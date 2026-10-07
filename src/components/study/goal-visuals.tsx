"use client";

import { CalendarDays, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { cn } from "@/lib/utils";
import { diffDays, formatDay } from "@/lib/study/dates";
import { subjectTone } from "@/lib/study/defaults";
import type { DayKey, StudyPlan } from "@/types/study";

/** Contagem regressiva da prova com a barra do caminho já percorrido desde o início do objetivo. */
export function ExamCountdown({
  plan,
  startDay,
  onSetDate,
  onNewExam,
}: {
  plan: StudyPlan;
  startDay: DayKey;
  onSetDate?: () => void;
  onNewExam?: () => void;
}) {
  const { st, locale } = useStudyT();
  const { today } = useStudy();
  if (!plan.examDate) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px] text-muted">{st("goal_no_exam")}</span>
        {onSetDate ? (
          <Button variant="secondary" size="sm" onClick={onSetDate} className="relative z-10">
            <CalendarDays />
            {st("goals_set_date")}
          </Button>
        ) : null}
      </div>
    );
  }
  const days = diffDays(today, plan.examDate);
  const long = formatDay(plan.examDate, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (days < 0) {
    // Prova passada: a data vira histórico e o caminho daqui é marcar a próxima.
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-muted">
          {st("goal_exam_was", { date: formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" }) })}
        </p>
        {onNewExam ? (
          <Button variant="secondary" size="sm" onClick={onNewExam} className="relative z-10">
            <Flag />
            {st("countdown_new_exam")}
          </Button>
        ) : null}
      </div>
    );
  }
  const span = Math.max(1, diffDays(startDay, plan.examDate));
  const elapsed = Math.min(span, Math.max(0, diffDays(startDay, today)));
  const week = Math.max(1, Math.floor(diffDays(startDay, today) / 7) + 1);
  const totalWeeks = Math.max(week, Math.ceil((diffDays(startDay, plan.examDate) + 1) / 7));
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-ink">{days === 0 ? st("goals_exam_today") : days}</span>
        <span className="text-[13px] text-muted">{days === 0 ? st("goals_exam_today_sub") : st("goal_countdown_label", { count: days })}</span>
      </p>
      {onSetDate ? (
        <button type="button" onClick={onSetDate} className="relative z-10 mt-1.5 text-start text-[13px] text-ink underline-offset-4 hover:underline">
          {long}
        </button>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink">{long}</p>
      )}
      <ProgressBar value={elapsed} max={span} className="mt-3" />
      <p className="mt-1.5 text-[12px] tabular-nums text-muted">{st("goal_ruler_week_of", { n: week, total: totalWeeks, left: Math.max(0, totalWeeks - week) })}</p>
    </div>
  );
}

const STUDIED_TONE = "color-mix(in oklab, var(--accent) 38%, var(--surface-2))";

/** Cobertura do edital: percentual, barra empilhada (concluído, estudado) e contagem por estado. */
export function SyllabusSummary({ done, studied, total }: { done: number; studied: number; total: number }) {
  const { st } = useStudyT();
  if (!total) return <p className="text-[13px] text-muted">{st("goal_subject_no_topics")}</p>;
  const unseen = Math.max(0, total - done - studied);
  const legend = [
    { color: "var(--accent)", label: st("goal_topics_done"), value: done },
    { color: STUDIED_TONE, label: st("goal_topics_studied"), value: studied },
    { color: "var(--border-strong)", label: st("goal_topics_unseen"), value: unseen },
  ];
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{Math.round((done / total) * 100)}%</span>
        <span className="text-[13px] tabular-nums text-muted">{st("kpi_coverage_hint", { done, total })}</span>
      </p>
      <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span style={{ width: `${(done / total) * 100}%`, background: "var(--accent)" }} />
        <span style={{ width: `${(studied / total) * 100}%`, background: STUDIED_TONE }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {legend.map((item) => (
          <span key={item.label} className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="mt-0.5 ps-3.5 text-[14px] font-medium tabular-nums text-ink">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Linha "rótulo · valor de meta" com barra, usada no resumo da semana. */
export function WeekMeter({ label, value, goal, ratio }: { label: string; value: string; goal: string | null; ratio: number | null }) {
  const { st } = useStudyT();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-ink">
          {value}
          {goal ? <span className="text-muted"> {st("goals_of_goal", { goal })}</span> : null}
        </span>
      </div>
      {ratio !== null ? <ProgressBar value={Math.min(ratio, 1)} max={1} color={ratio >= 1 ? "var(--band-high)" : "var(--accent)"} className="mt-1.5" /> : null}
    </div>
  );
}

/** Pizza de 16px no estilo do Things: anel claro e fatia do que já foi concluído. */
export function CoveragePie({ done, total, color, size = 16, className }: { done: number; total: number; color: string; size?: number; className?: string }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const r = size / 2;
  const inner = r - 2.25;
  let wedge: string | null = null;
  if (ratio >= 1) wedge = "full";
  else if (ratio > 0) {
    const angle = ratio * Math.PI * 2;
    const x = r + inner * Math.sin(angle);
    const y = r - inner * Math.cos(angle);
    wedge = `M ${r} ${r} L ${r} ${r - inner} A ${inner} ${inner} 0 ${ratio > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={cn("shrink-0", className)}>
      <circle cx={r} cy={r} r={r - 0.75} fill="none" stroke={`color-mix(in oklab, ${subjectTone(color)} 45%, transparent)`} strokeWidth={1.5} />
      {wedge === "full" ? <circle cx={r} cy={r} r={inner} fill={subjectTone(color)} /> : wedge ? <path d={wedge} fill={subjectTone(color)} /> : null}
    </svg>
  );
}

/** Barra fina de progresso. */
export function ProgressBar({ value, max, color = "var(--accent)", className }: { value: number; max: number; color?: string; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span aria-hidden className={cn("relative block h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]", className)}>
      {ratio > 0 ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(ratio * 100, 3)}%`, backgroundColor: subjectTone(color) }} /> : null}
    </span>
  );
}

export interface WeekBar {
  start: DayKey;
  minutes: number;
  /** Semana anterior ao início do objetivo: não é desenhada. */
  before?: boolean;
}

/**
 * Colunas das últimas semanas. Semanas zeradas viram um traço baixo (a falta
 * continua visível) e a meta semanal, quando existe, é uma linha tracejada.
 */
export function WeekBars({
  weeks,
  goalMinutes = 0,
  height = 24,
  labels = false,
  className,
}: {
  weeks: WeekBar[];
  goalMinutes?: number;
  height?: number;
  labels?: boolean;
  className?: string;
}) {
  const { st, locale, duration } = useStudyT();
  const max = Math.max(goalMinutes * 1.1, ...weeks.map((week) => week.minutes), 30);
  const lastIndex = weeks.length - 1;
  return (
    <div className={className}>
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {goalMinutes > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--border-strong)]"
            style={{ bottom: `${(goalMinutes / max) * 100}%` }}
          />
        ) : null}
        {weeks.map((week, index) => {
          const current = index === lastIndex;
          const title = `${st("goal_ruler_tip_week", { date: formatDay(week.start, locale, { day: "numeric", month: "short" }) })} · ${
            goalMinutes > 0 ? st("goal_weekly_time", { time: duration(week.minutes * 60), goal: duration(goalMinutes * 60) }) : duration(week.minutes * 60)
          }`;
          if (week.before) return <span key={week.start} className="flex-1" />;
          if (week.minutes <= 0) {
            return <span key={week.start} title={title} className="h-[2px] flex-1 rounded-full bg-[var(--border-strong)]" />;
          }
          const reached = goalMinutes <= 0 || week.minutes >= goalMinutes;
          return (
            <span
              key={week.start}
              title={title}
              className="flex-1 rounded-t-[2px]"
              style={{
                height: `${Math.max(8, (week.minutes / max) * 100)}%`,
                backgroundColor: reached || current ? "var(--accent)" : "color-mix(in oklab, var(--accent) 45%, var(--surface-2))",
              }}
            />
          );
        })}
      </div>
      {labels && weeks.length ? (
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--chart-label)]">
          <span>{formatDay(weeks[0].start, locale, { day: "numeric", month: "short" })}</span>
          <span>{st("goals_this_week")}</span>
        </div>
      ) : null}
    </div>
  );
}
