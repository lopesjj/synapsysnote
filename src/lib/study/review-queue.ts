import type { DayKey, ReviewStatus, StudyReview } from "@/types/study";
import { addDays, dayKeyOf } from "./dates";

export type ReviewTab = "due" | "overdue" | "upcoming" | "done" | "ignored";
export type ReviewPeriod = "7" | "30" | "90" | "365" | "all";

export type ReviewBuckets = Record<ReviewTab, StudyReview[]>;

/** Dia em que a revisão foi resolvida; sem registro, vale o vencimento. */
export function resolvedDayOf(review: Pick<StudyReview, "resolvedAt" | "dueDay">, timeZone?: string | null): DayKey {
  return review.resolvedAt ? dayKeyOf(review.resolvedAt, timeZone) : review.dueDay;
}

/**
 * Separa as revisões nas abas da página. O período recorta atrasadas e
 * resolvidas para trás e próximas para frente; "para hoje" nunca é recortada.
 */
export function bucketReviews(
  reviews: readonly StudyReview[],
  options: { today: DayKey; timeZone?: string | null; period: ReviewPeriod; subjectId?: string | null }
): ReviewBuckets {
  const { today, timeZone, period, subjectId } = options;
  const buckets: ReviewBuckets = { due: [], overdue: [], upcoming: [], done: [], ignored: [] };
  const span = period === "all" ? null : Number(period);
  const past = span === null ? null : addDays(today, -span);
  const future = span === null ? null : addDays(today, span);
  for (const review of reviews) {
    if (subjectId && review.subjectId !== subjectId) continue;
    if (review.status !== "pending") {
      if (past && resolvedDayOf(review, timeZone) < past) continue;
      buckets[review.status === "done" ? "done" : "ignored"].push(review);
    } else if (review.dueDay === today) {
      buckets.due.push(review);
    } else if (review.dueDay < today) {
      if (past && review.dueDay < past) continue;
      buckets.overdue.push(review);
    } else {
      if (future && review.dueDay > future) continue;
      buckets.upcoming.push(review);
    }
  }
  const byDue = (a: StudyReview, b: StudyReview) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : a.intervalDays - b.intervalDays);
  const byResolved = (a: StudyReview, b: StudyReview) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0);
  buckets.due.sort(byDue);
  buckets.overdue.sort(byDue);
  buckets.upcoming.sort(byDue);
  buckets.done.sort(byResolved);
  buckets.ignored.sort(byResolved);
  return buckets;
}

export interface ReviewStep {
  id: string;
  intervalDays: number;
  status: ReviewStatus;
}

export interface ReviewStage {
  /** Posição da revisão na sequência da sessão, a partir de 1. */
  index: number;
  total: number;
  steps: ReviewStep[];
}

/**
 * Cada sessão agenda uma revisão por intervalo. A etapa de uma revisão é a
 * posição dela entre as irmãs da mesma sessão (mesma disciplina e tópico), na
 * ordem dos intervalos; assim a contagem continua certa mesmo depois de os
 * intervalos mudarem.
 */
export function reviewStages(reviews: readonly StudyReview[]): Map<string, ReviewStage> {
  const bySession = new Map<string, StudyReview[]>();
  for (const review of reviews) {
    const key = review.sessionId ? `${review.sessionId}|${review.subjectId}|${review.topicId ?? ""}` : `review:${review.id}`;
    const list = bySession.get(key);
    if (list) list.push(review);
    else bySession.set(key, [review]);
  }
  const stages = new Map<string, ReviewStage>();
  for (const list of bySession.values()) {
    list.sort((a, b) => a.intervalDays - b.intervalDays || (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : 0));
    const steps = list.map((review) => ({ id: review.id, intervalDays: review.intervalDays, status: review.status }));
    list.forEach((review, index) => stages.set(review.id, { index: index + 1, total: list.length, steps }));
  }
  return stages;
}

export interface ForecastDay {
  day: DayKey;
  count: number;
}

/** Revisões pendentes em cada um dos próximos `days` dias, a partir de hoje. */
export function reviewForecast(
  reviews: readonly StudyReview[],
  today: DayKey,
  days: number,
  subjectId?: string | null
): ForecastDay[] {
  const counts = new Map<DayKey, number>();
  const last = addDays(today, days - 1);
  for (const review of reviews) {
    if (review.status !== "pending" || review.dueDay < today || review.dueDay > last) continue;
    if (subjectId && review.subjectId !== subjectId) continue;
    counts.set(review.dueDay, (counts.get(review.dueDay) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, index);
    return { day, count: counts.get(day) ?? 0 };
  });
}

export interface Punctuality {
  onTime: number;
  late: number;
  ignored: number;
  total: number;
}

/** Como as revisões resolvidas nos últimos `days` dias terminaram: no prazo, com atraso ou ignoradas. */
export function reviewPunctuality(
  reviews: readonly StudyReview[],
  today: DayKey,
  timeZone: string | null | undefined,
  days: number,
  subjectId?: string | null
): Punctuality {
  const first = addDays(today, -(days - 1));
  const result: Punctuality = { onTime: 0, late: 0, ignored: 0, total: 0 };
  for (const review of reviews) {
    if (review.status === "pending") continue;
    if (subjectId && review.subjectId !== subjectId) continue;
    const resolved = resolvedDayOf(review, timeZone);
    if (resolved < first || resolved > today) continue;
    if (review.status === "ignored") result.ignored += 1;
    else if (resolved <= review.dueDay) result.onTime += 1;
    else result.late += 1;
    result.total += 1;
  }
  return result;
}
