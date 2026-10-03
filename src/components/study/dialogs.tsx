"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/pickers";
import { IconPickerMenu } from "@/components/ui/icon-picker";
import { WORKSPACE_ICONS } from "@/lib/icons/catalog";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useIconUploads } from "@/lib/study/hooks";
import type { StudyPlan, StudyReminder } from "@/types/study";
import { GoalMark, Segmented } from "./ui";

export function DialogFrame({
  title,
  description,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onSubmit: () => void;
}) {
  const { textDir } = useStudyT();
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-3.5 pt-4 pr-12">
        <h2 dir={textDir} className="text-[16px] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        {footer}
      </div>
    </form>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11.5px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}

export type GoalField = "name" | "icon" | "examDate" | "weekly" | "notes";

export function GoalDialog({
  open,
  onOpenChange,
  plan,
  onSaved,
  focus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: StudyPlan | null;
  onSaved?: (id: string) => void;
  /** Campo que recebe o foco ao abrir (padrão: nome). */
  focus?: GoalField;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-lg">
      {open ? <GoalForm plan={plan ?? null} focus={focus ?? "name"} onClose={() => onOpenChange(false)} onSaved={onSaved} /> : null}
    </DialogShell>
  );
}

function GoalForm({
  plan,
  focus,
  onClose,
  onSaved,
}: {
  plan: StudyPlan | null;
  focus: GoalField;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { st, textDir } = useStudyT();
  const { actions } = useStudy();
  const icons = useIconUploads();
  const [icon, setIcon] = useState<string | null>(plan?.icon ?? null);
  const [name, setName] = useState(plan?.name ?? "");
  const [institution, setInstitution] = useState(plan?.institution ?? "");
  const [role, setRole] = useState(plan?.role ?? "");
  const [examDate, setExamDate] = useState(plan?.examDate ?? "");
  const [hours, setHours] = useState(plan?.weeklyGoalMinutes ? String(Math.round((plan.weeklyGoalMinutes / 60) * 10) / 10) : "");
  const [questions, setQuestions] = useState(plan?.weeklyGoalQuestions ? String(plan.weeklyGoalQuestions) : "");
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError(st("goal_name_required"));
      return;
    }
    setSaving(true);
    try {
      const staged = icon?.startsWith("blob:") ?? false;
      const storedIcon = await icons.materialize(icon);
      let id: string;
      try {
        id = await actions.savePlan({
          id: plan?.id,
          name: name.trim(),
          institution: institution.trim(),
          role: role.trim(),
          examDate: examDate || null,
          icon: storedIcon,
          notes,
          weeklyGoalMinutes: Math.round(Math.max(0, Number(hours.replace(",", ".")) || 0) * 60),
          weeklyGoalQuestions: Math.max(0, Math.round(Number(questions) || 0)),
        });
      } catch (error) {
        if (staged) await icons.releaseStored(storedIcon);
        throw error;
      }
      icons.discard();
      toast.success(plan ? st("goal_updated") : st("goal_created"));
      onSaved?.(id);
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame
      title={plan ? st("goal_form_edit") : st("goal_form_new")}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {st("save")}
          </Button>
        </>
      }
    >
      <div className="flex items-end gap-3">
        <IconPickerMenu
          icons={WORKSPACE_ICONS}
          current={icon}
          fallback=""
          onSelect={(value) => setIcon(value || null)}
          onUploadImage={icons.upload}
          trigger={
            <button
              type="button"
              aria-label={st("goal_icon")}
              autoFocus={focus === "icon"}
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] transition hover:border-[var(--border-strong)]"
            >
              <GoalMark icon={icon} name={name || st("untitled_goal")} seed={plan?.id || name || "goal"} size={48} />
            </button>
          }
        />
        <div className="min-w-0 flex-1">
          <Field label={st("goal_name")} htmlFor="goal-name">
            <Input
              id="goal-name"
              autoFocus={focus === "name"}
              dir={textDir}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={st("goal_name_placeholder")}
              maxLength={160}
            />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={st("goal_institution")} htmlFor="goal-institution">
          <Input id="goal-institution" dir={textDir} value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder={st("goal_institution_placeholder")} maxLength={160} />
        </Field>
        <Field label={st("goal_role")} htmlFor="goal-role">
          <Input id="goal-role" dir={textDir} value={role} onChange={(event) => setRole(event.target.value)} placeholder={st("goal_role_placeholder")} maxLength={160} />
        </Field>
        <Field label={st("goal_exam_date")} htmlFor="goal-exam">
          <DateField id="goal-exam" autoFocus={focus === "examDate"} clearable value={examDate} onChange={setExamDate} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={st("goal_weekly_hours")} htmlFor="goal-hours">
            <Input id="goal-hours" autoFocus={focus === "weekly"} inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} placeholder="0" className="tabular-nums" />
          </Field>
          <Field label={st("goal_weekly_questions")} htmlFor="goal-questions">
            <Input id="goal-questions" inputMode="numeric" value={questions} onChange={(event) => setQuestions(event.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder="0" className="tabular-nums" />
          </Field>
        </div>
      </div>
      <Field label={st("goal_notes")} htmlFor="goal-notes">
        <Textarea id="goal-notes" autoFocus={focus === "notes"} dir={textDir} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={st("goal_notes_placeholder")} />
      </Field>
      {error ? <p className="text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
    </DialogFrame>
  );
}

export function PaceDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (open: boolean) => void; plan: StudyPlan }) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-sm">
      {open ? <PaceForm plan={plan} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function PaceForm({ plan, onClose }: { plan: StudyPlan; onClose: () => void }) {
  const { st } = useStudyT();
  const { actions } = useStudy();
  const [hours, setHours] = useState(plan.weeklyGoalMinutes ? String(Math.round((plan.weeklyGoalMinutes / 60) * 10) / 10) : "");
  const [questions, setQuestions] = useState(plan.weeklyGoalQuestions ? String(plan.weeklyGoalQuestions) : "");
  const submit = async () => {
    try {
      await actions.savePlan({
        id: plan.id,
        weeklyGoalMinutes: Math.round(Math.max(0, Number(hours.replace(",", ".")) || 0) * 60),
        weeklyGoalQuestions: Math.max(0, Math.round(Number(questions) || 0)),
      });
      toast.success(st("goal_updated"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    }
  };
  return (
    <DialogFrame
      title={st("pace_title")}
      description={st("pace_dialog_desc")}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary">
            {st("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={st("pace_hours_input")} htmlFor="pace-hours">
          <Input id="pace-hours" autoFocus inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} placeholder="0" className="tabular-nums" />
        </Field>
        <Field label={st("pace_questions_input")} htmlFor="pace-questions">
          <Input id="pace-questions" inputMode="numeric" value={questions} onChange={(event) => setQuestions(event.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder="0" className="tabular-nums" />
        </Field>
      </div>
    </DialogFrame>
  );
}

export function ReminderDialog({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: StudyReminder | null;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-md">
      {open ? <ReminderForm reminder={reminder ?? null} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function ReminderForm({ reminder, onClose }: { reminder: StudyReminder | null; onClose: () => void }) {
  const { st, textDir } = useStudyT();
  const { actions, activePlan, today } = useStudy();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [kind, setKind] = useState<"task" | "event">(reminder?.kind === "event" ? "event" : "task");
  const [day, setDay] = useState(reminder?.day ?? today);
  const submit = async () => {
    if (!title.trim()) return;
    try {
      await actions.saveReminder({
        id: reminder?.id,
        title: title.trim(),
        kind,
        day: day || today,
        done: reminder?.done ?? false,
        planId: reminder?.planId ?? activePlan?.id ?? null,
      });
      toast.success(st("reminder_saved"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    }
  };
  const remove = async () => {
    if (!reminder || !window.confirm(st("reminder_delete_confirm", { name: reminder.title || st("reminder_title_label") }))) return;
    try {
      await actions.deleteReminder(reminder.id);
      toast.success(st("reminder_deleted"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    }
  };
  return (
    <DialogFrame
      title={reminder ? st("reminder_edit") : st("reminder_add")}
      onSubmit={() => void submit()}
      footer={
        <>
          {reminder ? (
            <Button type="button" variant="ghost" className="mr-auto text-[var(--danger)]" onClick={() => void remove()}>
              <Trash2 />
              {st("delete")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {st("save")}
          </Button>
        </>
      }
    >
      <Field label={st("reminder_title_label")} htmlFor="reminder-title">
        <Input id="reminder-title" autoFocus dir={textDir} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={st("reminder_title_placeholder")} maxLength={160} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={st("reminder_kind")}>
          <Segmented<"task" | "event">
            size="md"
            value={kind}
            onChange={setKind}
            options={[
              { value: "task", label: st("reminder_kind_task") },
              { value: "event", label: st("reminder_kind_event") },
            ]}
          />
        </Field>
        <Field label={st("reminder_date")} htmlFor="reminder-day">
          <DateField id="reminder-day" clearable value={day} onChange={setDay} />
        </Field>
      </div>
    </DialogFrame>
  );
}
