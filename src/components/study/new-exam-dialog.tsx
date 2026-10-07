"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/pickers";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import type { StudyPlan } from "@/types/study";
import { useStudyT } from "@/lib/study/i18n";
import { formatDay } from "@/lib/study/dates";
import { DialogFrame, Field } from "./dialogs";

type Mode = "same" | "term";

export function NewExamDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Objetivo que recebe a prova. Sem isso, vale o objetivo em foco. */
  plan?: StudyPlan | null;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-xl">
      {open ? <NewExamForm plan={plan ?? null} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

/**
 * Escolha de caminho no estilo Choicebox do Geist (Vercel): o bloco inteiro é o
 * alvo do clique, a marca de escolhido fica no canto e o texto de baixo diz o
 * que muda — não repete o título.
 */
function PathCard({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-col items-start gap-1 rounded-[var(--radius-md)] border px-3.5 py-3 text-start transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
        checked
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-snug text-ink">{title}</span>
        <span
          aria-hidden
          className={cn(
            "mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full border transition",
            checked ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border-strong)]"
          )}
        >
          <Check className={cn("size-2.5", checked ? "opacity-100" : "opacity-0")} strokeWidth={3.5} />
        </span>
      </span>
      <span className="text-[11.5px] leading-snug text-muted">{description}</span>
    </button>
  );
}

function NewExamForm({ plan, onClose }: { plan: StudyPlan | null; onClose: () => void }) {
  const { st, locale, textDir } = useStudyT();
  const { focusPlan, reviews, subjects, actions, today } = useStudy();
  const target = plan ?? focusPlan;
  const planId = target?.id ?? null;
  const planReviews = useMemo(() => reviews.filter((entry) => entry.planId === planId), [planId, reviews]);
  const planSubjects = useMemo(() => subjects.filter((entry) => entry.planId === planId), [planId, subjects]);
  const [mode, setMode] = useState<Mode>("same");
  const [examDate, setExamDate] = useState("");
  const [startDay, setStartDay] = useState(today);
  const [label, setLabel] = useState("");
  // O primeiro edital costuma não ter nome: ao abrir o próximo, ele ganha um.
  const [currentLabel, setCurrentLabel] = useState("");
  const [copySubjects, setCopySubjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropped = useMemo(
    () => (examDate ? planReviews.filter((review) => review.status === "pending" && review.dueDay >= examDate).length : 0),
    [examDate, planReviews]
  );
  const canCopy = planSubjects.length > 0;
  const needsCurrentLabel = !target?.termLabel.trim();

  const submit = async () => {
    if (!target) return;
    if (!examDate) {
      setError(st("new_exam_need_date"));
      return;
    }
    if (startDay > examDate) {
      setError(st("new_exam_start_after"));
      return;
    }
    if (mode === "term" && !label.trim()) {
      setError(st("new_exam_need_term_name"));
      return;
    }
    if (mode === "term" && needsCurrentLabel && !currentLabel.trim()) {
      setError(st("new_exam_need_current_name"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await actions.startNewExam({
        planId: target.id,
        mode,
        examDate,
        startDay,
        termLabel: label,
        currentLabel: mode === "term" && needsCurrentLabel ? currentLabel : undefined,
        copySubjects: mode === "term" && copySubjects && canCopy,
      });
      toast.success(st("new_exam_saved"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  return (
    <DialogFrame
      title={st("new_exam_title")}
      description={target.name}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {st("new_exam_submit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={st("new_exam_date")} htmlFor="new-exam-date">
          <DateField id="new-exam-date" min={today} value={examDate} onChange={setExamDate} />
        </Field>
        <Field label={st("new_exam_start")} htmlFor="new-exam-start" hint={st("new_exam_start_hint")}>
          <DateField id="new-exam-start" max={examDate || undefined} value={startDay} onChange={(next) => next && setStartDay(next)} />
        </Field>
      </div>

      <div role="radiogroup" aria-label={st("new_exam_where")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PathCard
          checked={mode === "same"}
          onSelect={() => setMode("same")}
          title={st("new_exam_same")}
          description={st("new_exam_same_desc")}
        />
        <PathCard
          checked={mode === "term"}
          onSelect={() => setMode("term")}
          title={st("new_exam_term")}
          description={st("new_exam_term_desc")}
        />
      </div>

      {mode === "term" ? (
        <div className="space-y-3">
          <div className={cn("grid grid-cols-1 gap-3", needsCurrentLabel && "sm:grid-cols-2")}>
            {needsCurrentLabel ? (
              <Field label={st("new_exam_current_name")} htmlFor="new-exam-current" hint={st("new_exam_current_hint")}>
                <Input
                  id="new-exam-current"
                  dir={textDir}
                  value={currentLabel}
                  onChange={(event) => setCurrentLabel(event.target.value)}
                  placeholder={st("new_exam_current_placeholder")}
                  maxLength={80}
                />
              </Field>
            ) : null}
            <Field label={st("new_exam_term_name")} htmlFor="new-exam-label">
              <Input
                id="new-exam-label"
                dir={textDir}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={st("new_exam_term_placeholder")}
                maxLength={80}
              />
            </Field>
          </div>
          {canCopy ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ink">
              <Checkbox checked={copySubjects} onCheckedChange={(value) => setCopySubjects(value === true)} />
              {st("new_exam_copy_subjects", { count: planSubjects.length })}
            </label>
          ) : null}
        </div>
      ) : null}

      {examDate ? (
        <div className="border-t border-[var(--border)] pt-3 text-[12px] leading-relaxed text-muted">
          <p>
            {st("new_exam_summary", {
              exam: formatDay(examDate, locale, { day: "numeric", month: "long", year: "numeric" }),
              start: formatDay(startDay, locale, { day: "numeric", month: "long" }),
            })}
          </p>
          {dropped ? <p className="mt-1 text-faint">{st("new_exam_drops_reviews", { count: dropped })}</p> : null}
          {mode === "term" ? <p className="mt-1 text-faint">{st("new_exam_term_archives", { name: target.name })}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
    </DialogFrame>
  );
}
