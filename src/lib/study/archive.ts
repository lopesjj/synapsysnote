import type { MockExam, StudyPlan, StudyReview, StudySession } from "@/types/study";
import { seriesIdOf, termsOf } from "./series";

/** Histórico de um objetivo arquivado, lido sob demanda. */
export interface ArchiveSlice {
  sessions: StudySession[];
  reviews: StudyReview[];
  exams: MockExam[];
}

export const bySessionOrder = (a: StudySession, b: StudySession) =>
  a.day === b.day ? b.createdAt - a.createdAt : a.day < b.day ? 1 : -1;

export const byDueDay = (a: StudyReview, b: StudyReview) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : 0);

export const byExamDay = (a: MockExam, b: MockExam) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt;

function join<T extends { id: string }>(base: readonly T[], extra: readonly (readonly T[])[], sort: (a: T, b: T) => number): T[] {
  const seen = new Set(base.map((entry) => entry.id));
  const out = [...base];
  for (const list of extra) {
    for (const entry of list) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out.length === base.length ? [...base] : out.sort(sort);
}

/**
 * Junta o que está assinado (objetivos abertos) com o histórico carregado dos
 * arquivados. Um objetivo que volta a ficar aberto entra pela assinatura, então
 * o id manda: nada aparece duas vezes.
 */
export function mergeArchive<T extends { sessions: StudySession[]; reviews: StudyReview[]; exams: MockExam[] }>(
  live: T,
  slices: readonly ArchiveSlice[]
): T {
  if (!slices.length) return live;
  return {
    ...live,
    sessions: join(live.sessions, slices.map((slice) => slice.sessions), bySessionOrder),
    reviews: join(live.reviews, slices.map((slice) => slice.reviews), byDueDay),
    exams: join(live.exams, slices.map((slice) => slice.exams), byExamDay),
  };
}

/**
 * Objetivo em foco, igual ao do contexto. Precisa ser calculado antes dele para
 * decidir qual histórico arquivado buscar.
 */
export function focusPlanOf(
  plans: readonly StudyPlan[],
  activePlanId: string | null,
  browsePlanId: string | null
): StudyPlan | null {
  const browsed = browsePlanId ? plans.find((plan) => plan.id === browsePlanId && plan.archived) ?? null : null;
  if (browsed) return browsed;
  const live = plans.filter((plan) => !plan.archived);
  return live.find((plan) => plan.id === activePlanId) ?? live[0] ?? null;
}

/**
 * Objetivos arquivados cujo histórico a tela precisa sem ninguém pedir: o que
 * está sendo navegado no arquivo e os editais anteriores da mesma série — deles
 * saem o tempo total da série e o calendário de dias estudados, que atravessam
 * os editais.
 */
export function archiveTargets(
  plans: readonly StudyPlan[],
  focus: StudyPlan | null,
  browsePlanId: string | null
): string[] {
  const ids = new Set<string>();
  if (browsePlanId && plans.some((plan) => plan.id === browsePlanId && plan.archived)) ids.add(browsePlanId);
  if (focus) {
    for (const term of termsOf(plans, seriesIdOf(focus))) {
      if (term.archived && term.id !== focus.id) ids.add(term.id);
    }
  }
  return [...ids].sort();
}

/**
 * União dos objetivos que as telas vivas estão pedindo. Cada tela registra sob
 * um id próprio e apaga o registro ao sair: o que saiu de cena para de ser
 * juntado ao estado a cada snapshot.
 */
export function requestedArchiveIds(byConsumer: Readonly<Record<string, readonly string[]>>): string[] {
  const ids = new Set<string>();
  for (const list of Object.values(byConsumer)) for (const planId of list) if (planId) ids.add(planId);
  return [...ids].sort();
}
