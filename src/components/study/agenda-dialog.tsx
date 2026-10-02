"use client";

import { useCallback, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Clock3, Repeat2, Trash2 } from "lucide-react";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { capitalizeFirst, formatDay, isDayKey, orderedWeekdays, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import type { AgendaDraft } from "@/lib/study/agenda";
import type { AgendaEntry, AgendaRepeat, DayKey } from "@/types/study";
import { Combobox } from "./combobox";
import { DialogFrame } from "./dialogs";

export const AGENDA_DURATIONS = [15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];

export type AgendaScope = "this" | "following" | "all";

export interface AgendaDialogState {
  open: boolean;
  entry: AgendaEntry | null;
  day: DayKey | null;
  draft?: Partial<AgendaDraft>;
  removeItemId?: string;
}


export function useAgendaLabels() {
  const { st, locale } = useStudyT();
  const weekdayName = useCallback((day: DayKey) => weekdayLabel(weekdayOf(day), locale, "long"), [locale]);
  const repeatLabel = useCallback(
    (repeat: AgendaRepeat, start: DayKey) => {
      if (repeat === "daily") return st("agenda_repeat_daily");
      if (repeat === "weekly") return st("agenda_repeat_weekly", { day: weekdayName(start) });
      if (repeat === "monthly") return st("agenda_repeat_monthly", { num: Number(start.slice(8, 10)) });
      if (repeat === "weekdays") return st("agenda_repeat_weekdays");
      if (repeat === "custom") return st("agenda_repeat_custom");
      return st("agenda_repeat_none");
    },
    [st, weekdayName]
  );
  const summary = useCallback(
    (entry: Pick<AgendaEntry, "repeat" | "start" | "weekdays" | "until">) => {
      const base =
        entry.repeat === "none"
          ? st("agenda_once", { date: formatDay(entry.start, locale, { day: "numeric", month: "short" }) })
          : entry.repeat === "custom"
            ? st("agenda_custom_days", {
                days: entry.weekdays.map((weekday) => weekdayLabel(weekday, locale, "short").replace(".", "")).join(", "),
              })
            : repeatLabel(entry.repeat, entry.start);
      return entry.until && entry.repeat !== "none"
        ? `${base} · ${st("agenda_until", { date: formatDay(entry.until, locale, { day: "numeric", month: "short" }) })}`
        : base;
    },
    [locale, repeatLabel, st]
  );
  return { repeatLabel, summary };
}

export function AgendaDialog({
  state,
  onOpenChange,
  onSubmit,
  onDelete,
}: {
  state: AgendaDialogState;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: AgendaDraft) => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <DialogShell open={state.open} onOpenChange={onOpenChange} className="max-w-[26rem]">
      {state.open ? (
        <AgendaForm
          key={`${state.entry?.id ?? "new"}:${state.day ?? ""}`}
          state={state}
          onClose={() => onOpenChange(false)}
          onSubmit={onSubmit}
          onDelete={onDelete}
        />
      ) : null}
    </DialogShell>
  );
}

function PropertyRow({ icon, label, htmlFor, children }: { icon: ReactNode; label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1">
      <label htmlFor={htmlFor} className="flex w-28 shrink-0 items-center gap-2 text-[12.5px] text-muted [&_svg]:size-3.5 [&_svg]:text-faint">
        {icon}
        {label}
      </label>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}


function AgendaForm({
  state,
  onClose,
  onSubmit,
  onDelete,
}: {
  state: AgendaDialogState;
  onClose: () => void;
  onSubmit: (draft: AgendaDraft) => Promise<void>;
  onDelete: () => void;
}) {
  const { st, locale, duration, textDir } = useStudyT();
  const { planSubjects, settings, today, subjectById } = useStudy();
  const { repeatLabel } = useAgendaLabels();
  const entry = state.entry;
  const initialStart = state.draft?.start ?? state.day ?? entry?.start ?? today;
  const [subjectId, setSubjectId] = useState(() => state.draft?.subjectId ?? entry?.subjectId ?? planSubjects[0]?.id ?? "");
  const [start, setStart] = useState<string>(initialStart);
  const [minutes, setMinutes] = useState(() => state.draft?.minutes ?? entry?.minutes ?? 60);
  const [repeat, setRepeat] = useState<AgendaRepeat>(() => state.draft?.repeat ?? entry?.repeat ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(
    () => state.draft?.weekdays ?? (entry?.weekdays.length ? entry.weekdays : [weekdayOf(initialStart)])
  );
  const [topicId, setTopicId] = useState<string | null>(() => state.draft?.topicId ?? entry?.topicId ?? null);
  const [note, setNote] = useState(() => state.draft?.note ?? entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = subjectById(subjectId);
  const validStart = isDayKey(start) ? start : today;
  const durations = AGENDA_DURATIONS.includes(minutes) ? AGENDA_DURATIONS : [...AGENDA_DURATIONS, minutes].sort((a, b) => a - b);
  const repeats: AgendaRepeat[] = ["none", "daily", "weekly", "monthly", "weekdays", "custom"];
  const topicValue = subject?.topics.some((topic) => topic.id === topicId) ? topicId : null;

  const submit = async () => {
    if (!subjectId || !isDayKey(start)) return;
    if (repeat === "custom" && !weekdays.length) {
      setError(st("agenda_need_weekday"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        subjectId,
        minutes,
        start,
        repeat,
        weekdays: repeat === "custom" ? weekdays : [],
        topicId: topicValue,
        note: topicValue ? "" : note,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5">
        <p className="pr-8 text-[12px] text-muted">{entry ? st("agenda_title_edit") : st("agenda_title_new")}</p>

        <div className="mt-2 flex items-center">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={st("col_subject")}
                className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] -ml-1.5 px-2 py-1 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full shadow-xs"
                  style={{ backgroundColor: subject?.color ?? "var(--text-faint)" }}
                />
                <span className="min-w-0 flex-1 truncate text-[21px] font-semibold tracking-[-0.02em] text-ink">
                  {subject ? (subject.name || st("untitled_subject")) : st("untitled_subject")}
                </span>
                <ChevronDown className="size-4 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="w-[min(24rem,calc(100vw-3rem))] max-h-80 overflow-y-auto p-1.5 shadow-[var(--shadow-float)]">
              <MenuLabel>
                {st("col_subject")}
              </MenuLabel>
              {planSubjects.map((item) => {
                const isSelected = item.id === subjectId;
                return (
                  <MenuItem
                    key={item.id}
                    onSelect={() => {
                      setSubjectId(item.id);
                      setTopicId(null);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] cursor-pointer transition-colors",
                      isSelected
                        ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                        : "text-ink hover:bg-[var(--surface-hover)]"
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color ?? "var(--text-faint)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.name || st("untitled_subject")}</span>
                    {isSelected ? <Check className="size-4 shrink-0 text-[var(--accent)]" /> : null}
                  </MenuItem>
                );
              })}
            </MenuContent>
          </Menu>
        </div>

        <div className="mt-1 pl-[1.375rem]" dir={textDir}>
          <Combobox
            ariaLabel={st("col_topic")}
            options={(subject?.topics ?? []).map((topic) => ({ id: topic.id, label: topic.name }))}
            value={topicValue}
            pendingLabel={topicValue ? null : note || null}
            onSelect={(id) => {
              setTopicId(id);
              setNote("");
            }}
            onCreate={(label) => {
              setTopicId(null);
              setNote(label);
            }}
            createLabel={(label) => st("agenda_topic_use", { label })}
            clearable
            commitOnBlur
            onClear={() => {
              setTopicId(null);
              setNote("");
            }}
            placeholder={st("agenda_topic_placeholder")}
            emptyLabel={st("agenda_topic_placeholder")}
            boxClassName="h-8 border-transparent bg-transparent px-2 hover:bg-[var(--surface-hover)]"
            inputClassName="text-[13.5px] text-muted placeholder:text-faint"
          />
        </div>

        <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          <PropertyRow icon={<CalendarDays />} label={st("reminder_date")} htmlFor="agenda-start">
            <input
              id="agenda-start"
              type="date"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="h-8 rounded-[8px] bg-transparent px-2 text-right text-[13px] tabular-nums text-ink outline-none transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
            />
          </PropertyRow>
          <PropertyRow icon={<Clock3 />} label={st("agenda_duration_label")} htmlFor="agenda-minutes">
            <Menu>
              <MenuTrigger asChild>
                <button
                  id="agenda-minutes"
                  type="button"
                  aria-label={st("agenda_duration_label")}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[8px] px-2 text-[13px] tabular-nums text-ink outline-none transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
                >
                  <span className="truncate">{duration(minutes * 60)}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="max-h-64 w-40 overflow-y-auto p-1 shadow-[var(--shadow-float)]">
                {durations.map((value) => {
                  const isSelected = value === minutes;
                  return (
                    <MenuItem
                      key={value}
                      onSelect={() => setMinutes(value)}
                      className={cn(
                        "flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-[12.5px] tabular-nums cursor-pointer transition-colors",
                        isSelected ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-ink hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      <span>{duration(value * 60)}</span>
                      {isSelected ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          </PropertyRow>
          <PropertyRow icon={<Repeat2 />} label={st("agenda_repeat")} htmlFor="agenda-repeat">
            <Menu>
              <MenuTrigger asChild>
                <button
                  id="agenda-repeat"
                  type="button"
                  aria-label={st("agenda_repeat")}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[8px] px-2 text-[13px] text-ink outline-none transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
                >
                  <span className="truncate">{repeatLabel(repeat, validStart)}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="max-h-64 w-52 overflow-y-auto p-1 shadow-[var(--shadow-float)]">
                {repeats.map((value) => {
                  const isSelected = value === repeat;
                  return (
                    <MenuItem
                      key={value}
                      onSelect={() => {
                        setRepeat(value);
                        setError(null);
                        if (value === "custom" && !weekdays.length) setWeekdays([weekdayOf(validStart)]);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-[12.5px] cursor-pointer transition-colors",
                        isSelected ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-ink hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      <span className="truncate">{repeatLabel(value, validStart)}</span>
                      {isSelected ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          </PropertyRow>
          {repeat === "custom" ? (
            <div role="group" aria-label={st("agenda_weekdays")} className="flex justify-end gap-1 py-2.5">
              {orderedWeekdays(settings.weekStartsOn).map((weekday) => {
                const on = weekdays.includes(weekday);
                return (
                  <button
                    key={weekday}
                    type="button"
                    aria-pressed={on}
                    aria-label={weekdayLabel(weekday, locale, "long")}
                    onClick={() => {
                      setError(null);
                      setWeekdays((list) => (on ? list.filter((value) => value !== weekday) : [...list, weekday]));
                    }}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-[12px] font-medium transition",
                      on ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
                    )}
                  >
                    {capitalizeFirst(weekdayLabel(weekday, locale, "narrow"))}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 px-6 pb-5 pt-3">
        {entry ? (
          <Button type="button" variant="ghost" size="icon" className="mr-auto text-[var(--danger)]" aria-label={st("delete")} title={st("delete")} onClick={onDelete}>
            <Trash2 />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          {st("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !subjectId}>
          {st("save")}
        </Button>
      </div>
    </form>
  );
}

export function AgendaScopeDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: { mode: "edit" | "delete"; entry: AgendaEntry } | null;
  onCancel: () => void;
  onConfirm: (scope: AgendaScope) => Promise<void>;
}) {
  return (
    <DialogShell open={Boolean(request)} onOpenChange={(open) => (open ? undefined : onCancel())} className="max-w-sm">
      {request ? <ScopeForm key={`${request.mode}:${request.entry.id}`} request={request} onCancel={onCancel} onConfirm={onConfirm} /> : null}
    </DialogShell>
  );
}

function ScopeForm({
  request,
  onCancel,
  onConfirm,
}: {
  request: { mode: "edit" | "delete"; entry: AgendaEntry };
  onCancel: () => void;
  onConfirm: (scope: AgendaScope) => Promise<void>;
}) {
  const { st } = useStudyT();
  const { subjectById } = useStudy();
  const { summary } = useAgendaLabels();
  const [scope, setScope] = useState<AgendaScope>("this");
  const [busy, setBusy] = useState(false);
  const name = subjectById(request.entry.subjectId)?.name ?? st("untitled_subject");
  const options: { value: AgendaScope; label: string }[] = [
    { value: "this", label: st("agenda_scope_this") },
    { value: "following", label: st("agenda_scope_following") },
    { value: "all", label: st("agenda_scope_all") },
  ];
  return (
    <DialogFrame
      title={request.mode === "delete" ? st("agenda_scope_delete_title") : st("agenda_scope_edit_title")}
      description={st("agenda_scope_desc", { name, repeat: summary(request.entry) })}
      onSubmit={() => {
        setBusy(true);
        void onConfirm(scope).finally(() => setBusy(false));
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant={request.mode === "delete" ? "danger" : "primary"} disabled={busy}>
            {request.mode === "delete" ? st("delete") : st("save")}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={st("agenda_repeat")} className="space-y-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition",
              scope === option.value ? "bg-[var(--accent-soft)] text-ink" : "text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
            )}
          >
            <input
              type="radio"
              name="agenda-scope"
              value={option.value}
              checked={scope === option.value}
              onChange={() => setScope(option.value)}
              className="size-4 accent-[var(--accent)]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </DialogFrame>
  );
}
