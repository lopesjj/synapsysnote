import type { DayKey, StudyPlan, StudySession } from "@/types/study";
import { addDays, compareDay } from "./dates";

/**
 * Série de editais. Um objetivo que teve a prova e marcou outra continua a mesma
 * série: os editais antigos guardam os registros de então e só o tempo total de
 * estudo soma a série inteira. Edital sem `seriesId` é série de um só.
 */
export function seriesIdOf(plan: Pick<StudyPlan, "id" | "seriesId">): string {
  return plan.seriesId || plan.id;
}

/** Editais da série, do mais antigo para o mais recente. */
export function termsOf(plans: readonly StudyPlan[], series: string): StudyPlan[] {
  return plans
    .filter((plan) => seriesIdOf(plan) === series)
    .sort((a, b) => a.createdAt - b.createdAt || a.order - b.order);
}

/** O edital em que se estuda agora: o mais recente que não foi arquivado. */
export function currentTerm(plans: readonly StudyPlan[], series: string): StudyPlan | null {
  const terms = termsOf(plans, series);
  for (let index = terms.length - 1; index >= 0; index -= 1) {
    if (!terms[index].archived) return terms[index];
  }
  return terms[terms.length - 1] ?? null;
}

/** Posição do edital na série, a partir de 1, e o tamanho dela. */
export function termPosition(plans: readonly StudyPlan[], plan: StudyPlan): { index: number; total: number } {
  const terms = termsOf(plans, seriesIdOf(plan));
  const index = terms.findIndex((entry) => entry.id === plan.id);
  return { index: index < 0 ? terms.length : index + 1, total: terms.length };
}

/**
 * Edital antigo da série: ficou arquivado quando a prova nova abriu outro. Ele
 * não é um objetivo arquivado pelo usuário — é histórico dentro da série, então
 * não entra na lista de objetivos nem pode ser reativado por fora (reativar
 * deixaria dois editais abertos com o mesmo nome).
 */
export function isPastTerm(plans: readonly StudyPlan[], plan: StudyPlan): boolean {
  if (!plan.archived) return false;
  const current = currentTerm(plans, seriesIdOf(plan));
  return Boolean(current && current.id !== plan.id && !current.archived);
}

/** Série com mais de um edital: só então a tela mostra a divisão. */
export function hasTerms(plans: readonly StudyPlan[], plan: StudyPlan): boolean {
  return termsOf(plans, seriesIdOf(plan)).length > 1;
}

/** Uma entrada por série, representada pelo edital atual, na ordem dos objetivos. */
export function seriesHeads(plans: readonly StudyPlan[]): StudyPlan[] {
  const seen = new Set<string>();
  const heads: StudyPlan[] = [];
  for (const plan of plans) {
    const series = seriesIdOf(plan);
    if (seen.has(series)) continue;
    seen.add(series);
    heads.push(currentTerm(plans, series) ?? plan);
  }
  return heads;
}

/** Segundos estudados na série inteira, somando os editais anteriores. */
export function seriesSeconds(
  plans: readonly StudyPlan[],
  sessions: readonly StudySession[],
  series: string,
  examSecondsOf?: (planId: string) => number
): number {
  const ids = new Set(termsOf(plans, series).map((plan) => plan.id));
  let seconds = 0;
  for (const session of sessions) {
    if (ids.has(session.planId)) seconds += session.durationSec;
  }
  if (examSecondsOf) {
    for (const id of ids) seconds += examSecondsOf(id);
  }
  return seconds;
}

/**
 * Janela cobrada pela contagem de dias. Ela começa no `startDay` do primeiro
 * edital e abre uma pausa depois de cada prova: do dia seguinte até a volta aos
 * estudos, nada ali conta como dia perdido. Uma série de editais entra inteira,
 * para o histórico de dias estudados não se perder quando o edital vira.
 */
export interface StudyPause {
  /** Primeiro dia neutro: o dia seguinte à prova. */
  from: DayKey;
  /** Primeiro dia que volta a contar; `null` enquanto ninguém voltou a estudar. */
  until: DayKey | null;
}

export interface StudyWindow {
  startDay: DayKey | null;
  pauses: StudyPause[];
}

export function studyWindow(
  terms: readonly (Pick<StudyPlan, "startDay" | "examDate"> | null | undefined)[],
  studied: ReadonlySet<DayKey>
): StudyWindow {
  // O piso só existe se todo edital tiver um: um edital sem `startDay` cobre a
  // história inteira dele, e o `startDay` de outro não pode apagar esses dias.
  let startDay: DayKey | null = null;
  let everyTermStarts = true;
  let lastStudied: DayKey | null = null;
  for (const day of studied) {
    if (!lastStudied || compareDay(day, lastStudied) > 0) lastStudied = day;
  }
  const pauses: StudyPause[] = [];
  // Trecho parado que só vale se um edital novo o fechar: sem prova nova marcada,
  // quem voltou a estudar depois da prova segue sendo cobrado normalmente.
  const quiet: StudyPause[] = [];
  for (const term of terms) {
    if (!term) continue;
    if (!term.startDay) everyTermStarts = false;
    else if (!startDay || compareDay(term.startDay, startDay) < 0) startDay = term.startDay;
    if (!term.examDate) continue;
    const from = addDays(term.examDate, 1);
    let resume: DayKey | null = null;
    for (const day of studied) {
      if (compareDay(day, from) < 0) continue;
      if (!resume || compareDay(day, resume) < 0) resume = day;
    }
    if (!resume) {
      pauses.push({ from, until: null });
      continue;
    }
    // Voltou a estudar depois da prova: o intervalo até a volta fica neutro e
    // dali em diante o dia perdido volta a valer.
    if (compareDay(resume, from) > 0) pauses.push({ from, until: resume });
    if (lastStudied && compareDay(lastStudied, from) >= 0) quiet.push({ from: addDays(lastStudied, 1), until: null });
  }
  // O começo de um edital novo fecha a pausa da prova anterior — e é só ele que
  // limpa os dias perdidos entre o último registro e a volta aos estudos.
  const closeAtNextTerm = (list: readonly StudyPause[]) => {
    for (const term of terms) {
      if (!term?.startDay) continue;
      for (const pause of list) {
        if (compareDay(term.startDay, pause.from) < 0) continue;
        if (pause.until === null || compareDay(term.startDay, pause.until) < 0) pause.until = term.startDay;
      }
    }
  };
  closeAtNextTerm(pauses);
  closeAtNextTerm(quiet);
  return {
    startDay: everyTermStarts ? startDay : null,
    pauses: [...pauses, ...quiet.filter((pause) => pause.until !== null)].filter(
      (pause) => pause.until === null || compareDay(pause.until, pause.from) > 0
    ),
  };
}

/** O dia entra na contagem de estudado/perdido? Fora da janela ele fica neutro. */
export function windowCovers(window: StudyWindow, day: DayKey): boolean {
  if (window.startDay && compareDay(day, window.startDay) < 0) return false;
  for (const pause of window.pauses) {
    if (compareDay(day, pause.from) < 0) continue;
    if (pause.until === null || compareDay(day, pause.until) < 0) return false;
  }
  return true;
}

/**
 * Intervalos de revisão que ainda cabem antes da prova. A prova fecha a agenda:
 * nada é marcado para o dia dela em diante.
 */
export function intervalsBefore(intervals: readonly number[], day: DayKey, examDate: DayKey | null): number[] {
  if (!examDate) return [...intervals];
  return intervals.filter((interval) => compareDay(addDays(day, interval), examDate) < 0);
}

/** Revisões pendentes que a prova apaga ao ser marcada. */
export function reviewsDroppedBy<T extends { status: string; dueDay: DayKey }>(
  reviews: readonly T[],
  examDate: DayKey | null
): T[] {
  if (!examDate) return [];
  return reviews.filter((review) => review.status === "pending" && compareDay(review.dueDay, examDate) >= 0);
}
