"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "./provider";
import { materialNoteId, type MaterialTarget } from "./material";
import {
  aggregate,
  consistencyInfo,
  coverageOf,
  groupSessions,
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
    const total = aggregate(planSessions);
    const examSeconds = planExams.reduce((sum, exam) => sum + exam.durationSec, 0);
    const days = studiedDays(planSessions, planExams);
    const seconds = total.seconds + examSeconds;
    const pendingReviews = planReviews.filter((review) => review.status === "pending");
    const dueReviews = pendingReviews.filter((review) => review.dueDay <= today);
    const weekStart = startOfWeek(today, settings.weekStartsOn);
    const weekEnd = addDays(weekStart, 6);
    const weekSessions = planSessions.filter((session) => session.day >= weekStart && session.day <= weekEnd);
    const week = aggregate(weekSessions);
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
      bySubject: groupSessions(planSessions, (session) => session.subjectId),
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
  const { activePlan, planSubjects, settings, today } = useStudy();
  const metrics = usePlanMetrics();
  return useMemo(
    () =>
      activePlan
        ? buildAwardBook({
            plan: activePlan,
            subjects: planSubjects,
            studied: metrics.days,
            today,
            weekdays: settings.studyWeekdays,
            timeZone: settings.timeZone,
            currentStreak: metrics.streak.current,
            claims: settings.claimedAwards,
          })
        : null,
    [activePlan, metrics.days, metrics.streak, planSubjects, settings.claimedAwards, settings.studyWeekdays, settings.timeZone, today]
  );
}

export function useIconUploads() {
  const { adapter } = useWorkspace();
  const uploads = useRef<Set<string>>(new Set());

  const upload = useCallback(
    async (file: File) => {
      const url = await adapter.uploadWorkspaceIcon(file);
      uploads.current.add(url);
      return url;
    },
    [adapter]
  );

  const settle = useCallback(
    (kept: string | null | undefined) => {
      const discarded = [...uploads.current].filter((url) => url !== kept);
      uploads.current.clear();
      if (discarded.length) void adapter.quarantineMedia(discarded);
    },
    [adapter]
  );

  useEffect(() => {
    const pending = uploads.current;
    return () => {
      const leftover = [...pending];
      pending.clear();
      if (leftover.length) void adapter.quarantineMedia(leftover);
    };
  }, [adapter]);

  return { upload, settle };
}

