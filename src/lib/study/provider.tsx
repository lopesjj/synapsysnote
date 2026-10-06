"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "@/lib/data/provider";
import { useStudyUi } from "@/lib/study/ui-store";
import type {
  AgendaEntry,
  CycleCompletion,
  CycleItem,
  CycleSubjectConfig,
  DayKey,
  MockExam,
  StudyCycle,
  StudyPlan,
  StudyReminder,
  StudyReview,
  StudySession,
  StudySettings,
  StudySticky,
  StudySubject,
  StudyTopic,
} from "@/types/study";
import {
  STUDY_COLLECTIONS,
  studyBackendFor,
  type StudyBackend,
  type StudyCollection,
  type StudyDoc,
  type PlainWrite,
  type StudyWrite,
} from "./backend";
import { MAX_AGENDA_ENTRIES } from "./agenda";
import { readStudyCache, rememberStudyCollection } from "./cache";
import {
  toCycle,
  toExam,
  toPlan,
  toReminder,
  toReview,
  toSession,
  toSticky,
  toSubject,
} from "./normalize";
import {
  DEFAULT_STUDY_SETTINGS,
  MAX_NAME_LENGTH,
  MAX_TOPIC_LENGTH,
  MAX_TOPICS_PER_SUBJECT,
  nextSubjectColor,
  normalizeSettings,
} from "./defaults";
import { addDays, diffDays, todayKey } from "./dates";
import {
  advanceCycle,
  countSession,
  generateCycleItems,
  recordAgendaDay,
  remapPointer,
  removeCompletion,
  tallyOf,
  uncountSession,
  undoLastCompletion,
  type CycleTally,
} from "./cycle";
import { PlanningProvider } from "./planning";
import { assertPlanFeature, assertPlanWritable, currentEntitlements, planFailure, useEntitlements } from "@/lib/plans/client";
import { goalGrowthViolation } from "@/lib/plans/usage";
import { PlanError } from "@/lib/plans/errors";

export interface SubjectDraft {
  name: string;
  color?: string;
  notebookId?: string | null;
  topics: { name: string; pageId?: string | null }[];
}

export type PlanInput = Partial<Omit<StudyPlan, "createdAt" | "updatedAt">>;

export interface SessionInput {
  planId: string;
  subjectId: string;
  topicId: string | null;
  day: DayKey;
  startMinute: number | null;
  durationSec: number;
  categoryId: string;
  correct: number;
  wrong: number;
  pages: number;
  pageRanges: StudySession["pageRanges"];
  videoSec: number;
  videos: StudySession["videos"];
  material: string;
  comment: string;
  reviewId: string | null;
  pageId: string | null;
  source: StudySession["source"];
}

export interface SessionOptions {
  completeTopic: boolean;
  scheduleReviews: boolean;
  countCycle: boolean;
  reopenTopic?: boolean;
}

export interface CreateTargets {
  subjectName?: string;
  topicName?: string;
}

export interface CycleConfigInput {
  subjects: CycleSubjectConfig[];
  weekMinutes: number[];
  minBlock: number;
  maxBlock: number;
  items?: CycleItem[];
}

export type ExamInput = Omit<MockExam, "id" | "createdAt" | "updatedAt"> & { id?: string };
export type ReminderInput = Omit<StudyReminder, "id" | "createdAt" | "updatedAt"> & { id?: string };

export interface StudyActions {
  savePlan(input: PlanInput): Promise<string>;
  createPlanWithSubjects(input: PlanInput, subjects: SubjectDraft[]): Promise<string>;
  setActivePlan(id: string | null): Promise<void>;
  archivePlan(id: string, archived: boolean): Promise<void>;
  deletePlan(id: string): Promise<void>;
  saveSubject(planId: string, input: Partial<StudySubject> & { id?: string }): Promise<string>;
  addSubjects(planId: string, drafts: SubjectDraft[]): Promise<number>;
  deleteSubject(id: string): Promise<void>;
  reorderSubjects(ids: string[]): Promise<void>;
  addTopic(subjectId: string, name: string): Promise<string | null>;
  updateTopic(subjectId: string, topicId: string, patch: Partial<StudyTopic>): Promise<void>;
  logSession(input: SessionInput, options: SessionOptions, create?: CreateTargets): Promise<StudySession>;
  updateSession(id: string, input: SessionInput, options: SessionOptions, create?: CreateTargets): Promise<void>;
  deleteSession(id: string): Promise<void>;
  resolveReviews(ids: string[], status: "done" | "ignored" | "pending"): Promise<void>;
  deleteReviews(ids: string[]): Promise<void>;
  rescheduleReview(id: string, day: DayKey): Promise<void>;
  saveExam(input: ExamInput): Promise<string>;
  deleteExam(id: string): Promise<void>;
  saveCycle(planId: string, config: CycleConfigInput): Promise<void>;
  editCycleItems(planId: string, edit: (items: CycleItem[]) => CycleItem[]): Promise<void>;
  setCyclePointer(planId: string, itemId: string): Promise<void>;
  completeCycleBlock(planId: string, skipped: boolean): Promise<void>;
  undoCycleBlock(planId: string): Promise<void>;
  removeCycleCompletion(planId: string, target: Pick<CycleCompletion, "itemId" | "day" | "at">): Promise<void>;
  editAgenda(planId: string, edit: (agenda: AgendaEntry[]) => AgendaEntry[], options?: { removeItemId?: string }): Promise<void>;
  markAgendaDay(planId: string, entryId: string, day: DayKey, skipped: boolean): Promise<void>;
  deleteCycle(planId: string): Promise<void>;
  saveReminder(input: ReminderInput): Promise<string>;
  deleteReminder(id: string): Promise<void>;
  createSticky(color?: StudySticky["color"]): Promise<string>;
  updateSticky(id: string, patch: Partial<Pick<StudySticky, "html" | "color">>): Promise<void>;
  deleteSticky(id: string): Promise<void>;
  deleteReviewInterval(intervalDays: number): Promise<void>;
  updateSettings(patch: Partial<StudySettings>): Promise<void>;
  saveDailyMotto(entry: { day: DayKey; id: string; author: string; en: string; language: string; text: string }): Promise<void>;
  claimAwards(keys: string[]): Promise<void>;
}

interface StudyState {
  plans: StudyPlan[];
  subjects: StudySubject[];
  sessions: StudySession[];
  reviews: StudyReview[];
  exams: MockExam[];
  cycles: StudyCycle[];
  reminders: StudyReminder[];
  stickies: StudySticky[];
  settings: StudySettings;
}

export interface StudyContextValue extends StudyState {
  ready: boolean;
  today: DayKey;
  activePlan: StudyPlan | null;
  focusPlan: StudyPlan | null;
  planReadOnly: boolean;
  planArchived: boolean;
  planSubjects: StudySubject[];
  planSessions: StudySession[];
  planReviews: StudyReview[];
  planExams: MockExam[];
  planCycle: StudyCycle | null;
  subjectById: (id: string | null | undefined) => StudySubject | undefined;
  topicById: (subjectId: string | null | undefined, topicId: string | null | undefined) => StudyTopic | undefined;
  actions: StudyActions;
}

const StudyContext = createContext<StudyContextValue | null>(null);

const EMPTY_STATE: StudyState = {
  plans: [],
  subjects: [],
  sessions: [],
  reviews: [],
  exams: [],
  cycles: [],
  reminders: [],
  stickies: [],
  settings: DEFAULT_STUDY_SETTINGS,
};

const REQUIRED_FOR_READY: StudyCollection[] = [
  "study_plans",
  "study_subjects",
  "study_meta",
  "study_sessions",
  "study_exams",
  "study_reviews",
  "study_cycles",
  "study_reminders",
];

function applyCollection(previous: StudyState, name: StudyCollection, docs: StudyDoc[]): StudyState {
  switch (name) {
    case "study_plans":
      return { ...previous, plans: docs.map(toPlan).sort(byOrder) };
    case "study_subjects":
      return { ...previous, subjects: docs.map(toSubject).sort(byOrder) };
    case "study_sessions":
      return {
        ...previous,
        sessions: docs
          .map(toSession)
          .sort((a, b) => (a.day === b.day ? b.createdAt - a.createdAt : a.day < b.day ? 1 : -1)),
      };
    case "study_reviews":
      return { ...previous, reviews: docs.map(toReview).sort((a, b) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : 0)) };
    case "study_exams":
      return { ...previous, exams: docs.map(toExam).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt)) };
    case "study_cycles":
      return { ...previous, cycles: docs.map(toCycle) };
    case "study_reminders":
      return { ...previous, reminders: docs.map(toReminder).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)) };
    case "study_stickies":
      return { ...previous, stickies: docs.map(toSticky).sort(byOrder) };
    case "study_meta": {
      const raw = docs.find((entry) => entry.id === "settings");
      return { ...previous, settings: normalizeSettings(raw as Partial<StudySettings> | undefined) };
    }
    default:
      return previous;
  }
}

function stateFromCache(collections: Partial<Record<StudyCollection, StudyDoc[]>>) {
  let data = EMPTY_STATE;
  const loaded = new Set<StudyCollection>();
  for (const name of STUDY_COLLECTIONS) {
    const docs = collections[name];
    if (!docs) continue;
    data = applyCollection(data, name, docs);
    loaded.add(name);
  }
  return { data, loaded };
}

function byOrder<T extends { order: number; createdAt: number }>(a: T, b: T) {
  return a.order - b.order || a.createdAt - b.createdAt;
}

function trimName(value: string | undefined, fallback = ""): string {
  return (value ?? fallback).replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function makeTopics(backend: StudyBackend, drafts: { name: string; pageId?: string | null }[]): StudyTopic[] {
  const seen = new Set<string>();
  const topics: StudyTopic[] = [];
  for (const draft of drafts) {
    const name = draft.name.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_LENGTH);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({ id: backend.newId(), name, done: false, doneAt: null, pageId: draft.pageId ?? null, url: null });
    if (topics.length >= MAX_TOPICS_PER_SUBJECT) break;
  }
  return topics;
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const { adapter } = useWorkspace();
  const backend = useMemo(() => studyBackendFor(adapter.mode, adapter.workspaceId), [adapter.mode, adapter.workspaceId]);
  const [stored, setStored] = useState<{ key: string; data: StudyState }>({ key: "", data: EMPTY_STATE });
  const [loaded, setLoaded] = useState<{ key: string; collections: Set<StudyCollection> }>({
    key: "",
    collections: new Set(),
  });
  if (stored.key !== backend.key) {
    const cached = readStudyCache(backend.key);
    if (cached) {
      const built = stateFromCache(cached);
      setStored({ key: backend.key, data: built.data });
      setLoaded({ key: backend.key, collections: built.loaded });
    } else {
      setStored({ key: backend.key, data: EMPTY_STATE });
      setLoaded({ key: backend.key, collections: new Set() });
    }
  }
  const state = stored.key === backend.key ? stored.data : EMPTY_STATE;
  const [clock, setClock] = useState(() => Date.now());
  const stateRef = useRef<StudyState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const markLoaded = (name: StudyCollection) => {
      setLoaded((previous) => {
        if (previous.key === backend.key && previous.collections.has(name)) return previous;
        const collections = new Set(previous.key === backend.key ? previous.collections : []);
        collections.add(name);
        return { key: backend.key, collections };
      });
    };
    const handle = (name: StudyCollection, docs: StudyDoc[]) => {
      if (cancelled) return;
      rememberStudyCollection(backend.key, name, docs);
      setStored((current) => ({
        key: backend.key,
        data: applyCollection(current.key === backend.key ? current.data : EMPTY_STATE, name, docs),
      }));
      markLoaded(name);
    };
    for (const name of STUDY_COLLECTIONS) {
      unsubs.push(
        backend.subscribe(
          name,
          (docs) => handle(name, docs),
          () => markLoaded(name)
        )
      );
    }
    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [backend]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = useMemo(() => {
    void clock;
    return todayKey(state.settings.timeZone);
  }, [clock, state.settings.timeZone]);

  const ready = loaded.key === backend.key && REQUIRED_FOR_READY.every((name) => loaded.collections.has(name));

  const commit = useCallback((writes: StudyWrite[]) => backend.commit(writes), [backend]);

  const relationsLoaded = loaded.key === backend.key && loaded.collections.has("study_sessions") && loaded.collections.has("study_reviews");

  useEffect(() => {
    if (!relationsLoaded) return;
    const known = new Set(state.sessions.map((session) => session.id));
    const settled = Date.now() - 120_000;
    const archivedIds = new Set(state.plans.filter((plan) => plan.archived).map((plan) => plan.id));
    const orphans = state.reviews.filter(
      (review) => review.sessionId && !known.has(review.sessionId) && review.createdAt < settled && !archivedIds.has(review.planId)
    );
    if (!orphans.length) return;
    void commit(orphans.map((review) => ({ kind: "delete" as const, collection: "study_reviews" as const, id: review.id })));
  }, [relationsLoaded, state.sessions, state.reviews, commit]);

  const actions = useMemo<StudyActions>(() => {
    const now = () => Date.now();
    const current = () => stateRef.current;
    const releaseIcons = async (icons: (string | null | undefined)[], ownerId?: string) => {
      const live = new Set(
        current()
          .plans.filter((plan) => plan.id !== ownerId)
          .map((plan) => plan.icon)
          .filter((icon): icon is string => Boolean(icon))
      );
      const files = icons.filter((icon): icon is string => Boolean(icon && /^https?:\/\//.test(icon) && !live.has(icon)));
      if (!files.length) return;
      try {
        await adapter.deleteMedia(files);
      } catch {}
    };

    const settingsWrite = (patch: Partial<StudySettings>): StudyWrite => ({
      kind: "merge",
      collection: "study_meta",
      id: "settings",
      data: { ...patch, updatedAt: now() },
    });

    const writable = () => {
      assertPlanWritable();
    };
    const goalCapacity = (planId?: string) => {
      const entitlements = assertPlanWritable();
      const active = current().plans.filter((plan) => !plan.archived && plan.id !== planId).length;
      const violation = goalGrowthViolation(active, active + 1, entitlements.limits.activeGoals);
      if (violation) throw planFailure(PlanError.limit(violation));
    };

    const planLocked = (planId: string | null | undefined) =>
      Boolean(planId && current().plans.some((plan) => plan.id === planId && plan.archived));
    const assertOpen = (planId: string | null | undefined) => {
      if (planLocked(planId)) throw new Error("archived-plan");
    };
    const assertSubjectOpen = (subjectId: string | null | undefined) => {
      const subject = subjectId ? current().subjects.find((entry) => entry.id === subjectId) : undefined;
      assertOpen(subject?.planId);
    };

    const planDoc = (input: PlanInput, id: string, existing?: StudyPlan): Record<string, unknown> => {
      const base = existing ?? {
        institution: "",
        role: "",
        examDate: null,
        icon: null,
        notes: "",
        archived: false,
        weeklyGoalMinutes: 0,
        weeklyGoalQuestions: 0,
        order: Math.max(0, ...current().plans.map((plan) => plan.order + 1)),
        createdAt: now(),
      };
      return {
        ...base,
        ...input,
        name: trimName(input.name ?? existing?.name, ""),
        institution: trimName(input.institution ?? existing?.institution),
        role: trimName(input.role ?? existing?.role),
        notes: (input.notes ?? existing?.notes ?? "").slice(0, 4000),
        id,
        updatedAt: now(),
      };
    };

    const subjectDocs = (planId: string, drafts: SubjectDraft[], startOrder: number, used: string[]) => {
      const writes: StudyWrite[] = [];
      const colors = [...used];
      drafts.forEach((draft, index) => {
        const name = trimName(draft.name);
        if (!name) return;
        const id = backend.newId();
        const color = draft.color ?? nextSubjectColor(colors);
        colors.push(color);
        writes.push({
          kind: "set",
          collection: "study_subjects",
          id,
          data: {
            planId,
            name,
            color,
            topics: makeTopics(backend, draft.topics),
            notebookId: draft.notebookId ?? null,
            order: startOrder + index,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      });
      return writes;
    };

    const cycleOf = (planId: string) => current().cycles.find((cycle) => cycle.planId === planId || cycle.id === planId);

    const cleanCycleItem = (item: CycleItem): CycleItem => ({
      id: item.id || backend.newId(),
      subjectId: item.subjectId,
      minutes: Math.min(600, Math.max(5, Math.round(item.minutes))),
    });

    const tallyMerge = (tally: CycleTally) => ({
      pointer: tally.pointer,
      round: tally.round,
      history: tally.history,
      progress: tally.progress,
      updatedAt: now(),
    });

    const reviewSets = (input: SessionInput, sessionId: string, intervals: number[]): PlainWrite[] =>
      intervals.map((interval) => ({
        kind: "set",
        collection: "study_reviews",
        id: backend.newId(),
        data: {
          planId: input.planId,
          subjectId: input.subjectId,
          topicId: input.topicId,
          sessionId,
          intervalDays: interval,
          dueDay: addDays(input.day, interval),
          status: "pending",
          resolvedAt: null,
          resolvedSessionId: null,
          createdAt: now(),
          updatedAt: now(),
        },
      }));

    const releaseTopic = (subjectId: string, topicId: string): StudyWrite => ({
      kind: "transform",
      collection: "study_subjects",
      id: subjectId,
      apply: (raw) => {
        if (!raw) return {};
        let dirty = false;
        const topics = toSubject(raw).topics.map((topic) => {
          if (topic.id !== topicId || !topic.done) return topic;
          dirty = true;
          return { ...topic, done: false, doneAt: null };
        });
        return dirty ? { merge: { topics, updatedAt: now() } } : {};
      },
    });

    const resolveTargets = (input: SessionInput, completeTopic: boolean, create?: CreateTargets) => {
      const snapshot = current();
      const writes: StudyWrite[] = [];
      let subjectId = input.subjectId;
      let topicId = input.topicId;
      const makeTopic = (name: string): StudyTopic => ({
        id: backend.newId(),
        name: name.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_LENGTH),
        done: completeTopic,
        doneAt: completeTopic ? now() : null,
        pageId: null,
        url: null,
      });
      if (create?.subjectName && trimName(create.subjectName)) {
        subjectId = backend.newId();
        const siblings = snapshot.subjects.filter((subject) => subject.planId === input.planId);
        const topics: StudyTopic[] = [];
        topicId = null;
        if (create.topicName && create.topicName.trim()) {
          const topic = makeTopic(create.topicName);
          topics.push(topic);
          topicId = topic.id;
        }
        writes.push({
          kind: "set",
          collection: "study_subjects",
          id: subjectId,
          data: {
            planId: input.planId,
            name: trimName(create.subjectName),
            color: nextSubjectColor(siblings.map((subject) => subject.color)),
            topics,
            notebookId: null,
            order: Math.max(0, ...siblings.map((subject) => subject.order + 1)),
            createdAt: now(),
            updatedAt: now(),
          },
        });
        return { subjectId, topicId, writes, completesTopic: completeTopic && topicId !== null };
      }
      const subject = snapshot.subjects.find((entry) => entry.id === subjectId);
      if (!subject) return { subjectId, topicId, writes, completesTopic: false };
      let created: StudyTopic | null = null;
      if (create?.topicName && create.topicName.trim()) {
        const clean = create.topicName.replace(/\s+/g, " ").trim().toLowerCase();
        const existing = subject.topics.find((topic) => topic.name.toLowerCase() === clean);
        if (existing) {
          topicId = existing.id;
        } else {
          created = makeTopic(create.topicName);
          topicId = created.id;
        }
      }
      const targetTopic = topicId;
      if (created || (completeTopic && targetTopic)) {
        writes.push({
          kind: "transform",
          collection: "study_subjects",
          id: subject.id,
          apply: (raw) => {
            if (!raw) return {};
            let topics = toSubject(raw).topics;
            let dirty = false;
            if (created && !topics.some((topic) => topic.id === created.id)) {
              topics = [...topics, created];
              dirty = true;
            }
            if (completeTopic && targetTopic) {
              topics = topics.map((topic) => {
                if (topic.id !== targetTopic || topic.done) return topic;
                dirty = true;
                return { ...topic, done: true, doneAt: now() };
              });
            }
            return dirty ? { merge: { topics, updatedAt: now() } } : {};
          },
        });
      }
      const completesTopic =
        completeTopic && targetTopic !== null && (created !== null || subject.topics.some((topic) => topic.id === targetTopic && !topic.done));
      return { subjectId, topicId, writes, completesTopic };
    };

    return {
      async savePlan(input) {
        const existing = input.id ? current().plans.find((plan) => plan.id === input.id) : undefined;
        if (existing?.archived) throw new Error("archived-plan");
        if (existing) writable();
        else goalCapacity();
        const id = existing?.id ?? backend.newId();
        const writes: StudyWrite[] = [{ kind: "set", collection: "study_plans", id, data: planDoc(input, id, existing) }];
        const settings = current().settings;
        const activeValid = current().plans.some((plan) => plan.id === settings.activePlanId && !plan.archived);
        if (!existing && !activeValid) writes.push(settingsWrite({ activePlanId: id }));
        await commit(writes);
        const nextIcon = input.icon === undefined ? existing?.icon : input.icon;
        if (existing?.icon && existing.icon !== nextIcon) await releaseIcons([existing.icon], id);
        return id;
      },
      async createPlanWithSubjects(input, drafts) {
        goalCapacity();
        const id = backend.newId();
        const writes: StudyWrite[] = [
          { kind: "set", collection: "study_plans", id, data: planDoc(input, id) },
          ...subjectDocs(id, drafts, 0, []),
          settingsWrite({ activePlanId: id }),
        ];
        await commit(writes);
        return id;
      },
      async setActivePlan(id) {
        if (id && planLocked(id)) throw new Error("archived-plan");
        await commit([settingsWrite({ activePlanId: id })]);
      },
      async archivePlan(id, archived) {
        const entitlements = assertPlanFeature("goalArchive");
        const target = current().plans.find((plan) => plan.id === id);
        if (!archived && target?.archived && !entitlements.readOnly) goalCapacity(id);
        const writes: StudyWrite[] = [
          { kind: "merge", collection: "study_plans", id, data: { archived, updatedAt: now() } },
        ];
        if (archived && current().settings.activePlanId === id) {
          const fallback = current().plans.find((plan) => plan.id !== id && !plan.archived);
          writes.push(settingsWrite({ activePlanId: fallback?.id ?? null }));
        }
        if (!archived && !current().plans.some((plan) => plan.id === current().settings.activePlanId && !plan.archived)) {
          writes.push(settingsWrite({ activePlanId: id }));
        }
        await commit(writes);
      },
      async deletePlan(id) {
        const snapshot = current();
        const writes: StudyWrite[] = [{ kind: "delete", collection: "study_plans", id }];
        for (const subject of snapshot.subjects) if (subject.planId === id) writes.push({ kind: "delete", collection: "study_subjects", id: subject.id });
        for (const session of snapshot.sessions) if (session.planId === id) writes.push({ kind: "delete", collection: "study_sessions", id: session.id });
        for (const review of snapshot.reviews) if (review.planId === id) writes.push({ kind: "delete", collection: "study_reviews", id: review.id });
        for (const exam of snapshot.exams) if (exam.planId === id) writes.push({ kind: "delete", collection: "study_exams", id: exam.id });
        for (const reminder of snapshot.reminders) if (reminder.planId === id) writes.push({ kind: "delete", collection: "study_reminders", id: reminder.id });
        const cycle = cycleOf(id);
        if (cycle) writes.push({ kind: "delete", collection: "study_cycles", id: cycle.id });
        if (snapshot.settings.activePlanId === id) {
          const fallback = snapshot.plans.find((plan) => plan.id !== id && !plan.archived);
          writes.push(settingsWrite({ activePlanId: fallback?.id ?? null }));
        }
        await commit(writes);
        const removed = snapshot.plans.find((plan) => plan.id === id);
        if (removed?.icon) await releaseIcons([removed.icon], id);
      },
      async saveSubject(planId, input) {
        writable();
        const snapshot = current();
        const existing = input.id ? snapshot.subjects.find((subject) => subject.id === input.id) : undefined;
        assertOpen(existing?.planId ?? planId);
        const id = existing?.id ?? backend.newId();
        const siblings = snapshot.subjects.filter((subject) => subject.planId === planId);
        const data: Record<string, unknown> = {
          planId: existing?.planId ?? planId,
          name: trimName(input.name ?? existing?.name),
          color: input.color ?? existing?.color ?? nextSubjectColor(siblings.map((subject) => subject.color)),
          topics: (input.topics ?? existing?.topics ?? []).slice(0, MAX_TOPICS_PER_SUBJECT).map((topic) => ({
            ...topic,
            name: topic.name.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_LENGTH),
          })).filter((topic) => topic.name),
          notebookId: input.notebookId !== undefined ? input.notebookId : (existing?.notebookId ?? null),
          order: existing?.order ?? Math.max(0, ...siblings.map((subject) => subject.order + 1)),
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        };
        const writes: StudyWrite[] = [];
        if (existing) {
          const edited = data.topics as StudyTopic[];
          const known = new Set(existing.topics.map((topic) => topic.id));
          const editedIds = new Set(edited.map((topic) => topic.id));
          writes.push({
            kind: "transform",
            collection: "study_subjects",
            id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toSubject(raw).topics;
              const latestById = new Map(latest.map((topic) => [topic.id, topic]));
              const merged = edited.map((topic) => {
                const fresh = latestById.get(topic.id);
                if (!fresh) return topic;
                return {
                  ...fresh,
                  name: topic.name,
                  done: topic.done,
                  doneAt: topic.done ? (fresh.doneAt ?? topic.doneAt ?? now()) : null,
                };
              });
              const concurrent = latest.filter((topic) => !known.has(topic.id) && !editedIds.has(topic.id));
              return {
                merge: {
                  name: data.name,
                  color: data.color,
                  notebookId: data.notebookId,
                  topics: [...merged, ...concurrent].slice(0, MAX_TOPICS_PER_SUBJECT),
                  updatedAt: now(),
                },
              };
            },
          });
        } else {
          writes.push({ kind: "set", collection: "study_subjects", id, data });
        }
        if (existing && input.topics) {
          const kept = new Set((data.topics as StudyTopic[]).map((topic) => topic.id));
          const removed = new Set(existing.topics.filter((topic) => !kept.has(topic.id)).map((topic) => topic.id));
          if (removed.size) {
            for (const session of snapshot.sessions) {
              if (session.subjectId === id && session.topicId && removed.has(session.topicId)) {
                writes.push({ kind: "merge", collection: "study_sessions", id: session.id, data: { topicId: null, updatedAt: now() } });
              }
            }
            for (const review of snapshot.reviews) {
              if (review.subjectId === id && review.topicId && removed.has(review.topicId)) {
                writes.push({ kind: "merge", collection: "study_reviews", id: review.id, data: { topicId: null, updatedAt: now() } });
              }
            }
          }
        }
        await commit(writes);
        return id;
      },
      async addSubjects(planId, drafts) {
        writable();
        assertOpen(planId);
        const siblings = current().subjects.filter((subject) => subject.planId === planId);
        const writes = subjectDocs(
          planId,
          drafts,
          Math.max(0, ...siblings.map((subject) => subject.order + 1)),
          siblings.map((subject) => subject.color)
        );
        if (writes.length) await commit(writes);
        return writes.length;
      },
      async deleteSubject(id) {
        const snapshot = current();
        const subject = snapshot.subjects.find((entry) => entry.id === id);
        assertOpen(subject?.planId);
        const writes: StudyWrite[] = [{ kind: "delete", collection: "study_subjects", id }];
        for (const session of snapshot.sessions) if (session.subjectId === id) writes.push({ kind: "delete", collection: "study_sessions", id: session.id });
        for (const review of snapshot.reviews) if (review.subjectId === id) writes.push({ kind: "delete", collection: "study_reviews", id: review.id });
        const cycle = subject ? cycleOf(subject.planId) : undefined;
        if (cycle) {
          writes.push({
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toCycle(raw);
              if (
                !latest.items.some((item) => item.subjectId === id) &&
                !latest.subjects.some((config) => config.subjectId === id) &&
                !latest.agenda.some((entry) => entry.subjectId === id)
              ) {
                return {};
              }
              const items = latest.items.filter((item) => item.subjectId !== id);
              const upcoming = latest.items.slice(latest.pointer).find((item) => item.subjectId !== id);
              const pointer = upcoming ? Math.max(0, items.findIndex((item) => item.id === upcoming.id)) : 0;
              return {
                merge: {
                  items,
                  agenda: latest.agenda.filter((entry) => entry.subjectId !== id),
                  subjects: latest.subjects.filter((config) => config.subjectId !== id),
                  pointer: items.length ? pointer % items.length : 0,
                  updatedAt: now(),
                },
              };
            },
          });
        }
        for (const exam of snapshot.exams) {
          if (!exam.rows.some((row) => row.subjectId === id)) continue;
          writes.push({
            kind: "transform",
            collection: "study_exams",
            id: exam.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toExam(raw);
              return {
                merge: {
                  rows: latest.rows.map((row) => (row.subjectId === id ? { ...row, subjectId: null } : row)),
                  updatedAt: now(),
                },
              };
            },
          });
        }
        await commit(writes);
      },
      async reorderSubjects(ids) {
        writable();
        for (const id of ids) assertSubjectOpen(id);
        await commit(
          ids.map((id, index) => ({ kind: "merge" as const, collection: "study_subjects" as const, id, data: { order: index, updatedAt: now() } }))
        );
      },
      async addTopic(subjectId, name) {
        writable();
        assertSubjectOpen(subjectId);
        const subject = current().subjects.find((entry) => entry.id === subjectId);
        const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_LENGTH);
        if (!subject || !clean) return null;
        const topic: StudyTopic = { id: backend.newId(), name: clean, done: false, doneAt: null, pageId: null, url: null };
        let resultId: string = topic.id;
        await commit([
          {
            kind: "transform",
            collection: "study_subjects",
            id: subjectId,
            apply: (raw) => {
              if (!raw) return {};
              const topics = toSubject(raw).topics;
              const existing = topics.find((entry) => entry.name.toLowerCase() === clean.toLowerCase());
              if (existing) {
                resultId = existing.id;
                return {};
              }
              if (topics.length >= MAX_TOPICS_PER_SUBJECT) return {};
              resultId = topic.id;
              return { merge: { topics: [...topics, topic], updatedAt: now() } };
            },
          },
        ]);
        return resultId;
      },
      async updateTopic(subjectId, topicId, patch) {
        writable();
        assertSubjectOpen(subjectId);
        await commit([
          {
            kind: "transform",
            collection: "study_subjects",
            id: subjectId,
            apply: (raw) => {
              if (!raw) return {};
              let found = false;
              const topics = toSubject(raw).topics.map((topic) => {
                if (topic.id !== topicId) return topic;
                found = true;
                const next = { ...topic, ...patch, id: topic.id };
                if (patch.done !== undefined) next.doneAt = patch.done ? (topic.doneAt ?? now()) : null;
                return next;
              });
              return found ? { merge: { topics, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async logSession(rawInput, options, create) {
        writable();
        assertOpen(rawInput.planId);
        if (rawInput.reviewId) {
          const review = current().reviews.find((entry) => entry.id === rawInput.reviewId);
          if (review) assertOpen(review.planId);
        }
        const snapshot = current();
        const targets = resolveTargets(rawInput, options.completeTopic, create);
        const input: SessionInput = { ...rawInput, subjectId: targets.subjectId, topicId: targets.topicId };
        const id = backend.newId();
        const session: StudySession = {
          ...input,
          id,
          cycleItemId: null,
          completedTopic: targets.completesTopic,
          createdAt: now(),
          updatedAt: now(),
        };
        const writes: StudyWrite[] = [...targets.writes];
        if (options.reopenTopic && !options.completeTopic && input.topicId && !create?.subjectName) {
          writes.push(releaseTopic(input.subjectId, input.topicId));
        }
        const cycle = cycleOf(input.planId);
        const sessionWrite = (cycleItemId: string | null): PlainWrite => ({
          kind: "set",
          collection: "study_sessions",
          id,
          data: { ...session, cycleItemId },
        });
        if (options.countCycle && cycle && (cycle.items.length || cycle.agenda.length)) {
          writes.push({
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              const latest = raw ? toCycle(raw) : null;
              if (!latest) return { also: [sessionWrite(null)] };
              const counted = countSession(tallyOf(latest), input, id, now(), { outOfTurn: true });
              if (!counted) return { also: [sessionWrite(null)] };
              session.cycleItemId = counted.cycleItemId;
              return { merge: tallyMerge(counted.cycle), also: [sessionWrite(counted.cycleItemId)] };
            },
          });
        } else {
          writes.push(sessionWrite(null));
        }
        if (options.scheduleReviews) writes.push(...reviewSets(input, id, snapshot.settings.reviewIntervals));
        if (input.reviewId) {
          writes.push({
            kind: "merge",
            collection: "study_reviews",
            id: input.reviewId,
            data: { status: "done", resolvedAt: now(), resolvedSessionId: id, updatedAt: now() },
          });
        }
        await commit(writes);
        return session;
      },
      async updateSession(id, rawInput, options, create) {
        writable();
        const snapshot = current();
        const previous = snapshot.sessions.find((session) => session.id === id);
        if (!previous) return;
        assertOpen(previous.planId);
        assertOpen(rawInput.planId);
        const keepsTopic = options.completeTopic && previous.completedTopic && previous.topicId === rawInput.topicId;
        if (previous.completedTopic && previous.topicId && !keepsTopic) {
          await commit([releaseTopic(previous.subjectId, previous.topicId)]);
        }
        const targets = resolveTargets(rawInput, options.completeTopic, create);
        const input: SessionInput = { ...rawInput, subjectId: targets.subjectId, topicId: targets.topicId };
        const writes: StudyWrite[] = [...targets.writes];
        if (options.reopenTopic && !options.completeTopic && input.topicId && !create?.subjectName && !(previous.completedTopic && previous.topicId === input.topicId)) {
          writes.push(releaseTopic(input.subjectId, input.topicId));
        }
        const completedTopic = options.completeTopic && (targets.completesTopic || keepsTopic);
        const sessionWrite = (cycleItemId: string | null): PlainWrite => ({
          kind: "set",
          collection: "study_sessions",
          id,
          data: {
            ...previous,
            ...input,
            reviewId: previous.reviewId,
            cycleItemId,
            completedTopic,
            source: previous.source,
            updatedAt: now(),
          },
        });
        const cycle = cycleOf(previous.planId);
        const counted = Boolean(previous.cycleItemId);
        const moved = previous.subjectId !== input.subjectId || previous.day !== input.day || previous.durationSec !== input.durationSec;
        const undo = counted && (!options.countCycle || moved);
        const redo = options.countCycle && (!counted || moved);
        if (cycle && (undo || redo)) {
          writes.push({
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return { also: [sessionWrite(null)] };
              let tally = tallyOf(toCycle(raw));
              let changed = false;
              let cycleItemId = undo ? null : previous.cycleItemId;
              if (undo) {
                const reverted = uncountSession(tally, previous, snapshot.sessions);
                if (reverted) {
                  tally = reverted;
                  changed = true;
                }
              }
              if (redo) {
                const applied = countSession(tally, input, id, now(), { outOfTurn: true });
                if (applied) {
                  tally = applied.cycle;
                  cycleItemId = applied.cycleItemId;
                  changed = true;
                }
              }
              return changed ? { merge: tallyMerge(tally), also: [sessionWrite(cycleItemId)] } : { also: [sessionWrite(cycleItemId)] };
            },
          });
        } else {
          writes.push(sessionWrite(options.countCycle ? previous.cycleItemId : null));
        }
        const own = snapshot.reviews.filter((review) => review.sessionId === id);
        if (!options.scheduleReviews) {
          for (const review of own) writes.push({ kind: "delete", collection: "study_reviews", id: review.id });
        } else if (!own.length) {
          writes.push(...reviewSets(input, id, snapshot.settings.reviewIntervals));
        } else {
          const shift = diffDays(previous.day, input.day);
          for (const review of own) {
            const data: Record<string, unknown> = {};
            if (review.subjectId !== input.subjectId) data.subjectId = input.subjectId;
            if (review.topicId !== input.topicId) data.topicId = input.topicId;
            if (shift !== 0 && review.status === "pending") data.dueDay = addDays(review.dueDay, shift);
            if (Object.keys(data).length) writes.push({ kind: "merge", collection: "study_reviews", id: review.id, data: { ...data, updatedAt: now() } });
          }
        }
        await commit(writes);
      },
      async deleteSession(id) {
        const snapshot = current();
        const writes: StudyWrite[] = [{ kind: "delete", collection: "study_sessions", id }];
        const owner = snapshot.sessions.find((session) => session.id === id);
        if (owner) assertOpen(owner.planId);
        const cycle = owner ? cycleOf(owner.planId) : undefined;
        if (cycle && owner) {
          writes.push({
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const reverted = uncountSession(tallyOf(toCycle(raw)), owner, snapshot.sessions);
              return reverted ? { merge: tallyMerge(reverted) } : {};
            },
          });
        }
        if (owner?.completedTopic && owner.topicId) writes.push(releaseTopic(owner.subjectId, owner.topicId));
        for (const review of snapshot.reviews) {
          if (review.sessionId === id) writes.push({ kind: "delete", collection: "study_reviews", id: review.id });
          else if (review.resolvedSessionId === id) {
            writes.push({
              kind: "merge",
              collection: "study_reviews",
              id: review.id,
              data: { status: "pending", resolvedAt: null, resolvedSessionId: null, updatedAt: now() },
            });
          }
        }
        await commit(writes);
      },
      async resolveReviews(ids, status) {
        if (!ids.length) return;
        writable();
        for (const id of ids) {
          const review = current().reviews.find((entry) => entry.id === id);
          if (review) assertOpen(review.planId);
        }
        await commit(
          ids.map((id) => ({
            kind: "merge" as const,
            collection: "study_reviews" as const,
            id,
            data:
              status === "pending"
                ? { status, resolvedAt: null, resolvedSessionId: null, updatedAt: now() }
                : { status, resolvedAt: now(), updatedAt: now() },
          }))
        );
      },
      async deleteReviews(ids) {
        if (!ids.length) return;
        for (const id of ids) {
          const review = current().reviews.find((entry) => entry.id === id);
          if (review) assertOpen(review.planId);
        }
        const targets = new Set(ids);
        const writes: StudyWrite[] = ids.map((id) => ({ kind: "delete" as const, collection: "study_reviews" as const, id }));
        for (const session of current().sessions) {
          if (session.reviewId && targets.has(session.reviewId)) {
            writes.push({ kind: "merge", collection: "study_sessions", id: session.id, data: { reviewId: null, updatedAt: now() } });
          }
        }
        await commit(writes);
      },
      async rescheduleReview(id, day) {
        writable();
        const review = current().reviews.find((entry) => entry.id === id);
        if (review) assertOpen(review.planId);
        await commit([
          {
            kind: "merge",
            collection: "study_reviews",
            id,
            data: { dueDay: day, status: "pending", resolvedAt: null, resolvedSessionId: null, updatedAt: now() },
          },
        ]);
      },
      async saveExam(input) {
        writable();
        const existing = input.id ? current().exams.find((exam) => exam.id === input.id) : undefined;
        assertOpen(existing?.planId ?? input.planId);
        const id = existing?.id ?? backend.newId();
        const { id: _ignored, ...rest } = input;
        void _ignored;
        await commit([
          {
            kind: "set",
            collection: "study_exams",
            id,
            data: {
              ...rest,
              name: trimName(rest.name),
              board: trimName(rest.board),
              comment: rest.comment.slice(0, 4000),
              createdAt: existing?.createdAt ?? now(),
              updatedAt: now(),
            },
          },
        ]);
        return id;
      },
      async deleteExam(id) {
        const exam = current().exams.find((entry) => entry.id === id);
        if (exam) assertOpen(exam.planId);
        await commit([{ kind: "delete", collection: "study_exams", id }]);
      },
      async saveCycle(planId, config) {
        writable();
        assertOpen(planId);
        const existing = cycleOf(planId);
        const items =
          config.items && config.items.length > 0
            ? config.items.map(cleanCycleItem)
            : generateCycleItems(config, () => backend.newId());
        const subjects =
          config.subjects && config.subjects.length > 0
            ? config.subjects
            : Array.from(new Set(items.map((item) => item.subjectId))).map((subjectId) => ({
                subjectId,
                weight: 3,
                level: 3,
              }));
        const data = {
          planId,
          items,
          weekMinutes: config.weekMinutes.map((value) => Math.max(0, Math.round(value))),
          subjects,
          minBlock: config.minBlock,
          maxBlock: config.maxBlock,
          updatedAt: now(),
        };
        if (!existing) {
          await commit([
            {
              kind: "set",
              collection: "study_cycles",
              id: planId,
              data: { ...data, pointer: 0, round: 0, history: [], createdAt: now() },
            },
          ]);
          return;
        }
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: existing.id,
            apply: (raw) => {
              if (!raw) return { merge: { ...data, pointer: 0, round: 0, history: [], createdAt: now() } };
              return { merge: { ...data, ...remapPointer(toCycle(raw), items) } };
            },
          },
        ]);
      },
      async editCycleItems(planId, edit) {
        writable();
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toCycle(raw);
              const items = edit(latest.items.map((item) => ({ ...item }))).map(cleanCycleItem);
              const known = new Set(latest.subjects.map((config) => config.subjectId));
              const added = [...new Set(items.map((item) => item.subjectId))]
                .filter((subjectId) => !known.has(subjectId))
                .map((subjectId) => ({ subjectId, weight: 3, level: 3 }));
              return {
                merge: {
                  items,
                  ...remapPointer(latest, items),
                  ...(added.length ? { subjects: [...latest.subjects, ...added] } : {}),
                  updatedAt: now(),
                },
              };
            },
          },
        ]);
      },
      async setCyclePointer(planId, itemId) {
        writable();
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const index = toCycle(raw).items.findIndex((item) => item.id === itemId);
              return index < 0 ? {} : { merge: { pointer: index, updatedAt: now() } };
            },
          },
        ]);
      },
      async completeCycleBlock(planId, skipped) {
        writable();
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        const day = todayKey(current().settings.timeZone);
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toCycle(raw);
              const item = latest.items[latest.pointer % latest.items.length];
              const key = item ? `${item.id}:${latest.round}` : null;
              const nextProgress = { ...(latest.progress ?? {}) };
              if (key) delete nextProgress[key];
              const patch = advanceCycle(latest, day, { skipped, at: now() });
              return patch ? { merge: { ...patch, progress: nextProgress, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async undoCycleBlock(planId) {
        writable();
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const patch = undoLastCompletion(toCycle(raw));
              return patch ? { merge: { ...patch, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async removeCycleCompletion(planId, target) {
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const patch = removeCompletion(toCycle(raw), target);
              return patch ? { merge: { ...patch, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async editAgenda(planId, edit, options) {
        writable();
        assertOpen(planId);
        const finish = (agenda: AgendaEntry[]) =>
          agenda
            .slice(0, MAX_AGENDA_ENTRIES)
            .map((entry) => ({ ...entry, id: entry.id || backend.newId(), createdAt: entry.createdAt || now() }));
        const fresh = (agenda: AgendaEntry[]): Record<string, unknown> => ({
          planId,
          items: [],
          agenda,
          weekMinutes: [0, 0, 0, 0, 0, 0, 0],
          pointer: 0,
          round: 0,
          history: [],
          subjects: [],
          minBlock: 30,
          maxBlock: 60,
          createdAt: now(),
          updatedAt: now(),
        });
        const cycle = cycleOf(planId);
        if (!cycle) {
          const agenda = finish(edit([]));
          if (agenda.length) await commit([{ kind: "set", collection: "study_cycles", id: planId, data: fresh(agenda) }]);
          return;
        }
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) {
                const agenda = finish(edit([]));
                return agenda.length ? { merge: fresh(agenda) } : {};
              }
              const latest = toCycle(raw);
              const merge: Record<string, unknown> = { agenda: finish(edit(latest.agenda.map((entry) => ({ ...entry })))), updatedAt: now() };
              if (options?.removeItemId && latest.items.some((item) => item.id === options.removeItemId)) {
                const items = latest.items.filter((item) => item.id !== options.removeItemId);
                Object.assign(merge, { items }, remapPointer(latest, items));
              }
              return { merge };
            },
          },
        ]);
      },
      async markAgendaDay(planId, entryId, day, skipped) {
        writable();
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (!cycle) return;
        await commit([
          {
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toCycle(raw);
              const entry = latest.agenda.find((item) => item.id === entryId);
              const key = `${entryId}:${day}`;
              const nextProgress = { ...(latest.progress ?? {}) };
              delete nextProgress[key];
              const patch = entry ? recordAgendaDay(latest, entry, day, { skipped, at: now() }) : null;
              return patch ? { merge: { ...patch, progress: nextProgress, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async deleteCycle(planId) {
        assertOpen(planId);
        const cycle = cycleOf(planId);
        if (cycle) await commit([{ kind: "delete", collection: "study_cycles", id: cycle.id }]);
      },
      async saveReminder(input) {
        writable();
        const existing = input.id ? current().reminders.find((reminder) => reminder.id === input.id) : undefined;
        assertOpen(existing?.planId);
        assertOpen(input.planId);
        const id = existing?.id ?? backend.newId();
        const { id: _ignored, ...rest } = input;
        void _ignored;
        await commit([
          {
            kind: "set",
            collection: "study_reminders",
            id,
            data: { ...rest, title: trimName(rest.title), createdAt: existing?.createdAt ?? now(), updatedAt: now() },
          },
        ]);
        return id;
      },
      async deleteReminder(id) {
        const reminder = current().reminders.find((entry) => entry.id === id);
        if (reminder) assertOpen(reminder.planId);
        await commit([{ kind: "delete", collection: "study_reminders", id }]);
      },
      async createSticky(color = "sun") {
        writable();
        const id = backend.newId();
        await commit([
          {
            kind: "set",
            collection: "study_stickies",
            id,
            data: {
              html: "",
              color,
              order: Math.max(0, ...current().stickies.map((sticky) => sticky.order + 1)),
              createdAt: now(),
              updatedAt: now(),
            },
          },
        ]);
        return id;
      },
      async updateSticky(id, patch) {
        writable();
        const data: Record<string, unknown> = { ...patch, updatedAt: now() };
        if (typeof patch.html === "string") data.html = patch.html.slice(0, 200_000);
        await commit([{ kind: "merge", collection: "study_stickies", id, data }]);
      },
      async deleteSticky(id) {
        await commit([{ kind: "delete", collection: "study_stickies", id }]);
      },
      async deleteReviewInterval(intervalDays) {
        const snapshot = current();
        const nextIntervals = snapshot.settings.reviewIntervals.filter((d) => d !== intervalDays);
        const matchingReviews = snapshot.reviews.filter((r) => r.intervalDays === intervalDays && !planLocked(r.planId));
        const reviewIds = new Set(matchingReviews.map((r) => r.id));
        const writes: StudyWrite[] = [settingsWrite({ reviewIntervals: nextIntervals })];
        for (const review of matchingReviews) {
          writes.push({ kind: "delete", collection: "study_reviews", id: review.id });
        }
        for (const session of snapshot.sessions) {
          if (session.reviewId && reviewIds.has(session.reviewId)) {
            writes.push({ kind: "merge", collection: "study_sessions", id: session.id, data: { reviewId: null, updatedAt: now() } });
          }
        }
        await commit(writes);
      },
      async updateSettings(patch) {
        let next = patch;
        if (patch.awardOrder) {
          assertPlanFeature("awards");
          writable();
          const currentOrder = current().settings.awardOrder;
          const awardOrder = { ...patch.awardOrder };
          for (const plan of current().plans) {
            if (!plan.archived || !awardOrder[plan.id]) continue;
            const before = currentOrder[plan.id] ?? [];
            if (awardOrder[plan.id].join("\0") === before.join("\0")) continue;
            if (before.length) awardOrder[plan.id] = before;
            else delete awardOrder[plan.id];
          }
          next = { ...patch, awardOrder };
        }
        await commit([settingsWrite(next)]);
      },
      async saveDailyMotto(entry) {
        const stamp = now();
        await commit([
          {
            kind: "transform",
            collection: "study_meta",
            id: "settings",
            apply: (raw) => {
              const settings = normalizeSettings(raw as Partial<StudySettings> | undefined);
              const current = settings.motto;
              if (current && current.day > entry.day) return {};
              if (current?.day === entry.day && current.id !== entry.id) return {};
              const texts = { ...(current?.day === entry.day ? current.texts : {}), en: entry.en, [entry.language]: entry.text };
              const seen = settings.seenMottoIds.includes(entry.id) ? settings.seenMottoIds : [...settings.seenMottoIds, entry.id];
              return {
                merge: {
                  motto: { day: entry.day, id: entry.id, author: entry.author.slice(0, 80), en: entry.en.slice(0, 240), texts },
                  seenMottoIds: seen.slice(-20_000),
                  updatedAt: stamp,
                },
              };
            },
          },
        ]);
      },
      async claimAwards(keys) {
        const fresh = keys.filter((key) => key && !current().settings.claimedAwards[key] && !planLocked(key.split("~")[0]));
        if (!fresh.length) return;
        const entitlements = currentEntitlements();
        if (!entitlements.features.awards || entitlements.readOnly) return;
        const stamp = now();
        await commit([
          {
            kind: "transform",
            collection: "study_meta",
            id: "settings",
            apply: (raw) => {
              const claimed = normalizeSettings(raw as Partial<StudySettings> | undefined).claimedAwards;
              const next = { ...claimed };
              for (const key of fresh) if (!next[key]) next[key] = stamp;
              return { merge: { claimedAwards: next, updatedAt: stamp } };
            },
          },
        ]);
      },
    };
  }, [adapter, backend, commit]);

  const browsePlanId = useStudyUi((store) => store.browsePlanId);
  const accountReadOnly = useEntitlements().readOnly;
  useEffect(() => {
    if (!browsePlanId) return;
    const plan = state.plans.find((entry) => entry.id === browsePlanId);
    if (!plan || !plan.archived) useStudyUi.getState().setBrowsePlanId(null);
  }, [browsePlanId, state.plans]);

  const value = useMemo<StudyContextValue>(() => {
    const livePlans = state.plans.filter((plan) => !plan.archived);
    const activePlan =
      livePlans.find((plan) => plan.id === state.settings.activePlanId) ?? livePlans[0] ?? null;
    const browsed = browsePlanId ? state.plans.find((plan) => plan.id === browsePlanId && plan.archived) ?? null : null;
    const focusPlan = browsed ?? activePlan;
    const planId = focusPlan?.id ?? null;
    const subjectIndex = new Map(state.subjects.map((subject) => [subject.id, subject]));
    return {
      ...state,
      ready,
      today,
      activePlan,
      focusPlan,
      planReadOnly: Boolean(browsed) || accountReadOnly,
      planArchived: Boolean(browsed),
      planSubjects: planId ? state.subjects.filter((subject) => subject.planId === planId) : [],
      planSessions: planId ? state.sessions.filter((session) => session.planId === planId) : [],
      planReviews: planId ? state.reviews.filter((review) => review.planId === planId) : [],
      planExams: planId ? state.exams.filter((exam) => exam.planId === planId) : [],
      planCycle: planId ? (state.cycles.find((cycle) => cycle.planId === planId || cycle.id === planId) ?? null) : null,
      subjectById: (id) => (id ? subjectIndex.get(id) : undefined),
      topicById: (subjectId, topicId) =>
        subjectId && topicId ? subjectIndex.get(subjectId)?.topics.find((topic) => topic.id === topicId) : undefined,
      actions,
    };
  }, [accountReadOnly, actions, browsePlanId, ready, state, today]);

  return (
    <StudyContext.Provider value={value}>
      <PlanningProvider>{children}</PlanningProvider>
    </StudyContext.Provider>
  );
}

export function useStudy(): StudyContextValue {
  const context = useContext(StudyContext);
  if (!context) throw new Error("useStudy precisa estar dentro de <StudyProvider>");
  return context;
}
