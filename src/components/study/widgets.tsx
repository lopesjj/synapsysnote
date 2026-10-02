"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { studyTranslateParts, useStudyT, type StudyKey, type StudyT } from "@/lib/study/i18n";
import { useAwardBook, usePlanMetrics } from "@/lib/study/hooks";
import { addDays, capitalizeFirst, compareDay, diffDays, dayKeyOf, formatDay, orderedWeekdays, startOfWeek, weekDays, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import { aggregate, dayStatus, isPlannedDay, performanceBand, percentLabel, type DayStatus } from "@/lib/study/metrics";
import { formatHoursTick, formatNumber } from "@/lib/study/format";
import type { DayKey, StudyReminder, StudyReview } from "@/types/study";
import { ColumnChart, Donut, Meter, Sparkbars } from "./charts";
import { PaceDialog, ReminderDialog, GoalDialog } from "./dialogs";
import { StreakSeal } from "./awards";
import {
  AccuracyTag,
  BandGlyph,
  CategoryChip,
  DurationFigure,
  Figure,
  FocusButton,
  Panel,
  PanelLink,
  RhythmMark,
  Segmented,
  SubjectBar,
  bandColor,
} from "./ui";

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
    <div className={cn("flex min-w-0 flex-col gap-2.5 px-4 py-4 sm:px-6 sm:py-5", className)}>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">{label}</span>
      <div className="min-h-[2.5rem]">{children}</div>
      {hint ? <div className="text-[11.5px] leading-snug text-muted">{hint}</div> : null}
    </div>
  );
}

export function KpiBand({ className }: { className?: string }) {
  const { st, duration, language } = useStudyT();
  const { settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const band = performanceBand(metrics.total.accuracy, settings);
  const isRecord = metrics.streak.current > 0 && metrics.streak.current >= metrics.streak.best && metrics.streak.best > 1;
  return (
    <section
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border)] lg:grid-cols-4",
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
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
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
        <div className="space-y-2.5">
          <Figure value={Math.round(metrics.coverage.ratio * 100)} unit="%" />
          <Meter
            value={metrics.coverage.done}
            max={metrics.coverage.total}
            label={st("kpi_coverage")}
            tone={metrics.coverage.total > 0 && metrics.coverage.done === metrics.coverage.total ? "var(--laurel)" : undefined}
          />
        </div>
      </KpiCell>
      <KpiCell
        label={st("kpi_streak")}
        className="border-l border-t border-[var(--border)] lg:border-t-0"
        hint={
          metrics.streak.best ? (
            <span className={cn(isRecord && "font-medium text-[var(--laurel)]")}>
              {isRecord ? st("streak_record_badge") : st("kpi_streak_hint", { count: metrics.streak.best })}
            </span>
          ) : undefined
        }
      >
        <span className="inline-flex items-center gap-2.5">
          <Figure value={metrics.streak.current} unit={st("countdown_days_label", { count: metrics.streak.current })} />
          {metrics.streak.current > 0 ? <RhythmMark full={isRecord} /> : null}
        </span>
      </KpiCell>
    </section>
  );
}

const CHAIN_WEEKS = 4;

export function ConsistencyPanel() {
  const { st, locale, duration, language } = useStudyT();
  const { settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const book = useAwardBook();
  const firstDay = metrics.consistency.firstDay;
  const current = metrics.streak.current;
  const best = metrics.streak.best;
  const isRecord = current >= best && best > 1;
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const [lastWeek, setLastWeek] = useState(thisWeek);
  const start = addDays(lastWeek, -(CHAIN_WEEKS - 1) * 7);
  const end = addDays(lastWeek, 6);
  const atToday = compareDay(lastWeek, thisWeek) >= 0;

  const rows = useMemo(() => {
    const built = Array.from({ length: CHAIN_WEEKS }, (_, row) => {
      const first = addDays(start, row * 7);
      const days = weekDays(first).map((day) => {
        const seconds = metrics.byDay.get(day) ?? 0;
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
                  : status === "future"
                    ? ""
                    : st("heatmap_before");
        const dateLabel = capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" }));
        return { key: day, status, date: Number(day.slice(8)), title: detail ? `${dateLabel} · ${detail}` : dateLabel, linked: false };
      });
      const last = addDays(first, 6);
      const label = first.slice(0, 7) === last.slice(0, 7) ? `${Number(first.slice(8))}–${formatDay(last, locale)}` : `${formatDay(first, locale)} – ${formatDay(last, locale)}`;
      return { key: first, label, days };
    });
    const flat = built.flatMap((row) => row.days);
    const bridge = (status: DayStatus) => status === "studied" || status === "rest";
    for (let index = 0; index < flat.length - 1; index += 1) {
      if (!bridge(flat[index].status) || !bridge(flat[index + 1].status)) continue;
      if (Math.floor(index / 7) !== Math.floor((index + 1) / 7)) continue;
      let hasBefore = false;
      for (let cursor = index; cursor >= 0 && bridge(flat[cursor].status); cursor -= 1) {
        if (flat[cursor].status === "studied") hasBefore = true;
      }
      let hasAfter = false;
      for (let cursor = index + 1; cursor < flat.length && bridge(flat[cursor].status); cursor += 1) {
        if (flat[cursor].status === "studied") hasAfter = true;
      }
      if (hasBefore && hasAfter) flat[index].linked = true;
    }
    return built;
  }, [duration, firstDay, locale, metrics.byDay, metrics.days, settings.studyWeekdays, st, start, today]);

  const strong = (value: number, unit: string) => (
    <strong className="font-semibold text-ink">
      {value} {unit}
    </strong>
  );
  const headline = current
    ? studyTranslateParts(language, "consistency_streak_line", { count: current }, { count: strong(current, st("countdown_days_label", { count: current })) })
    : st("streak_zero");
  const recordLine = best
    ? studyTranslateParts(language, "consistency_record_line", { count: best }, { count: strong(best, st("countdown_days_label", { count: best })) })
    : null;
  const nextSeal = book?.nextStreak ?? null;
  const weekdays = orderedWeekdays(settings.weekStartsOn);

  return (
    <Panel
      title={st("heatmap_title")}
      description={st("pace_range", { start: formatDay(start, locale), end: formatDay(end, locale) })}
      action={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={st("prev_period")} onClick={() => setLastWeek(addDays(lastWeek, -CHAIN_WEEKS * 7))}>
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={st("next_period")}
            disabled={atToday}
            onClick={() => setLastWeek(compareDay(addDays(lastWeek, CHAIN_WEEKS * 7), thisWeek) > 0 ? thisWeek : addDays(lastWeek, CHAIN_WEEKS * 7))}
          >
            <ChevronRight />
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="flex max-w-xl flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-relaxed text-muted">
          {current ? <RhythmMark full={isRecord} /> : null}
          <span>
            {headline}
            {recordLine ? <> {recordLine}</> : null}
          </span>
        </p>
        {nextSeal ? (
          <Tooltip label={st("streak_next_seal", { count: nextSeal.threshold - current, threshold: nextSeal.threshold })} side="left">
            <span tabIndex={0} className="inline-flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]">
              <StreakSeal award={nextSeal} size={38} unit={st("award_seal_unit")} />
              <span className="text-[11.5px] leading-tight text-faint">
                <span className="block tabular-nums text-ink">
                  {current}/{nextSeal.threshold}
                </span>
                {st("streak_next_seal", { count: nextSeal.threshold - current, threshold: nextSeal.threshold })}
              </span>
            </span>
          </Tooltip>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-y-1.5 sm:grid-cols-[6.5rem_repeat(7,minmax(0,1fr))]">
        <span className="hidden sm:block" />
        {weekdays.map((weekday) => (
          <span key={weekday} className="pb-1.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            {weekdayLabel(weekday, locale, "short").replace(".", "")}
          </span>
        ))}
        {rows.map((row) => (
          <Fragment key={row.key}>
            <span className="hidden self-center whitespace-nowrap pr-3 text-[12px] tabular-nums text-muted sm:block">{row.label}</span>
            {row.days.map((day) => (
              <span key={day.key} title={day.title} className="relative flex h-11 items-center justify-center">
                {day.linked ? (
                  <span aria-hidden className="absolute left-1/2 top-1/2 h-[6px] w-full -translate-y-1/2 bg-[color-mix(in_oklab,var(--accent)_24%,var(--surface))]" />
                ) : null}
                <span
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-full text-[13px] tabular-nums",
                    day.status === "studied" && "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_1px_2px_rgba(15,44,76,0.18)]",
                    day.status === "studied" && day.key === today && "synapsys-stamp",
                    day.status === "missed" && "bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-[var(--danger)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--danger)_55%,transparent)]",
                    day.status === "rest" && "bg-[var(--surface-2)] text-faint",
                    day.status === "pending" && "border-[1.5px] border-dashed border-[var(--accent)] font-semibold text-ink",
                    day.status === "future" && "text-muted",
                    day.status === "before" && "text-faint"
                  )}
                >
                  {day.status === "studied" ? (
                    <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
                      <path d="M2.5 6.2 5 8.6 9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : day.status === "missed" ? (
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
                      <path d="m3 3 6 6M9 3 3 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    </svg>
                  ) : (
                    day.date
                  )}
                </span>
              </span>
            ))}
          </Fragment>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px] text-muted">
        <p>{current && !metrics.streak.studiedToday && isPlannedDay(today, settings.studyWeekdays) ? st("streak_today_pending") : null}</p>
        <span className="inline-flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex size-3.5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
              <svg viewBox="0 0 12 12" className="size-2" fill="none" aria-hidden>
                <path d="M2.5 6.2 5 8.6 9.5 3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {st("heatmap_studied")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex size-3.5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-[var(--danger)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--danger)_55%,transparent)]">
              <svg viewBox="0 0 12 12" className="size-2" fill="none" aria-hidden>
                <path d="m3 3 6 6M9 3 3 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            {st("heatmap_missed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-full border-[1.5px] border-dashed border-[var(--accent)]" />
            {st("today")}
          </span>
        </span>
      </div>
      {!nextSeal && book && book.streaks.length ? <p className="mt-2 text-[12px] font-medium text-[var(--laurel)]">{st("streak_all_seals")}</p> : null}
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

export function SubjectsPanel() {
  const { st, duration, language, locale } = useStudyT();
  const { planSubjects, settings } = useStudy();
  const metrics = usePlanMetrics();
  const book = useAwardBook();
  const completed = book?.subjects.filter((award) => award.earnedAt !== null).length ?? 0;
  const withTopics = book?.subjects.length ?? 0;
  return (
    <Panel
      title={st("nav_subjects")}
      description={withTopics ? st("subjects_completed_count", { done: completed, total: withTopics }) : st("subjects_panel_desc")}
      action={<PanelLink href="/home/study/subjects">{st("view_all")}</PanelLink>}
      bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2"
    >
      <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6rem_7.5rem] gap-3 border-y border-[var(--border)] px-6 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-faint md:grid">
        <span>{st("col_subject")}</span>
        <span className="text-right">{st("col_time")}</span>
        <span className="text-right">{st("questions_label")}</span>
        <span>{st("col_accuracy")}</span>
        <span>{st("col_coverage")}</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {planSubjects.map((subject) => {
          const agg = metrics.bySubject.get(subject.id);
          const award = book?.subjects.find((entry) => entry.subjectId === subject.id) ?? null;
          const done = subject.topics.filter((topic) => topic.done).length;
          const total = subject.topics.length;
          const complete = award !== null && award.earnedAt !== null;
          return (
            <li key={subject.id} className="group relative">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-6 md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6rem_7.5rem]">
                <Link href={`/home/study/subjects/${subject.id}`} className="flex min-w-0 items-center gap-3 text-ink">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center">
                    <span aria-hidden className="block h-7 w-1 rounded-full" style={{ backgroundColor: subject.color }} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("truncate text-[13.5px] group-hover:underline", complete ? "font-semibold" : "font-medium")}>{subject.name}</span>
                      {complete ? (
                        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: `color-mix(in oklab, ${subject.color} 72%, var(--text))` }}>
                          {st("subject_complete_mark")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-faint">
                      {total ? st("kpi_coverage_hint", { done, total }) : st("goal_subject_no_topics")}
                      {agg?.lastDay ? ` · ${st("subject_last_studied", { date: formatDay(agg.lastDay, locale) })}` : ""}
                    </span>
                  </span>
                </Link>
                <span className="text-right text-[12.5px] tabular-nums text-ink">{agg?.seconds ? duration(agg.seconds) : "–"}</span>
                <span className="hidden text-right text-[12.5px] tabular-nums text-muted md:block">
                  {agg?.questions ? formatNumber(agg.questions, language) : "–"}
                </span>
                <span className="hidden md:block">
                  <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
                </span>
                <span className="col-span-2 flex items-center gap-2 md:col-span-1">
                  <Meter value={done} max={total} tone="var(--text-muted)" className="h-[5px] flex-1 md:w-16 md:flex-none" label={st("col_coverage")} />
                  <span className="w-9 text-right text-[11.5px] tabular-nums text-faint">{total ? `${Math.round((done / total) * 100)}%` : "–"}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
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
      extra: (amount: number) => duration(amount),
    },
    {
      key: "questions",
      label: st("pace_questions"),
      value: metrics.weekQuestions,
      goal: activePlan.weeklyGoalQuestions,
      text: activePlan.weeklyGoalQuestions
        ? st("pace_of", { value: formatNumber(metrics.weekQuestions, language), goal: formatNumber(activePlan.weeklyGoalQuestions, language) })
        : formatNumber(metrics.weekQuestions, language),
      extra: (amount: number) => formatNumber(amount, language),
    },
  ];
  const withGoal = rows.filter((row) => row.goal > 0);
  const allDone = withGoal.length > 0 && withGoal.every((row) => row.value >= row.goal);
  return (
    <Panel
      className={cn(allDone && "shadow-[0_0_0_1px_color-mix(in_oklab,var(--band-high)_45%,var(--border))]")}
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
      {allDone ? (
        <div className="mb-4 flex justify-center">
          <div className="w-fit max-w-full rounded-[12px] bg-[color-mix(in_oklab,var(--band-high)_12%,transparent)] px-2.5 py-2 text-center ring-1 ring-[color-mix(in_oklab,var(--band-high)_22%,transparent)]">
            <p className="text-[12.5px] font-medium leading-snug text-[var(--band-high-text)]">{st("pace_all_done")}</p>
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        {rows.map((row) => {
          const done = row.goal > 0 && row.value >= row.goal;
          const surplus = done ? row.value - row.goal : 0;
          return (
            <div key={row.key} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12.5px]">
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                  {done ? (
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--band-high)] text-white dark:text-[#06261a]">
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                  ) : null}
                  {row.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {done ? (
                    <span className="rounded-full bg-[color-mix(in_oklab,var(--band-high)_14%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--band-high-text)]">
                      {surplus > 0 && (row.key === "questions" || surplus >= 60) ? `+${row.extra(surplus)}` : st("pace_done")}
                    </span>
                  ) : null}
                  <span className={cn("tabular-nums", done ? "font-semibold text-[var(--band-high-text)]" : "text-muted")}>{row.text}</span>
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
  const done = goal > 0 && value >= goal;
  return (
    <div className="relative h-3">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-2)]" />
      <div
        className={cn("absolute left-0 top-1/2 -translate-y-1/2 rounded-full transition-[width] duration-500", done ? "h-2" : "h-1.5 bg-[var(--accent)]")}
        style={{
          width: `${ratio * 100}%`,
          background: done ? "linear-gradient(90deg, color-mix(in oklab, var(--band-high) 55%, transparent), var(--band-high))" : undefined,
          boxShadow: done ? "0 0 12px -2px color-mix(in oklab, var(--band-high) 70%, transparent)" : undefined,
        }}
      />
      {done
        ? null
        : [0.25, 0.5, 0.75].map((tick) => (
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
        height={190}
        ariaLabel={st("week_chart_title")}
        integer={metric === "questions"}
        variant="refined"
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

const REMINDER_KEY: Record<StudyReminder["kind"], StudyKey> = {
  exam: "reminder_kind_exam",
  task: "reminder_kind_task",
  event: "reminder_kind_event",
};

export function RemindersPanel({ className }: { className?: string }) {
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
      className={className}
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

export function RecentActivityPanel({ limit = 7, className }: { limit?: number; className?: string }) {
  const { st, locale, duration } = useStudyT();
  const { planSessions, subjectById, topicById, today } = useStudy();
  const recent = planSessions.slice(0, limit);
  return (
    <Panel className={className} title={st("recent_activity_title")} action={<PanelLink href="/home/study/log">{st("nav_log")}</PanelLink>}>
      {recent.length ? (
        <ul className="space-y-2.5">
          {recent.map((session) => {
            const subject = subjectById(session.subjectId);
            const topic = topicById(session.subjectId, session.topicId);
            return (
              <li key={session.id} className="flex items-stretch gap-2.5">
                <SubjectBar color={subject?.color} />
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
