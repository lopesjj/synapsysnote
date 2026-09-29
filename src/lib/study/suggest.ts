import type { DayKey, StudyCycle, StudySession, StudySettings, StudySubject, StudyTopic } from "@/types/study";
import { diffDays } from "./dates";
import { groupSessions, performanceBand } from "./metrics";

export type NextUpReason =
  | { kind: "cycle"; n: number; total: number }
  | { kind: "never" }
  | { kind: "stale"; days: number }
  | { kind: "weak"; accuracy: number }
  | { kind: "pending"; count: number };

export interface NextUp {
  subject: StudySubject;
  topic: StudyTopic | null;
  minutes: number | null;
  reason: NextUpReason;
}

function firstPending(subject: StudySubject): StudyTopic | null {
  return subject.topics.find((topic) => !topic.done) ?? null;
}

export function nextUp(
  subjects: readonly StudySubject[],
  sessions: readonly StudySession[],
  cycle: StudyCycle | null,
  today: DayKey,
  settings: Pick<StudySettings, "performanceLow" | "performanceHigh">
): NextUp | null {
  if (!subjects.length) return null;
  if (cycle && cycle.items.length) {
    const pointer = cycle.pointer % cycle.items.length;
    const item = cycle.items[pointer];
    const subject = subjects.find((entry) => entry.id === item.subjectId);
    if (subject) {
      return {
        subject,
        topic: firstPending(subject),
        minutes: item.minutes,
        reason: { kind: "cycle", n: pointer + 1, total: cycle.items.length },
      };
    }
  }
  const stats = groupSessions(sessions, (session) => session.subjectId);
  let best: { subject: StudySubject; score: number; reason: NextUpReason } | null = null;
  for (const subject of subjects) {
    const agg = stats.get(subject.id);
    const pending = subject.topics.filter((topic) => !topic.done).length;
    const stale = agg?.lastDay ? Math.max(0, diffDays(agg.lastDay, today)) : null;
    const band = performanceBand(agg?.accuracy ?? null, settings);
    let score = 0;
    let reason: NextUpReason;
    if (stale === null) {
      score = 1000 + pending;
      reason = { kind: "never" };
    } else if (band === "low" && agg?.accuracy !== null && agg?.accuracy !== undefined) {
      score = 40 + stale * 2 + pending * 0.2;
      reason = stale >= 5 ? { kind: "stale", days: stale } : { kind: "weak", accuracy: agg.accuracy };
    } else {
      score = stale * 3 + (subject.topics.length ? (pending / subject.topics.length) * 12 : 0);
      reason = stale >= 3 ? { kind: "stale", days: stale } : { kind: "pending", count: pending };
    }
    if (!best || score > best.score) best = { subject, score, reason };
  }
  if (!best) return null;
  return { subject: best.subject, topic: firstPending(best.subject), minutes: null, reason: best.reason };
}
