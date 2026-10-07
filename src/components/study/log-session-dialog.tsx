"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy, type SessionInput } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi, type LogPrefill } from "@/lib/study/ui-store";
import { addDays, minuteLabel, parseMinuteLabel } from "@/lib/study/dates";
import { canCountSession } from "@/lib/study/cycle";
import { intervalsBefore } from "@/lib/study/series";
import { clockLabel, parseDurationInput } from "@/lib/study/format";
import { accuracyOf } from "@/lib/study/metrics";
import { useLiveNote } from "@/lib/study/hooks";
import { ClockInput } from "./clock-input";
import { Combobox, type ComboOption } from "./combobox";
import { StudySelect, SubjectDot, useCategoryLabel } from "./ui";
import { MaterialInput } from "./material-input";
import { DateField, TimeField } from "@/components/ui/pickers";

type Choice = { kind: "existing"; id: string } | { kind: "new"; name: string } | null;

function numeric(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function LogSessionDialog() {
  const open = useStudyUi((state) => state.logOpen);
  const prefill = useStudyUi((state) => state.logPrefill);
  const editId = useStudyUi((state) => state.logEditId);
  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) useStudyUi.getState().closeLog();
      }}
      className="max-w-2xl"
    >
      {open ? <LogSessionForm key={`${editId ?? "new"}:${prefill?.reviewId ?? ""}:${prefill?.durationSec ?? ""}`} prefill={prefill} editId={editId} /> : null}
    </DialogShell>
  );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11.5px] font-medium text-muted">
      {children}
    </label>
  );
}

function Group({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 pb-3 pt-2.5", className)}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">{title}</span>
        {aside ? <span className="text-[11px] tabular-nums text-faint">{aside}</span> : null}
      </div>
      {children}
    </fieldset>
  );
}

function QuestionCounter({
  id,
  tone,
  label,
  value,
  onChange,
}: {
  id: string;
  tone: "success" | "danger";
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const color = tone === "success" ? "var(--success)" : "var(--danger)";
  const current = numeric(value);
  const step = (delta: number) => {
    const next = Math.max(0, Math.min(99999, current + delta));
    onChange(next ? String(next) : "");
  };
  return (
    <div
      className="flex items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 transition focus-within:ring-2 focus-within:ring-[var(--accent-soft)]"
      style={{
        borderColor: `color-mix(in oklab, ${color} ${current ? 38 : 16}%, var(--border))`,
        backgroundColor: `color-mix(in oklab, ${color} ${current ? 9 : 4}%, transparent)`,
      }}
    >
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-muted">{label}</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder="0"
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              step(1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              step(-1);
            }
          }}
          className="block w-full bg-transparent text-[20px] font-semibold leading-tight tabular-nums text-ink outline-none placeholder:text-faint"
        />
      </label>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`${label} −1`}
          disabled={!current}
          onClick={() => step(-1)}
          className="flex size-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted transition hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`${label} +1`}
          onClick={() => step(1)}
          className="flex size-7 items-center justify-center rounded-full text-white transition hover:brightness-110"
          style={{ backgroundColor: color }}
        >
          <Plus className="size-3.5" strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

function LogSessionForm({ prefill, editId }: { prefill: LogPrefill | null; editId: string | null }) {
  const { st, locale, textDir } = useStudyT();
  const router = useRouter();
  const categoryLabel = useCategoryLabel();
  const liveNote = useLiveNote();
  const { focusPlan, plans, subjects, cycles, sessions, settings, reviews, subjectById, actions, today } = useStudy();
  const editing = editId ? sessions.find((session) => session.id === editId) ?? null : null;
  const [carryPrefill, setCarryPrefill] = useState(true);
  const review =
    carryPrefill && prefill?.reviewId ? reviews.find((entry) => entry.id === prefill.reviewId) ?? null : null;
  const [planId] = useState<string | null>(
    () => editing?.planId ?? review?.planId ?? subjectById(prefill?.subjectId)?.planId ?? focusPlan?.id ?? null
  );
  const plan = plans.find((entry) => entry.id === planId) ?? null;
  const locked = Boolean(plan?.archived);
  const warned = useRef(false);
  useEffect(() => {
    if (!locked || warned.current) return;
    warned.current = true;
    toast.error(st("goal_readonly_toast"));
    useStudyUi.getState().closeLog();
  }, [locked, st]);
  const planSubjects = useMemo(() => subjects.filter((entry) => entry.planId === planId), [planId, subjects]);
  const planCycle = cycles.find((cycle) => cycle.planId === planId || cycle.id === planId) ?? null;

  const initialDay = editing?.day ?? prefill?.day ?? today;
  const [day, setDay] = useState(initialDay);
  const [dayMode, setDayMode] = useState<"today" | "yesterday" | "other">(
    initialDay === today ? "today" : initialDay === addDays(today, -1) ? "yesterday" : "other"
  );
  const [start, setStart] = useState(() => {
    const minute = editing?.startMinute ?? prefill?.startMinute ?? null;
    return minute === null || minute === undefined ? "" : minuteLabel(minute);
  });
  const [categoryId, setCategoryId] = useState(() => {
    const rawCat = editing?.categoryId ?? prefill?.categoryId ?? (review ? "review" : settings.categories[0]?.id ?? "theory");
    return rawCat === "reading" || rawCat === "video" || rawCat === "summary" ? "theory" : rawCat;
  });
  const initialSubjectId = editing?.subjectId ?? prefill?.subjectId ?? review?.subjectId ?? null;
  const initialTopicId = editing?.topicId ?? prefill?.topicId ?? review?.topicId ?? null;
  const [subject, setSubject] = useState<Choice>(() => (initialSubjectId ? { kind: "existing", id: initialSubjectId } : null));
  const [topic, setTopic] = useState<Choice>(() => (initialTopicId ? { kind: "existing", id: initialTopicId } : null));
  const [duration, setDuration] = useState(() => {
    const seconds = editing?.durationSec ?? prefill?.durationSec ?? 0;
    return seconds ? clockLabel(seconds, true) : "";
  });
  const [material, setMaterial] = useState(() =>
    editing && editing.material !== liveNote(editing.pageId)?.title ? editing.material : ""
  );
  const [comment, setComment] = useState(editing?.comment ?? "");
  const [correct, setCorrect] = useState(editing ? String(editing.correct || "") : "");
  const [wrong, setWrong] = useState(editing ? String(editing.wrong || "") : "");
  const [pageId, setPageId] = useState<string | null>(editing?.pageId ?? prefill?.pageId ?? null);
  const ownReviews = editing ? reviews.filter((entry) => entry.sessionId === editing.id) : [];
  // Tópico já encerrado abre marcado: registrar mais estudo nele não reabre a teoria.
  const [completeTopic, setCompleteTopic] = useState(() =>
    editing
      ? Boolean(editing.completedTopic)
      : Boolean(subjectById(initialSubjectId)?.topics.find((entry) => entry.id === initialTopicId)?.done)
  );
  const [scheduleReviews, setScheduleReviews] = useState(editing ? ownReviews.length > 0 : !review && settings.autoReviews);
  const [countCycle, setCountCycle] = useState(editing ? Boolean(editing.cycleItemId) : true);
  const [saveAnother, setSaveAnother] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectOptions: ComboOption[] = useMemo(
    () =>
      planSubjects.map((entry) => ({
        id: entry.id,
        label: entry.name || st("untitled_subject"),
        leading: <SubjectDot color={entry.color} />,
      })),
    [planSubjects, st]
  );

  const selectedSubject = subject?.kind === "existing" ? subjectById(subject.id) : undefined;
  const topicOptions: ComboOption[] = useMemo(
    () =>
      (selectedSubject?.topics ?? []).map((entry) => ({
        id: entry.id,
        label: entry.name,
        hint: entry.done ? <Check className="size-3.5 text-[var(--success)]" aria-label={st("logform_topic_done")} /> : undefined,
      })),
    [selectedSubject, st]
  );
  const selectedTopic =
    topic?.kind === "existing" ? selectedSubject?.topics.find((entry) => entry.id === topic.id) : undefined;


  const cycleMatches = Boolean(
    (planCycle && subject?.kind === "existing" && canCountSession(planCycle, subject.id, day, true)) ||
      (editing?.cycleItemId && subject?.kind === "existing" && subject.id === editing.subjectId && day === editing.day)
  );
  const ownsTopicDone = Boolean(editing?.completedTopic && topic?.kind === "existing" && topic.id === editing.topicId);
  const topicAlreadyDone = Boolean(selectedTopic?.done) && !ownsTopicDone;
  // A prova fecha a agenda: só valem os intervalos que caem antes dela. Sem
  // nenhum, a caixa não pode prometer revisões que não serão criadas.
  const fitIntervals = useMemo(
    () => intervalsBefore(settings.reviewIntervals, day, plan?.examDate ?? null),
    [day, plan?.examDate, settings.reviewIntervals]
  );
  const examClosed = settings.reviewIntervals.length > 0 && fitIntervals.length === 0;
  const canReview = fitIntervals.length > 0 || ownReviews.length > 0;
  // Sessão de revisão não abre outra série de revisões; ao editar, as que já existem ficam.
  const showReviews = categoryId !== "review";
  const willScheduleReviews = showReviews ? scheduleReviews && canReview : Boolean(editing && ownReviews.length);

  const correctN = numeric(correct);
  const wrongN = numeric(wrong);
  const accuracy = accuracyOf(correctN, wrongN);
  const setDayModeValue = (mode: "today" | "yesterday" | "other") => {
    setDayMode(mode);
    if (mode === "today") setDay(today);
    else if (mode === "yesterday") setDay(addDays(today, -1));
    else setDateOpen(true);
  };

  const reset = (savedSubjectId: string) => {
    setCarryPrefill(false);
    setSubject(savedSubjectId ? { kind: "existing", id: savedSubjectId } : null);
    setTopic(null);
    setDuration("");
    setMaterial("");
    setPageId(null);
    setComment("");
    setCorrect("");
    setWrong("");
    setCompleteTopic(false);
    setScheduleReviews(settings.autoReviews);
    setCountCycle(true);
    setStart("");
    setError(null);
  };

  const submit = async () => {
    if (plan?.archived) {
      toast.error(st("goal_readonly_toast"));
      useStudyUi.getState().closeLog();
      return;
    }
    if (!planId) {
      setError(st("logform_no_goal"));
      return;
    }
    if (!subject) {
      setError(st("logform_need_subject"));
      return;
    }
    const seconds = parseDurationInput(duration);
    if (seconds === null) {
      setError(st("logform_invalid_time"));
      return;
    }
    if (!seconds && !correctN && !wrongN) {
      setError(st("logform_need_time"));
      return;
    }
    setError(null);
    setSaving(true);
    const input: SessionInput = {
      planId,
      subjectId: subject.kind === "existing" ? subject.id : "",
      topicId: topic?.kind === "existing" ? topic.id : null,
      day,
      startMinute: start ? parseMinuteLabel(start) : null,
      durationSec: seconds,
      categoryId,
      correct: correctN,
      wrong: wrongN,
      pages: 0,
      pageRanges: [],
      videoSec: 0,
      videos: [],
      material: material.trim().slice(0, 200),
      comment: comment.trim().slice(0, 4000),
      reviewId: review?.id ?? null,
      pageId: liveNote(pageId) ? pageId : null,
      source: carryPrefill ? (prefill?.source ?? "manual") : "manual",
    };
    const create = {
      subjectName: subject.kind === "new" ? subject.name : undefined,
      topicName: topic?.kind === "new" ? topic.name : undefined,
    };
    try {
      if (editing) {
        await actions.updateSession(
          editing.id,
          input,
          {
            completeTopic,
            scheduleReviews: willScheduleReviews,
            countCycle: countCycle && cycleMatches,
            reopenTopic: topicAlreadyDone && !completeTopic,
          },
          create
        );
        toast.success(st("session_updated"));
        useStudyUi.getState().closeLog();
      } else {
        const saved = await actions.logSession(
          input,
          {
            completeTopic,
            scheduleReviews: willScheduleReviews,
            countCycle: countCycle && cycleMatches,
            reopenTopic: topicAlreadyDone && !completeTopic,
          },
          create
        );
        toast.success(st("session_saved"));
        if (saveAnother) {
          reset(saved.subjectId);
        } else {
          const store = useStudyUi.getState();
          store.closeLog();
          // Sessão cronometrada registrada: volta para a página inicial, na guia Estudos.
          if (input.source === "timer") {
            store.setModule("study");
            router.push("/home");
          }
        }
      }
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const intervals = fitIntervals;
  const intervalsText = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(intervals.map(String));

  if (locked) return null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 pb-3.5 pt-4">
        <div className="min-w-0">
          <h2 dir={textDir} className="text-[16px] font-semibold tracking-[-0.015em] text-ink">
            {editing ? st("logform_title_edit") : st("logform_title_new")}
          </h2>
          {plan ? <p className="mt-0.5 truncate text-[12px] text-muted">{plan.name}</p> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {review ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-[12px] text-[var(--accent)]">
            {st("logform_linked_review", { count: review.intervalDays })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" className="inline-flex rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {(["today", "yesterday", "other"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={dayMode === mode}
                onClick={() => setDayModeValue(mode)}
                className={cn(
                  "h-7 rounded-[6px] px-3 text-[12px] font-medium transition",
                  dayMode === mode ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
                )}
              >
                {mode === "today" ? st("today") : mode === "yesterday" ? st("yesterday") : st("other_day")}
              </button>
            ))}
          </div>
          {dayMode === "other" ? (
            <DateField
              value={day}
              max={today}
              open={dateOpen}
              onOpenChange={setDateOpen}
              onChange={(next) => next && setDay(next)}
              className="h-8 w-auto px-2 text-[12.5px]"
              aria-label={st("other_day")}
            />
          ) : (
            <span className="text-[12px] text-faint">
              {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
                new Date(`${day}T12:00:00Z`)
              )}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="log-start" className="text-[11.5px] font-medium text-muted">
              {st("logform_start")}
            </label>
            <TimeField id="log-start" value={start} onChange={setStart} clearable aria-label={st("logform_start")} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FieldLabel>{st("logform_subject")}</FieldLabel>
            <Combobox
              ariaLabel={st("logform_subject")}
              options={subjectOptions}
              value={subject?.kind === "existing" ? subject.id : null}
              pendingLabel={subject?.kind === "new" ? subject.name : null}
              placeholder={st("logform_subject_placeholder")}
              onSelect={(id) => {
                if (subject?.kind !== "existing" || subject.id !== id) {
                  setTopic(null);
                  if (!editing) setCompleteTopic(false);
                }
                setSubject({ kind: "existing", id });
              }}
              onCreate={(name) => {
                setSubject({ kind: "new", name });
                setTopic(null);
                if (!editing) setCompleteTopic(false);
              }}
              createLabel={(name) => st("logform_create_subject", { name })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="log-duration">{st("logform_duration")}</FieldLabel>
            <ClockInput id="log-duration" value={duration} onChange={setDuration} ariaLabel={st("logform_duration")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>{st("logform_topic")}</FieldLabel>
            <Combobox
              ariaLabel={st("logform_topic")}
              options={topicOptions}
              value={topic?.kind === "existing" ? topic.id : null}
              pendingLabel={topic?.kind === "new" ? topic.name : null}
              placeholder={st("logform_topic_placeholder")}
              disabled={!subject}
              clearable
              onClear={() => {
                setTopic(null);
                if (!editing) setCompleteTopic(false);
              }}
              onSelect={(id) => {
                setTopic({ kind: "existing", id });
                if (!editing) {
                  const found = selectedSubject?.topics.find((entry) => entry.id === id);
                  setCompleteTopic(Boolean(found?.done));
                }
              }}
              onCreate={(name) => {
                setTopic({ kind: "new", name });
                if (!editing) setCompleteTopic(false);
              }}
              createLabel={(name) => st("logform_create_topic", { name })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="log-category">{st("logform_category")}</FieldLabel>
            <StudySelect
              ariaLabel={st("logform_category")}
              value={categoryId}
              onChange={(val) => setCategoryId(String(val))}
              options={settings.categories.map((category) => ({
                value: category.id,
                label: categoryLabel(category.id),
              }))}
            />
          </div>
          <div className="sm:col-span-3">
            <FieldLabel htmlFor="log-material">{st("logform_material")}</FieldLabel>
            <MaterialInput
              id="log-material"
              text={material}
              pageId={pageId}
              onTextChange={setMaterial}
              onPageIdChange={setPageId}
              placeholder={st("logform_material_placeholder")}
            />
            <p className="mt-1 text-[11px] leading-snug text-faint">{st("logform_material_hint")}</p>
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-[var(--radius-md)] bg-[var(--surface-2)]/60 px-3.5 py-3",
            showReviews ? "sm:grid-cols-3" : "sm:grid-cols-2"
          )}
        >
          <Toggle checked={completeTopic} disabled={!topic} onChange={setCompleteTopic} label={st("logform_topic_done")} />
          <Toggle
            checked={countCycle && cycleMatches}
            disabled={!cycleMatches}
            onChange={setCountCycle}
            label={st("logform_cycle")}
            title={cycleMatches ? undefined : st("logform_cycle_locked")}
          />
          {showReviews ? (
            <Toggle
              checked={scheduleReviews && canReview}
              disabled={!canReview}
              onChange={setScheduleReviews}
              label={st("logform_reviews")}
              hint={
                editing && ownReviews.length
                  ? st("logform_reviews_existing", { count: ownReviews.length })
                  : intervals.length
                    ? st("logform_reviews_hint", { intervals: intervalsText, count: intervals[intervals.length - 1] })
                    : examClosed
                      ? st("logform_reviews_after_exam")
                      : st("logform_reviews_none")
              }
            />
          ) : null}
        </div>
        <Group
          title={st("logform_questions")}
          aside={accuracy !== null ? st("logform_accuracy_preview", { value: `${Math.round(accuracy * 100)}%` }) : undefined}
        >
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <QuestionCounter id="log-correct" tone="success" label={st("correct_label")} value={correct} onChange={setCorrect} />
            <QuestionCounter id="log-wrong" tone="danger" label={st("wrong_label")} value={wrong} onChange={setWrong} />
          </div>
          <div aria-hidden className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span className="h-full bg-[var(--success)] transition-[width] duration-300" style={{ width: `${accuracy === null ? 0 : accuracy * 100}%` }} />
            <span
              className="h-full bg-[var(--danger)] transition-[width] duration-300"
              style={{ width: `${accuracy === null ? 0 : (1 - accuracy) * 100}%` }}
            />
          </div>
        </Group>

        <div>
          <FieldLabel htmlFor="log-comment">{st("logform_comment")}</FieldLabel>
          <Textarea
            id="log-comment"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={st("logform_comment_placeholder")}
            dir={textDir}
          />
        </div>

        {error ? <p className="text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        {!editing ? (
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
            <Checkbox checked={saveAnother} onCheckedChange={(value) => setSaveAnother(value === true)} />
            {st("logform_save_another")}
          </label>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => useStudyUi.getState().closeLog()}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {st("save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  /** Motivo de estar fora de alcance, só no hover: a linha abaixo fica limpa. */
  title?: string;
}) {
  return (
    <label title={title} className={cn("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-[3px]"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[11px] leading-snug text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}
