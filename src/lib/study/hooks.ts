"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "./provider";
import { materialNoteId, type MaterialTarget } from "./material";
import {
  absorbExamQuestions,
  aggregate,
  consistencyInfo,
  coverageOf,
  groupWithExams,
  secondsByDay,
  secondsOnDay,
  streakInfo,
  studiedDays,
} from "./metrics";
import { addDays, startOfWeek } from "./dates";
import { seriesIdOf, studyWindow, termsOf } from "./series";
import type { StudyReview } from "@/types/study";
import { buildAwardBook, type AwardBook } from "./awards";

export function useLiveNote() {
  const { pageById } = useWorkspace();
  return useCallback(
    (pageId: string | null | undefined) => {
      if (!pageId) return null;
      const page = pageById(pageId);
      return page && !page.deletedAt ? page : null;
    },
    [pageById]
  );
}

export function useMaterialNote() {
  const { reviews, sessions, subjects } = useStudy();
  const liveNote = useLiveNote();
  return useCallback(
    (target: MaterialTarget) => materialNoteId(target, { reviews, sessions, subjects }, (pageId) => Boolean(liveNote(pageId))),
    [liveNote, reviews, sessions, subjects]
  );
}

/**
 * Material da revisão: o que a sessão de origem anotou e a nota ligada a ela —
 * a mesma nota que "Revisar agora" abre. Nada é copiado para a revisão.
 */
export function useReviewMaterial() {
  const { sessions } = useStudy();
  const materialNote = useMaterialNote();
  return useCallback(
    (review: Pick<StudyReview, "id" | "sessionId" | "subjectId" | "topicId">): { material: string; pageId: string | null } | null => {
      const origin = sessions.find((session) => session.id === review.sessionId);
      const pageId = materialNote({ reviewId: review.id, subjectId: review.subjectId, topicId: review.topicId });
      const material = origin?.material.trim() ?? "";
      return material || pageId ? { material, pageId } : null;
    },
    [materialNote, sessions]
  );
}

/**
 * Varre o histórico do objetivo inteiro: agregados, dias estudados, sequência,
 * consistência, cobertura e as somas da semana. É caro — cada passagem percorre
 * todos os registros — então roda uma vez só, no `StudyMetricsProvider`, e as
 * telas leem o resultado por `usePlanMetrics`.
 */
function usePlanMetricsValue() {
  const { focusPlan, plans, sessions, exams, planSessions, planExams, planSubjects, planReviews, settings, today } = useStudy();
  const series = focusPlan ? seriesIdOf(focusPlan) : null;
  // A série atravessa a medida do tempo e a dos dias: o calendário de check-ins
  // e o foco continuam de um edital para o outro. Disciplina, cobertura e
  // questões seguem sendo do edital atual.
  const terms = useMemo(() => (series ? termsOf(plans, series) : []), [plans, series]);
  const termIds = useMemo(() => new Set(terms.map((plan) => plan.id)), [terms]);
  const seriesSessions = useMemo(
    () => (terms.length > 1 ? sessions.filter((entry) => termIds.has(entry.planId)) : planSessions),
    [planSessions, sessions, termIds, terms.length]
  );
  const seriesExams = useMemo(
    () => (terms.length > 1 ? exams.filter((entry) => termIds.has(entry.planId)) : planExams),
    [exams, planExams, termIds, terms.length]
  );
  const seriesTotal = useMemo(() => {
    if (terms.length < 2) return null;
    let seconds = 0;
    for (const session of seriesSessions) seconds += session.durationSec;
    for (const exam of seriesExams) seconds += exam.durationSec;
    return { seconds, terms: terms.length };
  }, [seriesExams, seriesSessions, terms.length]);
  return useMemo(() => {
    const total = absorbExamQuestions(aggregate(planSessions), planExams, planSubjects);
    const examSeconds = planExams.reduce((sum, exam) => sum + exam.durationSec, 0);
    // Dias de check-in de toda a série, para o calendário não zerar no edital novo.
    const days = studiedDays(seriesSessions, seriesExams);
    // Cada prova abre uma pausa; ela só fecha no registro seguinte ou no edital novo.
    const window = studyWindow(terms.length ? terms : [focusPlan], days);
    const seconds = total.seconds + examSeconds;
    const seriesSeconds = seriesTotal?.seconds ?? seconds;
    const pendingReviews = planReviews.filter((review) => review.status === "pending");
    const dueReviews = pendingReviews.filter((review) => review.dueDay <= today);
    const weekStart = startOfWeek(today, settings.weekStartsOn);
    const weekEnd = addDays(weekStart, 6);
    const weekSessions = planSessions.filter((session) => session.day >= weekStart && session.day <= weekEnd);
    const week = absorbExamQuestions(
      aggregate(weekSessions),
      planExams.filter((exam) => exam.day >= weekStart && exam.day <= weekEnd),
      planSubjects
    );
    const weekExamSeconds = planExams
      .filter((exam) => exam.day >= weekStart && exam.day <= weekEnd)
      .reduce((sum, exam) => sum + exam.durationSec, 0);
    return {
      total,
      seconds,
      examSeconds,
      days,
      avgPerDay: days.size ? seriesSeconds / days.size : 0,
      window,
      terms,
      /** Soma de todos os editais da série, ou `null` quando só existe um. */
      seriesTotal,
      streak: streakInfo(days, today, settings.studyWeekdays, window),
      consistency: consistencyInfo(days, today, settings.studyWeekdays, window.startDay, window),
      coverage: coverageOf(planSubjects),
      bySubject: groupWithExams(planSessions, planExams, planSubjects),
      byDay: secondsByDay(seriesSessions, seriesExams),
      dueReviews,
      overdueReviews: dueReviews.filter((review) => review.dueDay < today),
      pendingReviews,
      weekStart,
      weekEnd,
      weekSeconds: week.seconds + weekExamSeconds,
      weekQuestions: week.questions,
      // O tempo de hoje soma os simulados do dia, como o total e a semana.
      todaySeconds: secondsOnDay(planSessions, planExams, today),
    };
  }, [focusPlan, planExams, planReviews, planSessions, planSubjects, seriesExams, seriesSessions, seriesTotal, settings.studyWeekdays, settings.weekStartsOn, terms, today]);
}

function useAwardBookValue(metrics: PlanMetrics): AwardBook | null {
  const { focusPlan, planSubjects, settings, today } = useStudy();
  return useMemo(
    () =>
      focusPlan
        ? buildAwardBook({
            plan: focusPlan,
            subjects: planSubjects,
            studied: metrics.days,
            today,
            weekdays: settings.studyWeekdays,
            timeZone: settings.timeZone,
            currentStreak: metrics.streak.current,
            claims: settings.claimedAwards,
            window: metrics.window,
          })
        : null,
    [focusPlan, metrics.days, metrics.streak, metrics.window, planSubjects, settings.claimedAwards, settings.studyWeekdays, settings.timeZone, today]
  );
}

export type PlanMetrics = ReturnType<typeof usePlanMetricsValue>;

interface StudyMetricsValue {
  metrics: PlanMetrics;
  awards: AwardBook | null;
}

const StudyMetricsContext = createContext<StudyMetricsValue | null>(null);

/**
 * Calcula as métricas do objetivo em foco uma vez por mudança nos dados. Antes
 * disto cada painel do Panorama refazia a conta por conta própria — uma dúzia
 * de varreduras do histórico inteiro a cada render.
 */
export function StudyMetricsProvider({ children }: { children: ReactNode }) {
  const metrics = usePlanMetricsValue();
  const awards = useAwardBookValue(metrics);
  const value = useMemo<StudyMetricsValue>(() => ({ metrics, awards }), [awards, metrics]);
  return createElement(StudyMetricsContext.Provider, { value }, children);
}

function useStudyMetrics(): StudyMetricsValue {
  const value = useContext(StudyMetricsContext);
  if (!value) throw new Error("usePlanMetrics precisa estar dentro de <StudyMetricsProvider>");
  return value;
}

export function usePlanMetrics(): PlanMetrics {
  return useStudyMetrics().metrics;
}

export function useAwardBook(): AwardBook | null {
  return useStudyMetrics().awards;
}

export function useIconUploads() {
  const { adapter } = useWorkspace();
  const pending = useRef<Map<string, File>>(new Map());

  const drop = useCallback((url: string) => {
    const file = pending.current.get(url);
    if (!file) return;
    URL.revokeObjectURL(url);
    pending.current.delete(url);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      for (const url of pending.current.keys()) drop(url);
      const url = URL.createObjectURL(file);
      pending.current.set(url, file);
      return url;
    },
    [drop]
  );

  const materialize = useCallback(
    async (kept: string | null | undefined) => {
      const file = kept ? pending.current.get(kept) : undefined;
      if (!file) return kept ?? null;
      return adapter.uploadWorkspaceIcon(file);
    },
    [adapter]
  );

  const discard = useCallback(() => {
    for (const url of [...pending.current.keys()]) drop(url);
  }, [drop]);

  const releaseStored = useCallback(
    async (url: string | null | undefined) => {
      if (!url || !/^https?:\/\//.test(url)) return;
      try {
        await adapter.deleteMedia([url]);
      } catch {}
    },
    [adapter]
  );

  useEffect(() => {
    const files = pending.current;
    return () => {
      for (const url of files.keys()) URL.revokeObjectURL(url);
      files.clear();
    };
  }, []);

  return { upload, materialize, discard, releaseStored };
}

