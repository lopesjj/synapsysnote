"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Flame, MoreHorizontal, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey, type StudyT } from "@/lib/study/i18n";
import { usePlanMetrics } from "@/lib/study/hooks";
import { useStudyUi } from "@/lib/study/ui-store";
import {
  addDays,
  capitalizeFirst,
  diffDays,
  dayKeyOf,
  formatDay,
  orderedWeekdays,
  startOfWeek,
  weekDays,
  weekdayLabel,
  weekdayOf,
} from "@/lib/study/dates";
import { aggregate, dayStatus, performanceBand, percentLabel } from "@/lib/study/metrics";
import { projectSchedule } from "@/lib/study/cycle";
import { nextUp } from "@/lib/study/suggest";
import { usePlanning } from "@/lib/study/planning";
import type { PlanningTask } from "@/lib/study/planning-bridge";
import { formatHoursTick, formatNumber } from "@/lib/study/format";
import type { DayKey, StudyReminder, StudyReview } from "@/types/study";
import { ColumnChart, Donut, HEAT_MISSED, Heatmap, Meter, Sparkbars, heatColor, heatWeeks, useWidth, type HeatCell } from "./charts";
import { PaceDialog, ReminderDialog, GoalDialog } from "./dialogs";
import { TaskDialog, TaskLine, type TaskDialogState } from "./tasks";
import {
  AccuracyTag,
  BandGlyph,
  CategoryChip,
  DurationFigure,
  Figure,
  FocusButton,
  Panel,
  PanelLink,
  Segmented,
  SubjectDot,
  bandColor,
} from "./ui";

function StreakFlame({ active, className }: { active?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0", active && "animate-[pulse_2.5s_ease-in-out_infinite]", className)}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="streak-flame-outer" x1="8" y1="1" x2="8" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        <linearGradient id="streak-flame-inner" x1="8" y1="7" x2="8" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path
        d="M8.2 1.2c-.3.4-.6.9-.8 1.5-.4 1.2-.2 2.3.2 3.1.1.2 0 .5-.2.6-.2.1-.5 0-.6-.2-.7-1.1-.8-2.5-.4-3.7C4.6 3.6 3 5.8 3 8.3 3 11.5 5.2 14 8 14s5-2.5 5-5.7c0-2.2-1.3-4.2-3.1-5.1-.3-.1-.4-.4-.3-.7.1-.4.4-.7.6-1 .2-.3.1-.7-.2-.9-.2-.1-.5-.1-.8.6z"
        fill="url(#streak-flame-outer)"
      />
      <path
        d="M8 7.5c-.2.3-.4.7-.5 1.1-.3.8-.1 1.5.1 2 .1.2 0 .4-.2.5-.2.1-.4 0-.5-.2-.4-.7-.5-1.6-.2-2.4C5.8 9 5 10.3 5 11.8 5 13.6 6.3 14 8 14s3-.4 3-2.2c0-1.2-.7-2.3-1.8-2.9-.2-.1-.3-.3-.2-.5.1-.3.3-.5.4-.7.1-.2 0-.4-.1-.5-.1 0-.3 0-.3.4z"
        fill="url(#streak-flame-inner)"
      />
    </svg>
  );
}

export function relativeDay(day: DayKey, today: DayKey, locale: string, st: StudyT): string {
  if (day === today) return st("today");
  if (day === addDays(today, -1)) return st("yesterday");
  return formatDay(day, locale, { weekday: "short", day: "numeric", month: "short" });
}

function KpiCell({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 px-5 py-4", className)}>
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <div className="min-h-[2.25rem]">{children}</div>
      {hint ? <div className="text-[11.5px] leading-snug text-faint">{hint}</div> : null}
    </div>
  );
}

export function KpiBand({ className }: { className?: string }) {
  const { st, duration, language } = useStudyT();
  const { settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const band = performanceBand(metrics.total.accuracy, settings);
  return (
    <section
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] lg:grid-cols-4",
        className
      )}
    >
      <KpiCell label={st("kpi_time")} hint={metrics.avgPerDay ? st("kpi_time_hint", { avg: duration(metrics.avgPerDay) }) : undefined}>
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <DurationFigure seconds={metrics.seconds} />
          <Sparkbars values={Array.from({ length: 14 }, (_, index) => metrics.byDay.get(addDays(today, index - 13)) ?? 0)} />
        </div>
      </KpiCell>
      <KpiCell
        label={st("kpi_accuracy")}
        className="border-l border-[var(--border)]"
        hint={
          metrics.total.questions
            ? st("kpi_accuracy_hint", {
                correct: formatNumber(metrics.total.correct, language),
                wrong: formatNumber(metrics.total.wrong, language),
              })
            : st("kpi_accuracy_empty")
        }
      >
        {metrics.total.accuracy !== null && band ? (
          <span className="flex items-baseline gap-2">
            <Figure value={Math.round(metrics.total.accuracy * 100)} unit="%" />
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: bandColor(band) }}>
              <BandGlyph band={band} />
              {st(band === "low" ? "band_low" : band === "mid" ? "band_mid" : "band_high")}
            </span>
          </span>
        ) : (
          <Figure value="–" />
        )}
      </KpiCell>
      <KpiCell
        label={st("kpi_coverage")}
        className="border-t border-[var(--border)] lg:border-l lg:border-t-0"
        hint={st("kpi_coverage_hint", { done: metrics.coverage.done, total: metrics.coverage.total })}
      >
        <div className="space-y-2">
          <Figure value={Math.round(metrics.coverage.ratio * 100)} unit="%" />
          <Meter value={metrics.coverage.done} max={metrics.coverage.total} label={st("kpi_coverage")} />
        </div>
      </KpiCell>
      <KpiCell
        label={st("kpi_streak")}
        className={cn(
          "border-l border-t border-[var(--border)] lg:border-t-0 transition-colors",
          metrics.streak.current > 0 && "bg-gradient-to-br from-amber-500/[0.04] to-orange-500/[0.02]"
        )}
        hint={
          metrics.streak.best ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <Trophy className="size-3 text-amber-500/80 shrink-0" />
              <span>{st("kpi_streak_hint", { count: metrics.streak.best })}</span>
            </span>
          ) : undefined
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Figure value={metrics.streak.current} unit={st("countdown_days_label", { count: metrics.streak.current })} />
          {metrics.streak.current > 0 ? (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-all backdrop-blur-sm",
                metrics.streak.current >= (metrics.streak.best ?? 0) && (metrics.streak.best ?? 0) > 1
                  ? "border border-amber-500/35 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/10 text-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.22)] dark:text-amber-300"
                  : "border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-orange-500/[0.08] to-amber-500/[0.04] text-amber-600 shadow-[0_1px_3px_rgba(245,158,11,0.08)] dark:text-amber-400"
              )}
              title={
                metrics.streak.current >= (metrics.streak.best ?? 0) && (metrics.streak.best ?? 0) > 1
                  ? st("streak_record_badge")
                  : st("streak_active_badge")
              }
            >
              <StreakFlame active />
              <span>
                {metrics.streak.current >= (metrics.streak.best ?? 0) && (metrics.streak.best ?? 0) > 1
                  ? st("streak_record_badge")
                  : st("streak_active_badge")}
              </span>
            </div>
          ) : null}
        </div>
      </KpiCell>
    </section>
  );
}

export function ConsistencyPanel() {
  const { st, locale, duration } = useStudyT();
  const { settings, today, activePlan } = useStudy();
  const metrics = usePlanMetrics();
  const [measureRef, width] = useWidth<HTMLDivElement>();
  const weeks = heatWeeks(width, 30, 4);
  const target = activePlan?.weeklyGoalMinutes ? activePlan.weeklyGoalMinutes / Math.max(1, settings.studyWeekdays.length || 7) : 0;
  const firstDay = metrics.consistency.firstDay;

  const { grid, columns } = useMemo(() => {
    const thresholds = target > 0 ? [target * 0.5, target, target * 1.5] : [45, 90, 180];
    const first = addDays(startOfWeek(today, settings.weekStartsOn), -(weeks - 1) * 7);
    const grid: HeatCell[][] = [];
    const columns: { index: number; label: string }[] = [];
    let lastMonth = "";
    for (let week = 0; week < weeks; week += 1) {
      const column: HeatCell[] = [];
      for (let offset = 0; offset < 7; offset += 1) {
        const day = addDays(first, week * 7 + offset);
        const seconds = metrics.byDay.get(day) ?? 0;
        const minutes = seconds / 60;
        const level = (minutes <= 0 ? 0 : minutes < thresholds[0] ? 1 : minutes < thresholds[1] ? 2 : minutes < thresholds[2] ? 3 : 4) as HeatCell["level"];
        const status = dayStatus(day, metrics.days, firstDay, today, settings.studyWeekdays);
        const detail =
          status === "studied"
            ? duration(seconds)
            : status === "missed"
              ? st("heatmap_missed_tooltip")
              : status === "rest"
                ? st("heatmap_rest")
                : status === "pending"
                  ? st("heatmap_today_pending")
                  : st("heatmap_before");
        column.push({
          key: day,
          level,
          status,
          tooltip: (
            <span className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: heatColor({ level, status }) }} />
              <span className="font-medium">{capitalizeFirst(formatDay(day, locale, { weekday: "short", day: "numeric", month: "short" }))}</span>
              <span className={status === "missed" ? "text-[var(--danger)]" : "text-muted"}>{detail}</span>
            </span>
          ),
        });
      }
      const month = column[0].key.slice(0, 7);
      if (month !== lastMonth) {
        columns.push({ index: week, label: formatDay(column[0].key, locale, { month: "short" }).replace(".", "") });
        lastMonth = month;
      }
      grid.push(column);
    }
    return { grid, columns: columns.filter((column, index) => index === 0 || column.index - columns[index - 1].index >= 3) };
  }, [duration, firstDay, locale, metrics.byDay, metrics.days, settings.studyWeekdays, settings.weekStartsOn, st, target, today, weeks]);

  const rowLabels = orderedWeekdays(settings.weekStartsOn).map((weekday, index) =>
    index % 2 === 0 ? weekdayLabel(weekday, locale, "short").replace(".", "") : ""
  );

  const message = metrics.streak.current ? st("streak_active", { count: metrics.streak.current }) : st("streak_zero");
  const { studied, planned, missed, ratio } = metrics.consistency;

  const stats: { key: string; label: string; value: ReactNode; tone?: string }[] = [
    {
      key: "streak",
      label: st("heatmap_stat_streak"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Flame className={cn("size-4", metrics.streak.current ? "animate-pulse text-[var(--warning)]" : "text-faint")} strokeWidth={2} />
          {st("kpi_streak_value", { count: metrics.streak.current })}
        </span>
      ),
    },
    { key: "best", label: st("heatmap_stat_best"), value: st("kpi_streak_value", { count: metrics.streak.best }) },
    {
      key: "kept",
      label: st("heatmap_stat_kept"),
      value: planned ? (
        <span>
          {st("heatmap_kept_value", { studied, planned })}
          <span className="ms-1.5 text-[12px] font-normal text-muted">{percentLabel(ratio)}</span>
        </span>
      ) : (
        "—"
      ),
    },
    {
      key: "missed",
      label: st("heatmap_stat_missed"),
      value: st("kpi_streak_value", { count: missed }),
      tone: missed ? "var(--danger)" : undefined,
    },
  ];

  return (
    <Panel
      title={st("heatmap_title")}
      description={st("heatmap_desc")}
      action={
        <span className="hidden items-center gap-3 text-[11px] text-faint md:flex">
          <span className="inline-flex items-center gap-1">
            {st("heatmap_less")}
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className="size-2.5 rounded-[3px]" style={{ backgroundColor: level ? `var(--heat-${level})` : "var(--surface-2)" }} />
            ))}
            {st("heatmap_more")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: HEAT_MISSED }} />
            {st("heatmap_missed")}
          </span>
        </span>
      }
    >
      <div ref={measureRef}>
        <Heatmap weeks={grid} rowLabels={rowLabels} columnLabels={columns} ariaLabel={st("heatmap_title")} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-y-4 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
        {stats.map((stat, index) => (
          <div key={stat.key} className={cn("min-w-0 px-0 sm:px-4", index % 2 === 1 && "border-l border-[var(--border)] ps-4", index > 0 && "sm:border-l sm:border-[var(--border)]", index === 0 && "sm:ps-0")}>
            <dt className="truncate text-[11.5px] text-muted">{stat.label}</dt>
            <dd className="mt-1 truncate text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-ink" style={{ color: stat.tone }}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12.5px] text-muted">
        {message}
        {metrics.streak.current && !metrics.streak.studiedToday ? <span> {st("streak_today_pending")}</span> : null}
      </p>
    </Panel>
  );
}

export function CountdownPanel() {
  const { st, locale } = useStudyT();
  const { activePlan, today } = useStudy();
  const [editing, setEditing] = useState(false);
  if (!activePlan) return null;
  const exam = activePlan.examDate;
  const left = exam ? diffDays(today, exam) : null;
  const created = activePlan.createdAt ? dayKeyOf(activePlan.createdAt) : today;
  const span = exam ? Math.max(1, diffDays(created, exam)) : 1;
  const elapsed = exam ? Math.max(0, Math.min(span, diffDays(created, today))) : 0;
  return (
    <Panel title={st("countdown_title")}>
      {exam && left !== null ? (
        <div className="space-y-3">
          {left > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">{left}</span>
              <span className="text-[13px] text-muted">{st("countdown_days_label", { count: left })}</span>
            </div>
          ) : (
            <p className="text-[15px] font-semibold text-ink">
              {left === 0 ? st("countdown_today") : st("countdown_past", { date: formatDay(exam, locale, { day: "numeric", month: "long", year: "numeric" }) })}
            </p>
          )}
          {left > 0 ? (
            <p className="text-[12px] text-muted">
              {st("countdown_until", { date: formatDay(exam, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) })}
            </p>
          ) : null}
          <div className="relative h-1.5 rounded-full bg-[var(--surface-2)]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${(elapsed / span) * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-muted">{st("countdown_empty")}</p>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {st("countdown_set_date")}
          </Button>
        </div>
      )}
      <GoalDialog open={editing} onOpenChange={setEditing} plan={activePlan} />
    </Panel>
  );
}

export function NextUpPanel() {
  const { st, duration } = useStudyT();
  const { planSubjects, planSessions, planCycle, today, settings } = useStudy();
  const suggestion = useMemo(
    () => nextUp(planSubjects, planSessions, planCycle, today, settings),
    [planCycle, planSessions, planSubjects, settings, today]
  );
  if (!suggestion) return null;
  const reason = suggestion.reason;
  const reasonText =
    reason.kind === "cycle"
      ? st("next_up_reason_cycle", { n: reason.n, total: reason.total })
      : reason.kind === "never"
        ? st("next_up_reason_never")
        : reason.kind === "stale"
          ? st("next_up_reason_stale", { count: reason.days })
          : reason.kind === "weak"
            ? st("next_up_reason_weak", { value: percentLabel(reason.accuracy) })
            : st("next_up_reason_pending", { count: reason.count });
  return (
    <Panel title={st("next_up_title")}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 block h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: suggestion.subject.color }} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{suggestion.subject.name}</p>
            {suggestion.topic ? <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{suggestion.topic.name}</p> : null}
            <p className="mt-1.5 text-[11.5px] text-faint">
              {reasonText}
              {suggestion.minutes ? ` · ${duration(suggestion.minutes * 60)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FocusButton
            variant="primary"
            subjectId={suggestion.subject.id}
            topicId={suggestion.topic?.id ?? null}
            label={st("next_up_start")}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => useStudyUi.getState().openLog({ subjectId: suggestion.subject.id, topicId: suggestion.topic?.id ?? null })}
          >
            {st("logform_title_new")}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function SubjectsTablePanel() {
  const { st, duration } = useStudyT();
  const { planSubjects, settings } = useStudy();
  const metrics = usePlanMetrics();
  return (
    <Panel title={st("nav_subjects")} description={st("subjects_panel_desc")} action={<PanelLink href="/home/study/subjects">{st("view_all")}</PanelLink>} bodyClassName="px-0 pb-1">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[12.5px]">
          <thead>
            <tr className="border-y border-[var(--border)] text-left text-[11px] text-faint">
              <th className="py-2 pl-5 pr-3 font-medium">{st("col_subject")}</th>
              <th className="px-3 py-2 text-right font-medium">{st("col_time")}</th>
              <th className="px-3 py-2 text-right font-medium">{st("correct_label")}</th>
              <th className="px-3 py-2 text-right font-medium">{st("wrong_label")}</th>
              <th className="px-3 py-2 font-medium">{st("col_accuracy")}</th>
              <th className="py-2 pl-3 pr-5 font-medium">{st("col_coverage")}</th>
            </tr>
          </thead>
          <tbody>
            {planSubjects.map((subject) => {
              const agg = metrics.bySubject.get(subject.id);
              const done = subject.topics.filter((topic) => topic.done).length;
              const total = subject.topics.length;
              return (
                <tr key={subject.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                  <td className="max-w-[16rem] py-2.5 pl-5 pr-3">
                    <Link href={`/home/study/subjects/${subject.id}`} className="flex items-center gap-2 text-ink hover:underline">
                      <SubjectDot color={subject.color} />
                      <span className="truncate">{subject.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{agg?.seconds ? duration(agg.seconds) : "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{agg?.correct ?? 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{agg?.wrong ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
                  </td>
                  <td className="py-2.5 pl-3 pr-5">
                    <div className="flex items-center gap-2">
                      <Meter
                        value={done}
                        max={total}
                        tone={total > 0 && done === total ? "var(--accent-emerald, #10b981)" : subject.color ?? undefined}
                        className={cn("w-16", total > 0 && done === total && "shadow-[0_0_8px_rgba(16,185,129,0.25)]")}
                        label={st("col_coverage")}
                      />
                      <span
                        className={cn(
                          "text-[11.5px] tabular-nums",
                          total > 0 && done === total ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-faint"
                        )}
                      >
                        {done}/{total}
                      </span>
                      {total > 0 && done === total ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold tracking-tight text-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.18)] dark:text-emerald-400"
                          title={st("subject_completed_badge")}
                        >
                          <Check className="size-2.5 stroke-[3]" />
                          <span>100%</span>
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function PacePanel() {
  const { st, locale, duration, language } = useStudyT();
  const { activePlan } = useStudy();
  const metrics = usePlanMetrics();
  const [editing, setEditing] = useState(false);
  if (!activePlan) return null;
  const rows = [
    {
      key: "hours",
      label: st("pace_hours"),
      value: metrics.weekSeconds,
      goal: activePlan.weeklyGoalMinutes * 60,
      text: activePlan.weeklyGoalMinutes
        ? st("pace_of", { value: duration(metrics.weekSeconds), goal: duration(activePlan.weeklyGoalMinutes * 60) })
        : duration(metrics.weekSeconds),
    },
    {
      key: "questions",
      label: st("pace_questions"),
      value: metrics.weekQuestions,
      goal: activePlan.weeklyGoalQuestions,
      text: activePlan.weeklyGoalQuestions
        ? st("pace_of", { value: formatNumber(metrics.weekQuestions, language), goal: formatNumber(activePlan.weeklyGoalQuestions, language) })
        : formatNumber(metrics.weekQuestions, language),
    },
  ];
  return (
    <Panel
      title={st("pace_title")}
      description={st("pace_range", {
        start: formatDay(metrics.weekStart, locale),
        end: formatDay(metrics.weekEnd, locale),
      })}
      action={
        <Tooltip label={st("pace_edit")}>
          <Button variant="ghost" size="icon-sm" aria-label={st("pace_edit")} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </Tooltip>
      }
    >
      <div className="space-y-4">
        {rows.map((row) => {
          const done = row.goal > 0 && row.value >= row.goal;
          return (
            <div key={row.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="font-medium text-ink">{row.label}</span>
                <span className={cn("tabular-nums", done ? "font-medium text-[var(--band-high)]" : "text-muted")}>
                  {row.goal > 0 ? (done ? `${st("pace_done")} · ${row.text}` : row.text) : row.text}
                </span>
              </div>
              {row.goal > 0 ? (
                <PaceRuler value={row.value} goal={row.goal} />
              ) : (
                <p className="text-[11px] text-faint">{st("pace_no_goal")}</p>
              )}
            </div>
          );
        })}
      </div>
      <PaceDialog open={editing} onOpenChange={setEditing} plan={activePlan} />
    </Panel>
  );
}

function PaceRuler({ value, goal }: { value: number; goal: number }) {
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <div className="relative h-3">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-2)]" />
      <div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--accent)] transition-[width] duration-500"
        style={{ width: `${ratio * 100}%` }}
      />
      {[0.25, 0.5, 0.75].map((tick) => (
        <span key={tick} className="absolute top-0 h-3 w-px bg-[var(--surface)]" style={{ left: `${tick * 100}%` }} />
      ))}
    </div>
  );
}

export function WeekChartPanel() {
  const { st, locale, duration, language } = useStudyT();
  const { planSessions, planExams, settings, today } = useStudy();
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<"time" | "questions">("time");
  const start = addDays(startOfWeek(today, settings.weekStartsOn), offset * 7);
  const days = weekDays(start);
  const end = days[6];
  const data = days.map((day) => {
    const sessions = planSessions.filter((session) => session.day === day);
    const agg = aggregate(sessions);
    const seconds = agg.seconds + planExams.filter((exam) => exam.day === day).reduce((sum, exam) => sum + exam.durationSec, 0);
    const value = metric === "time" ? seconds / 3600 : agg.questions;
    return {
      key: day,
      label: weekdayLabel(weekdayOf(day), locale, "short").replace(".", ""),
      value,
      emphasis: day === today,
      tooltip: (
        <span className="block">
          <span className="block font-medium">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "short" })}</span>
          <span className="block text-muted">
            {metric === "time"
              ? duration(seconds)
              : `${st("questions_count", { count: agg.questions })}${agg.accuracy !== null ? ` · ${percentLabel(agg.accuracy)}` : ""}`}
          </span>
        </span>
      ),
    };
  });
  const totalValue = data.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <Panel
      title={st("week_chart_title")}
      description={`${formatDay(start, locale)} – ${formatDay(end, locale)} · ${st("week_chart_total", {
        value: metric === "time" ? duration(totalValue * 3600) : formatNumber(totalValue, language),
      })}`}
      action={
        <>
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[
              { value: "time", label: st("time_label") },
              { value: "questions", label: st("questions_label") },
            ]}
          />
          <Button variant="ghost" size="icon-sm" aria-label={st("prev_week")} onClick={() => setOffset((value) => value - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={st("next_week")} disabled={offset >= 0} onClick={() => setOffset((value) => Math.min(0, value + 1))}>
            <ChevronRight />
          </Button>
        </>
      }
    >
      <ColumnChart
        data={data}
        height={200}
        ariaLabel={st("week_chart_title")}
        integer={metric === "questions"}
        formatTick={(value) =>
          metric === "time" ? formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") }) : formatNumber(value, language)
        }
      />
    </Panel>
  );
}

export function DistributionPanel() {
  const { st, duration } = useStudyT();
  const { planSessions, planSubjects, settings, today } = useStudy();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("week");
  const segments = useMemo(() => {
    const from =
      period === "today"
        ? today
        : period === "week"
          ? startOfWeek(today, settings.weekStartsOn)
          : period === "month"
            ? `${today.slice(0, 7)}-01`
            : null;
    const totals = new Map<string, number>();
    for (const session of planSessions) {
      if (from && (session.day < from || session.day > today)) continue;
      totals.set(session.subjectId, (totals.get(session.subjectId) ?? 0) + session.durationSec);
    }
    const ranked = [...totals.entries()].filter(([, seconds]) => seconds > 0).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 5).map(([subjectId, seconds]) => {
      const subject = planSubjects.find((entry) => entry.id === subjectId);
      return {
        id: subjectId,
        label: subject?.name ?? st("untitled_subject"),
        value: seconds,
        color: subject?.color ?? "var(--text-faint)",
        valueLabel: duration(seconds),
      };
    });
    const rest = ranked.slice(5).reduce((sum, [, seconds]) => sum + seconds, 0);
    if (rest > 0) top.push({ id: "other", label: st("distribution_other"), value: rest, color: "var(--border-strong)", valueLabel: duration(rest) });
    return top;
  }, [duration, period, planSessions, planSubjects, settings.weekStartsOn, st, today]);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <Panel
      title={st("distribution_title")}
      action={
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "today", label: st("period_today") },
            { value: "week", label: st("period_week") },
            { value: "month", label: st("period_month") },
            { value: "all", label: st("period_all") },
          ]}
        />
      }
    >
      {total > 0 ? (
        <Donut
          segments={segments}
          ariaLabel={st("distribution_title")}
          center={<DurationFigure seconds={total} size="sm" />}
        />
      ) : (
        <p className="py-10 text-center text-[12.5px] text-faint">{st("distribution_empty")}</p>
      )}
    </Panel>
  );
}

export function ReviewRow({ review, compact = false }: { review: StudyReview; compact?: boolean }) {
  const { st, locale } = useStudyT();
  const { subjectById, topicById, actions, today } = useStudy();
  const subject = subjectById(review.subjectId);
  const topic = topicById(review.subjectId, review.topicId);
  const late = review.status === "pending" && review.dueDay < today ? diffDays(review.dueDay, today) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="block h-7 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-ink">{subject?.name ?? st("untitled_subject")}</p>
        <p className="truncate text-[11.5px] text-muted">
          {topic?.name ?? st("no_topic")}
          <span className="text-faint">
            {" · "}
            {st("review_interval", { count: review.intervalDays })}
            {late ? ` · ${st("review_late_by", { count: late })}` : compact ? "" : ` · ${formatDay(review.dueDay, locale)}`}
          </span>
        </p>
      </div>
      <FocusButton variant="ghost" size="icon-sm" subjectId={review.subjectId} topicId={review.topicId} reviewId={review.id} label={st("review_start")} />
      <Tooltip label={st("review_complete")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={st("review_complete")}
          onClick={async () => {
            await actions.resolveReviews([review.id], "done");
            toast.success(st("review_done_toast", { count: 1 }), {
              action: { label: st("review_restore"), onClick: () => void actions.resolveReviews([review.id], "pending") },
            });
          }}
        >
          <Check />
        </Button>
      </Tooltip>
    </div>
  );
}

export function TodayReviewsPanel({ limit = 5 }: { limit?: number }) {
  const { st } = useStudyT();
  const metrics = usePlanMetrics();
  const list = metrics.dueReviews.slice(0, limit);
  return (
    <Panel
      title={st("today_reviews_title")}
      description={metrics.overdueReviews.length ? st("overdue_badge", { count: metrics.overdueReviews.length }) : undefined}
      action={<PanelLink href="/home/study/reviews">{st("view_all")}</PanelLink>}
    >
      {list.length ? (
        <div className="divide-y divide-[var(--border)]">
          {list.map((review) => (
            <ReviewRow key={review.id} review={review} compact />
          ))}
          {metrics.dueReviews.length > limit ? (
            <Link href="/home/study/reviews" className="block pt-2 text-[11.5px] text-muted hover:text-ink">
              {st("more_items", { count: metrics.dueReviews.length - limit })}
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="py-4 text-[12.5px] text-faint">{st("today_reviews_empty")}</p>
      )}
    </Panel>
  );
}

export function TodayPlanPanel() {
  const { st, duration } = useStudyT();
  const router = useRouter();
  const { planCycle, today, subjectById } = useStudy();
  const { tasks } = usePlanning();
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({ open: false, task: null, day: null });
  const blocks = useMemo(
    () => (planCycle ? (projectSchedule(planCycle, today, today, today).get(today) ?? []) : []),
    [planCycle, today]
  );
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.day === today || (task.day && task.day < today && !task.done))
        .sort((a, b) => Number(a.done) - Number(b.done) || ((a.day ?? "") < (b.day ?? "") ? -1 : 1)),
    [tasks, today]
  );
  const openTask = (task: PlanningTask) => setTaskDialog({ open: true, task, day: task.day });
  return (
    <Panel title={st("today_plan_title")} action={<PanelLink href="/home/study/schedule">{st("nav_schedule")}</PanelLink>}>
      {blocks.length ? (
        <ul className="space-y-1.5">
          {blocks.map((block) => {
            const subject = subjectById(block.subjectId);
            const done = block.status !== "planned";
            return (
              <li key={block.key} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1 py-1.5">
                <span className="block h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--border-strong)", opacity: done ? 0.4 : 1 }} />
                <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", done ? "text-faint line-through" : "text-ink", block.isNext && "font-medium")}>
                  {subject?.name ?? st("untitled_subject")}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted">{duration(block.minutes * 60)}</span>
                {block.isNext ? <FocusButton variant="ghost" size="icon-sm" subjectId={block.subjectId} label={st("next_up_start")} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {dayTasks.length ? (
        <div className={cn(blocks.length && "mt-2 border-t border-[var(--border)] pt-2")}>
          {dayTasks.slice(0, 6).map((task) => (
            <TaskLine key={task.id} task={task} onOpen={openTask} meta={task.day && task.day < today ? st("tasks_overdue") : undefined} />
          ))}
          {dayTasks.length > 6 ? <p className="px-2 pt-1 text-[11px] text-faint">{st("more_items", { count: dayTasks.length - 6 })}</p> : null}
        </div>
      ) : null}
      {!blocks.length && !dayTasks.length ? (
        planCycle ? (
          <p className="py-4 text-[12.5px] text-faint">{st("today_plan_empty")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-muted">{st("today_plan_create_desc")}</p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/home/study/schedule?setup=1")}>
              {st("schedule_setup")}
            </Button>
          </div>
        )
      ) : null}
      <TaskDialog state={taskDialog} onOpenChange={(open) => setTaskDialog((value) => ({ ...value, open }))} />
    </Panel>
  );
}

const REMINDER_KEY: Record<StudyReminder["kind"], StudyKey> = {
  exam: "reminder_kind_exam",
  task: "reminder_kind_task",
  event: "reminder_kind_event",
};

export function RemindersPanel() {
  const { st, locale } = useStudyT();
  const { reminders, activePlan, actions, today } = useStudy();
  const [dialog, setDialog] = useState<{ open: boolean; reminder: StudyReminder | null }>({ open: false, reminder: null });
  const [showDone, setShowDone] = useState(false);
  const scoped = reminders.filter((reminder) => !reminder.planId || reminder.planId === activePlan?.id);
  const pending = scoped.filter((reminder) => !reminder.done);
  const done = scoped.filter((reminder) => reminder.done).sort((a, b) => (a.day < b.day ? 1 : -1));
  const visible = showDone ? [...pending, ...done] : pending;
  return (
    <Panel
      title={st("reminders_title")}
      action={
        <Tooltip label={st("reminder_add")}>
          <Button variant="ghost" size="icon-sm" aria-label={st("reminder_add")} onClick={() => setDialog({ open: true, reminder: null })}>
            <Plus />
          </Button>
        </Tooltip>
      }
    >
      {visible.length ? (
        <ul className="space-y-1">
          {visible.map((reminder) => {
            const days = diffDays(today, reminder.day);
            return (
              <li key={reminder.id} className="group flex items-center gap-2.5 rounded-[var(--radius-sm)] py-1.5">
                <Checkbox
                  checked={reminder.done}
                  onCheckedChange={(value) => void actions.saveReminder({ ...reminder, done: value === true })}
                  aria-label={reminder.title}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[12.5px]", reminder.done ? "text-faint line-through" : "text-ink")}>{reminder.title}</p>
                  <p className="text-[11px] text-faint">
                    {st(REMINDER_KEY[reminder.kind])} · {formatDay(reminder.day, locale, { day: "numeric", month: "short", year: "2-digit" })}
                    {!reminder.done && days >= 0 && days <= 60 ? ` · ${days === 0 ? st("today") : st("in_days", { count: days })}` : ""}
                  </p>
                </div>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100" aria-label={st("more_actions")}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => setDialog({ open: true, reminder })}>
                      <Pencil /> {st("edit")}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      destructive
                      onSelect={async () => {
                        await actions.deleteReminder(reminder.id);
                        toast.success(st("reminder_deleted"));
                      }}
                    >
                      <Trash2 /> {st("delete")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-3 text-[12.5px] text-faint">{st("reminders_empty")}</p>
      )}
      {done.length ? (
        <button type="button" onClick={() => setShowDone((value) => !value)} className="mt-2 text-[11.5px] text-muted hover:text-ink">
          {showDone ? st("reminders_hide_done") : st("reminders_show_done", { count: done.length })}
        </button>
      ) : null}
      <ReminderDialog open={dialog.open} reminder={dialog.reminder} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} />
    </Panel>
  );
}

export function RecentActivityPanel({ limit = 7 }: { limit?: number }) {
  const { st, locale, duration } = useStudyT();
  const { planSessions, subjectById, topicById, today } = useStudy();
  const recent = planSessions.slice(0, limit);
  return (
    <Panel title={st("recent_activity_title")} action={<PanelLink href="/home/study/log">{st("nav_log")}</PanelLink>}>
      {recent.length ? (
        <ul className="space-y-2.5">
          {recent.map((session) => {
            const subject = subjectById(session.subjectId);
            const topic = topicById(session.subjectId, session.topicId);
            return (
              <li key={session.id} className="flex items-start gap-2.5">
                <SubjectDot color={subject?.color} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">
                    {subject?.name ?? st("untitled_subject")}
                    {topic ? <span className="text-muted"> · {topic.name}</span> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                    <CategoryChip id={session.categoryId} />
                    <span>{relativeDay(session.day, today, locale, st)}</span>
                    {session.durationSec ? <span>· {duration(session.durationSec)}</span> : null}
                    {session.correct + session.wrong ? <span>· {st("questions_count", { count: session.correct + session.wrong })}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-3 text-[12.5px] text-faint">{st("recent_activity_empty")}</p>
      )}
    </Panel>
  );
}
