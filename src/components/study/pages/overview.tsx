"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useAwardBook, usePlanMetrics } from "@/lib/study/hooks";
import { useStudyUi } from "@/lib/study/ui-store";
import { dayStatus, isPlannedDay, performanceBand } from "@/lib/study/metrics";
import { capitalizeFirst, diffDays, formatDay, startOfWeek, weekDays, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import { splitDuration } from "@/lib/study/format";
import { dailyMotto } from "@/lib/study/mottos";
import { subjectTone } from "@/lib/study/defaults";
import {
  ConsistencyPanel,
  CountdownPanel,
  DistributionPanel,
  KpiBand,
  RecentActivityPanel,
  RemindersPanel,
  SubjectsPanel,
  WeekChartPanel,
} from "../widgets";
import { AwardArt, AwardsPanel, CelebrationBanner } from "../awards";
import { GoalMark, GoalSwitcher, StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";
import { SubjectDialog } from "../subject-dialog";

export function StudyOverview() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_overview")}>
      <OverviewBody />
    </StudyGate>
  );
}

function OverviewBody() {
  const { st } = useStudyT();
  const router = useRouter();
  const { activePlan, planSubjects } = useStudy();
  const [subjectOpen, setSubjectOpen] = useState(false);
  if (!activePlan) return null;

  if (!planSubjects.length) {
    return (
      <StudyPage>
        <StudyHeader title={st("nav_overview")} subtitle={st("overview_subtitle", { goal: activePlan.name || st("untitled_goal") })} />
        <StudyEmpty
          art="subjects"
          title={st("empty_subjects_title")}
          description={st("empty_subjects_desc")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setSubjectOpen(true)}>
                <Plus />
                {st("empty_subjects_cta")}
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/home/study/goals/${activePlan.id}?bulk=1`)}>
                {st("goal_bulk_subjects")}
              </Button>
            </div>
          }
        />
        <SubjectDialog open={subjectOpen} onOpenChange={setSubjectOpen} planId={activePlan.id} />
      </StudyPage>
    );
  }

  return (
    <StudyPage className="pt-6 md:pt-7">
      <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
        <div className="max-sm:hidden">
          <GoalSwitcher />
        </div>
        <Button variant="primary" size="md" onClick={() => useStudyUi.getState().openLog()}>
          <Plus />
          {st("logform_title_new")}
        </Button>
      </div>
      <div className="space-y-4">
        <Cover />
        <CelebrationBanner />
        <KpiBand pace />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div className="order-1 min-w-0 lg:order-none">
              <ConsistencyPanel />
            </div>
            <div className="order-3 min-w-0 lg:order-none">
              <SubjectsPanel />
            </div>
            <div className="order-4 min-w-0 lg:order-none">
              <WeekChartPanel />
            </div>
            <div className="order-9 flex min-w-0 lg:order-none lg:flex-1">
              <RecentActivityPanel className="w-full" />
            </div>
          </div>
          <div className="contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div className="order-2 min-w-0 lg:order-none">
              <AwardsPanel />
            </div>
            <div className="order-5 min-w-0 lg:order-none">
              <CountdownPanel />
            </div>
            <div className="order-6 min-w-0 lg:order-none">
              <DistributionPanel />
            </div>
            <div className="order-8 min-w-0 lg:order-none">
              <RemindersPanel className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </StudyPage>
  );
}

function coverMarkSize(): number {
  return window.matchMedia("(min-width: 640px)").matches ? 104 : 84;
}

function useCoverMarkSize() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia("(min-width: 640px)");
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    coverMarkSize,
    () => 84
  );
}

function Cover() {
  const { st, duration, locale, textDir, language } = useStudyT();
  const { activePlan, planSubjects, settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const book = useAwardBook();
  const markSize = useCoverMarkSize();
  if (!activePlan) return null;

  const parts: string[] = [];
  parts.push(
    activePlan.weeklyGoalMinutes
      ? st("overview_lede_week_goal", { time: duration(metrics.weekSeconds), goal: duration(activePlan.weeklyGoalMinutes * 60) })
      : st("overview_lede_week", { time: duration(metrics.weekSeconds) })
  );
  if (metrics.dueReviews.length) parts.push(st("home_lede_reviews", { count: metrics.dueReviews.length }));
  const weakest = planSubjects
    .map((subject) => ({ subject, agg: metrics.bySubject.get(subject.id) }))
    .filter((entry) => entry.agg && entry.agg.questions >= 10 && performanceBand(entry.agg.accuracy, settings) === "low")
    .sort((a, b) => (a.agg?.accuracy ?? 1) - (b.agg?.accuracy ?? 1))[0];
  if (weakest) parts.push(st("overview_lede_weak", { subject: weakest.subject.name }));
  const examDays = activePlan.examDate ? diffDays(today, activePlan.examDate) : null;
  if (examDays !== null && examDays > 0) parts.push(st("home_lede_exam", { count: examDays }));
  const lede = `${capitalizeFirst(new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(parts))}.`;

  const goalName = activePlan.name || st("untitled_goal");
  const goalComplete = Boolean(book?.goalComplete && book.goal);
  const dateLabel = capitalizeFirst(formatDay(today, locale, { weekday: "long", day: "numeric", month: "long" }));
  const { h, m } = splitDuration(metrics.todaySeconds);
  const motto = dailyMotto(language, today);

  return (
    <section className="study-cover overflow-hidden rounded-[22px] shadow-[0_0_0_1px_var(--cover-line)]">
      <div className="grid gap-8 px-6 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-10">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--cover-faint)]">{dateLabel}</p>
          <div className="mt-4 flex items-center gap-4 sm:gap-6">
            {goalComplete && book?.goal ? (
              <span className="relative shrink-0">
                <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-full bg-[color-mix(in_oklab,var(--laurel)_10%,transparent)] blur-xl sm:-inset-4" />
                <AwardArt award={book.goal} size={Math.round(markSize * 1.5)} />
              </span>
            ) : (
              <span className="relative shrink-0">
                <span aria-hidden className="pointer-events-none absolute -inset-2 rounded-[1.8rem] bg-[color-mix(in_oklab,var(--cover-accent)_6%,transparent)] blur-2xl sm:-inset-2.5" />
                <span className="relative inline-flex rounded-[1.65rem] bg-[var(--cover-chip)] p-1.5 shadow-[0_0_0_1px_var(--cover-line),0_6px_14px_-12px_color-mix(in_oklab,var(--cover-fg)_10%,transparent)] sm:rounded-[1.9rem] sm:p-2">
                  <GoalMark icon={activePlan.icon} name={goalName} seed={activePlan.id} size={markSize} soft />
                </span>
              </span>
            )}
            <div className="min-w-0 flex-1">
              {goalComplete ? (
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--laurel)]">{st("hero_goal_complete_title")}</p>
              ) : null}
              <h2 dir={textDir} className="font-display text-[32px] font-medium leading-[1.02] tracking-[-0.02em] text-[var(--cover-fg)] [overflow-wrap:anywhere] sm:text-[40px]">
                {goalName}
              </h2>
              <p dir={textDir} className="mt-3 max-w-xl text-[14px] leading-relaxed text-[var(--cover-muted)]">
                {goalComplete && book?.goal ? st("hero_goal_complete_desc", { count: book.goal.total }) : lede}
              </p>
            </div>
          </div>
          <GoalProgress />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:h-full lg:border-l lg:border-[var(--cover-line)] lg:pl-10">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--cover-faint)]">{st("today")}</p>
            <p className="mt-2 flex items-baseline gap-1 leading-none text-[var(--cover-fg)]">
              {metrics.todaySeconds > 0 ? (
                <>
                  {h > 0 ? (
                    <>
                      <span className="text-[40px] font-semibold tracking-[-0.04em]">{h}</span>
                      <span className="mr-1.5 text-[14px] font-medium text-[var(--cover-muted)]">{st("unit_h")}</span>
                    </>
                  ) : null}
                  <span className="text-[40px] font-semibold tracking-[-0.04em]">{h > 0 ? String(m).padStart(2, "0") : m}</span>
                  <span className="text-[14px] font-medium text-[var(--cover-muted)]">{st("unit_min")}</span>
                </>
              ) : (
                <span className="text-[40px] font-semibold tracking-[-0.04em] text-[var(--cover-faint)]">–</span>
              )}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--cover-muted)]">
              {metrics.todaySeconds > 0 ? (
                st("hero_studied_today")
              ) : !isPlannedDay(today, settings.studyWeekdays) ? (
                <>
                  <span>{st("hero_rest_today")}</span>
                  <HappyFace className="size-[18px] shrink-0" />
                </>
              ) : (
                <>
                  <span>{st("hero_nothing_today")}</span>
                  <SadFace className="size-[18px] shrink-0" />
                </>
              )}
            </p>
          </div>

          <WeekDots />

          <figure dir={textDir} className="border-t border-[var(--cover-line)] pt-5 lg:flex lg:min-h-0 lg:flex-1 lg:items-center">
            <blockquote className="w-full min-w-0">
              <p className="font-display text-pretty text-[15px] italic leading-[1.5] text-[var(--cover-fg)]">
                <span aria-hidden className="select-none text-[var(--cover-accent)]">
                  {motto.open}
                </span>
                <span className="opacity-90">{motto.text}</span>
                <span aria-hidden className="select-none text-[var(--cover-accent)]">
                  {motto.close}
                </span>
              </p>
            </blockquote>
          </figure>
        </div>
      </div>
    </section>
  );
}

function GoalProgress() {
  const { st, duration, textDir } = useStudyT();
  const { planSubjects } = useStudy();
  const metrics = usePlanMetrics();
  const { done, total, ratio } = metrics.coverage;
  const segments = planSubjects
    .map((subject) => ({
      subject,
      total: subject.topics.length,
      done: subject.topics.filter((topic) => topic.done).length,
    }))
    .filter((segment) => segment.total > 0);

  return (
    <div className="mt-7 rounded-[14px] bg-[var(--cover-chip)] p-4 ring-1 ring-[var(--cover-line)] sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--cover-faint)]">{st("hero_progress_title")}</p>
        {total ? (
          <p className="text-[12.5px] tabular-nums text-[var(--cover-muted)]">
            <span className="font-semibold text-[var(--cover-fg)]">{Math.round(ratio * 100)}%</span> · {st("kpi_coverage_hint", { done, total })}
          </p>
        ) : null}
      </div>
      {segments.length ? (
        <>
          <div className="mt-3 flex h-[10px] w-full gap-[3px]" role="img" aria-label={st("kpi_coverage_hint", { done, total })}>
            {segments.map((segment) => (
              <span
                key={segment.subject.id}
                className="relative block h-full min-w-[6px] overflow-hidden rounded-full"
                style={{ flexGrow: segment.total, backgroundColor: `color-mix(in oklab, ${subjectTone(segment.subject.color)} 22%, transparent)` }}
                title={`${segment.subject.name} · ${st("kpi_coverage_hint", { done: segment.done, total: segment.total })}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[var(--ease-luxury)]"
                  style={{ width: `${(segment.done / segment.total) * 100}%`, backgroundColor: subjectTone(segment.subject.color) }}
                />
              </span>
            ))}
          </div>
          <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
            {segments.map((segment) => (
              <li key={segment.subject.id} className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="block h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subjectTone(segment.subject.color) }} />
                <Link href={`/home/study/subjects/${segment.subject.id}`} dir={textDir} className="truncate text-[12.5px] font-medium text-[var(--cover-fg)] hover:underline">
                  {segment.subject.name}
                </Link>
                <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--cover-faint)]">
                  {segment.done}/{segment.total}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {planSubjects.map((subject) => {
              const agg = metrics.bySubject.get(subject.id);
              return (
                <li key={subject.id} className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="block h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subjectTone(subject.color) }} />
                  <span dir={textDir} className="truncate text-[12.5px] font-medium text-[var(--cover-fg)]">{subject.name}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--cover-faint)]">{agg?.seconds ? duration(agg.seconds) : "–"}</span>
                </li>
              );
            })}
          </ul>
          <Link href="/home/study/subjects" className="text-[12px] font-medium text-[var(--cover-accent)] hover:underline">
            {st("hero_progress_no_topics")}
          </Link>
        </div>
      )}
    </div>
  );
}

function HappyFace({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}f`} cx="42%" cy="34%" r="70%">
          <stop offset="0" stopColor="#FFF07A" />
          <stop offset="0.55" stopColor="#FFCB2E" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="50%" cy="20%" r="55%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}e`} cx="38%" cy="35%" r="65%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" stopColor="#F4F7FB" />
          <stop offset="1" stopColor="#D5DCE6" />
        </radialGradient>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF8BC4" />
          <stop offset="1" stopColor="#E11D74" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}f)`} />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke="#D97706" strokeOpacity="0.35" />
      <ellipse cx="32" cy="16" rx="18" ry="10" fill={`url(#${id}s)`} />
      <path d="M15 29.5c1.4-3.6 4.6-5.2 7.4-4.2" stroke="#7A4518" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="43" cy="27" r="7.2" fill={`url(#${id}e)`} />
      <circle cx="43" cy="27" r="3.3" fill="#1C1917" />
      <circle cx="44.3" cy="25.6" r="1.15" fill="#fff" />
      <path d="M16 40c1.2-4 7.2-6.6 16-6.6s14.8 2.6 16 6.6c.8 8.4-6.4 13.4-16 13.4S15.2 48.4 16 40z" fill="#7A4518" />
      <path d="M27.5 45.5c1.4 7.2 3.4 11.6 4.2 13 1.4 2.6 5.4 2.4 6.4-.4.8-2.2 0-6.4-1.4-12.2-1.8 1.6-5 2.4-7.6 1.4-.8.4-1.4-1-2-1.8z" fill={`url(#${id}k)`} />
      <ellipse cx="31" cy="50" rx="1.8" ry="2.8" fill="#fff" fillOpacity="0.28" />
    </svg>
  );
}

function SadFace({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}f`} cx="42%" cy="34%" r="70%">
          <stop offset="0" stopColor="#FFF07A" />
          <stop offset="0.55" stopColor="#FFCB2E" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B3A1A" />
          <stop offset="1" stopColor="#2E1C0B" />
        </linearGradient>
        <radialGradient id={`${id}s`} cx="50%" cy="20%" r="55%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}f)`} />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke="#D97706" strokeOpacity="0.35" />
      <ellipse cx="32" cy="17" rx="18" ry="11" fill={`url(#${id}s)`} />
      <path d="M14.5 22.5c3.2-.4 6.9-2 9-4.6" stroke={`url(#${id}e)`} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M49.5 22.5c-3.2-.4-6.9-2-9-4.6" stroke={`url(#${id}e)`} strokeWidth="3" strokeLinecap="round" fill="none" />
      <ellipse cx="22.5" cy="31" rx="3.6" ry="5" fill={`url(#${id}e)`} />
      <ellipse cx="41.5" cy="31" rx="3.6" ry="5" fill={`url(#${id}e)`} />
      <circle cx="23.6" cy="29.2" r="1.2" fill="#fff" fillOpacity="0.7" />
      <circle cx="42.6" cy="29.2" r="1.2" fill="#fff" fillOpacity="0.7" />
      <path d="M21 49.5c3-4.6 7-6.8 11-6.8s8 2.2 11 6.8" stroke={`url(#${id}e)`} strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function WeekDots() {
  const { st, locale, duration } = useStudyT();
  const { settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const days = weekDays(startOfWeek(today, settings.weekStartsOn));
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--cover-faint)]">{st("hero_week_label")}</p>
      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const status = dayStatus(day, metrics.days, metrics.consistency.firstDay, today, settings.studyWeekdays);
          const seconds = metrics.byDay.get(day) ?? 0;
          const title = `${capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" }))}${
            status === "studied" ? ` · ${duration(seconds)}` : status === "missed" ? ` · ${st("heatmap_missed_tooltip")}` : status === "pending" ? ` · ${st("heatmap_today_pending")}` : status === "rest" ? ` · ${st("heatmap_rest")}` : ""
          }`;
          return (
            <li key={day} className="flex flex-col items-center gap-1.5" title={title}>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  status === "studied" && "bg-[var(--cover-accent)] text-[var(--cover-accent-contrast)]",
                  status === "missed" && "bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-[var(--danger)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--danger)_55%,transparent)]",
                  status === "pending" && "border-[1.5px] border-dashed border-[var(--cover-accent)]",
                  status === "rest" && "border-[1.5px] border-[color-mix(in_oklab,var(--cover-fg)_22%,transparent)] text-[var(--cover-faint)]",
                  status === "future" && "border-[1.5px] border-[color-mix(in_oklab,var(--cover-fg)_26%,transparent)] bg-[color-mix(in_oklab,var(--cover-fg)_6%,transparent)]",
                  status === "before" && "border-[1.5px] border-[color-mix(in_oklab,var(--cover-fg)_16%,transparent)] bg-[color-mix(in_oklab,var(--cover-fg)_3%,transparent)]"
                )}
              >
                {status === "studied" ? (
                  <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
                    <path d="M2.5 6.2 5 8.6 9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : status === "missed" ? (
                  <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
                    <path d="m3.2 3.2 5.6 5.6M8.8 3.2 3.2 8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                ) : status === "rest" ? (
                  <span className="size-1.5 rounded-full bg-current" />
                ) : null}
              </span>
              <span className={cn("text-[10px] uppercase leading-none", day === today ? "font-semibold text-[var(--cover-fg)]" : "text-[var(--cover-faint)]")}>
                {weekdayLabel(weekdayOf(day), locale, "short").replace(".", "")}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
