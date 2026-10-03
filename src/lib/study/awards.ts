import type { DayKey, StudyPlan, StudySubject } from "@/types/study";
import { compareDay, dayKeyOf, dayRange, diffDays, keyToUtc } from "./dates";
import { isPlannedDay } from "./metrics";

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export interface StreakRun {
  start: DayKey;
  end: DayKey;
  length: number;
  days: DayKey[];
}

export function streakRuns(days: ReadonlySet<DayKey>, today: DayKey, weekdays: readonly number[]): StreakRun[] {
  const sorted = [...days].sort(compareDay);
  if (!sorted.length) return [];
  const first = sorted[0];
  const last = compareDay(today, first) >= 0 ? today : first;
  const runs: DayKey[][] = [];
  let current: DayKey[] = [];
  for (const day of dayRange(first, last)) {
    if (days.has(day)) {
      current.push(day);
    } else if (isPlannedDay(day, weekdays) && day !== today) {
      if (current.length) runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs.map((list) => ({ start: list[0], end: list[list.length - 1], length: list.length, days: list }));
}

export type AwardClaim = "kept" | "pending" | "lost";

interface AwardBase {
  id: string;
  earnedAt: number | null;
  earnedDay: DayKey | null;
  progress: number;
  claimKey: string;
  claim: AwardClaim | null;
  daysLeft: number | null;
}

export interface SubjectAward extends AwardBase {
  kind: "subject";
  subjectId: string;
  name: string;
  color: string;
  done: number;
  total: number;
}

export interface GoalAward extends AwardBase {
  kind: "goal";
  planId: string;
  name: string;
  done: number;
  total: number;
}

export interface StreakAward extends AwardBase {
  kind: "streak";
  threshold: StreakMilestone;
  tier: number;
  current: number;
}

export type Award = SubjectAward | GoalAward | StreakAward;

export interface AwardBook {
  all: Award[];
  earned: Award[];
  kept: Award[];
  pending: Award[];
  lost: Award[];
  locked: Award[];
  subjects: SubjectAward[];
  goal: GoalAward | null;
  streaks: StreakAward[];
  nextStreak: StreakAward | null;
  goalComplete: boolean;
}

export function subjectCompletion(subject: StudySubject): { done: number; total: number; at: number | null } {
  const total = subject.topics.length;
  const finished = subject.topics.filter((topic) => topic.done);
  const done = finished.length;
  if (!total || done < total) return { done, total, at: null };
  const stamps = finished.map((topic) => topic.doneAt ?? 0).filter((value) => value > 0);
  const at = stamps.length === finished.length ? Math.max(...stamps) : subject.updatedAt || null;
  return { done, total, at };
}

export const CLAIM_WINDOW_DAYS = 7;
const CLAIM_POLICY_SINCE = Date.UTC(2026, 9, 1);

const UNCLAIMED = { claimKey: "", claim: null, daysLeft: null } as const;

export function buildAwardBook({
  plan,
  subjects,
  studied,
  today,
  weekdays,
  timeZone,
  currentStreak,
  claims,
}: {
  plan: StudyPlan;
  subjects: readonly StudySubject[];
  studied: ReadonlySet<DayKey>;
  today: DayKey;
  weekdays: readonly number[];
  timeZone?: string | null;
  currentStreak: number;
  claims: Readonly<Record<string, number>>;
}): AwardBook {
  const subjectAwards: SubjectAward[] = subjects
    .filter((subject) => subject.topics.length > 0)
    .map((subject) => {
      const { done, total, at } = subjectCompletion(subject);
      return {
        kind: "subject",
        id: `subject:${subject.id}`,
        subjectId: subject.id,
        name: subject.name,
        color: subject.color,
        done,
        total,
        earnedAt: at,
        earnedDay: at ? dayKeyOf(at, timeZone) : null,
        progress: total ? done / total : 0,
        ...UNCLAIMED,
      };
    });

  const completedSubjects = subjectAwards.filter((award) => award.earnedAt !== null);
  const goalComplete = subjectAwards.length > 0 && completedSubjects.length === subjectAwards.length;
  const goalAt = goalComplete ? Math.max(...completedSubjects.map((award) => award.earnedAt ?? 0)) : null;
  const goal: GoalAward | null = subjectAwards.length
    ? {
        kind: "goal",
        id: `goal:${plan.id}`,
        planId: plan.id,
        name: plan.name,
        done: completedSubjects.length,
        total: subjectAwards.length,
        earnedAt: goalAt,
        earnedDay: goalAt ? dayKeyOf(goalAt, timeZone) : null,
        progress: subjectAwards.length ? completedSubjects.length / subjectAwards.length : 0,
        ...UNCLAIMED,
      }
    : null;

  const runs = streakRuns(studied, today, weekdays);
  const streaks: StreakAward[] = STREAK_MILESTONES.map((threshold, tier) => {
    let earnedDay: DayKey | null = null;
    for (const run of runs) {
      if (run.length >= threshold) {
        earnedDay = run.days[threshold - 1];
        break;
      }
    }
    return {
      kind: "streak",
      id: `streak:${threshold}`,
      threshold,
      tier,
      current: currentStreak,
      earnedAt: earnedDay ? keyToUtc(earnedDay) : null,
      earnedDay,
      progress: earnedDay ? 1 : Math.min(1, currentStreak / threshold),
      ...UNCLAIMED,
    };
  });

  const all: Award[] = [...(goal ? [goal] : []), ...subjectAwards, ...streaks];
  for (const award of all) {
    award.claimKey = `${plan.id}~${award.id}`;
    if (award.earnedAt === null || !award.earnedDay) continue;
    if (claims[award.claimKey] || award.earnedAt < CLAIM_POLICY_SINCE) {
      award.claim = "kept";
      continue;
    }
    const left = CLAIM_WINDOW_DAYS - Math.max(0, diffDays(award.earnedDay, today));
    award.claim = left > 0 ? "pending" : "lost";
    award.daysLeft = left > 0 ? left : 0;
  }
  const earned = all.filter((award) => award.earnedAt !== null);
  const kept = earned.filter((award) => award.claim === "kept");
  const pending = earned.filter((award) => award.claim === "pending");
  const lost = earned.filter((award) => award.claim === "lost");
  const locked = all.filter((award) => award.earnedAt === null);
  const nextStreak = streaks.find((award) => award.earnedAt === null) ?? null;

  return { all, earned, kept, pending, lost, locked, subjects: subjectAwards, goal, streaks, nextStreak, goalComplete };
}

export function awardWeight(award: Award): number {
  if (award.kind === "goal") return 3;
  if (award.kind === "subject") return 2;
  return 1;
}

export function sortAwards(list: readonly Award[]): Award[] {
  return [...list].sort((a, b) => {
    const weight = awardWeight(b) - awardWeight(a);
    if (weight) return weight;
    return (b.earnedAt ?? 0) - (a.earnedAt ?? 0);
  });
}

export function arrangeAwards(list: readonly Award[], order: readonly string[]): Award[] {
  if (!order.length) return [...list];
  const byId = new Map(list.map((award) => [award.id, award]));
  const seen = new Set<string>();
  const placed: Award[] = [];
  for (const id of order) {
    const award = byId.get(id);
    if (!award || seen.has(id)) continue;
    seen.add(id);
    placed.push(award);
  }
  return [...placed, ...list.filter((award) => !seen.has(award.id))];
}