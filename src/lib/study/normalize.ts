import type {
  AgendaEntry,
  AgendaRepeat,
  CycleCompletion,
  CycleItem,
  MockExam,
  MockExamRow,
  PageRange,
  ReminderKind,
  ReviewStatus,
  StickyColor,
  StudyCycle,
  StudyPlan,
  StudyReminder,
  StudyReview,
  StudySession,
  StudySticky,
  StudySubject,
  StudyTopic,
  VideoEntry,
} from "@/types/study";
import type { StudyDoc } from "./backend";
import { MAX_AGENDA_ENTRIES, MAX_AGENDA_REMOVED } from "./agenda";
import { isDayKey } from "./dates";
import { MAX_SESSION_SECONDS, STICKY_COLORS, SUBJECT_COLORS } from "./defaults";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(max, Math.max(0, Math.round(num(value))));
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function day(value: unknown, fallback: string): string {
  return isDayKey(value) ? value : fallback;
}

export function toPlan(raw: StudyDoc): StudyPlan {
  return {
    id: raw.id,
    name: str(raw.name),
    institution: str(raw.institution),
    role: str(raw.role),
    examDate: isDayKey(raw.examDate) ? raw.examDate : null,
    icon: nullableStr(raw.icon),
    notes: str(raw.notes),
    archived: Boolean(raw.archived),
    weeklyGoalMinutes: nonNegative(raw.weeklyGoalMinutes, 7 * 24 * 60),
    weeklyGoalQuestions: nonNegative(raw.weeklyGoalQuestions, 100_000),
    order: num(raw.order),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed) || trimmed.length > 2000) return null;
  return trimmed;
}

function toTopic(raw: unknown, index: number): StudyTopic | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = str(entry.id) || `t${index}`;
  return {
    id,
    name: str(entry.name),
    done: Boolean(entry.done),
    doneAt: entry.doneAt ? num(entry.doneAt) : null,
    pageId: nullableStr(entry.pageId),
    url: safeUrl(entry.url),
  };
}

export function toSubject(raw: StudyDoc): StudySubject {
  const topics = Array.isArray(raw.topics)
    ? raw.topics.map(toTopic).filter((topic): topic is StudyTopic => Boolean(topic))
    : [];
  const color = str(raw.color);
  return {
    id: raw.id,
    planId: str(raw.planId),
    name: str(raw.name),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : SUBJECT_COLORS[0],
    topics,
    notebookId: nullableStr(raw.notebookId),
    order: num(raw.order),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

function toPageRanges(raw: unknown): PageRange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const from = nonNegative(value.from, 1_000_000);
      const to = nonNegative(value.to, 1_000_000);
      return { from, to };
    })
    .filter((entry): entry is PageRange => Boolean(entry))
    .slice(0, 20);
}

function toVideos(raw: unknown): VideoEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      return {
        title: str(value.title).slice(0, 160),
        fromSec: nonNegative(value.fromSec, 48 * 3600),
        toSec: nonNegative(value.toSec, 48 * 3600),
      };
    })
    .filter((entry): entry is VideoEntry => Boolean(entry))
    .slice(0, 20);
}

export function pagesFromRanges(ranges: readonly PageRange[]): number {
  return ranges.reduce((sum, range) => sum + (range.to >= range.from && range.to > 0 ? range.to - range.from + (range.from > 0 ? 1 : 0) : 0), 0);
}

export function secondsFromVideos(videos: readonly VideoEntry[]): number {
  return videos.reduce((sum, video) => sum + Math.max(0, video.toSec - video.fromSec), 0);
}

export function toSession(raw: StudyDoc): StudySession {
  const source = raw.source === "timer" || raw.source === "import" ? raw.source : "manual";
  const startMinute = raw.startMinute === null || raw.startMinute === undefined ? null : nonNegative(raw.startMinute, 1439);
  return {
    id: raw.id,
    planId: str(raw.planId),
    subjectId: str(raw.subjectId),
    topicId: nullableStr(raw.topicId),
    day: day(raw.day, "1970-01-01"),
    startMinute,
    durationSec: nonNegative(raw.durationSec, MAX_SESSION_SECONDS),
    categoryId:
      str(raw.categoryId, "theory") === "reading" ||
      str(raw.categoryId, "theory") === "video" ||
      str(raw.categoryId, "theory") === "summary"
        ? "theory"
        : str(raw.categoryId, "theory") || "theory",
    correct: nonNegative(raw.correct),
    wrong: nonNegative(raw.wrong),
    pages: nonNegative(raw.pages),
    pageRanges: toPageRanges(raw.pageRanges),
    videoSec: nonNegative(raw.videoSec, MAX_SESSION_SECONDS),
    videos: toVideos(raw.videos),
    material: str(raw.material),
    comment: str(raw.comment),
    reviewId: nullableStr(raw.reviewId),
    cycleItemId: nullableStr(raw.cycleItemId),
    pageId: nullableStr(raw.pageId),
    source,
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export function toReview(raw: StudyDoc): StudyReview {
  const status: ReviewStatus = raw.status === "done" || raw.status === "ignored" ? raw.status : "pending";
  return {
    id: raw.id,
    planId: str(raw.planId),
    subjectId: str(raw.subjectId),
    topicId: nullableStr(raw.topicId),
    sessionId: str(raw.sessionId),
    intervalDays: nonNegative(raw.intervalDays, 3650),
    dueDay: day(raw.dueDay, "1970-01-01"),
    status,
    resolvedAt: raw.resolvedAt ? num(raw.resolvedAt) : null,
    resolvedSessionId: nullableStr(raw.resolvedSessionId),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

function toExamRow(raw: unknown, index: number): MockExamRow | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const total = nonNegative(entry.total, 100_000);
  const correct = Math.min(total, nonNegative(entry.correct));
  const wrong = Math.min(total - correct, nonNegative(entry.wrong));
  return {
    id: str(entry.id) || `r${index}`,
    subjectId: nullableStr(entry.subjectId),
    name: str(entry.name),
    weight: Math.max(0, Math.min(100, num(entry.weight, 1))),
    total,
    correct,
    wrong,
    blank: Math.max(0, total - correct - wrong),
  };
}

export function toExam(raw: StudyDoc): MockExam {
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(toExamRow).filter((row): row is MockExamRow => Boolean(row))
    : [];
  return {
    id: raw.id,
    planId: str(raw.planId),
    day: day(raw.day, "1970-01-01"),
    name: str(raw.name),
    style: raw.style === "truefalse" ? "truefalse" : "multiple",
    board: str(raw.board),
    durationSec: nonNegative(raw.durationSec, 24 * 3600),
    rows,
    comment: str(raw.comment),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

function toCycleItem(raw: unknown, index: number): CycleItem | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const subjectId = str(entry.subjectId);
  if (!subjectId) return null;
  return { id: str(entry.id) || `c${index}`, subjectId, minutes: Math.max(5, nonNegative(entry.minutes, 600)) };
}

const AGENDA_REPEATS: AgendaRepeat[] = ["none", "daily", "weekly", "weekdays", "monthly", "custom"];

function toAgendaEntry(raw: unknown, index: number): AgendaEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const subjectId = str(entry.subjectId);
  if (!subjectId || !isDayKey(entry.start)) return null;
  const repeat = AGENDA_REPEATS.includes(entry.repeat as AgendaRepeat) ? (entry.repeat as AgendaRepeat) : "none";
  const weekdays = Array.isArray(entry.weekdays)
    ? [...new Set(entry.weekdays.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort(
        (a, b) => a - b
      )
    : [];
  return {
    id: str(entry.id) || `a${index}`,
    subjectId,
    minutes: Math.max(5, nonNegative(entry.minutes, 600)),
    start: entry.start,
    until: isDayKey(entry.until) ? entry.until : null,
    repeat: repeat === "custom" && !weekdays.length ? "none" : repeat,
    weekdays,
    topicId: nullableStr(entry.topicId),
    note: str(entry.note).slice(0, 120),
    removed: Array.isArray(entry.removed) ? entry.removed.filter(isDayKey).slice(-MAX_AGENDA_REMOVED) : [],
    createdAt: num(entry.createdAt),
  };
}

function toCompletion(raw: unknown): CycleCompletion | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (!isDayKey(entry.day)) return null;
  return {
    itemId: str(entry.itemId),
    subjectId: str(entry.subjectId),
    minutes: nonNegative(entry.minutes, 600),
    round: nonNegative(entry.round),
    day: entry.day,
    sessionId: nullableStr(entry.sessionId),
    skipped: Boolean(entry.skipped),
    at: num(entry.at),
  };
}

export function toCycle(raw: StudyDoc): StudyCycle {
  const items = Array.isArray(raw.items)
    ? raw.items.map(toCycleItem).filter((item): item is CycleItem => Boolean(item))
    : [];
  const weekMinutes = Array.from({ length: 7 }, (_, index) =>
    Array.isArray(raw.weekMinutes) ? nonNegative(raw.weekMinutes[index], 24 * 60) : 0
  );
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const value = entry as Record<string, unknown>;
          const subjectId = str(value.subjectId);
          if (!subjectId) return null;
          return {
            subjectId,
            weight: Math.min(5, Math.max(1, nonNegative(value.weight) || 3)),
            level: Math.min(5, Math.max(1, nonNegative(value.level) || 3)),
          };
        })
        .filter((entry): entry is { subjectId: string; weight: number; level: number } => Boolean(entry))
    : [];
  const history = Array.isArray(raw.history)
    ? raw.history.map(toCompletion).filter((entry): entry is CycleCompletion => Boolean(entry))
    : [];
  const agenda = Array.isArray(raw.agenda)
    ? raw.agenda.map(toAgendaEntry).filter((entry): entry is AgendaEntry => Boolean(entry)).slice(0, MAX_AGENDA_ENTRIES)
    : [];
  return {
    id: raw.id,
    planId: str(raw.planId) || raw.id,
    items,
    agenda,
    weekMinutes,
    pointer: items.length ? nonNegative(raw.pointer) % items.length : 0,
    round: nonNegative(raw.round),
    history,
    subjects,
    minBlock: Math.max(10, nonNegative(raw.minBlock) || 30),
    maxBlock: Math.max(15, nonNegative(raw.maxBlock) || 90),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export function toReminder(raw: StudyDoc): StudyReminder {
  const kind: ReminderKind = raw.kind === "exam" || raw.kind === "event" ? raw.kind : "task";
  return {
    id: raw.id,
    title: str(raw.title),
    kind,
    day: day(raw.day, "1970-01-01"),
    done: Boolean(raw.done),
    planId: nullableStr(raw.planId),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export function toSticky(raw: StudyDoc): StudySticky {
  const color = STICKY_COLORS.includes(raw.color as StickyColor) ? (raw.color as StickyColor) : "sun";
  return {
    id: raw.id,
    html: str(raw.html),
    color,
    order: num(raw.order),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}
