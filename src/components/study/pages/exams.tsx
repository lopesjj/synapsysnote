"use client";

import { useMemo, useState } from "react";
import { ChevronRight, MessageSquareText, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { formatDay } from "@/lib/study/dates";
import { clockLabel, formatNumber } from "@/lib/study/format";
import { examTotals, percentLabel, performanceBand } from "@/lib/study/metrics";
import type { MockExam } from "@/types/study";
import { BarList, LineChart } from "../charts";
import { ExamDialog } from "../exam-dialog";
import { AccuracyTag, Panel, Segmented, StudyEmpty, StudyGate, StudyHeader, StudyPage, bandColor } from "../ui";

export function ExamsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_exams")}>
      <ExamsBody />
    </StudyGate>
  );
}

function ExamsBody() {
  const { st, locale, language } = useStudyT();
  const { planExams, settings, actions } = useStudy();
  const [dialog, setDialog] = useState<{ open: boolean; exam: MockExam | null }>({ open: false, exam: null });
  const [metric, setMetric] = useState<"percent" | "score">("percent");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => planExams.map((exam) => ({ exam, totals: examTotals(exam) })), [planExams]);
  const newestFirst = [...rows].reverse();
  const last = newestFirst[0] ?? null;
  const percents = rows.map((row) => row.totals.percent).filter((value): value is number => value !== null);
  const best = percents.length ? Math.max(...percents) : null;
  const average = percents.length ? percents.reduce((sum, value) => sum + value, 0) / percents.length : null;

  const chartData = rows.map(({ exam, totals }) => ({
    key: exam.id,
    label: formatDay(exam.day, locale, { day: "numeric", month: "short" }).replace(".", ""),
    value: metric === "percent" ? (totals.percent === null ? null : totals.percent * 100) : totals.score,
    tooltip: (
      <span className="block">
        <span className="block font-medium">{exam.name}</span>
        <span className="block text-muted">
          {formatDay(exam.day, locale, { day: "numeric", month: "short", year: "numeric" })} · {percentLabel(totals.percent)} ·{" "}
          {st("exam_score", { score: formatNumber(totals.score, language, 2), max: formatNumber(totals.maxScore, language, 2) })}
        </span>
      </span>
    ),
  }));

  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_exams")}
        subtitle={st("exams_subtitle")}
        showLog={false}
        actions={
          <Button variant="primary" onClick={() => setDialog({ open: true, exam: null })}>
            <Plus />
            {st("exams_new")}
          </Button>
        }
      />
      {rows.length ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
            <div className="bg-[var(--surface)] px-5 py-4">
              <p className="text-[12px] font-medium text-muted">{st("exams_count")}</p>
              <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{rows.length}</p>
            </div>
            <div className="bg-[var(--surface)] px-5 py-4">
              <p className="text-[12px] font-medium text-muted">{st("exams_last")}</p>
              <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{percentLabel(last?.totals.percent ?? null)}</p>
              {last ? (
                <p className="mt-1.5 text-[11.5px] tabular-nums text-faint">
                  <span className="text-[var(--band-high)]">{last.totals.correct}</span> · <span>{last.totals.blank}</span> ·{" "}
                  <span className="text-[var(--band-low)]">{last.totals.wrong}</span>
                </p>
              ) : null}
            </div>
            <div className="bg-[var(--surface)] px-5 py-4">
              <p className="text-[12px] font-medium text-muted">{st("exams_best")}</p>
              <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{percentLabel(best)}</p>
            </div>
            <div className="bg-[var(--surface)] px-5 py-4">
              <p className="text-[12px] font-medium text-muted">{st("exams_average")}</p>
              <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{percentLabel(average)}</p>
            </div>
          </section>

          <Panel
            title={st("exams_chart")}
            action={
              <Segmented
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "percent", label: st("exams_metric_percent") },
                  { value: "score", label: st("exams_metric_score") },
                ]}
              />
            }
          >
            <LineChart
              data={chartData}
              height={190}
              domainMax={metric === "percent" ? 100 : undefined}
              labelEvery={Math.max(1, Math.ceil(chartData.length / 12))}
              ariaLabel={st("exams_chart")}
              formatTick={(value) => (metric === "percent" ? `${Math.round(value)}%` : formatNumber(value, language, 1))}
            />
          </Panel>

          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
            {newestFirst.map(({ exam, totals }) => {
              const open = expanded === exam.id;
              return (
                <li key={exam.id}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : exam.id)}
                      className="flex min-w-0 w-full sm:w-auto sm:flex-1 items-center gap-3 text-left"
                      aria-expanded={open}
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-90")} />
                      <span className="w-16 shrink-0 text-[12px] tabular-nums text-muted">{formatDay(exam.day, locale, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{exam.name}</span>
                        <span className="block truncate text-[11.5px] text-faint">
                          {exam.style === "truefalse" ? st("exam_style_truefalse") : st("exam_style_multiple")}
                          {exam.board ? ` · ${exam.board}` : ""}
                          {` · ${st("subjects_count", { count: exam.rows.length })}`}
                        </span>
                      </span>
                    </button>
                    <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-x-4 gap-y-2 flex-wrap sm:flex-nowrap pl-7 sm:pl-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[12px] tabular-nums text-muted">
                          <Timer className="size-3.5 text-faint" />
                          {clockLabel(exam.durationSec, true)}
                        </span>
                        <span
                          className="text-[12.5px] tabular-nums"
                          title={`${st("correct_label")} · ${st("blank_label")} · ${st("wrong_label")}`}
                        >
                          <span className="text-[var(--band-high)]">{totals.correct}</span>
                          <span className="text-faint"> · {totals.blank} · </span>
                          <span className="text-[var(--band-low)]">{totals.wrong}</span>
                        </span>
                        <AccuracyTag accuracy={totals.percent} band={performanceBand(totals.percent, settings)} className="w-14 font-medium" />
                      </div>
                      <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
                        {exam.comment ? (
                          <Tooltip label={exam.comment.slice(0, 280)}>
                            <span className="flex size-7 items-center justify-center text-faint">
                              <MessageSquareText className="size-3.5" />
                            </span>
                          </Tooltip>
                        ) : null}
                        <Button variant="ghost" size="icon-sm" aria-label={st("edit")} onClick={() => setDialog({ open: true, exam })}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={st("delete")}
                          className="hover:text-[var(--danger)]"
                          onClick={async () => {
                            if (!window.confirm(st("exam_delete_confirm", { name: exam.name }))) return;
                            await actions.deleteExam(exam.id);
                            toast.success(st("exam_deleted"));
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {open ? <ExamBreakdown exam={exam} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <StudyEmpty
          art="exams"
          title={st("exams_empty")}
          action={
            <Button variant="primary" onClick={() => setDialog({ open: true, exam: null })}>
              <Plus />
              {st("exams_new")}
            </Button>
          }
        />
      )}
      <ExamDialog open={dialog.open} exam={dialog.exam} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} />
    </StudyPage>
  );
}

function ExamBreakdown({ exam }: { exam: MockExam }) {
  const { st } = useStudyT();
  const { subjectById, settings } = useStudy();
  const rows = exam.rows.map((row) => {
    const net = exam.style === "truefalse" ? row.correct - row.wrong : row.correct;
    const accuracy = row.total ? net / row.total : null;
    const subject = subjectById(row.subjectId);
    return {
      id: row.id,
      label: row.name || subject?.name || st("untitled_subject"),
      color: subject?.color,
      value: Math.max(0, accuracy ?? 0),
      valueLabel: percentLabel(accuracy),
      detail: `${row.correct}/${row.total}${row.weight !== 1 ? ` ×${row.weight}` : ""}`,
      tone: bandColor(performanceBand(accuracy, settings)),
    };
  });
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/30 px-5 py-4">
      <BarList rows={rows} max={1} />
      {exam.comment ? <p className="mt-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{exam.comment}</p> : null}
    </div>
  );
}
