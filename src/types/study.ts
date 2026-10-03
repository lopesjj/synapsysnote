export type DayKey = string;

export interface StudyPlan {
  id: string;
  name: string;
  institution: string;
  role: string;
  examDate: DayKey | null;
  icon: string | null;
  notes: string;
  archived: boolean;
  weeklyGoalMinutes: number;
  weeklyGoalQuestions: number;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudyTopic {
  id: string;
  name: string;
  done: boolean;
  doneAt: number | null;
  pageId: string | null;
  url: string | null;
}

export interface StudySubject {
  id: string;
  planId: string;
  name: string;
  color: string;
  topics: StudyTopic[];
  notebookId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type BuiltInCategoryId = "theory" | "practice" | "review";

export interface StudyCategory {
  id: string;
  name: string;
  color: string;
}

export type SessionSource = "manual" | "timer" | "import";

export interface PageRange {
  from: number;
  to: number;
}

export interface VideoEntry {
  title: string;
  fromSec: number;
  toSec: number;
}

export interface StudySession {
  id: string;
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
  pageRanges: PageRange[];
  videoSec: number;
  videos: VideoEntry[];
  material: string;
  comment: string;
  reviewId: string | null;
  cycleItemId: string | null;
  completedTopic: boolean;
  pageId: string | null;
  source: SessionSource;
  createdAt: number;
  updatedAt: number;
}

export type ReviewStatus = "pending" | "done" | "ignored";

export interface StudyReview {
  id: string;
  planId: string;
  subjectId: string;
  topicId: string | null;
  sessionId: string;
  intervalDays: number;
  dueDay: DayKey;
  status: ReviewStatus;
  resolvedAt: number | null;
  resolvedSessionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MockExamStyle = "multiple" | "truefalse";

export interface MockExamRow {
  id: string;
  subjectId: string | null;
  name: string;
  weight: number;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
}

export interface MockExam {
  id: string;
  planId: string;
  day: DayKey;
  name: string;
  style: MockExamStyle;
  board: string;
  durationSec: number;
  rows: MockExamRow[];
  comment: string;
  createdAt: number;
  updatedAt: number;
}

export interface CycleItem {
  id: string;
  subjectId: string;
  minutes: number;
}

export interface CycleCompletion {
  itemId: string;
  subjectId: string;
  minutes: number;
  round: number;
  day: DayKey;
  sessionId: string | null;
  skipped: boolean;
  at: number;
}

export interface CycleSubjectConfig {
  subjectId: string;
  weight: number;
  level: number;
}

export type AgendaRepeat = "none" | "daily" | "weekly" | "weekdays" | "monthly" | "custom";

/**
 * Disciplina marcada em dia fixo, fora da rotação do ciclo. As conclusões vão
 * para o histórico do ciclo com `itemId` igual ao `id` daqui e o dia da ocorrência.
 */
export interface AgendaEntry {
  id: string;
  subjectId: string;
  minutes: number;
  start: DayKey;
  until: DayKey | null;
  repeat: AgendaRepeat;
  weekdays: number[];
  topicId: string | null;
  note: string;
  removed: DayKey[];
  createdAt: number;
}

export interface StudyCycle {
  id: string;
  planId: string;
  items: CycleItem[];
  agenda: AgendaEntry[];
  weekMinutes: number[];
  pointer: number;
  round: number;
  history: CycleCompletion[];
  subjects: CycleSubjectConfig[];
  minBlock: number;
  maxBlock: number;
  progress?: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export type ReminderKind = "exam" | "task" | "event";

export interface StudyReminder {
  id: string;
  title: string;
  kind: ReminderKind;
  day: DayKey;
  done: boolean;
  planId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type StickyColor = "sun" | "mint" | "sky" | "rose" | "lilac";

export interface StudySticky {
  id: string;
  html: string;
  color: StickyColor;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type TimerSound = "none" | "chime" | "bell" | "soft" | "digital";

export interface StudyMotto {
  day: DayKey;
  id: string;
  author: string;
  en: string;
  texts: Record<string, string>;
}

export interface StudySettings {
  activePlanId: string | null;
  studyWeekdays: number[];
  weekStartsOn: 0 | 1;
  performanceLow: number;
  performanceHigh: number;
  reviewIntervals: number[];
  autoReviews: boolean;
  categories: StudyCategory[];
  timerSound: TimerSound;
  timeZone: string;
  pomodoroFocus: number;
  pomodoroShort: number;
  pomodoroLong: number;
  pomodoroRounds: number;
  claimedAwards: Record<string, number>;
  awardOrder: Record<string, string[]>;
  motto: StudyMotto | null;
  seenMottoIds: string[];
  updatedAt: number;
}

export interface StudyAggregate {
  seconds: number;
  correct: number;
  wrong: number;
  questions: number;
  accuracy: number | null;
  pages: number;
  pageSeconds: number;
  videoSec: number;
  sessions: number;
  lastDay: DayKey | null;
}

export type PerformanceBand = "low" | "mid" | "high";
