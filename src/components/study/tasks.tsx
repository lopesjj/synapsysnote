"use client";

import { useRef, useState } from "react";
import { CalendarDays, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { usePlanning } from "@/lib/study/planning";
import { addDays, formatDay, startOfWeek } from "@/lib/study/dates";
import type { PlanningTask, TaskState } from "@/lib/study/planning-bridge";
import type { DayKey } from "@/types/study";
import { DialogFrame } from "./dialogs";

export interface TaskDialogState {
  open: boolean;
  task: PlanningTask | null;
  day: DayKey | null;
}

export function TaskDialog({ state, onOpenChange }: { state: TaskDialogState; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogShell open={state.open} onOpenChange={onOpenChange} className="max-w-md">
      {state.open ? (
        <TaskForm key={state.task?.id ?? `new:${state.day ?? ""}`} task={state.task} day={state.day} onClose={() => onOpenChange(false)} />
      ) : null}
    </DialogShell>
  );
}

function TaskForm({ task, day, onClose }: { task: PlanningTask | null; day: DayKey | null; onClose: () => void }) {
  const { st, textDir, locale } = useStudyT();
  const { today, settings } = useStudy();
  const { createTask, updateTask, deleteTask } = usePlanning();
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState<string>(task ? (task.day ?? "") : (day ?? today));
  const [state, setState] = useState<TaskState>(task?.state ?? "todo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const presets = [
    { key: "today", day: today, label: st("today") },
    { key: "tomorrow", day: addDays(today, 1), label: st("tomorrow") },
    { key: "next", day: startOfWeek(addDays(today, 7), settings.weekStartsOn), label: st("task_next_week") },
  ];
  const custom = Boolean(date) && !presets.some((preset) => preset.day === date);
  const short = (value: string) => formatDay(value, locale, { day: "numeric", month: "short" });

  const openPicker = () => {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  const submit = async () => {
    const clean = title.replace(/\s+/g, " ").trim();
    if (!clean) {
      setError(true);
      return;
    }
    setSaving(true);
    try {
      const draft = { title: clean, day: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, state };
      if (task) await updateTask(task, draft);
      else await createTask(draft);
      toast.success(st("task_saved"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition",
      active
        ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_2px_8px_-3px_var(--accent)]"
        : "bg-[var(--surface-2)] text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
    );

  const states: { value: TaskState; label: string }[] = [
    { value: "todo", label: st("task_state_todo") },
    { value: "doing", label: st("task_state_doing") },
    { value: "done", label: st("task_state_done") },
  ];

  return (
    <DialogFrame
      title={task ? st("task_edit") : st("task_new")}
      onSubmit={() => void submit()}
      footer={
        <>
          {task ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-[var(--danger)]"
              onClick={async () => {
                if (!window.confirm(st("task_delete_confirm", { name: task.title || st("task_title_label") }))) return;
                try {
                  await deleteTask(task);
                  toast.success(st("task_deleted"));
                  onClose();
                } catch {
                  toast.error(st("error_generic"));
                }
              }}
            >
              <Trash2 />
              {st("delete")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {st("save")}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 pt-1">
        <span className="mt-[5px] shrink-0">
          <StateGlyph state={state} />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="task-title" className="sr-only">
            {st("task_title_label")}
          </label>
          <textarea
            id="task-title"
            autoFocus
            dir={textDir}
            rows={2}
            value={title}
            maxLength={300}
            onChange={(event) => {
              setTitle(event.target.value.replace(/\n/g, " "));
              setError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={st("task_title_placeholder")}
            aria-invalid={error || undefined}
            className={cn(
              "block w-full resize-none bg-transparent text-[17px] font-semibold leading-[1.4] tracking-[-0.015em] text-ink outline-none placeholder:font-normal placeholder:text-faint",
              error && "placeholder:text-[var(--danger)]"
            )}
          />
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <p className="mb-2.5 text-[11.5px] font-medium text-muted">{st("task_when")}</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => setDate(preset.day)}
              className={chip(date === preset.day)}
              aria-pressed={date === preset.day}
            >
              {preset.label}
              <span className="font-normal opacity-70">{short(preset.day)}</span>
            </button>
          ))}
          <button type="button" onClick={openPicker} className={chip(custom)} aria-pressed={custom}>
            <CalendarDays className="size-3.5" />
            {custom ? short(date) : st("task_pick_date")}
            <input
              ref={picker}
              type="date"
              tabIndex={-1}
              aria-label={st("task_pick_date")}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            />
          </button>
          <button type="button" onClick={() => setDate("")} className={chip(!date)} aria-pressed={!date}>
            {st("task_no_date")}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[11.5px] font-medium text-muted">{st("task_state_label")}</p>
        <div role="radiogroup" aria-label={st("task_state_label")} className="grid grid-cols-3 gap-1.5">
          {states.map((option) => {
            const active = option.value === state;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setState(option.value)}
                className={cn(
                  "flex h-10 min-w-0 items-center justify-center gap-2 rounded-[12px] px-2 text-[12.5px] font-medium transition",
                  active
                    ? "bg-[var(--accent-soft)] text-ink shadow-[inset_0_0_0_1.5px_var(--accent)]"
                    : "bg-[var(--surface-2)] text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-ink"
                )}
              >
                <StateGlyph state={option.value} />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </DialogFrame>
  );
}

function StateGlyph({ state }: { state: TaskState }) {
  if (state === "done") {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
    );
  }
  return (
    <span className="relative block size-4 overflow-hidden rounded-full shadow-[inset_0_0_0_1.5px_var(--accent)]">
      {state === "doing" ? <span className="absolute inset-y-0 left-0 w-1/2 bg-[var(--accent)]" /> : null}
    </span>
  );
}

export function TaskCheck({ task, size = "md" }: { task: PlanningTask; size?: "sm" | "md" }) {
  const { st } = useStudyT();
  const { setTaskState } = usePlanning();
  const next: TaskState = task.state === "done" ? "todo" : "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.state === "done" ? true : task.state === "doing" ? "mixed" : false}
      aria-label={task.title}
      title={st(task.state === "done" ? "task_state_todo" : "task_state_done")}
      onClick={(event) => {
        event.stopPropagation();
        void setTaskState(task, next).catch(() => toast.error(st("error_generic")));
      }}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-[4px] border transition",
        size === "sm" ? "size-3.5" : "size-4",
        task.state === "done"
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
          : task.state === "doing"
            ? "border-[var(--accent)] bg-[var(--surface)]"
            : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)]"
      )}
    >
      {task.state === "done" ? <Check className={size === "sm" ? "size-2.5" : "size-3"} strokeWidth={3} /> : null}
      {task.state === "doing" ? <span className="absolute inset-[3px] rounded-[1px] bg-[var(--accent)]" style={{ clipPath: "inset(0 50% 0 0)" }} /> : null}
    </button>
  );
}

export function TaskLine({
  task,
  onOpen,
  meta,
  dense = false,
}: {
  task: PlanningTask;
  onOpen: (task: PlanningTask) => void;
  meta?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-[var(--radius-sm)] transition hover:bg-[var(--surface-hover)]",
        dense ? "px-1.5 py-1" : "px-2 py-1.5"
      )}
    >
      <TaskCheck task={task} size={dense ? "sm" : "md"} />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          dense ? "text-[11.5px]" : "text-[12.5px]",
          task.done ? "text-faint line-through" : "text-ink"
        )}
        title={task.title}
      >
        {task.title || "—"}
      </button>
      {meta ? <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{meta}</span> : null}
    </div>
  );
}

export function TasksPanel({ onOpen }: { onOpen: (task: PlanningTask) => void }) {
  const { st, locale } = useStudyT();
  const { today } = useStudy();
  const { tasks, createTask } = usePlanning();
  const [draft, setDraft] = useState("");
  const open = tasks.filter((task) => !task.done);
  const overdue = open.filter((task) => task.day && task.day < today).sort((a, b) => ((a.day ?? "") < (b.day ?? "") ? -1 : 1));
  const todays = tasks.filter((task) => task.day === today);
  const undated = open.filter((task) => !task.day);
  const groups: { key: string; label: string; items: PlanningTask[]; tone?: string }[] = [
    { key: "overdue", label: st("tasks_overdue"), items: overdue, tone: "text-[var(--band-low)]" },
    { key: "today", label: st("tasks_today"), items: todays },
    { key: "undated", label: st("tasks_undated"), items: undated },
  ];

  const add = async () => {
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title) return;
    setDraft("");
    try {
      await createTask({ title, day: today, state: "todo" });
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <section className="rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-[13.5px] font-semibold text-ink">{st("tasks_panel_title")}</h2>
        {open.length ? <span className="text-[11.5px] tabular-nums text-muted">{open.length}</span> : null}
      </div>
      <form
        className="px-3 pb-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-2 text-faint focus-within:border-solid focus-within:border-[var(--accent)]">
          <Plus className="size-3.5 shrink-0" />
          <input
            value={draft}
            maxLength={300}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={st("tasks_quick_placeholder")}
            aria-label={st("task_new")}
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
          />
        </label>
      </form>
      <div className="max-h-[22rem] overflow-y-auto px-2 pb-3">
        {groups.every((group) => !group.items.length) ? (
          <p className="px-2 py-2 text-[12px] leading-relaxed text-faint">{st("tasks_empty")}</p>
        ) : (
          groups.map((group) =>
            group.items.length ? (
              <div key={group.key} className="mt-1.5">
                <p className={cn("px-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]", group.tone ?? "text-faint")}>
                  {group.label}
                </p>
                {group.items.map((task) => (
                  <TaskLine
                    key={task.id}
                    task={task}
                    onOpen={onOpen}
                    meta={group.key === "overdue" && task.day ? formatDay(task.day, locale, { day: "numeric", month: "short" }) : undefined}
                  />
                ))}
              </div>
            ) : null
          )
        )}
      </div>
    </section>
  );
}
