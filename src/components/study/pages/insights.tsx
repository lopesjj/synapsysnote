"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Table2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import {
  addDays,
  compareDay,
  dayRange,
  formatDay,
  orderedWeekdays,
  startOfWeek,
  weekdayLabel,
  weekdayOf,
} from "@/lib/study/dates";
import {
  aggregate,
  consistencyInfo,
  groupSessions,
  percentLabel,
  performanceBand,
  studiedDays,
  topicKey,
} from "@/lib/study/metrics";
import { formatHoursTick } from "@/lib/study/format";
import type { DayKey } from "@/types/study";
import { BarList, ColumnChart, LineChart } from "../charts";
import { AccuracyTag, BandGlyph, DurationFigure, Panel, Segmented, SelectFilter, StudyEmpty, StudyGate, StudyHeader, StudyPage, bandColor, categoryColor, useCategoryLabel } from "../ui";

type Period = "30" | "90" | "365" | "all";
type TopicSort = "subject" | "topic" | "questions" | "accuracy" | "time";

export function InsightsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_insights")}>
      <InsightsBody />
    </StudyGate>
  );
}

function InsightsBody() {
  const { st, locale, duration, language } = useStudyT();
  const categoryLabel = useCategoryLabel();
  const { planSessions, planExams, planSubjects, settings, today, subjectById } = useStudy();
  const [period, setPeriod] = useState<Period>("90");
  const [subjectId, setSubjectId] = useState("");
  const [tableView, setTableView] = useState(false);
  const [sort, setSort] = useState<{ key: TopicSort; dir: 1 | -1 }>({ key: "questions", dir: -1 });

  const firstDay = useMemo(() => {
    const days = [...planSessions.map((session) => session.day), ...planExams.map((exam) => exam.day)].sort(compareDay);
    return days[0] ?? today;
  }, [planExams, planSessions, today]);

  const from = period === "all" ? firstDay : addDays(today, -(Number(period) - 1));
  const sessions = useMemo(
    () => planSessions.filter((session) => session.day >= from && session.day <= today && (!subjectId || session.subjectId === subjectId)),
    [from, planSessions, subjectId, today]
  );
  const exams = useMemo(
    () => (subjectId ? [] : planExams.filter((exam) => exam.day >= from && exam.day <= today)),
    [from, planExams, subjectId, today]
  );

  const totals = useMemo(() => aggregate(sessions), [sessions]);
  const examSeconds = exams.reduce((sum, exam) => sum + exam.durationSec, 0);
  const days = useMemo(() => studiedDays(sessions, exams), [exams, sessions]);
  const consistency = useMemo(() => consistencyInfo(days, today, settings.studyWeekdays, from), [days, from, settings.studyWeekdays, today]);
  const totalSeconds = totals.seconds + examSeconds;
  const spanDays = Math.max(1, dayRange(from, today).length);

  const evolution = useMemo(() => {
    const weekly = spanDays > 45;
    const buckets = new Map<DayKey, { seconds: number; correct: number; wrong: number }>();
    const keyOf = (day: DayKey) => (weekly ? startOfWeek(day, settings.weekStartsOn) : day);
    const start = keyOf(from);
    const keys: DayKey[] = [];
    for (let cursor = start; cursor <= today; cursor = addDays(cursor, weekly ? 7 : 1)) {
      keys.push(cursor);
      buckets.set(cursor, { seconds: 0, correct: 0, wrong: 0 });
    }
    for (const session of sessions) {
      const bucket = buckets.get(keyOf(session.day));
      if (!bucket) continue;
      bucket.seconds += session.durationSec;
      bucket.correct += session.correct;
      bucket.wrong += session.wrong;
    }
    for (const exam of exams) {
      const bucket = buckets.get(keyOf(exam.day));
      if (bucket) bucket.seconds += exam.durationSec;
    }
    const label = (day: DayKey) => formatDay(day, locale, { day: "numeric", month: "short" }).replace(".", "");
    const every = Math.max(1, Math.ceil(keys.length / 10));
    return {
      weekly,
      every,
      rows: keys.map((key) => ({ key, ...(buckets.get(key) as { seconds: number; correct: number; wrong: number }) })),
      time: keys.map((key) => {
        const bucket = buckets.get(key) as { seconds: number };
        return {
          key,
          label: label(key),
          value: bucket.seconds / 3600,
          tooltip: (
            <span className="block">
              <span className="block font-medium">{weekly ? `${label(key)} – ${label(addDays(key, 6))}` : formatDay(key, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
              <span className="block text-muted">{duration(bucket.seconds)}</span>
            </span>
          ),
        };
      }),
      accuracy: keys.map((key) => {
        const bucket = buckets.get(key) as { correct: number; wrong: number };
        const total = bucket.correct + bucket.wrong;
        return {
          key,
          label: label(key),
          value: total ? (bucket.correct / total) * 100 : null,
          tooltip: (
            <span className="block">
              <span className="block font-medium">{weekly ? `${label(key)} – ${label(addDays(key, 6))}` : formatDay(key, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
              <span className="block text-muted">
                {total ? `${percentLabel(bucket.correct / total)} · ${st("questions_count", { count: total })}` : st("no_questions")}
              </span>
            </span>
          ),
        };
      }),
    };
  }, [duration, exams, from, locale, sessions, settings.weekStartsOn, spanDays, st, today]);

  const bySubject = useMemo(() => groupSessions(sessions, (session) => session.subjectId), [sessions]);
  const byCategory = useMemo(() => groupSessions(sessions, (session) => session.categoryId), [sessions]);

  const subjectTimeRows = [...bySubject.entries()]
    .filter(([, agg]) => agg.seconds > 0)
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .map(([id, agg]) => {
      const subject = subjectById(id);
      return { id, label: subject?.name ?? st("untitled_subject"), color: subject?.color, value: agg.seconds, valueLabel: duration(agg.seconds) };
    });

  const categoryRows = [
    ...[...byCategory.entries()].map(([id, agg]) => ({
      id,
      label: categoryLabel(id),
      color: categoryColor(settings.categories, id),
      value: agg.seconds,
      valueLabel: duration(agg.seconds),
    })),
    ...(examSeconds ? [{ id: "exam", label: st("cat_exam"), color: "#607489", value: examSeconds, valueLabel: duration(examSeconds) }] : []),
  ]
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const accuracyRows = [...bySubject.entries()]
    .filter(([, agg]) => agg.questions > 0)
    .sort((a, b) => (a[1].accuracy ?? 0) - (b[1].accuracy ?? 0))
    .map(([id, agg]) => {
      const subject = subjectById(id);
      const band = performanceBand(agg.accuracy, settings);
      return {
        id,
        label: subject?.name ?? st("untitled_subject"),
        color: subject?.color,
        value: agg.accuracy ?? 0,
        valueLabel: percentLabel(agg.accuracy),
        detail: st("questions_count", { count: agg.questions }),
        tone: bandColor(band),
      };
    });

  const hourData = useMemo(() => {
    const seconds = Array.from({ length: 24 }, () => 0);
    for (const session of sessions) {
      if (session.startMinute === null) continue;
      seconds[Math.floor(session.startMinute / 60)] += session.durationSec;
    }
    return seconds.map((value, hour) => ({
      key: String(hour),
      label: String(hour).padStart(2, "0"),
      value: value / 3600,
      tooltip: (
        <span className="block">
          <span className="block font-medium">{`${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59`}</span>
          <span className="block text-muted">{duration(value)}</span>
        </span>
      ),
    }));
  }, [duration, sessions]);

  const weekdayData = useMemo(() => {
    const seconds = new Map<number, number>();
    for (const session of sessions) {
      const weekday = weekdayOf(session.day);
      seconds.set(weekday, (seconds.get(weekday) ?? 0) + session.durationSec);
    }
    return orderedWeekdays(settings.weekStartsOn).map((weekday) => ({
      key: String(weekday),
      label: weekdayLabel(weekday, locale, "short").replace(".", ""),
      value: (seconds.get(weekday) ?? 0) / 3600,
      tooltip: (
        <span className="block">
          <span className="block font-medium">{weekdayLabel(weekday, locale, "long")}</span>
          <span className="block text-muted">{duration(seconds.get(weekday) ?? 0)}</span>
        </span>
      ),
    }));
  }, [duration, locale, sessions, settings.weekStartsOn]);

  const topics = useMemo(() => {
    const grouped = groupSessions(sessions, (session) => topicKey(session.subjectId, session.topicId));
    const rows = [...grouped.entries()].map(([key, agg]) => {
      const [sid, tid] = key.split("::");
      const subject = subjectById(sid);
      const topic = subject?.topics.find((entry) => entry.id === tid);
      return { key, subject: subject?.name ?? st("untitled_subject"), color: subject?.color, topic: topic?.name ?? st("no_topic"), agg };
    });
    const dir = sort.dir;
    rows.sort((a, b) => {
      switch (sort.key) {
        case "subject":
          return a.subject.localeCompare(b.subject) * dir;
        case "topic":
          return a.topic.localeCompare(b.topic) * dir;
        case "accuracy":
          return ((a.agg.accuracy ?? -1) - (b.agg.accuracy ?? -1)) * dir;
        case "time":
          return (a.agg.seconds - b.agg.seconds) * dir;
        default:
          return (a.agg.questions - b.agg.questions) * dir;
      }
    });
    return rows.slice(0, 200);
  }, [sessions, sort, st, subjectById]);

  const sortHeader = (key: TopicSort, label: string, align: "left" | "right" = "left") => (
    <th className={cn("px-3 py-2 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "subject" || key === "topic" ? 1 : -1 }))}
        className={cn("inline-flex items-center gap-1 hover:text-ink", sort.key === key && "text-ink")}
      >
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );

  return (
    <StudyPage>
      <StudyHeader title={st("nav_insights")} subtitle={st("insights_subtitle")} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Segmented<Period>
            size="md"
            value={period}
            onChange={setPeriod}
            ariaLabel={st("period_label")}
            options={[
              { value: "30", label: st("period_30") },
              { value: "90", label: st("period_90") },
              { value: "365", label: st("period_365") },
              { value: "all", label: st("period_all") },
            ]}
          />
        </div>
        <SelectFilter
          label={st("col_subject")}
          value={subjectId}
          onChange={setSubjectId}
          options={[{ value: "", label: st("filter_all_subjects") }, ...planSubjects.map((subject) => ({ value: subject.id, label: subject.name || st("untitled_subject") }))]}
        />
      </div>

      {!sessions.length && !exams.length ? (
        <StudyEmpty art="log" title={st("insights_empty")} />
      ) : (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--border)] md:grid-cols-3 xl:grid-cols-5">
            <Cell label={st("time_label")}>
              <DurationFigure seconds={totalSeconds} size="md" />
            </Cell>
            <Cell label={st("insight_avg_day")}>
              <DurationFigure seconds={days.size ? totalSeconds / days.size : 0} size="md" />
            </Cell>
            <Cell label={st("insight_days")} hint={st("insight_days_hint", { count: spanDays })}>
              <Big>{days.size}</Big>
            </Cell>
            <Cell label={st("insight_consistency")} hint={st("consistency_line", { studied: consistency.studied, planned: consistency.planned, percent: percentLabel(consistency.ratio) })}>
              <Big>{percentLabel(consistency.ratio)}</Big>
            </Cell>
            <Cell label={st("accuracy_label")} className="col-span-2 md:col-span-1" hint={totals.questions ? st("questions_count", { count: totals.questions }) : st("no_questions")}>
              {totals.accuracy !== null ? (
                <span className="inline-flex items-center gap-2">
                  <Big>{percentLabel(totals.accuracy)}</Big>
                  <BandGlyph band={performanceBand(totals.accuracy, settings) ?? "mid"} />
                </span>
              ) : (
                <Big>–</Big>
              )}
            </Cell>
          </section>

          <Panel
            title={st(evolution.weekly ? "evolution_time_weekly" : "evolution_time")}
            action={
              <Button variant="ghost" size="sm" onClick={() => setTableView((value) => !value)}>
                {tableView ? <BarChart3 /> : <Table2 />}
                {tableView ? st("show_chart") : st("show_table")}
              </Button>
            }
          >
            {tableView ? (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-[var(--surface)]">
                    <tr className="border-b border-[var(--border)] text-left text-[11px] text-faint">
                      <th className="py-2 pr-3 font-medium">{st("col_date")}</th>
                      <th className="px-3 py-2 text-right font-medium">{st("time_label")}</th>
                      <th className="px-3 py-2 text-right font-medium">{st("questions_label")}</th>
                      <th className="py-2 pl-3 text-right font-medium">{st("col_accuracy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolution.rows
                      .filter((row) => row.seconds || row.correct + row.wrong)
                      .reverse()
                      .map((row) => (
                        <tr key={row.key} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="py-1.5 pr-3 text-ink">{formatDay(row.key, locale, { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-ink">{duration(row.seconds)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted">{row.correct + row.wrong}</td>
                          <td className="py-1.5 pl-3 text-right tabular-nums text-muted">
                            {row.correct + row.wrong ? percentLabel(row.correct / (row.correct + row.wrong)) : "–"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-5">
                <ColumnChart
                  data={evolution.time}
                  height={190}
                  labelEvery={evolution.every}
                  ariaLabel={st(evolution.weekly ? "evolution_time_weekly" : "evolution_time")}
                  formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })}
                />
                <div>
                  <p className="mb-2 text-[12.5px] font-semibold text-ink">
                    {st(evolution.weekly ? "evolution_accuracy_weekly" : "evolution_accuracy")}{" "}
                    <span className="font-normal text-faint">· {st("evolution_accuracy_hint")}</span>
                  </p>
                  <LineChart
                    data={evolution.accuracy}
                    height={150}
                    domainMax={100}
                    labelEvery={evolution.every}
                    ariaLabel={st("evolution_accuracy")}
                    formatTick={(value) => `${Math.round(value)}%`}
                    emptyLabel={st("no_questions")}
                  />
                </div>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={st("time_by_subject")}>
              <BarList rows={subjectTimeRows} emptyLabel={st("distribution_empty")} />
            </Panel>
            <Panel title={st("time_by_category")}>
              <BarList rows={categoryRows} emptyLabel={st("distribution_empty")} />
            </Panel>
          </div>

          <Panel
            title={st("accuracy_by_subject")}
            action={
              <span className="hidden items-center gap-3 text-[11px] text-muted sm:flex">
                {(["low", "mid", "high"] as const).map((band) => (
                  <span key={band} className="inline-flex items-center gap-1">
                    <BandGlyph band={band} />
                    {st(band === "low" ? "band_low" : band === "mid" ? "band_mid" : "band_high")}
                  </span>
                ))}
              </span>
            }
          >
            <BarList rows={accuracyRows} max={1} emptyLabel={st("no_questions")} />
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Panel title={st("hour_of_day")} description={st("hour_of_day_desc")} className="lg:col-span-3">
              <ColumnChart data={hourData} height={170} labelEvery={3} ariaLabel={st("hour_of_day")} formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })} />
            </Panel>
            <Panel title={st("weekday_title")} className="lg:col-span-2">
              <ColumnChart data={weekdayData} height={170} ariaLabel={st("weekday_title")} formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })} />
            </Panel>
          </div>

          <Panel title={st("topics_table")} bodyClassName="px-0 pb-1">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[36rem] text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                  <tr className="border-y border-[var(--border)] text-left text-[11px] text-faint">
                    <th className="w-5 pl-5" />
                    {sortHeader("subject", st("col_subject"))}
                    {sortHeader("topic", st("col_topic"))}
                    {sortHeader("time", st("col_time"), "right")}
                    {sortHeader("questions", st("questions_label"), "right")}
                    {sortHeader("accuracy", st("col_accuracy"))}
                  </tr>
                </thead>
                <tbody>
                  {topics.map((row) => (
                    <tr key={row.key} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                      <td className="pl-5">
                        <span className="block size-2 rounded-full" style={{ backgroundColor: row.color ?? "var(--text-faint)" }} />
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-muted">{row.subject}</td>
                      <td className="max-w-[20rem] truncate px-3 py-2 text-ink" title={row.topic}>
                        {row.topic}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{row.agg.seconds ? duration(row.agg.seconds) : "–"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{row.agg.questions || "–"}</td>
                      <td className="px-3 py-2 pr-5">
                        <AccuracyTag accuracy={row.agg.accuracy} band={performanceBand(row.agg.accuracy, settings)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </StudyPage>
  );
}

function Cell({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("bg-[var(--surface)] px-5 py-4", className)}>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <div className="mt-2 flex items-baseline">{children}</div>
      {hint ? <p className="mt-1 text-[11.5px] leading-snug text-faint">{hint}</p> : null}
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{children}</span>;
}
