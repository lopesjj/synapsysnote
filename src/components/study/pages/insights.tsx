"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, BarChart3, Search, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
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
  absorbExamQuestions,
  aggregate,
  consistencyInfo,
  EXAM_OTHER_SUBJECT,
  groupSessions,
  groupWithExams,
  percentLabel,
  resolveExamSubjectId,
  performanceBand,
  studiedDays,
  topicKey,
} from "@/lib/study/metrics";
import { formatHoursTick } from "@/lib/study/format";
import { subjectTone } from "@/lib/study/defaults";
import type { DayKey } from "@/types/study";
import { BarList, ColumnChart, LineChart } from "../charts";
import { AccuracyTag, BandGlyph, DurationFigure, Panel, Segmented, SelectFilter, StudyEmpty, StudyGate, StudyHeader, StudyPage, bandColor, categoryColor, useCategoryLabel } from "../ui";

function accuracyChartHeight(): number {
  if (window.matchMedia("(min-width: 1280px)").matches) return 360;
  if (window.matchMedia("(min-width: 640px)").matches) return 320;
  return 280;
}

function useAccuracyChartHeight() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const queries = ["(min-width: 640px)", "(min-width: 1280px)"].map((query) => window.matchMedia(query));
      for (const query of queries) query.addEventListener("change", onStoreChange);
      return () => {
        for (const query of queries) query.removeEventListener("change", onStoreChange);
      };
    },
    accuracyChartHeight,
    () => 320
  );
}

function weekSpan(start: DayKey, locale: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameMonth) {
    return `${formatDay(start, locale, { day: "numeric" })} – ${formatDay(end, locale, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${formatDay(start, locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${formatDay(end, locale, { day: "numeric", month: "short", year: "numeric" })}`;
}

type Period = "30" | "90" | "365" | "all";
type TopicSort = "subject" | "topic" | "questions" | "accuracy" | "time";
type TopicBand = "" | "low" | "mid" | "high" | "none";
type TopicScope = "" | "named" | "none";

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

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
  const [topicQuery, setTopicQuery] = useState("");
  const [topicSubjectId, setTopicSubjectId] = useState("");
  const [topicCategoryId, setTopicCategoryId] = useState("");
  const [topicBand, setTopicBand] = useState<TopicBand>("");
  const [topicScope, setTopicScope] = useState<TopicScope>("");
  const accuracyHeight = useAccuracyChartHeight();

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
  const questionExams = useMemo(
    () =>
      planExams
        .filter((exam) => exam.day >= from && exam.day <= today)
        .map((exam) =>
          subjectId
            ? { ...exam, rows: exam.rows.filter((row) => resolveExamSubjectId(row, planSubjects) === subjectId) }
            : exam
        )
        .filter((exam) => exam.rows.some((row) => row.correct + row.wrong > 0)),
    [from, planExams, planSubjects, subjectId, today]
  );

  const totals = useMemo(() => absorbExamQuestions(aggregate(sessions), questionExams, planSubjects), [planSubjects, questionExams, sessions]);
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
    for (const exam of questionExams) {
      const bucket = buckets.get(keyOf(exam.day));
      if (!bucket) continue;
      for (const row of exam.rows) {
        bucket.correct += row.correct;
        bucket.wrong += row.wrong;
      }
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
        const ratio = total ? bucket.correct / total : null;
        const tone = ratio === null ? undefined : bandColor(performanceBand(ratio, settings));
        return {
          key,
          label: label(key),
          value: ratio === null ? null : ratio * 100,
          pointLabel: ratio === null ? undefined : percentLabel(ratio),
          pointTone: tone,
          tooltip: (
            <span className="flex items-center gap-3">
              <span className="min-w-0">
                <span className="block max-w-[12rem] truncate font-medium text-ink">
                  {weekly ? `${label(key)} – ${label(addDays(key, 6))}` : formatDay(key, locale, { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{total ? st("questions_count", { count: total }) : st("no_questions")}</span>
              </span>
              {ratio !== null && tone ? (
                <span
                  className="inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-[15px] font-semibold leading-none tracking-[-0.04em] tabular-nums"
                  style={{ color: tone, backgroundColor: `color-mix(in oklab, ${tone} 18%, transparent)` }}
                >
                  {percentLabel(ratio)}
                </span>
              ) : null}
            </span>
          ),
        };
      }),
    };
  }, [duration, exams, from, locale, questionExams, sessions, settings, spanDays, st, today]);

  const bySubject = useMemo(() => groupWithExams(sessions, questionExams, planSubjects), [planSubjects, questionExams, sessions]);
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
      const subject = id === EXAM_OTHER_SUBJECT ? null : subjectById(id);
      const band = performanceBand(agg.accuracy, settings);
      return {
        id,
        label: id === EXAM_OTHER_SUBJECT ? st("exam_other_subject") : subject?.name ?? st("untitled_subject"),
        color: id === EXAM_OTHER_SUBJECT ? "#8b95a3" : subject?.color,
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

  const topicSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          (!topicSubjectId || session.subjectId === topicSubjectId) && (!topicCategoryId || session.categoryId === topicCategoryId)
      ),
    [sessions, topicCategoryId, topicSubjectId]
  );

  const topicSubjects = useMemo(() => {
    const ids = [...new Set(sessions.map((session) => session.subjectId))];
    return ids
      .map((id) => ({ value: id, label: subjectById(id)?.name || st("untitled_subject") }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale, sessions, st, subjectById]);

  const topics = useMemo(() => {
    const grouped = groupSessions(topicSessions, (session) => topicKey(session.subjectId, session.topicId));
    const query = fold(topicQuery.trim());
    const rows = [...grouped.entries()].flatMap(([key, agg]) => {
      const [sid, tid] = key.split("::");
      const subject = subjectById(sid);
      const named = Boolean(tid);
      const subjectName = subject?.name ?? st("untitled_subject");
      const topic = (named ? subject?.topics.find((entry) => entry.id === tid)?.name : "") || st("no_topic");
      if (topicScope === "named" && !named) return [];
      if (topicScope === "none" && named) return [];
      if (query && !fold(subjectName).includes(query) && !fold(topic).includes(query)) return [];
      const band = performanceBand(agg.accuracy, settings);
      if (topicBand === "none" && agg.questions > 0) return [];
      if (topicBand && topicBand !== "none" && band !== topicBand) return [];
      return [{ key, subject: subjectName, color: subject?.color, topic, agg }];
    });
    const dir = sort.dir;
    rows.sort((a, b) => {
      switch (sort.key) {
        case "subject":
          return a.subject.localeCompare(b.subject, locale) * dir;
        case "topic":
          return a.topic.localeCompare(b.topic, locale) * dir;
        case "accuracy":
          return ((a.agg.accuracy ?? -1) - (b.agg.accuracy ?? -1)) * dir;
        case "time":
          return (a.agg.seconds - b.agg.seconds) * dir;
        default:
          return (a.agg.questions - b.agg.questions) * dir;
      }
    });
    return rows.slice(0, 200);
  }, [locale, settings, sort, st, subjectById, topicBand, topicQuery, topicScope, topicSessions]);

  const topicFiltersOn = Boolean(topicQuery.trim() || topicSubjectId || topicCategoryId || topicBand || topicScope);

  const sortHeader = (key: TopicSort, label: string, align: "left" | "right" = "left") => (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "subject" || key === "topic" ? 1 : -1 }))}
        className={cn("inline-flex items-center gap-1 hover:text-ink", align === "right" && "w-full justify-end", sort.key === key && "text-ink")}
      >
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );

  return (
    <StudyPage>
      <StudyHeader title={st("nav_insights")} subtitle={st("insights_subtitle")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-[var(--border)] shadow-[0_0_0_1px_var(--border)] sm:grid-cols-3 xl:grid-cols-5">
            <Cell label={st("time_label")}>
              <DurationFigure seconds={totalSeconds} size="md" />
            </Cell>
            <Cell label={st("insight_avg_day")}>
              <DurationFigure seconds={days.size ? totalSeconds / days.size : 0} size="md" />
            </Cell>
            <Cell label={st("insight_days")} hint={st("insight_days_hint", { count: spanDays })}>
              <Big>{days.size}</Big>
            </Cell>
            <Cell label={st("kpi_streak")} hint={st("consistency_line", { studied: consistency.studied, planned: consistency.planned, percent: percentLabel(consistency.ratio) })}>
              <Big>{percentLabel(consistency.ratio)}</Big>
            </Cell>
            <Cell label={st("kpi_accuracy")} className="col-span-2 sm:col-span-1" hint={totals.questions ? st("questions_count", { count: totals.questions }) : st("no_questions")}>
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Panel
              className="xl:col-span-3"
              title={st(evolution.weekly ? "evolution_time_weekly" : "evolution_time")}
              action={
                <Button variant="ghost" size="sm" onClick={() => setTableView((value) => !value)}>
                  {tableView ? <BarChart3 /> : <Table2 />}
                  {tableView ? st("show_chart") : st("show_table")}
                </Button>
              }
            >
              {tableView ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[28rem] text-[12.5px]">
                    <thead className="sticky top-0 bg-[var(--surface)]">
                      <tr className="border-b border-[var(--border)] text-left text-[10.5px] font-medium uppercase tracking-[0.12em] text-faint">
                        <th className="py-2 pr-3 font-medium">{evolution.weekly ? st("schedule_week") : st("col_date")}</th>
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
                            <td className="py-2 pr-3 text-ink sm:whitespace-nowrap">
                              {evolution.weekly ? weekSpan(row.key, locale) : formatDay(row.key, locale, { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">{duration(row.seconds)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted">{row.correct + row.wrong || "–"}</td>
                            <td className="py-2 pl-3 text-right tabular-nums text-muted">
                              {row.correct + row.wrong ? percentLabel(row.correct / (row.correct + row.wrong)) : "–"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ColumnChart
                  data={evolution.time}
                  height={220}
                  labelEvery={evolution.every}
                  variant="refined"
                  vivid
                  ariaLabel={st(evolution.weekly ? "evolution_time_weekly" : "evolution_time")}
                  formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })}
                />
              )}
            </Panel>
            <Panel
              className="xl:col-span-2"
              title={st(evolution.weekly ? "evolution_accuracy_weekly" : "evolution_accuracy")}
              description={st("evolution_accuracy_hint")}
            >
              <LineChart
                data={evolution.accuracy}
                height={accuracyHeight}
                domainMax={100}
                labelEvery={evolution.every}
                ariaLabel={st(evolution.weekly ? "evolution_accuracy_weekly" : "evolution_accuracy")}
                formatTick={(value) => `${Math.round(value)}%`}
                emptyLabel={st("no_questions")}
              />
            </Panel>
          </div>

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
              <ColumnChart data={hourData} height={180} labelEvery={3} variant="refined" vivid ariaLabel={st("hour_of_day")} formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })} />
            </Panel>
            <Panel title={st("weekday_title")} className="lg:col-span-2">
              <ColumnChart data={weekdayData} height={200} variant="refined" vivid ariaLabel={st("weekday_title")} formatTick={(value) => formatHoursTick(value, language, { h: st("unit_h"), min: st("unit_min") })} />
            </Panel>
          </div>

          <Panel
            title={st("topics_table")}
            description={st("topics_count", { count: topics.length })}
            bodyClassName="px-0 pb-0"
          >
            <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 pb-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                  <Input value={topicQuery} onChange={(event) => setTopicQuery(event.target.value)} placeholder={st("topics_search")} className="h-8 pl-8" aria-label={st("topics_search")} />
                </div>
                <SelectFilter
                  label={st("col_subject")}
                  value={topicSubjectId}
                  onChange={setTopicSubjectId}
                  options={[{ value: "", label: st("filter_all_subjects") }, ...topicSubjects]}
                />
                <SelectFilter
                  label={st("col_category")}
                  value={topicCategoryId}
                  onChange={setTopicCategoryId}
                  options={[{ value: "", label: st("filter_all_categories") }, ...settings.categories.map((category) => ({ value: category.id, label: categoryLabel(category.id) }))]}
                />
                <SelectFilter
                  label={st("kpi_accuracy")}
                  value={topicBand}
                  onChange={(value) => setTopicBand(value as TopicBand)}
                  options={[
                    { value: "", label: st("topics_band_all") },
                    { value: "low", label: st("band_low") },
                    { value: "mid", label: st("band_mid") },
                    { value: "high", label: st("band_high") },
                    { value: "none", label: st("no_questions") },
                  ]}
                />
                <SelectFilter
                  label={st("col_topic")}
                  value={topicScope}
                  onChange={(value) => setTopicScope(value as TopicScope)}
                  options={[
                    { value: "", label: st("topics_scope_all") },
                    { value: "named", label: st("topics_scope_named") },
                    { value: "none", label: st("no_topic") },
                  ]}
                />
                {topicFiltersOn ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTopicQuery("");
                      setTopicSubjectId("");
                      setTopicCategoryId("");
                      setTopicBand("");
                      setTopicScope("");
                    }}
                  >
                    {st("topics_clear")}
                  </Button>
                ) : null}
              </div>
            </div>
            {topics.length ? (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full min-w-[40rem] text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                    <tr className="border-b border-[var(--border)] text-left text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      <th className="w-5 pl-5 sm:pl-6" />
                      {sortHeader("subject", st("col_subject"))}
                      {sortHeader("topic", st("col_topic"))}
                      {sortHeader("time", st("col_time"), "right")}
                      {sortHeader("questions", st("questions_label"), "right")}
                      {sortHeader("accuracy", st("col_accuracy"), "right")}
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((row) => (
                      <tr key={row.key} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                        <td className="pl-5 sm:pl-6">
                          <span className="block h-4 w-[5px] rounded-[2px]" style={{ backgroundColor: row.color ? subjectTone(row.color) : "var(--text-faint)" }} />
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2.5 text-muted">{row.subject}</td>
                        <td className="max-w-[20rem] truncate px-3 py-2.5 font-medium text-ink" title={row.topic}>
                          {row.topic}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{row.agg.seconds ? duration(row.agg.seconds) : "–"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{row.agg.questions || "–"}</td>
                        <td className="px-3 py-2.5 pr-5 text-right sm:pr-6">
                          <AccuracyTag accuracy={row.agg.accuracy} band={performanceBand(row.agg.accuracy, settings)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-[12.5px] text-faint sm:px-6">{topicFiltersOn ? st("topics_empty_filter") : st("insights_empty")}</p>
            )}
          </Panel>
        </div>
      )}
    </StudyPage>
  );
}

function Cell({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 bg-[var(--surface)] px-4 py-4 sm:px-5 sm:py-5", className)}>
      <p className="text-[10.5px] font-medium uppercase leading-snug tracking-[0.12em] text-faint">{label}</p>
      <div className="flex min-h-8 items-end">{children}</div>
      {hint ? <p className="line-clamp-2 text-[11.5px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{children}</span>;
}
