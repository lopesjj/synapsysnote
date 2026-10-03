"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
  streakInfo,
  studiedDays,
} from "./metrics";
import { addDays, startOfWeek } from "./dates";
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

export function usePlanMetrics() {
  const { planSessions, planExams, planSubjects, planReviews, settings, today } = useStudy();
  return useMemo(() => {
    const total = absorbExamQuestions(aggregate(planSessions), planExams, planSubjects);
    const examSeconds = planExams.reduce((sum, exam) => sum + exam.durationSec, 0);
    const days = studiedDays(planSessions, planExams);
    const seconds = total.seconds + examSeconds;
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
      avgPerDay: days.size ? seconds / days.size : 0,
      streak: streakInfo(days, today, settings.studyWeekdays),
      consistency: consistencyInfo(days, today, settings.studyWeekdays),
      coverage: coverageOf(planSubjects),
      bySubject: groupWithExams(planSessions, planExams, planSubjects),
      byDay: secondsByDay(planSessions, planExams),
      dueReviews,
      overdueReviews: dueReviews.filter((review) => review.dueDay < today),
      pendingReviews,
      weekStart,
      weekEnd,
      weekSeconds: week.seconds + weekExamSeconds,
      weekQuestions: week.questions,
      todaySeconds: planSessions.filter((session) => session.day === today).reduce((sum, session) => sum + session.durationSec, 0),
    };
  }, [planExams, planReviews, planSessions, planSubjects, settings.studyWeekdays, settings.weekStartsOn, today]);
}

export function useAwardBook(): AwardBook | null {
  const { focusPlan, planSubjects, settings, today } = useStudy();
  const metrics = usePlanMetrics();
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
          })
        : null,
    [focusPlan, metrics.days, metrics.streak, planSubjects, settings.claimedAwards, settings.studyWeekdays, settings.timeZone, today]
  );
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

