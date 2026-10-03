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
import { absorbExamQuestions, aggregate, dayStatus, examTotals, isPlannedDay, performanceBand, percentLabel, type DayStatus } from "@/lib/study/metrics";
import { formatHoursTick, formatNumber } from "@/lib/study/format";
import type { DayKey, MockExam, StudyReminder, StudyReview, StudySession } from "@/types/study";
import { subjectTone } from "@/lib/study/defaults";
import { ColumnChart, Donut, Meter } from "./charts";
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

const KPI_LABEL = "text-[10.5px] font-medium uppercase leading-snug tracking-[0.12em] text-faint";

function KpiCell({
  label,
  children,
  hint,
  className,
  center = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("row-span-2 grid min-w-0 grid-rows-subgrid content-start px-4 py-4 sm:px-6 sm:py-5", className)}>
      <span className={cn("self-start", KPI_LABEL)}>{label}</span>
      <div className={cn("flex min-h-[2.5rem] min-w-0 flex-col gap-2.5", center ? "justify-center" : "pt-2.5")}>
        {children}
        {hint ? <div className="text-[11.5px] leading-snug text-muted">{hint}</div> : null}
      </div>
    </div>
  );
}

export function KpiBand({ className, pace = false }: { className?: string; pace?: boolean }) {
  const { st, duration, language } = useStudyT();
  const { settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const band = performanceBand(metrics.total.accuracy, settings);
  const isRecord = metrics.streak.current > 0 && metrics.streak.current >= metrics.streak.best && metrics.streak.best > 1;
  return (
    <section
      className={cn(
        "grid grid-cols-2 grid-rows-[auto_1fr_auto_1fr] overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border)] lg:grid-cols-4 lg:grid-rows-[auto_1fr]",
        className
      )}
    >
      <KpiCell
        center={pace}
        label={st("kpi_time")}
        hint={metrics.avgPerDay ? st("kpi_time_hint", { avg: duration(metrics.avgPerDay) }) : undefined}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <DurationFigure seconds={metrics.seconds} className="tabular-nums" />
          <KpiSpark values={Array.from({ length: 14 }, (_, index) => metrics.byDay.get(addDays(today, index - 13)) ?? 0)} />
        </div>
      </KpiCell>
      <KpiCell
        label={st("kpi_accuracy")}
        center={pace}
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
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Figure value={Math.round(metrics.total.accuracy * 100)} unit="%" className="tabular-nums" />
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold leading-none"
              style={{
                color: bandColor(band),
                backgroundColor: `color-mix(in oklab, ${bandColor(band)} 14%, transparent)`,
              }}
            >
              <BandGlyph band={band} />
              {st(band === "low" ? "band_low" : band === "mid" ? "band_mid" : "band_high")}
            </span>
          </span>
        ) : (
          <Figure value="–" />
        )}
      </KpiCell>
      {pace ? (
        <PaceKpi />
      ) : (
        <>
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
        </>
      )}
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

function ExamPath({ spent, startLabel, examLabel }: { spent: number; startLabel: string; examLabel: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, spent)) * 1000) / 10;
  return (
    <div className="mt-5">
      <div className="relative h-[3px]">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--border)]" />
        <div className="absolute inset-y-0 start-0 my-auto h-[3px] rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
        <span
          aria-hidden
          className="absolute top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--surface)]"
          style={{ insetInlineStart: `clamp(0px, calc(${percent}% - 3.5px), calc(100% - 7px))` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px] text-faint">
        <span className="min-w-0 truncate">{startLabel}</span>
        <span className="min-w-0 truncate text-end">{examLabel}</span>
      </div>
    </div>
  );
}

export function CountdownPanel() {
  const { st, locale, language } = useStudyT();
  const { focusPlan, planReadOnly, today } = useStudy();
  const [editing, setEditing] = useState(false);
  if (!focusPlan) return null;
  const exam = focusPlan.examDate;
  const left = exam ? diffDays(today, exam) : null;
  const created = focusPlan.createdAt ? dayKeyOf(focusPlan.createdAt) : today;
  const span = exam ? Math.max(1, diffDays(created, exam)) : 1;
  const elapsed = exam ? Math.max(0, Math.min(span, diffDays(created, today))) : 0;
  const spent = left !== null && left > 0 ? elapsed / span : left === 0 ? 1 : 0;
  const tracked = language !== "ja" && language !== "zh" && language !== "ar";
  return (
    <Panel title={st("countdown_title")}>
      {exam && left !== null ? (
        left > 0 ? (
          <div>
            <p className={cn("text-[11px] font-semibold text-muted", tracked && "uppercase tracking-[0.18em]")}>
              {st("countdown_days_label", { count: left })}
            </p>
            <p className="mt-1 text-[60px] font-semibold leading-none tracking-[-0.06em] text-ink tabular-nums sm:text-[72px]">{left}</p>
            <p className="mt-4 text-[13px] text-muted">{capitalizeFirst(formatDay(exam, locale, { weekday: "long" }))}</p>
            <p className="mt-0.5 text-[17px] font-medium leading-snug tracking-[-0.02em] text-pretty text-ink">
              {formatDay(exam, locale, { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <ExamPath spent={spent} startLabel={st("countdown_span_start")} examLabel={st("countdown_span_exam")} />
          </div>
        ) : (
          <div>
            <p className="text-[17px] font-medium leading-snug text-pretty text-ink">
              {left === 0
                ? st("countdown_today")
                : st("countdown_past", { date: formatDay(exam, locale, { day: "numeric", month: "long", year: "numeric" }) })}
            </p>
            {left === 0 ? <ExamPath spent={1} startLabel={st("countdown_span_start")} examLabel={st("countdown_span_exam")} /> : null}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-muted">{st("countdown_empty")}</p>
          {planReadOnly ? null : (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {st("countdown_set_date")}
            </Button>
          )}
        </div>
      )}
      {planReadOnly ? null : <GoalDialog open={editing} onOpenChange={setEditing} plan={focusPlan} />}
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
                    <span aria-hidden className="block h-7 w-1 rounded-full" style={{ backgroundColor: subjectTone(subject.color) }} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("truncate text-[13.5px] group-hover:underline", complete ? "font-semibold" : "font-medium")}>{subject.name}</span>
                      {complete ? (
                        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: `color-mix(in oklab, ${subjectTone(subject.color)} 72%, var(--text))` }}>
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

function KpiSpark({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  return (
    <div className="flex h-6 shrink-0 items-end gap-[3px]" aria-hidden>
      {values.map((value, index) => {
        const ratio = max > 0 ? value / max : 0;
        const last = index === values.length - 1;
        return (
          <span
            key={index}
            className="w-[4px] rounded-[2px]"
            style={{
              height: value > 0 ? `${Math.max(8, Math.round(ratio * 24))}px` : "2px",
              backgroundColor:
                value > 0
                  ? last
                    ? "var(--accent)"
                    : "color-mix(in oklab, var(--accent) 45%, var(--surface-2))"
                  : "var(--border)",
            }}
          />
        );
      })}
    </div>
  );
}

function PaceKpi() {
  const { st, locale, duration, language } = useStudyT();
  const { focusPlan, planReadOnly } = useStudy();
  const metrics = usePlanMetrics();
  const [editing, setEditing] = useState(false);
  if (!focusPlan) return null;
  const rows = [
    {
      key: "hours",
      label: st("pace_hours"),
      value: metrics.weekSeconds,
      goal: focusPlan.weeklyGoalMinutes * 60,
      valueLabel: duration(metrics.weekSeconds),
      goalLabel: duration(focusPlan.weeklyGoalMinutes * 60),
      extra: (amount: number) => duration(amount),
    },
    {
      key: "questions",
      label: st("pace_questions"),
      value: metrics.weekQuestions,
      goal: focusPlan.weeklyGoalQuestions,
      valueLabel: formatNumber(metrics.weekQuestions, language),
      goalLabel: formatNumber(focusPlan.weeklyGoalQuestions, language),
      extra: (amount: number) => formatNumber(amount, language),
    },
  ];
  const withGoal = rows.filter((row) => row.goal > 0);
  const allDone = withGoal.length > 0 && withGoal.every((row) => row.value >= row.goal);
  return (
    <div className="@container/pace col-span-2 row-span-2 grid min-w-0 grid-rows-subgrid content-start border-t border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5 lg:border-l lg:border-t-0">
      <div className="relative flex min-w-0 items-center gap-2 self-start pe-8">
        <span className={cn("shrink-0", KPI_LABEL)}>{st("pace_title")}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] leading-none text-muted">
          {st("pace_range", {
            start: formatDay(metrics.weekStart, locale),
            end: formatDay(metrics.weekEnd, locale),
          })}
        </span>
        {planReadOnly ? null : (
          <Tooltip label={st("pace_edit")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute end-0 top-1/2 -translate-y-1/2"
              aria-label={st("pace_edit")}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="min-w-0 pt-2.5">
      {allDone ? <p className="mb-2.5 text-center text-[12px] font-medium leading-snug text-[var(--band-high-text)]">{st("pace_all_done")}</p> : null}
      <div className="grid grid-cols-1 gap-3.5 @[17rem]/pace:grid-cols-2 @[17rem]/pace:gap-0">
        {rows.map((row, index) => {
          const done = row.goal > 0 && row.value >= row.goal;
          const surplus = done ? row.value - row.goal : 0;
          const surplusLabel = surplus > 0 && (row.key === "questions" || surplus >= 60) ? `+${row.extra(surplus)}` : st("pace_done");
          return (
            <div
              key={row.key}
              className={cn(
                "min-w-0",
                index === 0 && "@[17rem]/pace:pe-5",
                index > 0 && "border-t border-[var(--border)] pt-3.5 @[17rem]/pace:border-s @[17rem]/pace:border-t-0 @[17rem]/pace:ps-5 @[17rem]/pace:pt-0"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  {done ? (
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--band-high)] text-white dark:text-[#06261a]">
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                  ) : null}
                  <span className="truncate">{row.label}</span>
                </span>
                {done ? (
                  <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--band-high)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--band-high-text)]">
                    {surplusLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[12.5px] font-medium leading-none text-muted">
                {row.goal > 0 ? (
                  studyTranslateParts(language, "pace_of", { value: row.valueLabel, goal: row.goalLabel }, {
                    value:
                      row.key === "hours" ? (
                        <DurationFigure seconds={row.value} className={cn("tabular-nums", done && "text-[var(--band-high-text)]")} />
                      ) : (
                        <Figure value={row.valueLabel} className={cn("tabular-nums", done && "text-[var(--band-high-text)]")} />
                      ),
                    goal: <span className="text-[13px] font-medium text-muted">{row.goalLabel}</span>,
                  })
                ) : row.key === "hours" ? (
                  <DurationFigure seconds={row.value} className="tabular-nums" />
                ) : (
                  <Figure value={row.valueLabel} className="tabular-nums" />
                )}
              </p>
              <div className="mt-2">
                {row.goal > 0 ? (
                  <PaceRuler value={row.value} goal={row.goal} label={row.label} />
                ) : (
                  <p className="text-[11px] text-faint">{st("pace_no_goal")}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {planReadOnly ? null : <PaceDialog open={editing} onOpenChange={setEditing} plan={focusPlan} />}
      </div>
    </div>
  );
}

function PaceRuler({ value, goal, label }: { value: number; goal: number; label?: string }) {
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = goal > 0 && value >= goal;
  return (
    <div
      className="relative h-3"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(value, goal)}
      aria-label={label}
    >
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-2)]" />
      <div
        className={cn(
          "absolute start-0 top-1/2 -translate-y-1/2 rounded-full transition-[width] duration-500",
          done
            ? "h-2 bg-[#1f9a64] shadow-[0_0_10px_-2px_rgba(31,154,100,0.45)] dark:bg-[#46d39a] dark:shadow-[0_0_12px_-2px_rgba(70,211,154,0.42)]"
            : "h-1.5 bg-[var(--accent)]"
        )}
        style={{ width: `${ratio * 100}%` }}
      />
      {done
        ? null
        : [0.25, 0.5, 0.75].map((tick) => (
            <span key={tick} className="absolute top-0 h-3 w-px bg-[var(--surface)]" style={{ insetInlineStart: `${tick * 100}%` }} />
          ))}
    </div>
  );
}

export function WeekChartPanel() {
  const { st, locale, duration, language } = useStudyT();
  const { planSessions, planExams, planSubjects, settings, today } = useStudy();
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<"time" | "questions">("time");
  const start = addDays(startOfWeek(today, settings.weekStartsOn), offset * 7);
  const days = weekDays(start);
  const end = days[6];
  const data = days.map((day) => {
    const sessions = planSessions.filter((session) => session.day === day);
    const dayExams = planExams.filter((exam) => exam.day === day);
    const agg = absorbExamQuestions(aggregate(sessions), dayExams, planSubjects);
    const seconds = agg.seconds + dayExams.reduce((sum, exam) => sum + exam.durationSec, 0);
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
      description={
        <>
          <span className="block">{formatDay(start, locale)} – {formatDay(end, locale)}</span>
          <span className="block">{st("week_chart_total", { value: metric === "time" ? duration(totalValue * 3600) : formatNumber(totalValue, language) })}</span>
        </>
      }
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
        color: subject?.color ? subjectTone(subject.color) : "var(--text-faint)",
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
  const { subjectById, topicById, actions, today, planReadOnly } = useStudy();
  const subject = subjectById(review.subjectId);
  const topic = topicById(review.subjectId, review.topicId);
  const late = review.status === "pending" && review.dueDay < today ? diffDays(review.dueDay, today) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="block h-7 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ? subjectTone(subject.color) : "var(--border-strong)" }} />
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
      {planReadOnly ? null : (
        <>
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
        </>
      )}
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
  const { reminders, focusPlan, planReadOnly, actions, today } = useStudy();
  const [dialog, setDialog] = useState<{ open: boolean; reminder: StudyReminder | null }>({ open: false, reminder: null });
  const [showDone, setShowDone] = useState(false);
  const scoped = reminders.filter((reminder) => !reminder.planId || reminder.planId === focusPlan?.id);
  const pending = scoped.filter((reminder) => !reminder.done);
  const done = scoped.filter((reminder) => reminder.done).sort((a, b) => (a.day < b.day ? 1 : -1));
  const visible = showDone ? [...pending, ...done] : pending;
  return (
    <Panel
      className={className}
      title={st("reminders_title")}
      action={
        planReadOnly ? null : (
          <Tooltip label={st("reminder_add")}>
            <Button variant="ghost" size="icon-sm" aria-label={st("reminder_add")} onClick={() => setDialog({ open: true, reminder: null })}>
              <Plus />
            </Button>
          </Tooltip>
        )
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
                  disabled={Boolean(reminder.planId && planReadOnly)}
                  onCheckedChange={(value) => {
                    if (reminder.planId && planReadOnly) return;
                    void actions.saveReminder({ ...reminder, done: value === true });
                  }}
                  aria-label={reminder.title}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[12.5px]", reminder.done ? "text-faint line-through" : "text-ink")}>{reminder.title}</p>
                  <p className="text-[11px] text-faint">
                    {st(REMINDER_KEY[reminder.kind])} · {formatDay(reminder.day, locale, { day: "numeric", month: "short", year: "2-digit" })}
                    {!reminder.done && days >= 0 && days <= 60 ? ` · ${days === 0 ? st("today") : st("in_days", { count: days })}` : ""}
                  </p>
                </div>
                {reminder.planId && planReadOnly ? null : (
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
                )}
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
  const { st, locale } = useStudyT();
  const { planSessions, planExams, subjectById, topicById, today } = useStudy();
  const recent = [...planSessions.map((session) => ({ kind: "session" as const, session })), ...planExams.map((exam) => ({ kind: "exam" as const, exam }))]
    .sort((a, b) => {
      const dayA = a.kind === "session" ? a.session.day : a.exam.day;
      const dayB = b.kind === "session" ? b.session.day : b.exam.day;
      const createdA = a.kind === "session" ? a.session.createdAt : a.exam.createdAt;
      const createdB = b.kind === "session" ? b.session.createdAt : b.exam.createdAt;
      return dayA === dayB ? createdB - createdA : dayA < dayB ? 1 : -1;
    })
    .slice(0, limit);
  return (
    <Panel className={className} title={st("recent_activity_title")} action={<PanelLink href="/home/study/log">{st("nav_log")}</PanelLink>}>
      {recent.length ? (
        <ul className="space-y-2.5">
          {recent.map((item) =>
            item.kind === "session" ? (
              <SessionActivity key={item.session.id} session={item.session} subjectName={subjectById(item.session.subjectId)?.name} subjectColor={subjectById(item.session.subjectId)?.color} topicName={topicById(item.session.subjectId, item.session.topicId)?.name} today={today} locale={locale} />
            ) : (
              <ExamActivity key={item.exam.id} exam={item.exam} today={today} locale={locale} />
            )
          )}
        </ul>
      ) : (
        <p className="py-3 text-[12.5px] text-faint">{st("recent_activity_empty")}</p>
      )}
    </Panel>
  );
}

function SessionActivity({
  session,
  subjectName,
  subjectColor,
  topicName,
  today,
  locale,
}: {
  session: StudySession;
  subjectName?: string;
  subjectColor?: string;
  topicName?: string;
  today: DayKey;
  locale: string;
}) {
  const { st, duration } = useStudyT();
  return (
    <li className="flex items-stretch gap-2.5">
      <SubjectBar color={subjectColor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-ink">
          {subjectName ?? st("untitled_subject")}
          {topicName ? <span className="text-muted"> · {topicName}</span> : null}
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
}

function ExamActivity({ exam, today, locale }: { exam: MockExam; today: DayKey; locale: string }) {
  const { st, duration } = useStudyT();
  const totals = examTotals(exam);
  const questions = totals.correct + totals.wrong;
  return (
    <li className="flex items-stretch gap-2.5">
      <SubjectBar color="#607489" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-ink">{exam.name || st("cat_exam")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span className="truncate">{st("cat_exam")}</span>
          </span>
          <span>{relativeDay(exam.day, today, locale, st)}</span>
          {exam.durationSec ? <span>· {duration(exam.durationSec)}</span> : null}
          {questions ? <span>· {st("questions_count", { count: questions })}</span> : null}
        </div>
      </div>
    </li>
  );
}
