"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerDownRight,
  EyeOff,
  Flag,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  SkipForward,
  SlidersHorizontal,
  Scale,
  Timer,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { useStudyUi, type ScheduleLayers } from "@/lib/study/ui-store";
import {
  addDays,
  addMonths,
  capitalizeFirst,
  diffDays,
  formatDay,
  monthGrid,
  monthLabel,
  orderedWeekdays,
  startOfMonth,
  startOfWeek,
  weekDays,
  weekdayLabel,
  weekdayOf,
} from "@/lib/study/dates";
import { projectSchedule, roundProgress, type LapState, type PlannedBlock, type RoundProgress } from "@/lib/study/cycle";
import {
  deleteAgendaEntry,
  dropAgendaDay,
  endAgendaBefore,
  makeAgendaEntry,
  nextOccurrence,
  nextWeekday,
  upsertAgendaEntry,
  type AgendaDraft,
} from "@/lib/study/agenda";
import type { PlanningTask } from "@/lib/study/planning-bridge";
import { usePlanning } from "@/lib/study/planning";
import type { AgendaEntry, CycleItem, DayKey, StudyCycle, StudyReminder, StudyReview } from "@/types/study";
import { AgendaDialog, AgendaScopeDialog, useAgendaLabels, type AgendaDialogState, type AgendaScope } from "../agenda-dialog";
import { CycleWizard } from "../cycle-wizard";
import { ReminderDialog } from "../dialogs";
import { FocusButton, Segmented, StudyHeader, StudyLoading, StudyPage, useStartFocus } from "../ui";
import { TaskDialog, TaskLine, TasksPanel, type TaskDialogState } from "../tasks";

const SHEET = "rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]";
const DURATIONS = [15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];
const SOFT_ACCENT = "color-mix(in oklab, var(--accent) 34%, var(--surface-2))";
const LAYERS: { key: keyof ScheduleLayers; label: StudyKey }[] = [
  { key: "plan", label: "layer_plan" },
  { key: "reviews", label: "layer_reviews" },
  { key: "tasks", label: "layer_tasks" },
];

type WizardMode = "manual" | "auto";

interface DayData {
  blocks: PlannedBlock[];
  reviews: { review: StudyReview; late: boolean }[];
  tasks: PlanningTask[];
  reminders: StudyReminder[];
  exam: boolean;
  capacity: number;
  done: number;
  planned: number;
}

interface WeekTotals {
  done: number;
  planned: number;
  available: number;
}

function tint(color: string, amount: number) {
  return `color-mix(in oklab, ${color} ${amount}%, var(--surface))`;
}

function sortByIds(list: CycleItem[], ids: string[]): CycleItem[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return list
    .map((item, index) => ({ item, key: rank.get(item.id) ?? ids.length + index }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}

type ScopeRequest =
  | { mode: "edit"; entry: AgendaEntry; day: DayKey; draft: AgendaDraft }
  | { mode: "delete"; entry: AgendaEntry; day: DayKey };

interface ScheduleCommands {
  scheduleOn: (day: DayKey | null, draft?: Partial<AgendaDraft>, removeItemId?: string) => void;
  editAgenda: (entry: AgendaEntry, day: DayKey | null) => void;
  deleteAgenda: (entry: AgendaEntry, day: DayKey | null) => void;
  newTask: (day: DayKey | null) => void;
}

const ScheduleCommandsContext = createContext<ScheduleCommands | null>(null);

function useScheduleCommands(): ScheduleCommands {
  const value = useContext(ScheduleCommandsContext);
  if (!value) throw new Error("useScheduleCommands precisa estar dentro do Planejamento");
  return value;
}

export function SchedulePage() {
  const { ready } = useStudy();
  if (!ready) return <StudyLoading />;
  return <ScheduleBody />;
}

function ScheduleBody() {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const params = useSearchParams();
  const { planCycle, planReviews, planSubjects, reminders, settings, today, actions, activePlan, subjectById } = useStudy();
  const { tasks } = usePlanning();
  const view = useStudyUi((state) => state.scheduleView);
  const [anchor, setAnchor] = useState(today);
  const [wizard, setWizard] = useState<{ open: boolean; mode: WizardMode }>(() => ({ open: params.get("setup") === "1", mode: "manual" }));
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({ open: false, task: null, day: null });
  const [reminderDialog, setReminderDialog] = useState<{ open: boolean; reminder: StudyReminder | null }>({ open: false, reminder: null });
  const [agendaDialog, setAgendaDialog] = useState<AgendaDialogState>({ open: false, entry: null, day: null });
  const [scope, setScope] = useState<ScopeRequest | null>(null);

  useEffect(() => {
    if (params.get("setup") === "1") router.replace("/home/study/schedule");
  }, [params, router]);

  const days = useMemo(
    () => (view === "week" ? weekDays(startOfWeek(anchor, settings.weekStartsOn)) : monthGrid(anchor, settings.weekStartsOn)),
    [anchor, settings.weekStartsOn, view]
  );
  const from = days[0];
  const to = days[days.length - 1];
  const progress = useMemo(() => (planCycle ? roundProgress(planCycle) : null), [planCycle]);

  const byDay = useMemo(() => {
    const map = new Map<DayKey, DayData>();
    for (const day of days) {
      map.set(day, {
        blocks: [],
        reviews: [],
        tasks: [],
        reminders: [],
        exam: false,
        capacity: planCycle?.weekMinutes[weekdayOf(day)] ?? 0,
        done: 0,
        planned: 0,
      });
    }
    if (planCycle) {
      for (const [day, blocks] of projectSchedule(planCycle, from, to, today)) {
        const entry = map.get(day);
        if (!entry) continue;
        for (const block of blocks) {
          if (!subjectById(block.subjectId)) continue;
          entry.blocks.push(block);
          if (block.status === "done") entry.done += block.minutes;
          else if (block.status === "planned") entry.planned += block.minutes;
        }
      }
    }
    // Revisão atrasada vai para hoje quando hoje está na tela: é lá que ela precisa ser feita.
    const showsToday = today >= from && today <= to;
    for (const review of planReviews) {
      if (review.status !== "pending") continue;
      const late = review.dueDay < today;
      map.get(late && showsToday ? today : review.dueDay)?.reviews.push({ review, late });
    }
    for (const task of tasks) if (task.day) map.get(task.day)?.tasks.push(task);
    for (const reminder of reminders) {
      if (reminder.done || (reminder.planId && reminder.planId !== activePlan?.id)) continue;
      map.get(reminder.day)?.reminders.push(reminder);
    }
    if (activePlan?.examDate) {
      const entry = map.get(activePlan.examDate);
      if (entry) entry.exam = true;
    }
    for (const entry of map.values()) {
      entry.reviews.sort((a, b) => Number(b.late) - Number(a.late) || (a.review.dueDay < b.review.dueDay ? -1 : 1));
    }
    return map;
  }, [activePlan, days, from, planCycle, planReviews, reminders, subjectById, tasks, to, today]);

  const week = useMemo<WeekTotals>(() => {
    if (!planCycle) return { done: 0, planned: 0, available: 0 };
    const start = startOfWeek(today, settings.weekStartsOn);
    let done = 0;
    let planned = 0;
    for (const blocks of projectSchedule(planCycle, start, addDays(start, 6), today).values()) {
      for (const block of blocks) {
        if (block.status === "done") done += block.minutes;
        else if (block.status === "planned") planned += block.minutes;
      }
    }
    return { done, planned, available: planCycle.weekMinutes.reduce((sum, value) => sum + value, 0) };
  }, [planCycle, settings.weekStartsOn, today]);

  const shift = (direction: number) =>
    setAnchor((value) => (view === "week" ? addDays(value, direction * 7) : addMonths(value, direction)));

  const title =
    view === "week"
      ? `${formatDay(from, locale, { day: "numeric", month: "short" })} – ${formatDay(to, locale, { day: "numeric", month: "short", year: "numeric" })}`
      : capitalizeFirst(monthLabel(startOfMonth(anchor), locale));

  const openWizard = (mode: WizardMode = "manual") => setWizard({ open: true, mode });
  const openTask = (task: PlanningTask) => setTaskDialog({ open: true, task, day: task.day });
  const newTask = (day: DayKey | null) => setTaskDialog({ open: true, task: null, day });
  const openReminder = (reminder: StudyReminder) => setReminderDialog({ open: true, reminder });

  const removeCycle = async () => {
    if (!activePlan || !window.confirm(st("schedule_remove_confirm"))) return;
    try {
      await actions.deleteCycle(activePlan.id);
      toast.success(st("schedule_removed"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  const changeAgenda = async (edit: (agenda: AgendaEntry[]) => AgendaEntry[], message: string, removeItemId?: string) => {
    if (!activePlan) return false;
    try {
      await actions.editAgenda(activePlan.id, edit, { removeItemId });
      toast.success(message);
      return true;
    } catch {
      toast.error(st("error_generic"));
      return false;
    }
  };

  const commands: ScheduleCommands = {
    scheduleOn: (day, draft, removeItemId) => setAgendaDialog({ open: true, entry: null, day, draft, removeItemId }),
    editAgenda: (entry, day) => setAgendaDialog({ open: true, entry, day }),
    deleteAgenda: (entry, day) => {
      if (day && entry.repeat !== "none") {
        setScope({ mode: "delete", entry, day });
        return;
      }
      const name = subjectById(entry.subjectId)?.name ?? st("untitled_subject");
      if (!window.confirm(st("agenda_delete_confirm", { name }))) return;
      void changeAgenda((agenda) => deleteAgendaEntry(agenda, entry.id), st("agenda_deleted"));
    },
    newTask,
  };

  const submitAgenda = async (draft: AgendaDraft) => {
    const { entry, day, removeItemId } = agendaDialog;
    if (entry && day && entry.repeat !== "none") {
      setAgendaDialog((value) => ({ ...value, open: false }));
      setScope({ mode: "edit", entry, day, draft });
      return;
    }
    const saved = await changeAgenda(
      (agenda) => upsertAgendaEntry(agenda, makeAgendaEntry(draft, entry ?? undefined)),
      st(entry ? "agenda_updated" : "agenda_saved"),
      removeItemId
    );
    if (saved) setAgendaDialog((value) => ({ ...value, open: false }));
  };

  const applyScope = async (choice: AgendaScope) => {
    if (!scope) return;
    const { entry, day } = scope;
    let edit: (agenda: AgendaEntry[]) => AgendaEntry[];
    let message: string;
    if (scope.mode === "delete") {
      message = st(choice === "this" ? "agenda_day_removed" : "agenda_deleted");
      edit =
        choice === "this"
          ? (agenda) => dropAgendaDay(agenda, entry.id, day)
          : choice === "following"
            ? (agenda) => endAgendaBefore(agenda, entry.id, day)
            : (agenda) => deleteAgendaEntry(agenda, entry.id);
    } else {
      const draft = scope.draft;
      message = st("agenda_updated");
      edit =
        choice === "this"
          ? (agenda) => upsertAgendaEntry(dropAgendaDay(agenda, entry.id, day), makeAgendaEntry({ ...draft, repeat: "none", weekdays: [] }))
          : choice === "following"
            ? (agenda) => upsertAgendaEntry(endAgendaBefore(agenda, entry.id, day), makeAgendaEntry(draft))
            : (agenda) => upsertAgendaEntry(agenda, makeAgendaEntry({ ...draft, start: draft.start === day ? entry.start : draft.start }, entry));
    }
    if (await changeAgenda(edit, message)) setScope(null);
  };

  const deleteFromDialog = () => {
    const { entry, day } = agendaDialog;
    if (!entry) return;
    setAgendaDialog((value) => ({ ...value, open: false }));
    commands.deleteAgenda(entry, day);
  };

  return (
    <ScheduleCommandsContext.Provider value={commands}>
      <StudyPage>
        <StudyHeader
          title={st("nav_schedule")}
          subtitle={st("schedule_subtitle")}
          showGoal={Boolean(activePlan)}
          showLog={false}
          actions={
            <>
              {activePlan && planSubjects.length ? (
                <Button variant="secondary" onClick={() => commands.scheduleOn(null)}>
                  <CalendarPlus />
                  {st("agenda_title_new")}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => newTask(today)}>
                <ListPlus />
                {st("task_new")}
              </Button>
              {planCycle && activePlan ? (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="secondary" size="icon" className="size-9" aria-label={st("more_actions")}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => openWizard("manual")}>
                      <SlidersHorizontal /> {st("schedule_reconfigure")}
                    </MenuItem>
                    <MenuItem onSelect={() => openWizard("auto")}>
                      <Scale /> {st("schedule_setup_auto")}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => void removeCycle()}>
                      <Trash2 /> {st("schedule_remove")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              ) : null}
            </>
          }
        />

        {planCycle?.items.length && progress ? <CycleBand cycle={planCycle} progress={progress} week={week} /> : <SetupBand onSetup={openWizard} />}

        <div className="@container">
          <div className="grid grid-cols-1 gap-5 @6xl:grid-cols-[minmax(0,1fr)_21rem]">
            <CalendarSheet
              view={view}
              title={title}
              days={days}
              byDay={byDay}
              month={startOfMonth(anchor)}
              onShift={shift}
              onToday={() => setAnchor(today)}
              onOpenDay={(day) => {
                setAnchor(day);
                useStudyUi.getState().setScheduleView("week");
              }}
              onOpenTask={openTask}
              onOpenReminder={openReminder}
            />
            <div className="grid min-w-0 content-start gap-5 @3xl:grid-cols-2 @6xl:grid-cols-1">
              <TasksPanel onOpen={openTask} />
              {planCycle && progress ? <CycleSequence cycle={planCycle} progress={progress} onReconfigure={openWizard} /> : null}
            </div>
          </div>
        </div>

        {activePlan ? (
          <CycleWizard open={wizard.open} onOpenChange={(open) => setWizard((value) => ({ ...value, open }))} initialMode={wizard.mode} />
        ) : null}
        <TaskDialog state={taskDialog} onOpenChange={(open) => setTaskDialog((value) => ({ ...value, open }))} />
        <ReminderDialog
          open={reminderDialog.open}
          reminder={reminderDialog.reminder}
          onOpenChange={(open) => setReminderDialog((value) => ({ ...value, open }))}
        />
        {activePlan ? (
          <AgendaDialog
            state={agendaDialog}
            onOpenChange={(open) => setAgendaDialog((value) => ({ ...value, open }))}
            onSubmit={submitAgenda}
            onDelete={deleteFromDialog}
          />
        ) : null}
        <AgendaScopeDialog request={scope} onCancel={() => setScope(null)} onConfirm={applyScope} />
      </StudyPage>
    </ScheduleCommandsContext.Provider>
  );
}

function CycleBand({ cycle, progress, week }: { cycle: StudyCycle; progress: RoundProgress; week: WeekTotals }) {
  const { st, duration } = useStudyT();
  const { subjectById, actions } = useStudy();
  const current = cycle.items.length ? cycle.items[cycle.pointer % cycle.items.length] : null;
  const subject = current ? subjectById(current.subjectId) : undefined;
  const topic = subject?.topics.find((entry) => !entry.done) ?? null;

  const mark = async (skipped: boolean) => {
    try {
      await actions.completeCycleBlock(cycle.planId, skipped);
      toast.success(st(skipped ? "cycle_skipped_toast" : "cycle_done_toast"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <section aria-label={st("cycle_now")} className="mb-8 flex flex-wrap items-center gap-x-12 gap-y-7">
      <div className="@container min-w-0 flex-[1_1_30rem]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 @md:gap-x-7">
          <CycleWheel cycle={cycle} progress={progress} className="size-[6.5rem] @md:size-[8rem] @2xl:row-span-2 @2xl:size-[9.5rem]" />
          <div className="min-w-0 @2xl:self-end">
            <p className="text-[12.5px] text-muted">
              {st("cycle_now")} · {st("cycle_round", { n: cycle.round + 1 })}
            </p>
            {current ? (
              <>
                <h2 className="mt-1 line-clamp-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink [overflow-wrap:anywhere] @md:text-[28px] @2xl:text-[30px]">
                  {subject?.name ?? st("untitled_subject")}
                </h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] tabular-nums text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--text-faint)" }} />
                    {duration(current.minutes * 60)}
                  </span>
                  <span aria-hidden className="text-faint">·</span>
                  <span>{st("next_up_reason_cycle", { n: progress.position, total: progress.total })}</span>
                  {progress.minutesLeft > current.minutes ? (
                    <>
                      <span aria-hidden className="text-faint">·</span>
                      <span>{st("cycle_left", { time: duration(progress.minutesLeft * 60) })}</span>
                    </>
                  ) : null}
                </p>
                {topic ? <p className="mt-1 truncate text-[12.5px] text-faint">{st("cycle_next_topic", { name: topic.name })}</p> : null}
              </>
            ) : (
              <p className="mt-1 text-[15px] text-muted">{st("cycle_empty")}</p>
            )}
          </div>
          {current ? (
            <div className="col-span-2 flex flex-wrap gap-2 @2xl:col-span-1 @2xl:col-start-2 @2xl:self-start">
              <FocusButton variant="primary" size="md" subjectId={current.subjectId} topicId={topic?.id ?? null} minutes={current.minutes} label={st("next_up_start")} />
              <Button variant="secondary" onClick={() => void mark(false)}>
                <Check />
                {st("cycle_mark_done")}
              </Button>
              <Button variant="ghost" onClick={() => void mark(true)}>
                <SkipForward />
                {st("cycle_skip")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <WeekLedger week={week} />
    </section>
  );
}

/** Roda do ciclo. `compact` tira o rótulo central e o destaque ao passar o mouse (uso em miniatura). */
export function CycleWheel({
  cycle,
  progress,
  className,
  compact = false,
}: {
  cycle: StudyCycle;
  progress: RoundProgress;
  className?: string;
  compact?: boolean;
}) {
  const { st, duration } = useStudyT();
  const { subjectById } = useStudy();
  const [hover, setHover] = useState<number | null>(null);
  const size = 152;
  const thickness = compact ? 24 : 13;
  const radius = size / 2 - thickness / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const total = cycle.items.reduce((sum, item) => sum + item.minutes, 0);
  const gap = cycle.items.length > 1 ? Math.min(3, circumference / cycle.items.length / 4) : 0;
  const hovered = hover !== null ? cycle.items[hover] : undefined;
  const hoveredSubject = hovered ? subjectById(hovered.subjectId) : undefined;
  let offset = 0;

  const strokeFor = (color: string, state: LapState) => {
    if (state === "done" || state === "current") return color;
    if (state === "skipped") return `color-mix(in oklab, ${color} 16%, var(--surface-2))`;
    return `color-mix(in oklab, ${color} 40%, var(--surface-2))`;
  };

  return (
    <div className={cn("relative shrink-0", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={`${st("cycle_round", { n: cycle.round + 1 })}: ${st("cycle_progress", { done: progress.done, total: progress.total })}`}
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0
          ? cycle.items.map((item, index) => {
              const length = (item.minutes / total) * circumference;
              const dash = Math.max(0.5, length - gap);
              const state = progress.states[index];
              const subject = subjectById(item.subjectId);
              const element = (
                <circle
                  key={item.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={strokeFor(subject?.color ?? "var(--text-faint)", state)}
                  strokeWidth={compact ? thickness : state === "current" ? thickness + 7 : hover === index ? thickness + 3 : thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  className="transition-[stroke-width] duration-200"
                  onPointerEnter={compact ? undefined : () => setHover(index)}
                  onPointerLeave={compact ? undefined : () => setHover(null)}
                >
                  <title>{`${subject?.name ?? st("untitled_subject")} · ${duration(item.minutes * 60)}`}</title>
                </circle>
              );
              offset += length;
              return element;
            })
          : null}
      </svg>
      {compact ? null : (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        {hovered ? (
          <>
            <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-ink">{hoveredSubject?.name ?? st("untitled_subject")}</span>
            <span className="mt-0.5 text-[11px] tabular-nums text-muted">{duration(hovered.minutes * 60)}</span>
          </>
        ) : (
          <>
            <span className="text-[19px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink @2xl:text-[24px]">
              {progress.done}
              <span className="text-faint">/{progress.total}</span>
            </span>
            <span className="mt-1 text-[10.5px] text-muted @2xl:text-[11px]">{st("cycle_wheel_done")}</span>
          </>
        )}
      </div>
      )}
    </div>
  );
}

function WeekLedger({ week }: { week: WeekTotals }) {
  const { st, duration } = useStudyT();
  const max = Math.max(week.available, week.done + week.planned, 1);
  const rows = [
    { key: "done", label: st("week_done_label"), value: week.done, swatch: { backgroundColor: "var(--accent)" } },
    { key: "planned", label: st("week_planned_label"), value: week.planned, swatch: { backgroundColor: SOFT_ACCENT } },
    { key: "available", label: st("week_available_label"), value: week.available, swatch: { boxShadow: "inset 0 0 0 1.5px var(--border-strong)" } },
  ];
  return (
    <div className="w-full min-w-0 sm:w-[17rem]">
      <p className="text-[12.5px] text-muted">{st("week_title")}</p>
      <div aria-hidden className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span className="h-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${(week.done / max) * 100}%` }} />
        <span className="h-full transition-[width] duration-500" style={{ width: `${(week.planned / max) * 100}%`, backgroundColor: SOFT_ACCENT }} />
      </div>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={row.swatch} />
            <dt className="min-w-0 flex-1 truncate text-muted">{row.label}</dt>
            <dd className="tabular-nums text-ink">{duration(row.value * 60)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SetupBand({ onSetup }: { onSetup: (mode: WizardMode) => void }) {
  const { st } = useStudyT();
  const router = useRouter();
  const { activePlan, planSubjects } = useStudy();
  return (
    <section className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-5">
      <svg viewBox="0 0 120 120" aria-hidden className="size-[5.5rem] shrink-0 -rotate-90 sm:size-28">
        <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border-strong)" strokeWidth="12" strokeDasharray="14 7" />
      </svg>
      <div className="min-w-0 max-w-xl flex-[1_1_20rem]">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
          {activePlan ? st("schedule_empty_title") : st("schedule_no_goal_title")}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {activePlan ? st("schedule_empty_desc") : st("schedule_no_goal_desc")}
        </p>
        {activePlan && !planSubjects.length ? <p className="mt-2 text-[12.5px] text-muted">{st("cycle_no_subjects_warning")}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {!activePlan ? (
            <Button variant="primary" onClick={() => router.push("/home/study/goals/new")}>
              <Plus />
              {st("empty_goal_cta")}
            </Button>
          ) : !planSubjects.length ? (
            <Button variant="primary" onClick={() => router.push("/home/study/subjects")}>
              <BookOpen />
              {st("cycle_add_subjects_cta")}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onSetup("manual")}>
              {st("schedule_setup_manual")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function CalendarSheet({
  view,
  title,
  days,
  byDay,
  month,
  onShift,
  onToday,
  onOpenDay,
  onOpenTask,
  onOpenReminder,
}: {
  view: "week" | "month";
  title: string;
  days: DayKey[];
  byDay: Map<DayKey, DayData>;
  month: DayKey;
  onShift: (direction: number) => void;
  onToday: () => void;
  onOpenDay: (day: DayKey) => void;
  onOpenTask: (task: PlanningTask) => void;
  onOpenReminder: (reminder: StudyReminder) => void;
}) {
  const { st } = useStudyT();
  const layers = useStudyUi((state) => state.scheduleLayers);
  return (
    <section className={cn(SHEET, "@container min-w-0 overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--border)] px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-initial">
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" aria-label={st("prev_period")} onClick={() => onShift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={st("next_period")} onClick={() => onShift(1)}>
              <ChevronRight />
            </Button>
          </div>
          <h2 className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.015em] text-ink sm:text-[15px]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onToday} className="shrink-0 px-2 text-[12px]">
            {st("today")}
          </Button>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:gap-x-3">
          <div role="group" aria-label={st("schedule_show")} className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LAYERS.map((layer) => {
              const on = layers[layer.key];
              return (
                <button
                  key={layer.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => useStudyUi.getState().setScheduleLayer(layer.key, !on)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[11.5px] font-medium transition hover:bg-[var(--surface-hover)] sm:text-[12px]",
                    on ? "text-ink" : "text-faint"
                  )}
                >
                  <LayerGlyph layer={layer.key} />
                  {st(layer.label)}
                </button>
              );
            })}
          </div>
          <Segmented
            value={view}
            onChange={(mode) => useStudyUi.getState().setScheduleView(mode)}
            options={[
              { value: "week", label: st("schedule_week") },
              { value: "month", label: st("schedule_month") },
            ]}
          />
        </div>
      </div>

      {view === "week" ? (
        <div className="divide-y divide-[var(--border)] @3xl:grid @3xl:grid-cols-7 @3xl:divide-x @3xl:divide-y-0">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              data={byDay.get(day)}
              layers={layers}
              onOpenTask={onOpenTask}
              onOpenReminder={onOpenReminder}
            />
          ))}
        </div>
      ) : (
        <MonthView days={days} byDay={byDay} layers={layers} month={month} onOpenDay={onOpenDay} />
      )}
    </section>
  );
}

function LayerGlyph({ layer }: { layer: keyof ScheduleLayers }) {
  if (layer === "plan") return <span aria-hidden className="h-3 w-[3px] rounded-full bg-current" />;
  if (layer === "reviews") return <span aria-hidden className="size-2 rounded-full border-[1.5px] border-current" />;
  return <span aria-hidden className="size-2 rounded-[2px] border-[1.5px] border-current" />;
}

function DayAddMenu({ day, className, children }: { day: DayKey; className?: string; children: ReactNode }) {
  const { st, locale } = useStudyT();
  const { planSubjects, activePlan } = useStudy();
  const commands = useScheduleCommands();
  const label = st("day_add", { date: formatDay(day, locale, { day: "numeric", month: "long" }) });
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label={label} title={label} className={className}>
          {children}
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        {activePlan && planSubjects.length ? (
          <MenuItem onSelect={() => commands.scheduleOn(day)}>
            <CalendarPlus /> {st("agenda_title_new")}
          </MenuItem>
        ) : null}
        <MenuItem onSelect={() => commands.newTask(day)}>
          <ListPlus /> {st("task_new")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function DayColumn({
  day,
  data,
  layers,
  onOpenTask,
  onOpenReminder,
}: {
  day: DayKey;
  data?: DayData;
  layers: ScheduleLayers;
  onOpenTask: (task: PlanningTask) => void;
  onOpenReminder: (reminder: StudyReminder) => void;
}) {
  const { st, locale } = useStudyT();
  const { today, planCycle } = useStudy();
  const isToday = day === today;
  const past = day < today;
  const blocks = layers.plan ? (data?.blocks ?? []) : [];
  const reviews = layers.reviews ? (data?.reviews ?? []) : [];
  const tasks = layers.tasks ? (data?.tasks ?? []) : [];
  const reminders = layers.tasks ? (data?.reminders ?? []) : [];
  const empty = !data?.exam && !blocks.length && !reviews.length && !tasks.length && !reminders.length;
  const weekday = capitalizeFirst(weekdayLabel(weekdayOf(day), locale, "short").replace(".", ""));

  return (
    <section
      aria-label={formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}
      className={cn(
        "group/day relative grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-4 px-4 py-3.5 @3xl:flex @3xl:min-h-[24rem] @3xl:flex-col @3xl:gap-x-0 @3xl:p-0",
        isToday && "bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
      )}
    >
      <header className="min-w-0 @3xl:px-3 @3xl:pb-2.5 @3xl:pt-3">
        <p className="flex flex-col items-start @3xl:flex-row @3xl:items-center @3xl:gap-1.5">
          <span className={cn("text-[11.5px] font-medium", isToday ? "text-[var(--accent)]" : past ? "text-faint" : "text-muted")}>{weekday}</span>
          <span
            className={cn(
              "text-[19px] font-semibold leading-tight tracking-[-0.02em] tabular-nums @3xl:text-[15px] @3xl:leading-6",
              isToday ? "rounded-full bg-[var(--accent)] px-[7px] text-[var(--accent-contrast)]" : past ? "text-faint" : "text-ink"
            )}
          >
            {Number(day.slice(8, 10))}
          </span>
        </p>
        <DayMeter data={data} className="mt-2" />
      </header>
      <div className="min-w-0 pr-7 @3xl:flex-1 @3xl:px-2 @3xl:pb-3">
        {empty ? (
          <p className="py-0.5 text-[11.5px] text-faint @3xl:px-1.5">{planCycle && !data?.capacity ? st("day_free") : ""}</p>
        ) : (
          <ul className="space-y-1.5">
            {data?.exam ? (
              <li className="flex items-center gap-1.5 rounded-[8px] bg-[color-mix(in_oklab,var(--band-low)_12%,transparent)] px-2 py-1 text-[11.5px] font-semibold text-[var(--band-low)]">
                <Flag className="size-3.5 shrink-0" />
                <span className="truncate">{st("reminder_kind_exam")}</span>
              </li>
            ) : null}
            {blocks.map((block) => (
              <DisciplineItem key={block.key} block={block} day={day} />
            ))}
            {reviews.map(({ review, late }) => (
              <ReviewItem key={review.id} review={review} late={late} />
            ))}
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskLine task={task} onOpen={onOpenTask} dense />
              </li>
            ))}
            {reminders.map((reminder) => (
              <ReminderItem key={reminder.id} reminder={reminder} onOpen={onOpenReminder} />
            ))}
          </ul>
        )}
        <DayAddMenu
          day={day}
          className="mt-1.5 hidden h-8 w-full items-center justify-center rounded-[9px] border border-dashed border-[var(--border-strong)] text-faint opacity-0 transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover/day:opacity-100 @3xl:flex [@media(hover:none)]:opacity-100"
        >
          <Plus className="size-3.5" />
        </DayAddMenu>
      </div>
      <DayAddMenu
        day={day}
        className="absolute right-2.5 top-3 flex size-7 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink @3xl:hidden"
      >
        <Plus className="size-3.5" />
      </DayAddMenu>
    </section>
  );
}

function DayMeter({ data, className }: { data?: DayData; className?: string }) {
  const { st, duration } = useStudyT();
  if (!data || (!data.capacity && !data.done && !data.planned)) return null;
  const used = data.done + data.planned;
  const max = Math.max(data.capacity, used, 1);
  const label = [
    `${st("week_done_label")} ${duration(data.done * 60)}`,
    `${st("week_planned_label")} ${duration(data.planned * 60)}`,
    `${st("week_available_label")} ${duration(data.capacity * 60)}`,
  ].join(" · ");
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={cn("flex h-[3px] w-full max-w-[2.75rem] overflow-hidden rounded-full bg-[var(--surface-2)] @3xl:max-w-none", className)}
    >
      <span className="h-full bg-[var(--accent)]" style={{ width: `${(data.done / max) * 100}%` }} />
      <span
        className="h-full"
        style={{
          width: `${(data.planned / max) * 100}%`,
          backgroundColor: used > data.capacity ? "color-mix(in oklab, var(--band-mid) 60%, var(--surface-2))" : SOFT_ACCENT,
        }}
      />
    </div>
  );
}

function DisciplineItem({ block, day }: { block: PlannedBlock; day: DayKey }) {
  const { st, locale, duration } = useStudyT();
  const { subjectById, topicById, planCycle, actions, today } = useStudy();
  const startFocus = useStartFocus();
  const commands = useScheduleCommands();
  const { summary } = useAgendaLabels();
  const subject = subjectById(block.subjectId);
  const color = subject?.color ?? "var(--text-faint)";
  const name = subject?.name ?? st("untitled_subject");
  const planned = block.status === "planned";
  const missed = block.status === "missed";
  const skipped = block.status === "skipped";
  const record = block.completion;
  const entry = block.fixed ? planCycle?.agenda.find((item) => item.id === block.itemId) : undefined;
  const topicText = (entry?.topicId ? topicById(block.subjectId, entry.topicId)?.name : null) ?? (entry?.note || null);
  const planId = planCycle?.planId;
  const shortDate = formatDay(day, locale, { day: "numeric", month: "short" });

  const run = async (task: () => Promise<void>, message: string) => {
    try {
      await task();
      toast.success(message);
    } catch {
      toast.error(st("error_generic"));
    }
  };
  const markFixed = (skip: boolean) => {
    if (planId && entry) void run(() => actions.markAgendaDay(planId, entry.id, day, skip), st(skip ? "cycle_skipped_toast" : "cycle_done_toast"));
  };
  const markNext = (skip: boolean) => {
    if (planId) void run(() => actions.completeCycleBlock(planId, skip), st(skip ? "cycle_skipped_toast" : "cycle_done_toast"));
  };

  const context = record
    ? st(record.skipped ? "history_skipped_on" : "history_done_on", { date: shortDate })
    : entry
      ? summary(entry)
      : block.sequence >= 0 && planCycle
        ? st("next_up_reason_cycle", { n: block.sequence + 1, total: planCycle.items.length })
        : duration(block.minutes * 60);

  return (
    <li>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 gap-2 rounded-[9px] border py-1.5 pl-1.5 pr-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--accent-soft)]",
              (skipped || missed) && "border-dashed"
            )}
            style={{
              backgroundColor: planned ? tint(color, 9) : "transparent",
              borderColor: block.isNext ? "var(--accent)" : planned ? `color-mix(in oklab, ${color} 24%, var(--border))` : "var(--border)",
            }}
          >
            <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: color, opacity: planned ? 1 : 0.4 }} />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "line-clamp-2 text-[12px] font-medium leading-snug [overflow-wrap:anywhere]",
                  planned ? "text-ink" : skipped || missed ? "text-faint" : "text-muted",
                  block.status === "done" && "line-through decoration-[1.5px] decoration-[color-mix(in_oklab,currentColor_70%,transparent)]"
                )}
              >
                {name}
              </span>
              {topicText ? <span className="mt-0.5 block truncate text-[10.5px] text-faint">{topicText}</span> : null}
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] tabular-nums text-muted">
                {block.status === "done" ? <Check className="size-3 text-[var(--accent)]" strokeWidth={2.5} aria-hidden /> : null}
                {skipped ? <SkipForward className="size-3 text-faint" aria-hidden /> : null}
                <span className={cn((skipped || missed) && "text-faint")}>{duration(block.minutes * 60)}</span>
                {block.fixed ? <Pin className="size-3 text-faint" aria-label={st("agenda_fixed")} /> : null}
                {block.isNext ? <span className="ml-auto font-medium text-[var(--accent)]">{st("cycle_state_current")}</span> : null}
                {missed ? <span className="ml-auto text-[var(--band-low)]">{st("agenda_missed")}</span> : null}
              </span>
            </span>
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <div className="px-2 pb-2 pt-1.5">
            <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink">{name}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{context}</p>
          </div>
          <MenuSeparator />
          {record ? (
            <MenuItem destructive onSelect={() => planId && void run(() => actions.removeCycleCompletion(planId, record), st("history_deleted"))}>
              <Trash2 /> {st("history_delete")}
            </MenuItem>
          ) : entry ? (
            <>
              {day <= today ? (
                <>
                  {day === today ? (
                    <MenuItem onSelect={() => startFocus({ subjectId: entry.subjectId, topicId: entry.topicId, minutes: block.minutes })}>
                      <Timer /> {st("next_up_start")}
                    </MenuItem>
                  ) : null}
                  <MenuItem onSelect={() => markFixed(false)}>
                    <Check /> {st("cycle_mark_done")}
                  </MenuItem>
                  <MenuItem onSelect={() => markFixed(true)}>
                    <SkipForward /> {st("cycle_skip")}
                  </MenuItem>
                  <MenuSeparator />
                </>
              ) : null}
              <MenuItem onSelect={() => commands.editAgenda(entry, day)}>
                <Pencil /> {st("edit")}
              </MenuItem>
              <MenuItem destructive onSelect={() => commands.deleteAgenda(entry, day)}>
                <Trash2 /> {st("delete")}
              </MenuItem>
            </>
          ) : (
            <>
              {block.isNext ? (
                <>
                  <MenuItem onSelect={() => startFocus({ subjectId: block.subjectId, minutes: block.minutes })}>
                    <Timer /> {st("next_up_start")}
                  </MenuItem>
                  <MenuItem onSelect={() => markNext(false)}>
                    <Check /> {st("cycle_mark_done")}
                  </MenuItem>
                  <MenuItem onSelect={() => markNext(true)}>
                    <SkipForward /> {st("cycle_skip")}
                  </MenuItem>
                </>
              ) : (
                <MenuItem
                  onSelect={() => planId && void run(() => actions.setCyclePointer(planId, block.itemId), st("cycle_set_as_next_toast"))}
                >
                  <CornerDownRight /> {st("cycle_set_as_next")}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                onSelect={() =>
                  commands.scheduleOn(day, { subjectId: block.subjectId, minutes: block.minutes, start: day, repeat: "weekly" }, block.itemId)
                }
              >
                <Pin /> {st("agenda_fix_item")}
              </MenuItem>
              <MenuItem
                destructive
                onSelect={() =>
                  planId &&
                  void run(
                    () => actions.editCycleItems(planId, (items) => items.filter((item) => item.id !== block.itemId)),
                    st("cycle_removed_toast")
                  )
                }
              >
                <Trash2 /> {st("cycle_remove_block")}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </li>
  );
}

function ReviewItem({ review, late }: { review: StudyReview; late: boolean }) {
  const { st } = useStudyT();
  const router = useRouter();
  const { subjectById, topicById, actions, today } = useStudy();
  const startFocus = useStartFocus();
  const subject = subjectById(review.subjectId);
  const topic = topicById(review.subjectId, review.topicId);
  const name = subject?.name ?? st("untitled_subject");

  const resolve = async (status: "done" | "ignored") => {
    try {
      await actions.resolveReviews([review.id], status);
      toast.success(st(status === "done" ? "review_done_toast" : "review_ignored_toast", { count: 1 }));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <li>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            title={topic ? `${name} · ${topic.name}` : name}
            className="flex w-full min-w-0 items-center gap-2 rounded-[7px] px-1.5 py-1 text-left text-[11.5px] transition hover:bg-[var(--surface-hover)] data-[state=open]:bg-[var(--surface-hover)]"
          >
            <span aria-hidden className="size-[9px] shrink-0 rounded-full border-2" style={{ borderColor: subject?.color ?? "var(--text-faint)" }} />
            <span className={cn("min-w-0 flex-1 truncate", late ? "text-[var(--band-low)]" : "text-muted")}>{name}</span>
            <span className="shrink-0 tabular-nums text-faint">+{review.intervalDays}</span>
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <div className="px-2 pb-2 pt-1.5">
            <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink">{topic?.name ?? name}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {topic ? `${name} · ` : ""}
              {st("review_interval", { count: review.intervalDays })}
              {late ? (
                <span className="text-[var(--band-low)]"> · {st("review_late_by", { count: diffDays(review.dueDay, today) })}</span>
              ) : null}
            </p>
          </div>
          <MenuSeparator />
          <MenuItem onSelect={() => startFocus({ subjectId: review.subjectId, topicId: review.topicId, reviewId: review.id })}>
            <Timer /> {st("review_start")}
          </MenuItem>
          <MenuItem onSelect={() => void resolve("done")}>
            <Check /> {st("review_complete")}
          </MenuItem>
          <MenuItem onSelect={() => void resolve("ignored")}>
            <EyeOff /> {st("review_ignore")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => router.push("/home/study/reviews")}>
            <ArrowUpRight /> {st("review_open_page")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

function ReminderItem({ reminder, onOpen }: { reminder: StudyReminder; onOpen: (reminder: StudyReminder) => void }) {
  const Icon = reminder.kind === "exam" ? Flag : reminder.kind === "event" ? CalendarDays : Bell;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(reminder)}
        title={reminder.title}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-[7px] px-1.5 py-1 text-left text-[11.5px] transition hover:bg-[var(--surface-hover)]"
      >
        <Icon className={cn("size-3 shrink-0", reminder.kind === "exam" ? "text-[var(--band-low)]" : "text-faint")} />
        <span className="min-w-0 flex-1 truncate text-muted">{reminder.title}</span>
      </button>
    </li>
  );
}

function MonthView({
  days,
  byDay,
  layers,
  month,
  onOpenDay,
}: {
  days: DayKey[];
  byDay: Map<DayKey, DayData>;
  layers: ScheduleLayers;
  month: DayKey;
  onOpenDay: (day: DayKey) => void;
}) {
  const { locale } = useStudyT();
  const { settings } = useStudy();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {orderedWeekdays(settings.weekStartsOn).map((weekday) => (
          <span key={weekday} className="truncate px-1 py-2 text-center text-[10.5px] font-medium text-faint sm:px-2 sm:text-[11.5px]">
            {capitalizeFirst(weekdayLabel(weekday, locale, "short").replace(".", ""))}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <MonthCell
            key={day}
            day={day}
            data={byDay.get(day)}
            layers={layers}
            outside={day.slice(0, 7) !== month.slice(0, 7)}
            onOpen={() => onOpenDay(day)}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  data,
  layers,
  outside,
  onOpen,
}: {
  day: DayKey;
  data?: DayData;
  layers: ScheduleLayers;
  outside: boolean;
  onOpen: () => void;
}) {
  const { st, locale } = useStudyT();
  const { today, subjectById } = useStudy();
  const blocks = layers.plan ? (data?.blocks ?? []) : [];
  const reviews = layers.reviews ? (data?.reviews.length ?? 0) : 0;
  const tasks = layers.tasks ? (data?.tasks ?? []).filter((task) => !task.done).length + (data?.reminders.length ?? 0) : 0;
  const visible = blocks.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}
      className={cn(
        "flex min-h-[4.5rem] min-w-0 flex-col gap-1 border-b border-r border-[var(--border)] p-1 text-left transition hover:bg-[var(--surface-hover)] sm:p-1.5 @2xl:min-h-[6.75rem] [&:nth-child(7n)]:border-r-0",
        outside && "bg-[color-mix(in_oklab,var(--surface-2)_45%,transparent)]"
      )}
    >
      <span className="flex items-center gap-1">
        <span
          className={cn(
            "flex h-5 w-5 min-w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums sm:h-6 sm:w-6 sm:min-w-6 sm:px-1 sm:text-[12px]",
            day === today ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : outside ? "text-faint" : "text-ink"
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
        {data?.exam ? <Flag className="size-3.5 text-[var(--band-low)]" aria-label={st("reminder_kind_exam")} /> : null}
      </span>
      <span className="hidden min-w-0 flex-col gap-0.5 @2xl:flex">
        {visible.map((block) => {
          const subject = subjectById(block.subjectId);
          return (
            <span
              key={block.key}
              className={cn("flex min-w-0 items-center gap-1.5 text-[11px] text-muted", block.status !== "planned" && "opacity-50")}
            >
              <span aria-hidden className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} />
              <span className="truncate">{subject?.name}</span>
            </span>
          );
        })}
        {blocks.length > visible.length ? (
          <span className="text-[10.5px] text-faint">{st("more_items", { count: blocks.length - visible.length })}</span>
        ) : null}
      </span>
      {blocks.length ? (
        <span aria-hidden className="flex flex-wrap gap-[3px] @2xl:hidden">
          {blocks.slice(0, 6).map((block) => (
            <span
              key={block.key}
              className={cn("size-1.5 rounded-full", block.status !== "planned" && "opacity-40")}
              style={{ backgroundColor: subjectById(block.subjectId)?.color }}
            />
          ))}
        </span>
      ) : null}
      {reviews || tasks ? (
        <span className="mt-auto flex flex-wrap items-center gap-x-2 text-[10.5px] tabular-nums text-faint">
          {reviews ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-[7px] rounded-full border-[1.5px] border-current" />
              {reviews}
            </span>
          ) : null}
          {tasks ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-[7px] rounded-[2px] border-[1.5px] border-current" />
              {tasks}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function CycleSequence({
  cycle,
  progress,
  onReconfigure,
}: {
  cycle: StudyCycle;
  progress: RoundProgress;
  onReconfigure: (mode?: WizardMode) => void;
}) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const { planSubjects, subjectById, settings, today, actions } = useStudy();
  const commands = useScheduleCommands();
  const { summary } = useAgendaLabels();
  const [order, setOrder] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftMinutes, setDraftMinutes] = useState(60);
  const [draftDay, setDraftDay] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const planId = cycle.planId;
  const stateOf = new Map(cycle.items.map((item, index) => [item.id, progress.states[index]]));
  const byId = new Map(cycle.items.map((item) => [item.id, item]));
  const items = order ? order.map((id) => byId.get(id)).filter((item): item is CycleItem => Boolean(item)) : cycle.items;
  const total = cycle.items.reduce((sum, item) => sum + item.minutes, 0);
  const subjectId = planSubjects.some((subject) => subject.id === draftSubject) ? draftSubject : (planSubjects[0]?.id ?? "");
  const showAdd = adding || !items.length;
  const fixed = cycle.agenda
    .map((entry) => ({ entry, next: nextOccurrence(entry, today) }))
    .filter((row): row is { entry: AgendaEntry; next: DayKey } => Boolean(row.next))
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : 0));

  const run = async (task: () => Promise<void>) => {
    try {
      await task();
      return true;
    } catch {
      toast.error(st("error_generic"));
      return false;
    }
  };
  const edit = (change: (list: CycleItem[]) => CycleItem[]) => run(() => actions.editCycleItems(planId, change));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    void edit((list) => sortByIds(list, next)).finally(() => setOrder(null));
  };

  const move = (id: string, direction: -1 | 1) =>
    void edit((list) => {
      const index = list.findIndex((entry) => entry.id === id);
      const target = index + direction;
      return index < 0 || target < 0 || target >= list.length ? list : arrayMove(list, index, target);
    });

  const duplicate = (id: string) =>
    void edit((list) => {
      const index = list.findIndex((entry) => entry.id === id);
      if (index < 0) return list;
      const copy = [...list];
      copy.splice(index + 1, 0, { ...list[index], id: "" });
      return copy;
    });

  const setMinutes = (id: string, minutes: number) =>
    void edit((list) => list.map((entry) => (entry.id === id ? { ...entry, minutes } : entry)));

  const setNext = async (id: string) => {
    if (await run(() => actions.setCyclePointer(planId, id))) toast.success(st("cycle_set_as_next_toast"));
  };

  const remove = async (item: CycleItem, index: number) => {
    const wasCurrent = stateOf.get(item.id) === "current";
    if (!(await edit((list) => list.filter((entry) => entry.id !== item.id)))) return;
    toast.success(st("cycle_removed_toast"), {
      action: {
        label: st("undo"),
        onClick: () =>
          void run(async () => {
            await actions.editCycleItems(planId, (list) => {
              if (list.some((entry) => entry.id === item.id)) return list;
              const copy = [...list];
              copy.splice(Math.min(index, copy.length), 0, item);
              return copy;
            });
            if (wasCurrent) await actions.setCyclePointer(planId, item.id);
          }),
      },
    });
  };

  const add = async () => {
    if (!subjectId) return;
    if (draftDay) {
      const draft: AgendaDraft = {
        subjectId,
        minutes: draftMinutes,
        start: nextWeekday(today, Number(draftDay)),
        repeat: "weekly",
        weekdays: [],
        topicId: null,
      };
      if (await run(() => actions.editAgenda(planId, (agenda) => upsertAgendaEntry(agenda, makeAgendaEntry(draft))))) {
        toast.success(st("agenda_saved"));
      }
      return;
    }
    void edit((list) => [...list, { id: "", subjectId, minutes: draftMinutes }]);
  };

  const undo = async () => {
    if (await run(() => actions.undoCycleBlock(planId))) toast.success(st("cycle_undone_toast"));
  };

  const selectClass =
    "h-8 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12.5px] text-ink outline-none transition focus:border-[var(--accent)]";

  return (
    <section className={cn(SHEET, "flex min-w-0 flex-col")}>
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2.5 pt-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{st("cycle_sequence_title")}</h2>
        {cycle.items.length ? (
          <span className="shrink-0 text-[12px] tabular-nums text-faint">
            {st("cycle_blocks_count", { count: cycle.items.length })} · {duration(total * 60)}
          </span>
        ) : null}
      </div>

      {items.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ol className="max-h-[27rem] space-y-0.5 overflow-y-auto px-2">
              {items.map((item, index) => (
                <SequenceRow
                  key={item.id}
                  item={item}
                  index={index}
                  count={items.length}
                  state={stateOf.get(item.id) ?? "pending"}
                  onSetNext={() => void setNext(item.id)}
                  onMove={(direction) => move(item.id, direction)}
                  onDuplicate={() => duplicate(item.id)}
                  onFix={() => commands.scheduleOn(null, { subjectId: item.subjectId, minutes: item.minutes, repeat: "weekly" }, item.id)}
                  onRemove={() => void remove(item, index)}
                  onMinutes={(minutes) => setMinutes(item.id, minutes)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="px-5 pb-1 text-[12.5px] text-faint">{st("cycle_empty")}</p>
      )}

      <div className="px-2 pb-2 pt-1">
        {!planSubjects.length ? (
          <div className="space-y-2 px-3 py-1.5">
            <p className="text-[12px] text-muted">{st("cycle_no_subjects_warning")}</p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/home/study/subjects")}>
              <BookOpen />
              {st("cycle_add_subjects_cta")}
            </Button>
          </div>
        ) : showAdd ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
            className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-1.5 rounded-[12px] bg-[var(--surface-2)] p-1.5"
          >
            <select
              aria-label={st("col_subject")}
              value={subjectId}
              onChange={(event) => setDraftSubject(event.target.value)}
              className={cn(selectClass, "col-span-2 min-w-0")}
            >
              {planSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name || st("untitled_subject")}
                </option>
              ))}
            </select>
            <select
              aria-label={st("agenda_day")}
              value={draftDay}
              onChange={(event) => {
                if (event.target.value === "more") {
                  commands.scheduleOn(null, { subjectId, minutes: draftMinutes });
                  return;
                }
                setDraftDay(event.target.value);
              }}
              className={cn(selectClass, "min-w-0")}
            >
              <option value="">{st("agenda_no_day")}</option>
              <optgroup label={st("agenda_every_week")}>
                {orderedWeekdays(settings.weekStartsOn).map((weekday) => (
                  <option key={weekday} value={String(weekday)}>
                    {capitalizeFirst(weekdayLabel(weekday, locale, "long"))}
                  </option>
                ))}
              </optgroup>
              <option value="more">{st("agenda_more_options")}</option>
            </select>
            <select
              aria-label={st("col_time")}
              value={draftMinutes}
              onChange={(event) => setDraftMinutes(Number(event.target.value))}
              className={cn(selectClass, "tabular-nums")}
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {duration(minutes * 60)}
                </option>
              ))}
            </select>
            <div className="col-span-2 flex items-center justify-end gap-1">
              {items.length ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={st("close")} onClick={() => setAdding(false)}>
                  <X />
                </Button>
              ) : null}
              <Button type="submit" variant="primary" size="sm" className="h-8" disabled={!subjectId}>
                <Plus />
                {st("add")}
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <Plus className="size-3.5" />
            {st("cycle_add_block")}
          </button>
        )}
      </div>

      <div className="border-t border-[var(--border)] px-2 pb-2 pt-2.5">
        <div className="flex items-center justify-between gap-2 pl-3 pr-1">
          <h3 className="text-[13px] font-semibold text-ink">{st("agenda_section")}</h3>
          {planSubjects.length ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={st("agenda_title_new")}
              title={st("agenda_title_new")}
              onClick={() => commands.scheduleOn(null)}
            >
              <CalendarPlus />
            </Button>
          ) : null}
        </div>
        {fixed.length ? (
          <ul className="mt-1 space-y-0.5">
            {fixed.map(({ entry }) => {
              const subject = subjectById(entry.subjectId);
              const name = subject?.name ?? st("untitled_subject");
              return (
                <li key={entry.id} className="group/fixed flex items-center gap-2 rounded-[10px] py-1 pl-2 pr-1 transition hover:bg-[var(--surface-hover)]">
                  <span aria-hidden className="h-7 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }} />
                  <button type="button" onClick={() => commands.editAgenda(entry, null)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[12.5px] text-ink">{name}</span>
                    <span className="block truncate text-[11px] text-faint">{summary(entry)}</span>
                  </button>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted">{duration(entry.minutes * 60)}</span>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${st("more_actions")}: ${name}`}
                        className="size-6 opacity-0 group-hover/fixed:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuItem onSelect={() => commands.editAgenda(entry, null)}>
                        <Pencil /> {st("edit")}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive onSelect={() => commands.deleteAgenda(entry, null)}>
                        <Trash2 /> {st("delete")}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 pb-1 pt-1 text-[12px] leading-relaxed text-faint">{st("agenda_section_hint")}</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-1 border-t border-[var(--border)] px-2 py-1.5">
        {cycle.history.length ? (
          <Button variant="ghost" size="sm" onClick={() => void undo()} title={st("cycle_undo")} aria-label={st("cycle_undo")}>
            <Undo2 />
            {st("undo")}
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={() => onReconfigure("manual")}>
          <SlidersHorizontal />
          {st("schedule_reconfigure")}
        </Button>
      </div>
    </section>
  );
}

function SequenceRow({
  item,
  index,
  count,
  state,
  onSetNext,
  onMove,
  onDuplicate,
  onFix,
  onRemove,
  onMinutes,
}: {
  item: CycleItem;
  index: number;
  count: number;
  state: LapState;
  onSetNext: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onFix: () => void;
  onRemove: () => void;
  onMinutes: (minutes: number) => void;
}) {
  const { st, duration } = useStudyT();
  const { subjectById } = useStudy();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const subject = subjectById(item.subjectId);
  const name = subject?.name ?? st("untitled_subject");
  const finished = state === "done" || state === "skipped";
  const minutesOptions = DURATIONS.includes(item.minutes) ? DURATIONS : [...DURATIONS, item.minutes].sort((a, b) => a - b);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/row relative flex items-center gap-2 rounded-[10px] py-0.5 pl-1 pr-1 text-[12.5px] transition-colors",
        state === "current" ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]",
        isDragging && "z-10 bg-[var(--surface)] shadow-[var(--shadow-float)]"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${st("drag_to_reorder")}: ${name}`}
        className="relative flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-[11px] tabular-nums text-faint outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing"
      >
        <span className="transition-opacity group-hover/row:opacity-0">
          {state === "done" ? (
            <Check className="size-3.5 text-[var(--accent)]" strokeWidth={2.5} />
          ) : state === "skipped" ? (
            <SkipForward className="size-3" />
          ) : (
            index + 1
          )}
        </span>
        <GripVertical className="absolute size-3.5 opacity-0 transition-opacity group-hover/row:opacity-100" />
      </button>
      <span
        aria-hidden
        className="h-4 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: subject?.color ?? "var(--border-strong)", opacity: finished ? 0.4 : 1 }}
      />
      <span
        title={state === "done" ? st("cycle_state_done") : state === "skipped" ? st("cycle_state_skipped") : name}
        className={cn("min-w-0 flex-1 truncate", state === "current" ? "font-semibold text-ink" : finished ? "text-muted" : "text-ink")}
      >
        {name}
      </span>
      <select
        aria-label={`${st("col_time")}: ${name}`}
        value={item.minutes}
        onChange={(event) => onMinutes(Number(event.target.value))}
        className="h-7 shrink-0 cursor-pointer appearance-none rounded-[6px] bg-transparent px-1.5 text-[11.5px] tabular-nums text-muted outline-none transition [text-align-last:right] hover:bg-[var(--surface-2)] hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {minutesOptions.map((minutes) => (
          <option key={minutes} value={minutes}>
            {duration(minutes * 60)}
          </option>
        ))}
      </select>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${st("more_actions")}: ${name}`}
            className="size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          {state !== "current" ? (
            <>
              <MenuItem onSelect={onSetNext}>
                <CornerDownRight /> {st("cycle_set_as_next")}
              </MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          <MenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUp /> {st("cycle_move_up")}
          </MenuItem>
          <MenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
            <ArrowDown /> {st("cycle_move_down")}
          </MenuItem>
          <MenuItem onSelect={onDuplicate}>
            <Copy /> {st("cycle_duplicate")}
          </MenuItem>
          <MenuItem onSelect={onFix}>
            <Pin /> {st("agenda_fix_item")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onSelect={onRemove}>
            <Trash2 /> {st("cycle_remove_block")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}
