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
  generateCycleItems,
  pendingAgendaEntry,
  recordAgendaDay,
  remapPointer,
  removeCompletion,
  undoLastCompletion,
} from "./cycle";
import { PlanningProvider } from "./planning";

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
  updateSession(id: string, input: SessionInput, options: Pick<SessionOptions, "completeTopic">, create?: CreateTargets): Promise<void>;
  deleteSession(id: string): Promise<void>;
  resolveReviews(ids: string[], status: "done" | "ignored" | "pending"): Promise<void>;
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

const REQUIRED_FOR_READY: StudyCollection[] = ["study_plans", "study_subjects", "study_meta"];

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
  const state = stored.key === backend.key ? stored.data : EMPTY_STATE;
  const [loaded, setLoaded] = useState<{ key: string; collections: Set<StudyCollection> }>({
    key: "",
    collections: new Set(),
  });
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
      const apply = (previous: StudyState): StudyState => {
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
      };
      setStored((current) => ({ key: backend.key, data: apply(current.key === backend.key ? current.data : EMPTY_STATE) }));
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

  const actions = useMemo<StudyActions>(() => {
    const now = () => Date.now();
    const current = () => stateRef.current;
    const releaseIcons = (icons: (string | null | undefined)[]) => {
      const files = icons.filter((icon): icon is string => Boolean(icon && /^https?:\/\//.test(icon)));
      if (files.length) void adapter.quarantineMedia(files);
    };

    const settingsWrite = (patch: Partial<StudySettings>): StudyWrite => ({
      kind: "merge",
      collection: "study_meta",
      id: "settings",
      data: { ...patch, updatedAt: now() },
    });

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
        return { subjectId, topicId, writes };
      }
      const subject = snapshot.subjects.find((entry) => entry.id === subjectId);
      if (!subject) return { subjectId, topicId, writes };
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
      return { subjectId, topicId, writes };
    };

    return {
      async savePlan(input) {
        const existing = input.id ? current().plans.find((plan) => plan.id === input.id) : undefined;
        const id = existing?.id ?? backend.newId();
        const writes: StudyWrite[] = [{ kind: "set", collection: "study_plans", id, data: planDoc(input, id, existing) }];
        const settings = current().settings;
        const activeValid = current().plans.some((plan) => plan.id === settings.activePlanId && !plan.archived);
        if (!existing && !activeValid) writes.push(settingsWrite({ activePlanId: id }));
        await commit(writes);
        const nextIcon = input.icon === undefined ? existing?.icon : input.icon;
        if (existing?.icon && existing.icon !== nextIcon) releaseIcons([existing.icon]);
        return id;
      },
      async createPlanWithSubjects(input, drafts) {
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
        await commit([settingsWrite({ activePlanId: id })]);
      },
      async archivePlan(id, archived) {
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
        if (removed?.icon) releaseIcons([removed.icon]);
      },
      async saveSubject(planId, input) {
        const snapshot = current();
        const existing = input.id ? snapshot.subjects.find((subject) => subject.id === input.id) : undefined;
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
        await commit(
          ids.map((id, index) => ({ kind: "merge" as const, collection: "study_subjects" as const, id, data: { order: index, updatedAt: now() } }))
        );
      },
      async addTopic(subjectId, name) {
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
        const snapshot = current();
        const targets = resolveTargets(rawInput, options.completeTopic, create);
        const input: SessionInput = { ...rawInput, subjectId: targets.subjectId, topicId: targets.topicId };
        const id = backend.newId();
        const session: StudySession = {
          ...input,
          id,
          cycleItemId: null,
          createdAt: now(),
          updatedAt: now(),
        };
        const writes: StudyWrite[] = [...targets.writes];
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
              // A disciplina marcada para o dia da sessão tem prioridade sobre a rotação.
              const fixed = pendingAgendaEntry(latest, input.subjectId, input.day);
              const marked = fixed ? recordAgendaDay(latest, fixed, input.day, { sessionId: id, at: now() }) : null;
              if (fixed && marked) {
                session.cycleItemId = fixed.id;
                return { merge: { ...marked, updatedAt: now() }, also: [sessionWrite(fixed.id)] };
              }
              const item = latest.items.length ? latest.items[latest.pointer % latest.items.length] : null;
              if (!item || item.subjectId !== input.subjectId) return { also: [sessionWrite(null)] };
              const patch = advanceCycle(latest, input.day, { sessionId: id, at: now() });
              session.cycleItemId = item.id;
              return { merge: patch ? { ...patch, updatedAt: now() } : null, also: [sessionWrite(item.id)] };
            },
          });
        } else {
          writes.push(sessionWrite(null));
        }
        if (options.scheduleReviews) {
          for (const interval of snapshot.settings.reviewIntervals) {
            writes.push({
              kind: "set",
              collection: "study_reviews",
              id: backend.newId(),
              data: {
                planId: input.planId,
                subjectId: input.subjectId,
                topicId: input.topicId,
                sessionId: id,
                intervalDays: interval,
                dueDay: addDays(input.day, interval),
                status: "pending",
                resolvedAt: null,
                resolvedSessionId: null,
                createdAt: now(),
                updatedAt: now(),
              },
            });
          }
        }
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
        const snapshot = current();
        const previous = snapshot.sessions.find((session) => session.id === id);
        if (!previous) return;
        const targets = resolveTargets(rawInput, options.completeTopic, create);
        const input: SessionInput = { ...rawInput, subjectId: targets.subjectId, topicId: targets.topicId };
        const writes: StudyWrite[] = [
          ...targets.writes,
          {
            kind: "set",
            collection: "study_sessions",
            id,
            data: {
              ...previous,
              ...input,
              reviewId: previous.reviewId,
              cycleItemId: previous.cycleItemId,
              source: previous.source,
              updatedAt: now(),
            },
          },
        ];
        const shift = diffDays(previous.day, input.day);
        for (const review of snapshot.reviews) {
          if (review.sessionId !== id) continue;
          const data: Record<string, unknown> = {};
          if (review.subjectId !== input.subjectId) data.subjectId = input.subjectId;
          if (review.topicId !== input.topicId) data.topicId = input.topicId;
          if (shift !== 0 && review.status === "pending") data.dueDay = addDays(review.dueDay, shift);
          if (Object.keys(data).length) writes.push({ kind: "merge", collection: "study_reviews", id: review.id, data: { ...data, updatedAt: now() } });
        }
        await commit(writes);
      },
      async deleteSession(id) {
        const snapshot = current();
        const writes: StudyWrite[] = [{ kind: "delete", collection: "study_sessions", id }];
        const owner = snapshot.sessions.find((session) => session.id === id);
        const cycle = owner ? cycleOf(owner.planId) : undefined;
        if (cycle && cycle.history.some((entry) => entry.sessionId === id)) {
          writes.push({
            kind: "transform",
            collection: "study_cycles",
            id: cycle.id,
            apply: (raw) => {
              if (!raw) return {};
              const latest = toCycle(raw);
              if (!latest.history.some((entry) => entry.sessionId === id)) return {};
              return {
                merge: {
                  history: latest.history.map((entry) => (entry.sessionId === id ? { ...entry, sessionId: null } : entry)),
                  updatedAt: now(),
                },
              };
            },
          });
        }
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
      async rescheduleReview(id, day) {
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
        const existing = input.id ? current().exams.find((exam) => exam.id === input.id) : undefined;
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
        await commit([{ kind: "delete", collection: "study_exams", id }]);
      },
      async saveCycle(planId, config) {
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
              const patch = advanceCycle(toCycle(raw), day, { skipped, at: now() });
              return patch ? { merge: { ...patch, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async undoCycleBlock(planId) {
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
              const patch = entry ? recordAgendaDay(latest, entry, day, { skipped, at: now() }) : null;
              return patch ? { merge: { ...patch, updatedAt: now() } } : {};
            },
          },
        ]);
      },
      async deleteCycle(planId) {
        const cycle = cycleOf(planId);
        if (cycle) await commit([{ kind: "delete", collection: "study_cycles", id: cycle.id }]);
      },
      async saveReminder(input) {
        const existing = input.id ? current().reminders.find((reminder) => reminder.id === input.id) : undefined;
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
        await commit([{ kind: "delete", collection: "study_reminders", id }]);
      },
      async createSticky(color = "sun") {
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
        const matchingReviews = snapshot.reviews.filter((r) => r.intervalDays === intervalDays);
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
        await commit([settingsWrite(patch)]);
      },
    };
  }, [adapter, backend, commit]);

  const value = useMemo<StudyContextValue>(() => {
    const livePlans = state.plans.filter((plan) => !plan.archived);
    const activePlan =
      livePlans.find((plan) => plan.id === state.settings.activePlanId) ?? livePlans[0] ?? null;
    const planId = activePlan?.id ?? null;
    const subjectIndex = new Map(state.subjects.map((subject) => [subject.id, subject]));
    return {
      ...state,
      ready,
      today,
      activePlan,
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
  }, [actions, ready, state, today]);

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
