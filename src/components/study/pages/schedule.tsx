"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListPlus,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi, type ScheduleLayers } from "@/lib/study/ui-store";
import {
  addDays,
  addMonths,
  formatDay,
  monthGrid,
  monthLabel,
  orderedWeekdays,
  startOfMonth,
  capitalizeFirst,
  startOfWeek,
  weekDays,
  weekdayLabel,
  weekdayOf,
} from "@/lib/study/dates";
import { projectSchedule, roundProgress, type PlannedBlock } from "@/lib/study/cycle";
import type { PlanningTask } from "@/lib/study/planning-bridge";
import { usePlanning } from "@/lib/study/planning";
import type { DayKey, StudyReminder, StudyReview, StudySession } from "@/types/study";
import { Meter } from "../charts";
import { CycleWizard } from "../cycle-wizard";
import { FocusButton, StudyHeader, StudyLoading, StudyPage, SubjectDot } from "../ui";
import { TaskDialog, TaskLine, TasksPanel, type TaskDialogState } from "../tasks";

export function SchedulePage() {
  const { ready } = useStudy();
  if (!ready) return <StudyLoading />;
  return <ScheduleBody />;
}

interface DayData {
  blocks: PlannedBlock[];
  reviews: StudyReview[];
  sessions: StudySession[];
  tasks: PlanningTask[];
  reminders: StudyReminder[];
  exam: boolean;
}

const LAYER_KEYS: { key: keyof ScheduleLayers; label: "layer_plan" | "layer_reviews" | "layer_sessions" | "layer_tasks" }[] = [
  { key: "plan", label: "layer_plan" },
  { key: "reviews", label: "layer_reviews" },
  { key: "sessions", label: "layer_sessions" },
  { key: "tasks", label: "layer_tasks" },
];

function ScheduleBody() {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const params = useSearchParams();
  const { planCycle, planReviews, planSessions, planSubjects, reminders, settings, today, actions, activePlan } = useStudy();
  const { tasks } = usePlanning();
  const view = useStudyUi((state) => state.scheduleView);
  const layers = useStudyUi((state) => state.scheduleLayers);
  const [anchor, setAnchor] = useState(today);
  const [wizardOpen, setWizardOpen] = useState(params.get("setup") === "1");
  const [wizardMode, setWizardMode] = useState<"manual" | "auto">("manual");
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({ open: false, task: null, day: null });

  useEffect(() => {
    if (params.get("setup") === "1") router.replace("/home/study/schedule");
  }, [params, router]);

  const days = useMemo(
    () => (view === "week" ? weekDays(startOfWeek(anchor, settings.weekStartsOn)) : monthGrid(anchor, settings.weekStartsOn)),
    [anchor, settings.weekStartsOn, view]
  );
  const from = days[0];
  const to = days[days.length - 1];

  const byDay = useMemo(() => {
    const map = new Map<DayKey, DayData>();
    for (const day of days) map.set(day, { blocks: [], reviews: [], sessions: [], tasks: [], reminders: [], exam: false });
    if (planCycle) {
      for (const [day, blocks] of projectSchedule(planCycle, from, to, today)) map.get(day)?.blocks.push(...blocks);
    }
    for (const review of planReviews) {
      if (review.status !== "pending") continue;
      map.get(review.dueDay)?.reviews.push(review);
    }
    for (const session of planSessions) map.get(session.day)?.sessions.push(session);
    for (const task of tasks) if (task.day) map.get(task.day)?.tasks.push(task);
    for (const reminder of reminders) {
      if (reminder.done || (reminder.planId && reminder.planId !== activePlan?.id)) continue;
      map.get(reminder.day)?.reminders.push(reminder);
    }
    if (activePlan?.examDate) {
      const entry = map.get(activePlan.examDate);
      if (entry) entry.exam = true;
    }
    return map;
  }, [activePlan, days, from, planCycle, planReviews, planSessions, reminders, tasks, to, today]);

  const shift = (direction: number) =>
    setAnchor((value) => (view === "week" ? addDays(value, direction * 7) : addMonths(value, direction)));

  const title =
    view === "week"
      ? `${formatDay(from, locale, { day: "numeric", month: "short" })} – ${formatDay(to, locale, { day: "numeric", month: "short", year: "numeric" })}`
      : capitalizeFirst(monthLabel(startOfMonth(anchor), locale));

  const openTask = (task: PlanningTask) => setTaskDialog({ open: true, task, day: task.day });
  const newTask = (day: DayKey | null) => setTaskDialog({ open: true, task: null, day });

  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_schedule")}
        subtitle={st("schedule_subtitle")}
        showGoal={Boolean(activePlan)}
        actions={
          <>
            <Button variant="secondary" onClick={() => newTask(today)}>
              <ListPlus />
              {st("task_new")}
            </Button>
            {planCycle && activePlan ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setWizardMode("manual");
                    setWizardOpen(true);
                  }}
                >
                  <RefreshCcw />
                  {st("schedule_reconfigure")}
                </Button>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="secondary" size="icon" aria-label={st("more_actions")}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem
                      onSelect={() => {
                        setWizardMode("auto");
                        setWizardOpen(true);
                      }}
                    >
                      <Sparkles /> {st("schedule_setup_auto")}
                    </MenuItem>
                    <MenuItem
                      destructive
                      onSelect={async () => {
                        if (!window.confirm(st("schedule_remove_confirm"))) return;
                        await actions.deleteCycle(activePlan.id);
                        toast.success(st("schedule_removed"));
                      }}
                    >
                      <Trash2 /> {st("schedule_remove")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label={st("prev_period")} onClick={() => shift(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={st("next_period")} onClick={() => shift(1)}>
                <ChevronRight />
              </Button>
            </div>
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              {st("today")}
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {LAYER_KEYS.map((layer) => (
                <button
                  key={layer.key}
                  type="button"
                  aria-pressed={layers[layer.key]}
                  onClick={() => useStudyUi.getState().setScheduleLayer(layer.key, !layers[layer.key])}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition",
                    layers[layer.key] ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-ink" : "border-[var(--border)] text-faint"
                  )}
                >
                  <LayerGlyph layer={layer.key} active={layers[layer.key]} />
                  {st(layer.label)}
                </button>
              ))}
              <div className="ml-1 inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
                {(["week", "month"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => useStudyUi.getState().setScheduleView(mode)}
                    className={cn(
                      "h-6 rounded-[6px] px-2 text-[11.5px] font-medium transition",
                      view === mode ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
                    )}
                  >
                    {mode === "week" ? st("schedule_week") : st("schedule_month")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "week" ? (
            <div className="grid grid-cols-1 divide-y divide-[var(--border)] lg:grid-cols-7 lg:divide-x lg:divide-y-0">
              {days.map((day) => (
                <WeekColumn
                  key={day}
                  day={day}
                  data={byDay.get(day)}
                  layers={layers}
                  capacity={planCycle?.weekMinutes[weekdayOf(day)] ?? 0}
                  onOpenTask={openTask}
                  onNewTask={newTask}
                />
              ))}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 border-b border-[var(--border)]">
                {orderedWeekdays(settings.weekStartsOn).map((weekday) => (
                  <span key={weekday} className="px-2 py-2 text-center text-[11px] font-medium text-faint">
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
                    outside={day.slice(0, 7) !== startOfMonth(anchor).slice(0, 7)}
                    onOpen={() => {
                      setAnchor(day);
                      useStudyUi.getState().setScheduleView("week");
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          <div className="min-w-0 max-lg:order-first">
            <TasksPanel onOpen={openTask} />
          </div>
          {planCycle ? (
            <CyclePanel
              onReconfigure={(mode = "manual") => {
                setWizardMode(mode);
                setWizardOpen(true);
              }}
            />
          ) : (
            <section className="relative overflow-hidden rounded-[20px] bg-[var(--surface)] p-5 shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                  <SlidersHorizontal className="size-4" />
                </span>
                <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  {st("cycle_panel_title")}
                </span>
              </div>
              <h3 className="mt-2.5 text-[15px] font-semibold text-ink">
                {activePlan ? st("schedule_empty_title") : st("schedule_no_goal_title")}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {activePlan ? st("schedule_empty_desc") : st("schedule_no_goal_desc")}
              </p>
              {activePlan && planSubjects.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-medium text-faint">
                      {st("subjects_count", { count: planSubjects.length })}:
                    </span>
                    {planSubjects.slice(0, 4).map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-ink">
                        <SubjectDot color={s.color} />
                        <span className="max-w-[80px] truncate">{s.name}</span>
                      </span>
                    ))}
                    {planSubjects.length > 4 ? (
                      <span className="text-[11px] text-faint">+{planSubjects.length - 4}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setWizardMode("manual");
                        setWizardOpen(true);
                      }}
                    >
                      <SlidersHorizontal />
                      {st("schedule_setup_manual")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setWizardMode("auto");
                        setWizardOpen(true);
                      }}
                    >
                      <Sparkles />
                      {st("schedule_setup_auto")}
                    </Button>
                  </div>
                </div>
              ) : activePlan && planSubjects.length === 0 ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-3 text-[12px] text-muted">
                    {st("cycle_no_subjects_warning")}
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => router.push("/home/study/subjects")}
                  >
                    <BookOpen />
                    {st("cycle_add_subjects_cta")}
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-4 w-full"
                  variant="primary"
                  onClick={() => router.push("/home/study/goals/new")}
                >
                  {st("empty_goal_cta")}
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
      {activePlan ? <CycleWizard open={wizardOpen} onOpenChange={setWizardOpen} initialMode={wizardMode} /> : null}
      <TaskDialog state={taskDialog} onOpenChange={(open) => setTaskDialog((value) => ({ ...value, open }))} />
    </StudyPage>
  );
}

function LayerGlyph({ layer, active }: { layer: keyof ScheduleLayers; active: boolean }) {
  const color = active ? "var(--accent)" : "var(--text-faint)";
  if (layer === "plan") return <span className="h-2.5 w-1 rounded-full" style={{ backgroundColor: color }} />;
  if (layer === "reviews") return <span className="size-2 rounded-full border-2" style={{ borderColor: color }} />;
  if (layer === "sessions") return <span className="size-2 rounded-full" style={{ backgroundColor: color }} />;
  return <span className="size-2 rounded-[2px] border" style={{ borderColor: color }} />;
}

function WeekColumn({
  day,
  data,
  layers,
  capacity,
  onOpenTask,
  onNewTask,
}: {
  day: DayKey;
  data?: DayData;
  layers: ScheduleLayers;
  capacity: number;
  onOpenTask: (task: PlanningTask) => void;
  onNewTask: (day: DayKey) => void;
}) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const { today, subjectById, topicById, planCycle, actions } = useStudy();
  const isToday = day === today;
  const past = day < today;
  const blocks = layers.plan ? (data?.blocks ?? []) : [];
  const reviews = layers.reviews ? (data?.reviews ?? []) : [];
  const sessions = layers.sessions ? (data?.sessions ?? []) : [];
  const tasks = layers.tasks ? (data?.tasks ?? []) : [];
  const reminders = layers.tasks ? (data?.reminders ?? []) : [];
  const studied = (data?.sessions ?? []).reduce((sum, session) => sum + session.durationSec, 0);
  const empty = !blocks.length && !reviews.length && !sessions.length && !tasks.length && !reminders.length;

  return (
    <div className={cn("group/day flex min-h-[9rem] flex-col lg:min-h-[26rem]", isToday && "bg-[var(--accent-soft)]/40")}>
      <div className="flex items-center justify-between gap-1 px-3 pb-2 pt-3">
        <span className={cn("text-[12px] font-medium", isToday ? "text-[var(--accent)]" : past ? "text-faint" : "text-muted")}>
          {capitalizeFirst(weekdayLabel(weekdayOf(day), locale, "short").replace(".", ""))}
        </span>
        <button
          type="button"
          onClick={() => onNewTask(day)}
          aria-label={st("task_add_day", { date: formatDay(day, locale, { day: "numeric", month: "long" }) })}
          className="ml-auto flex size-6 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink focus-visible:opacity-100 lg:opacity-0 lg:group-hover/day:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
            isToday ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : past ? "text-faint" : "text-ink"
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 px-2 pb-2">
        {data?.exam ? (
          <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--band-low)_14%,transparent)] px-2 py-1 text-[11.5px] font-semibold text-[var(--band-low)]">
            <Flag className="size-3.5 shrink-0" />
            {st("reminder_kind_exam")}
          </div>
        ) : null}
        {blocks.map((block) => {
          const subject = subjectById(block.subjectId);
          const done = block.status !== "planned";
          return (
            <div
              key={block.key}
              className={cn(
                "group relative flex items-start gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5",
                block.isNext ? "border-[var(--accent)]/60 bg-[var(--surface)] shadow-sm" : "border-[var(--border)] bg-[var(--surface)]",
                done && "opacity-60"
              )}
            >
              <span className="mt-0.5 block h-7 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }} />
              <div className="min-w-0 flex-1">
                <p className={cn("line-clamp-2 hyphens-auto text-[12px] leading-snug text-ink [overflow-wrap:anywhere]", done && "line-through", block.status === "skipped" && "text-faint")}>
                  {subject?.name ?? st("untitled_subject")}
                </p>
                <p className="text-[10.5px] tabular-nums text-faint">{duration(block.minutes * 60)}</p>
              </div>
              {block.isNext ? (
                <div className="absolute right-1 top-1 flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <FocusButton variant="ghost" size="icon-sm" subjectId={block.subjectId} label={st("next_up_start")} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={st("cycle_mark_done")}
                    onClick={async () => {
                      if (!planCycle) return;
                      await actions.completeCycleBlock(planCycle.planId, false);
                      toast.success(st("cycle_done_toast"));
                    }}
                  >
                    <Check />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {reviews.map((review) => {
          const subject = subjectById(review.subjectId);
          const topic = topicById(review.subjectId, review.topicId);
          const late = review.dueDay < today;
          return (
            <button
              key={review.id}
              type="button"
              onClick={() => router.push("/home/study/reviews")}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-[11.5px] transition hover:bg-[var(--surface-hover)]"
              title={topic?.name}
            >
              <span className="size-2 shrink-0 rounded-full border-2" style={{ borderColor: subject?.color ?? "var(--border-strong)" }} />
              <span className={cn("min-w-0 flex-1 truncate", late ? "text-[var(--band-low)]" : "text-muted")}>{subject?.name}</span>
              <span className="shrink-0 tabular-nums text-faint">+{review.intervalDays}</span>
            </button>
          );
        })}
        {sessions.map((session) => {
          const subject = subjectById(session.subjectId);
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => useStudyUi.getState().openLog(null, session.id)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-[11.5px] transition hover:bg-[var(--surface-hover)]"
            >
              <SubjectDot color={subject?.color} />
              <span className="min-w-0 flex-1 truncate text-muted">{subject?.name}</span>
              <span className="shrink-0 tabular-nums text-faint">{session.durationSec ? duration(session.durationSec) : ""}</span>
            </button>
          );
        })}
        {tasks.map((task) => (
          <TaskLine key={task.id} task={task} onOpen={onOpenTask} dense />
        ))}
        {reminders.map((reminder) => (
          <div key={reminder.id} className="flex items-center gap-1.5 px-1.5 py-1 text-[11.5px]" title={reminder.title}>
            <Bell className="size-3 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-muted">{reminder.title}</span>
          </div>
        ))}
        {empty ? <p className="px-1.5 pt-1 text-[11px] text-faint">{capacity ? "" : st("day_free")}</p> : null}
      </div>
      {capacity || studied ? (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-1.5 text-[10.5px] tabular-nums text-faint">
          <span>{studied ? duration(studied) : "–"}</span>
          <span>{capacity ? duration(capacity * 60) : ""}</span>
        </div>
      ) : null}
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
  const { st, duration } = useStudyT();
  const { today, subjectById } = useStudy();
  const blocks = layers.plan ? (data?.blocks ?? []) : [];
  const reviews = layers.reviews ? (data?.reviews.length ?? 0) : 0;
  const tasks = layers.tasks ? [...(data?.tasks ?? []).filter((task) => !task.done), ...(data?.reminders ?? [])] : [];
  const studied = layers.sessions ? (data?.sessions ?? []).reduce((sum, session) => sum + session.durationSec, 0) : 0;
  const visible = blocks.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-[var(--border)] p-1.5 text-left transition hover:bg-[var(--surface-hover)] [&:nth-child(7n)]:border-r-0",
        outside && "bg-[var(--surface-2)]/40"
      )}
    >
      <span className="flex items-center gap-1">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-[11.5px] font-semibold tabular-nums",
            day === today ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : outside ? "text-faint" : "text-ink"
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
        {data?.exam ? <Flag className="size-3.5 text-[var(--band-low)]" aria-label={st("reminder_kind_exam")} /> : null}
      </span>
      {visible.map((block) => {
        const subject = subjectById(block.subjectId);
        return (
          <span key={block.key} className={cn("flex items-center gap-1 truncate text-[10.5px] text-muted", block.status !== "planned" && "line-through opacity-60")}>
            <span className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} />
            <span className="truncate">{subject?.name}</span>
          </span>
        );
      })}
      {blocks.length > visible.length ? <span className="text-[10px] text-faint">{st("more_items", { count: blocks.length - visible.length })}</span> : null}
      <span className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px] tabular-nums text-faint">
        {studied ? <span>{duration(studied)}</span> : null}
        {reviews ? (
          <span className="inline-flex items-center gap-0.5">
            <span className="size-1.5 rounded-full border border-current" />
            {reviews}
          </span>
        ) : null}
        {tasks.length ? (
          <span className="inline-flex items-center gap-0.5">
            <span className="size-1.5 rounded-[1px] border border-current" />
            {tasks.length}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function CyclePanel({ onReconfigure }: { onReconfigure: (mode?: "manual" | "auto") => void }) {
  const { st, duration } = useStudyT();
  const { planCycle, planSubjects, subjectById, actions } = useStudy();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickSubjectId, setQuickSubjectId] = useState(() => planSubjects[0]?.id ?? "");
  const [quickMinutes, setQuickMinutes] = useState(50);
  const [savingQuick, setSavingQuick] = useState(false);

  if (!planCycle) return null;
  const progress = roundProgress(planCycle);
  const current = planCycle.items[planCycle.pointer % Math.max(1, planCycle.items.length)];
  const currentSubject = current ? subjectById(current.subjectId) : undefined;

  const handleQuickAdd = async () => {
    if (!quickSubjectId || !planCycle) return;
    setSavingQuick(true);
    try {
      const newItems = [
        ...planCycle.items,
        {
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          subjectId: quickSubjectId,
          minutes: quickMinutes,
        },
      ];
      await actions.saveCycle(planCycle.planId, {
        subjects: planCycle.subjects,
        weekMinutes: planCycle.weekMinutes,
        minBlock: planCycle.minBlock,
        maxBlock: planCycle.maxBlock,
        items: newItems,
      });
      setQuickAddOpen(false);
      toast.success(st("schedule_saved"));
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSavingQuick(false);
    }
  };

  const handleSetAsNext = async (index: number) => {
    await actions.setCyclePointer(planCycle.planId, index);
    toast.success(st("cycle_set_as_next_toast"));
  };

  const handleMoveBlock = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= planCycle.items.length) return;
    const items = [...planCycle.items];
    const temp = items[index];
    items[index] = items[target];
    items[target] = temp;
    await actions.saveCycle(planCycle.planId, {
      subjects: planCycle.subjects,
      weekMinutes: planCycle.weekMinutes,
      minBlock: planCycle.minBlock,
      maxBlock: planCycle.maxBlock,
      items,
    });
  };

  const handleDeleteBlock = async (index: number) => {
    if (planCycle.items.length <= 1) return;
    const items = planCycle.items.filter((_, idx) => idx !== index);
    await actions.saveCycle(planCycle.planId, {
      subjects: planCycle.subjects,
      weekMinutes: planCycle.weekMinutes,
      minBlock: planCycle.minBlock,
      maxBlock: planCycle.maxBlock,
      items,
    });
  };

  return (
    <aside className="flex min-w-0 flex-col rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13.5px] font-semibold text-ink">{st("cycle_panel_title")}</h2>
          <span className="text-[11.5px] tabular-nums text-muted">{st("cycle_round", { n: planCycle.round + 1 })}</span>
        </div>
        <p className="mt-1 text-[11.5px] text-faint">{st("cycle_progress", { done: progress.done, total: progress.total })}</p>
        <Meter value={progress.minutesDone} max={progress.minutesTotal} className="mt-2" label={st("cycle_panel_title")} />
      </div>

      {current ? (
        <div className="mx-3 mb-3 rounded-[var(--radius-md)] border border-[var(--accent)]/45 bg-[var(--accent-soft)]/50 p-3">
          <p className="text-[11px] font-medium text-[var(--accent)]">{st("next_up_reason_cycle", { n: progress.done + 1, total: progress.total })}</p>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-ink">
            <SubjectDot color={currentSubject?.color} />
            <span className="truncate">{currentSubject?.name ?? st("untitled_subject")}</span>
          </p>
          <p className="text-[12px] tabular-nums text-muted">{duration(current.minutes * 60)}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <FocusButton variant="primary" subjectId={current.subjectId} label={st("next_up_start")} />
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await actions.completeCycleBlock(planCycle.planId, false);
                toast.success(st("cycle_done_toast"));
              }}
            >
              <Check />
              {st("cycle_mark_done")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await actions.completeCycleBlock(planCycle.planId, true);
                toast.success(st("cycle_skipped_toast"));
              }}
            >
              <SkipForward />
              {st("cycle_skip")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="px-4 pb-4 text-[12px] text-faint">{st("cycle_empty")}</p>
      )}

      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
        <span className="text-[11.5px] font-medium text-muted">
          {st("cycle_blocks_count", { count: planCycle.items.length })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQuickAddOpen((prev) => !prev)}
            className="h-7 px-2 text-[11.5px]"
          >
            <Plus />
            {st("cycle_add_block")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReconfigure("manual")}
            className="h-7 px-2 text-[11.5px]"
          >
            <RefreshCcw />
            {st("schedule_reconfigure")}
          </Button>
        </div>
      </div>

      {quickAddOpen ? (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/30 p-2.5">
          <div className="flex flex-col gap-2">
            <select
              value={quickSubjectId}
              onChange={(e) => setQuickSubjectId(e.target.value)}
              className="h-7.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-ink outline-none"
            >
              {planSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <select
                value={quickMinutes}
                onChange={(e) => setQuickMinutes(Number(e.target.value))}
                className="h-7.5 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-ink outline-none"
              >
                {[15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {duration(m * 60)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={savingQuick || !quickSubjectId}
                onClick={() => void handleQuickAdd()}
                className="h-7.5 text-[11.5px]"
              >
                <Plus />
                {st("add")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ol className="max-h-[24rem] flex-1 overflow-y-auto border-t border-[var(--border)] px-2 py-2">
        {planCycle.items.map((item, index) => {
          const subject = subjectById(item.subjectId);
          const done = index < progress.done;
          const active = index === progress.done;
          return (
            <li
              key={item.id}
              className={cn(
                "group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] transition hover:bg-[var(--surface-hover)]",
                active && "bg-[var(--surface-2)] shadow-xs"
              )}
            >
              <span className="w-5 text-right font-mono text-[10.5px] tabular-nums text-faint">{index + 1}</span>
              <span className="block h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color, opacity: done ? 0.4 : 1 }} />
              <span className={cn("min-w-0 flex-1 truncate", done ? "text-faint line-through" : active ? "font-semibold text-ink" : "text-muted")}>
                {subject?.name ?? st("untitled_subject")}
              </span>
              <span className="text-[11px] tabular-nums text-faint">{duration(item.minutes * 60)}</span>

              {!done && !active ? (
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void handleSetAsNext(index)}
                    className="flex size-5.5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                    title={st("cycle_set_as_next")}
                  >
                    <Check className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void handleMoveBlock(index, -1)}
                    className="flex size-5.5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-ink disabled:opacity-20"
                    title={st("cycle_move_up")}
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === planCycle.items.length - 1}
                    onClick={() => void handleMoveBlock(index, 1)}
                    className="flex size-5.5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-ink disabled:opacity-20"
                    title={st("cycle_move_down")}
                  >
                    <ArrowDown className="size-3" />
                  </button>
                  {planCycle.items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteBlock(index)}
                      className="flex size-5.5 items-center justify-center rounded text-muted hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                      title={st("cycle_remove_block")}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {planCycle.history.length ? (
        <div className="border-t border-[var(--border)] px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await actions.undoCycleBlock(planCycle.planId);
              toast.success(st("cycle_undone_toast"));
            }}
          >
            <Undo2 />
            {st("cycle_undo")}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
