import type {
  DayKey,
  MockExam,
  PerformanceBand,
  StudyAggregate,
  StudySession,
  StudySettings,
  StudySubject,
} from "@/types/study";
import { addDays, compareDay, dayRange, weekdayOf } from "./dates";

export function emptyAggregate(): StudyAggregate {
  return {
    seconds: 0,
    correct: 0,
    wrong: 0,
    questions: 0,
    accuracy: null,
    pages: 0,
    pageSeconds: 0,
    videoSec: 0,
    sessions: 0,
    lastDay: null,
  };
}

export function accuracyOf(correct: number, wrong: number): number | null {
  const total = correct + wrong;
  return total > 0 ? correct / total : null;
}

function include(target: StudyAggregate, session: StudySession) {
  target.seconds += session.durationSec;
  target.correct += session.correct;
  target.wrong += session.wrong;
  target.questions += session.correct + session.wrong;
  target.pages += session.pages;
  if (session.pages > 0) target.pageSeconds += session.durationSec;
  target.videoSec += session.videoSec;
  target.sessions += 1;
  if (!target.lastDay || compareDay(session.day, target.lastDay) > 0) target.lastDay = session.day;
}

function finish(target: StudyAggregate): StudyAggregate {
  target.accuracy = accuracyOf(target.correct, target.wrong);
  return target;
}

export function aggregate(sessions: readonly StudySession[]): StudyAggregate {
  const result = emptyAggregate();
  for (const session of sessions) include(result, session);
  return finish(result);
}

export function groupSessions<K>(
  sessions: readonly StudySession[],
  keyOf: (session: StudySession) => K | null
): Map<K, StudyAggregate> {
  const map = new Map<K, StudyAggregate>();
  for (const session of sessions) {
    const key = keyOf(session);
    if (key === null) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = emptyAggregate();
      map.set(key, entry);
    }
    include(entry, session);
  }
  for (const entry of map.values()) finish(entry);
  return map;
}

export function topicKey(subjectId: string, topicId: string | null): string {
  return `${subjectId}::${topicId ?? ""}`;
}

export function pagesPerHour(agg: StudyAggregate): number {
  if (!agg.pageSeconds) return 0;
  return agg.pages / (agg.pageSeconds / 3600);
}

export function performanceBand(
  accuracy: number | null,
  settings: Pick<StudySettings, "performanceLow" | "performanceHigh">
): PerformanceBand | null {
  if (accuracy === null) return null;
  const percent = accuracy * 100;
  if (percent < settings.performanceLow) return "low";
  if (percent < settings.performanceHigh) return "mid";
  return "high";
}

export interface CoverageInfo {
  done: number;
  total: number;
  ratio: number;
}

export function coverageOf(subjects: readonly StudySubject[]): CoverageInfo {
  let done = 0;
  let total = 0;
  for (const subject of subjects) {
    total += subject.topics.length;
    done += subject.topics.filter((topic) => topic.done).length;
  }
  return { done, total, ratio: total ? done / total : 0 };
}

export function studiedDays(sessions: readonly StudySession[], exams: readonly MockExam[] = []): Set<DayKey> {
  const set = new Set<DayKey>();
  for (const session of sessions) if (session.durationSec > 0 || session.correct + session.wrong > 0) set.add(session.day);
  for (const exam of exams) if (exam.durationSec > 0) set.add(exam.day);
  return set;
}

export function isPlannedDay(day: DayKey, weekdays: readonly number[]): boolean {
  if (!weekdays.length) return true;
  return weekdays.includes(weekdayOf(day));
}

export interface StreakInfo {
  current: number;
  best: number;
  studiedToday: boolean;
}

export function streakInfo(days: ReadonlySet<DayKey>, today: DayKey, weekdays: readonly number[]): StreakInfo {
  const studiedToday = days.has(today);
  if (!days.size) return { current: 0, best: 0, studiedToday };
  const first = [...days].sort(compareDay)[0];
  let current = 0;
  let cursor = studiedToday ? today : addDays(today, -1);
  while (compareDay(cursor, first) >= 0) {
    if (days.has(cursor)) current += 1;
    else if (isPlannedDay(cursor, weekdays)) break;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  const last = compareDay(today, first) >= 0 ? today : first;
  for (const day of dayRange(first, last)) {
    if (days.has(day)) {
      run += 1;
      best = Math.max(best, run);
    } else if (isPlannedDay(day, weekdays) && day !== today) {
      run = 0;
    }
  }
  return { current, best: Math.max(best, current), studiedToday };
}

export interface ConsistencyInfo {
  studied: number;
  planned: number;
  missed: number;
  ratio: number;
  firstDay: DayKey | null;
}

export function consistencyInfo(
  days: ReadonlySet<DayKey>,
  today: DayKey,
  weekdays: readonly number[],
  from?: DayKey | null
): ConsistencyInfo {
  const sorted = [...days].sort(compareDay);
  const firstStudied = sorted[0] ?? null;
  const start = from && firstStudied ? (compareDay(from, firstStudied) > 0 ? from : firstStudied) : firstStudied;
  if (!start || compareDay(start, today) > 0) return { studied: 0, planned: 0, missed: 0, ratio: 0, firstDay: firstStudied };
  let studied = 0;
  let planned = 0;
  for (const day of dayRange(start, today)) {
    const has = days.has(day);
    const expected = isPlannedDay(day, weekdays);
    if (day === today && !has) continue;
    if (has || expected) planned += 1;
    if (has) studied += 1;
  }
  return {
    studied,
    planned,
    missed: Math.max(0, planned - studied),
    ratio: planned ? studied / planned : 0,
    firstDay: firstStudied,
  };
}

export interface ExamTotals {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  maxScore: number;
  percent: number | null;
}

export function examTotals(exam: Pick<MockExam, "rows" | "style">): ExamTotals {
  let total = 0;
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let score = 0;
  let maxScore = 0;
  for (const row of exam.rows) {
    total += row.total;
    correct += row.correct;
    wrong += row.wrong;
    blank += row.blank;
    const weight = Number.isFinite(row.weight) ? row.weight : 1;
    score += weight * (exam.style === "truefalse" ? row.correct - row.wrong : row.correct);
    maxScore += weight * row.total;
  }
  return {
    total,
    correct,
    wrong,
    blank,
    score: Math.round(score * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    percent: maxScore > 0 ? score / maxScore : null,
  };
}

export function inRange(day: DayKey, from: DayKey | null, to: DayKey | null): boolean {
  if (from && compareDay(day, from) < 0) return false;
  if (to && compareDay(day, to) > 0) return false;
  return true;
}

export function secondsByDay(
  sessions: readonly StudySession[],
  exams: readonly MockExam[] = []
): Map<DayKey, number> {
  const map = new Map<DayKey, number>();
  for (const session of sessions) map.set(session.day, (map.get(session.day) ?? 0) + session.durationSec);
  for (const exam of exams) map.set(exam.day, (map.get(exam.day) ?? 0) + exam.durationSec);
  return map;
}

export function percentLabel(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export type DayStatus = "studied" | "missed" | "rest" | "pending" | "before" | "future";

export function dayStatus(
  day: DayKey,
  studied: ReadonlySet<DayKey>,
  firstDay: DayKey | null,
  today: DayKey,
  weekdays: readonly number[]
): DayStatus {
  if (studied.has(day)) return "studied";
  if (!isPlannedDay(day, weekdays)) return "rest";
  if (compareDay(day, today) > 0) return "future";
  if (day === today) return "pending";
  if (!firstDay || compareDay(day, firstDay) < 0) return "before";
  return "missed";
}

