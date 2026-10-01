"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { clockLabel, parseDurationInput } from "@/lib/study/format";
import { examTotals, percentLabel } from "@/lib/study/metrics";
import type { MockExam, MockExamRow, MockExamStyle } from "@/types/study";
import { ClockInput } from "./clock-input";
import { Field } from "./dialogs";
import { Segmented, SubjectDot } from "./ui";

interface RowDraft {
  id: string;
  subjectId: string | null;
  name: string;
  weight: string;
  total: string;
  correct: string;
  wrong: string;
}

function toNumber(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function toRow(draft: RowDraft): MockExamRow {
  const total = Math.round(toNumber(draft.total));
  const correct = Math.min(total, Math.round(toNumber(draft.correct)));
  const wrong = Math.min(total - correct, Math.round(toNumber(draft.wrong)));
  return {
    id: draft.id,
    subjectId: draft.subjectId,
    name: draft.name.trim(),
    weight: draft.weight.trim() === "" ? 1 : toNumber(draft.weight),
    total,
    correct,
    wrong,
    blank: Math.max(0, total - correct - wrong),
  };
}

export function ExamDialog({ open, onOpenChange, exam }: { open: boolean; onOpenChange: (open: boolean) => void; exam?: MockExam | null }) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-3xl">
      {open ? <ExamForm exam={exam ?? null} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function ExamForm({ exam, onClose }: { exam: MockExam | null; onClose: () => void }) {
  const { st, textDir } = useStudyT();
  const { activePlan, planSubjects, actions, today, subjectById } = useStudy();
  const [day, setDay] = useState(exam?.day ?? today);
  const [name, setName] = useState(exam?.name ?? "");
  const [style, setStyle] = useState<MockExamStyle>(exam?.style ?? "multiple");
  const [board, setBoard] = useState(exam?.board ?? "");
  const [durationText, setDurationText] = useState(exam?.durationSec ? clockLabel(exam.durationSec, true) : "");
  const [comment, setComment] = useState(exam?.comment ?? "");
  const [rows, setRows] = useState<RowDraft[]>(() =>
    exam
      ? exam.rows.map((row) => ({
          id: row.id,
          subjectId: row.subjectId,
          name: row.name || subjectById(row.subjectId)?.name || "",
          weight: String(row.weight),
          total: String(row.total || ""),
          correct: String(row.correct || ""),
          wrong: String(row.wrong || ""),
        }))
      : planSubjects.map((subject) => ({
          id: nanoid(10),
          subjectId: subject.id,
          name: subject.name,
          weight: "1",
          total: "",
          correct: "",
          wrong: "",
        }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => rows.map(toRow), [rows]);
  const totals = examTotals({ rows: parsed, style });

  const update = (id: string, patch: Partial<RowDraft>) => setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const submit = async () => {
    if (!activePlan) return;
    if (!name.trim()) {
      setError(st("exam_name_required"));
      return;
    }
    const invalid = rows.find((row) => toNumber(row.correct) + toNumber(row.wrong) > toNumber(row.total));
    if (invalid) {
      setError(st("exam_invalid_row", { name: invalid.name || st("exam_row_name_placeholder") }));
      return;
    }
    const filled = parsed.filter((row) => row.total > 0);
    if (!filled.length) {
      setError(st("exam_needs_questions"));
      return;
    }
    const seconds = parseDurationInput(durationText);
    if (seconds === null) {
      setError(st("logform_invalid_time"));
      return;
    }
    setSaving(true);
    try {
      await actions.saveExam({
        id: exam?.id,
        planId: exam?.planId ?? activePlan.id,
        day,
        name: name.trim(),
        style,
        board: board.trim(),
        durationSec: seconds,
        rows: filled.map((row) => ({ ...row, name: row.name || subjectById(row.subjectId)?.name || "" })),
        comment: comment.trim(),
      });
      toast.success(st("exam_saved"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const cellInput = "h-8 w-full rounded-[var(--radius-xs)] border border-transparent bg-[var(--surface-2)]/70 px-2 text-center text-[12.5px] tabular-nums text-ink outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-3.5 pt-4 pr-12">
        <h2 dir={textDir} className="text-[16px] font-semibold tracking-[-0.015em] text-ink">
          {exam ? st("exam_form_edit") : st("exams_new")}
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,0.8fr)_7.5rem]">
          <Field label={st("exam_date")} htmlFor="exam-day">
            <Input id="exam-day" type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} />
          </Field>
          <Field label={st("exam_name")} htmlFor="exam-name">
            <Input id="exam-name" dir={textDir} value={name} onChange={(event) => setName(event.target.value)} placeholder={st("exam_name_placeholder")} maxLength={160} />
          </Field>
          <Field label={st("exam_board")} htmlFor="exam-board">
            <Input id="exam-board" dir={textDir} value={board} onChange={(event) => setBoard(event.target.value)} maxLength={80} />
          </Field>
          <Field label={st("exam_duration")} htmlFor="exam-duration">
            <ClockInput id="exam-duration" value={durationText} onChange={setDurationText} ariaLabel={st("exam_duration")} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11.5px] font-medium text-muted">{st("exam_style")}</span>
          <Segmented<MockExamStyle>
            size="md"
            value={style}
            onChange={setStyle}
            options={[
              { value: "multiple", label: st("exam_style_multiple") },
              { value: "truefalse", label: st("exam_style_truefalse") },
            ]}
          />
          {style === "truefalse" ? <span className="text-[11.5px] text-faint">{st("exam_style_truefalse_hint")}</span> : null}
        </div>

        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full min-w-[40rem] text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] text-faint">
                <th className="px-3 py-2 text-left font-medium">{st("col_subject")}</th>
                <th className="w-16 px-1.5 py-2 font-medium">{st("col_weight")}</th>
                <th className="w-20 px-1.5 py-2 font-medium">{st("col_total")}</th>
                <th className="w-20 px-1.5 py-2 font-medium">{st("correct_label")}</th>
                <th className="w-20 px-1.5 py-2 font-medium">{st("wrong_label")}</th>
                <th className="w-20 px-1.5 py-2 font-medium">{st("blank_label")}</th>
                <th className="w-16 px-1.5 py-2 font-medium">%</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const value = parsed[index];
                const over = toNumber(row.correct) + toNumber(row.wrong) > toNumber(row.total);
                const subject = subjectById(row.subjectId);
                const rowPercent = value.total
                  ? (style === "truefalse" ? value.correct - value.wrong : value.correct) / value.total
                  : null;
                return (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-1.5">
                      {subject ? (
                        <span className="flex min-w-0 items-center gap-2 text-ink">
                          <SubjectDot color={subject.color} />
                          <span className="truncate">{row.name}</span>
                        </span>
                      ) : (
                        <input
                          value={row.name}
                          onChange={(event) => update(row.id, { name: event.target.value.slice(0, 160) })}
                          placeholder={st("exam_row_name_placeholder")}
                          className="h-8 w-full rounded-[var(--radius-xs)] border border-transparent bg-[var(--surface-2)]/70 px-2 text-[12.5px] text-ink outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)]"
                        />
                      )}
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input aria-label={st("col_weight")} inputMode="decimal" value={row.weight} onChange={(event) => update(row.id, { weight: event.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })} className={cellInput} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input aria-label={st("col_total")} inputMode="numeric" value={row.total} placeholder="0" onChange={(event) => update(row.id, { total: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })} className={cellInput} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input aria-label={st("correct_label")} inputMode="numeric" value={row.correct} placeholder="0" onChange={(event) => update(row.id, { correct: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })} className={cn(cellInput, over && "border-[var(--danger)]")} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input aria-label={st("wrong_label")} inputMode="numeric" value={row.wrong} placeholder="0" onChange={(event) => update(row.id, { wrong: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })} className={cn(cellInput, over && "border-[var(--danger)]")} />
                    </td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums text-muted">{value.blank}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums text-muted">{percentLabel(rowPercent)}</td>
                    <td className="pr-2">
                      <button
                        type="button"
                        onClick={() => setRows((list) => list.filter((entry) => entry.id !== row.id))}
                        className="rounded p-1 text-faint transition hover:text-[var(--danger)]"
                        aria-label={st("remove")}
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]/50 text-[12.5px] font-medium">
                <td className="px-3 py-2 text-muted">{st("exam_result")}</td>
                <td className="px-1.5 py-2 text-center text-faint">–</td>
                <td className="px-1.5 py-2 text-center tabular-nums text-ink">{totals.total}</td>
                <td className="px-1.5 py-2 text-center tabular-nums text-[var(--band-high)]">{totals.correct}</td>
                <td className="px-1.5 py-2 text-center tabular-nums text-[var(--band-low)]">{totals.wrong}</td>
                <td className="px-1.5 py-2 text-center tabular-nums text-muted">{totals.blank}</td>
                <td className="px-1.5 py-2 text-center tabular-nums text-ink">{percentLabel(totals.percent)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows((list) => [...list, { id: nanoid(10), subjectId: null, name: "", weight: "1", total: "", correct: "", wrong: "" }])}
          >
            <Plus />
            {st("exam_add_row")}
          </Button>
          {totals.maxScore ? (
            <span className="text-[12px] tabular-nums text-muted">
              {st("exam_score", { score: totals.score, max: totals.maxScore })}
            </span>
          ) : null}
        </div>
        <Field label={st("exam_comment")} htmlFor="exam-comment">
          <Textarea id="exam-comment" dir={textDir} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>
        {error ? <p className="text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          {st("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {st("save")}
        </Button>
      </div>
    </form>
  );
}
