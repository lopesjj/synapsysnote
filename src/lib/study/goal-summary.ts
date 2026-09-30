import type {
  DayKey,
  MockExam,
  StudyAggregate,
  StudyPlan,
  StudyReview,
  StudySession,
  StudySettings,
  StudySubject,
} from "@/types/study";
import { addDays, compareDay, dayKeyOf, diffDays, startOfWeek } from "./dates";
import { aggregate, coverageOf, examTotals, groupSessions, topicKey, type CoverageInfo } from "./metrics";

export interface SubjectSummary {
  subject: StudySubject;
  done: number;
  /** Tópicos não concluídos que já tiveram alguma sessão registrada. */
  studied: number;
  total: number;
  ratio: number;
  agg: StudyAggregate | undefined;
  pendingReviews: number;
  /** Tópicos (por id) com revisão pendente vencida. */
  reviewTopics: Set<string>;
  /** Tópicos (por id) que já têm sessão. */
  studiedTopics: Set<string>;
}

export interface GoalSummary {
  subjects: SubjectSummary[];
  total: StudyAggregate;
  /** Tempo de sessões mais a duração dos simulados. */
  seconds: number;
  examSeconds: number;
  coverage: CoverageInfo;
  exams: { exam: MockExam; percent: number | null }[];
  daysToExam: number | null;
  lastDay: DayKey | null;
  pendingReviews: number;
  /** Minutos e questões da semana atual (simulados entram no tempo). */
  weekMinutes: number;
  weekQuestions: number;
  studiedDays: Set<DayKey>;
}

type GoalData = {
  subjects: readonly StudySubject[];
  sessions: readonly StudySession[];
  exams: readonly MockExam[];
  reviews: readonly StudyReview[];
};

export function goalSummary(
  plan: StudyPlan,
  data: GoalData,
  today: DayKey,
  settings: Pick<StudySettings, "weekStartsOn">
): GoalSummary {
  const subjects = data.subjects.filter((subject) => subject.planId === plan.id);
  const sessions = data.sessions.filter((session) => session.planId === plan.id);
  const exams = data.exams
    .filter((exam) => exam.planId === plan.id)
    .sort((a, b) => compareDay(a.day, b.day) || a.createdAt - b.createdAt);
  const pending = data.reviews.filter((review) => review.planId === plan.id && review.status === "pending" && compareDay(review.dueDay, today) <= 0);
  const bySubject = groupSessions(sessions, (session) => session.subjectId);
  const total = aggregate(sessions);
  const examSeconds = exams.reduce((sum, exam) => sum + exam.durationSec, 0);
  const touched = new Set(sessions.filter((session) => session.topicId).map((session) => topicKey(session.subjectId, session.topicId)));

  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (day: DayKey) => compareDay(day, weekStart) >= 0 && compareDay(day, weekEnd) <= 0;
  let weekSeconds = 0;
  let weekQuestions = 0;
  for (const session of sessions) {
    if (!inWeek(session.day)) continue;
    weekSeconds += session.durationSec;
    weekQuestions += session.correct + session.wrong;
  }
  for (const exam of exams) if (inWeek(exam.day)) weekSeconds += exam.durationSec;

  const studiedDays = new Set<DayKey>();
  for (const session of sessions) if (session.durationSec > 0 || session.correct + session.wrong > 0) studiedDays.add(session.day);
  for (const exam of exams) if (exam.durationSec > 0) studiedDays.add(exam.day);
  const lastDays = [...studiedDays].filter((day) => compareDay(day, today) <= 0).sort(compareDay);

  return {
    subjects: subjects.map((subject) => {
      const done = subject.topics.filter((topic) => topic.done).length;
      const studiedTopics = new Set(subject.topics.filter((topic) => touched.has(topicKey(subject.id, topic.id))).map((topic) => topic.id));
      const subjectReviews = pending.filter((review) => review.subjectId === subject.id);
      return {
        subject,
        done,
        studied: subject.topics.filter((topic) => !topic.done && studiedTopics.has(topic.id)).length,
        total: subject.topics.length,
        ratio: subject.topics.length ? done / subject.topics.length : 0,
        agg: bySubject.get(subject.id),
        pendingReviews: subjectReviews.length,
        reviewTopics: new Set(subjectReviews.map((review) => review.topicId).filter((id): id is string => Boolean(id))),
        studiedTopics,
      };
    }),
    total,
    seconds: total.seconds + examSeconds,
    examSeconds,
    coverage: coverageOf(subjects),
    exams: exams.map((exam) => ({ exam, percent: examTotals(exam).percent })),
    daysToExam: plan.examDate ? diffDays(today, plan.examDate) : null,
    lastDay: lastDays.length ? lastDays[lastDays.length - 1] : null,
    pendingReviews: pending.length,
    weekMinutes: Math.round(weekSeconds / 60),
    weekQuestions,
    studiedDays,
  };
}

/* ---------------------------------------------------------------------------
 * Linha do tempo do objetivo: volume por dia, tópicos concluídos por dia e
 * simulados, de onde saem a régua da prova e a projeção do edital.
 * ------------------------------------------------------------------------- */

export interface DayVolume {
  minutes: number;
  questions: number;
  correct: number;
}

export interface TimelineExam {
  day: DayKey;
  name: string;
  percent: number | null;
}

export interface GoalTimeline {
  goalStart: DayKey;
  days: Map<DayKey, DayVolume>;
  /** Um dia por tópico concluído, em ordem. Sem data, conta no início do objetivo. */
  topicDays: DayKey[];
  exams: TimelineExam[];
  topicTotal: number;
  topicDone: number;
  /** Tópicos concluídos por semana, na média das últimas 4 semanas. */
  pace28: number;
}

export function goalTimeline(
  plan: StudyPlan,
  data: Pick<GoalData, "subjects" | "sessions" | "exams">,
  today: DayKey,
  timeZone?: string | null
): GoalTimeline {
  const subjects = data.subjects.filter((subject) => subject.planId === plan.id);
  const sessions = data.sessions.filter((session) => session.planId === plan.id);
  const exams = data.exams.filter((exam) => exam.planId === plan.id).sort((a, b) => compareDay(a.day, b.day) || a.createdAt - b.createdAt);

  const created = plan.createdAt > 0 ? dayKeyOf(plan.createdAt, timeZone) : today;
  let goalStart = compareDay(created, today) > 0 ? today : created;
  for (const session of sessions) if (compareDay(session.day, goalStart) < 0) goalStart = session.day;
  for (const exam of exams) if (compareDay(exam.day, goalStart) < 0) goalStart = exam.day;

  const days = new Map<DayKey, DayVolume>();
  const bump = (day: DayKey, minutes: number, questions: number, correct: number) => {
    const entry = days.get(day) ?? { minutes: 0, questions: 0, correct: 0 };
    entry.minutes += minutes;
    entry.questions += questions;
    entry.correct += correct;
    days.set(day, entry);
  };
  for (const session of sessions) bump(session.day, session.durationSec / 60, session.correct + session.wrong, session.correct);
  for (const exam of exams) if (exam.durationSec > 0) bump(exam.day, exam.durationSec / 60, 0, 0);

  const topicDays: DayKey[] = [];
  let topicTotal = 0;
  for (const subject of subjects) {
    topicTotal += subject.topics.length;
    for (const topic of subject.topics) {
      if (!topic.done) continue;
      const day = topic.doneAt ? dayKeyOf(topic.doneAt, timeZone) : goalStart;
      topicDays.push(compareDay(day, goalStart) < 0 ? goalStart : day);
    }
  }
  topicDays.sort(compareDay);

  const windowStart = addDays(today, -27);
  const recent = topicDays.filter((day) => compareDay(day, windowStart) >= 0 && compareDay(day, today) <= 0).length;

  return {
    goalStart,
    days,
    topicDays,
    exams: exams.map((exam) => ({ day: exam.day, name: exam.name, percent: examTotals(exam).percent })),
    topicTotal,
    topicDone: topicDays.length,
    pace28: recent / 4,
  };
}

export interface RecentWeek {
  start: DayKey;
  minutes: number;
  /** Semana inteira antes do início do objetivo. */
  before: boolean;
}

/** Minutos por semana nas últimas `count` semanas, da mais antiga até a atual. */
export function recentWeeks(timeline: GoalTimeline, today: DayKey, weekStartsOn: 0 | 1, count = 12): RecentWeek[] {
  const current = startOfWeek(today, weekStartsOn);
  const weeks = Array.from({ length: count }, (_, index) => {
    const start = addDays(current, (index - count + 1) * 7);
    return { start, minutes: 0, before: compareDay(addDays(start, 6), timeline.goalStart) < 0 };
  });
  const first = weeks[0].start;
  const last = addDays(current, 6);
  for (const [day, volume] of timeline.days) {
    if (compareDay(day, first) < 0 || compareDay(day, last) > 0) continue;
    weeks[Math.floor(diffDays(first, day) / 7)].minutes += volume.minutes;
  }
  return weeks.map((week) => ({ ...week, minutes: Math.round(week.minutes) }));
}
export type ProjectionKind = "none" | "wait" | "stalled" | "done" | "ahead" | "behind" | "undated";

export interface SyllabusProjection {
  kind: ProjectionKind;
  pace: number;
  finish: DayKey | null;
  /** Semanas inteiras de folga entre o fim do edital e a prova. */
  weeksEarly: number;
  /** Fração do edital que estará concluída no dia da prova, no ritmo atual. */
  atExam: number;
  /** Tópicos por semana necessários para fechar o edital até a prova. */
  need: number;
}

export function projectSyllabus(timeline: GoalTimeline, today: DayKey, examDate: DayKey | null): SyllabusProjection {
  const base: SyllabusProjection = { kind: "none", pace: timeline.pace28, finish: null, weeksEarly: 0, atExam: 0, need: 0 };
  const { topicTotal: total, topicDone: done, pace28: pace } = timeline;
  if (!total) return base;
  if (done >= total) return { ...base, kind: "done" };
  if (examDate && compareDay(examDate, today) < 0) return base;
  if (diffDays(timeline.goalStart, today) < 14 || done < 3) return { ...base, kind: "wait" };
  if (pace <= 0) return { ...base, kind: "stalled" };
  const remaining = total - done;
  const finish = addDays(today, Math.ceil(remaining / pace) * 7);
  if (!examDate) return { ...base, kind: "undated", finish };
  const weeksLeft = diffDays(today, examDate) / 7;
  if (compareDay(finish, examDate) <= 0) {
    return { ...base, kind: "ahead", finish, weeksEarly: Math.floor(diffDays(finish, examDate) / 7) };
  }
  return {
    ...base,
    kind: "behind",
    finish,
    atExam: Math.min(1, (done + pace * weeksLeft) / total),
    need: Math.ceil(remaining / Math.max(1, weeksLeft)),
  };
}
