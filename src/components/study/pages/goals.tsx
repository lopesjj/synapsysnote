"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, Check, ChevronRight, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { compareDay, diffDays, formatDay } from "@/lib/study/dates";
import { formatNumber } from "@/lib/study/format";
import { goalSummary, goalTimeline, recentWeeks, type GoalSummary, type GoalTimeline } from "@/lib/study/goal-summary";
import type { DayKey, StudyPlan } from "@/types/study";
import { GoalDialog, type GoalField } from "../dialogs";
import { ExamCountdown, ProgressBar, SyllabusSummary, WeekBars, WeekMeter } from "../goal-visuals";
import { GoalMark, StudyHeader, StudyLoading, StudyPage } from "../ui";
import { useGoalGates, usePlanGates } from "@/lib/plans/gates";
import { GateTooltip, PlanLockBadge } from "@/components/plans/plan-lock";

export interface GoalFacts {
  summary: GoalSummary;
  timeline: GoalTimeline;
}

/** Resumo e linha do tempo de cada objetivo, calculados uma vez por mudança nos dados. */
export function useGoalFacts(): Map<string, GoalFacts> {
  const { plans, subjects, sessions, exams, reviews, today, settings } = useStudy();
  return useMemo(() => {
    const map = new Map<string, GoalFacts>();
    for (const plan of plans) {
      map.set(plan.id, {
        summary: goalSummary(plan, { subjects, sessions, exams, reviews }, today, settings),
        timeline: goalTimeline(plan, { subjects, sessions, exams }, today, settings.timeZone),
      });
    }
    return map;
  }, [exams, plans, reviews, sessions, settings, subjects, today]);
}

function examOrder(today: DayKey, activeId: string | null) {
  const rank = (plan: StudyPlan) => {
    if (plan.id === activeId) return 0;
    if (!plan.examDate) return 2;
    return compareDay(plan.examDate, today) >= 0 ? 1 : 3;
  };
  return (a: StudyPlan, b: StudyPlan) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    if (rank(a) === 1) return compareDay(a.examDate!, b.examDate!);
    if (rank(a) === 3) return compareDay(b.examDate!, a.examDate!);
    return a.order - b.order;
  };
}

/** Painel com borda sutil, a superfície onde vivem as listas destas páginas. */
export const PANEL = "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]";

export function GoalsPage() {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const { ready, plans, activePlan, today } = useStudy();
  const goalGates = useGoalGates();
  const facts = useGoalFacts();
  const [dialog, setDialog] = useState<{ plan: StudyPlan | null; focus: GoalField }>({ plan: null, focus: "name" });

  const live = useMemo(() => plans.filter((plan) => !plan.archived).sort(examOrder(today, activePlan?.id ?? null)), [activePlan?.id, plans, today]);
  const archived = useMemo(() => plans.filter((plan) => plan.archived).sort((a, b) => b.updatedAt - a.updatedAt), [plans]);
  const featured = live.find((plan) => plan.id === activePlan?.id) ?? null;
  const others = live.filter((plan) => plan !== featured);

  if (!ready) return <StudyLoading />;

  const summaryLine = (() => {
    if (!live.length) return archived.length ? st("goals_summary_only_archived", { count: archived.length }) : st("goals_summary_empty");
    const upcoming = live.filter((plan) => plan.examDate && compareDay(plan.examDate, today) >= 0).sort((a, b) => compareDay(a.examDate!, b.examDate!))[0];
    if (!upcoming?.examDate) return st("goals_summary_undated", { count: live.length });
    const name = upcoming.institution || upcoming.name || st("untitled_goal");
    const days = diffDays(today, upcoming.examDate);
    if (days === 0) return st("goals_summary_today", { count: live.length, name });
    return st("goals_summary_next", { count: live.length, days, name, date: formatDay(upcoming.examDate, locale, { day: "numeric", month: "short" }) });
  })();

  const openDialog = (plan: StudyPlan, focus: GoalField = "name") => setDialog({ plan, focus });

  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_goals")}
        subtitle={summaryLine}
        showGoal={false}
        showLog={false}
        actions={
          <GateTooltip gate={goalGates.newGoal}>
            <Button
              variant="primary"
              disabled={!goalGates.newGoal.allowed}
              onClick={() => router.push("/home/study/goals/new")}
            >
              {goalGates.newGoal.allowed ? <Plus /> : <Lock />}
              {st("goal_switch_new")}
            </Button>
          </GateTooltip>
        }
      />
      <div className="@container/goals">
        {live.length ? (
          <>
            {featured && facts.get(featured.id) ? <FeaturedGoal plan={featured} fact={facts.get(featured.id)!} onEdit={openDialog} /> : null}
            {others.length ? (
              <section className={featured ? "mt-8" : undefined}>
                {featured ? <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.015em] text-ink">{st("goals_others")}</h2> : null}
                <GoalTable plans={others} facts={facts} onEdit={openDialog} />
              </section>
            ) : null}
          </>
        ) : (
          <EmptyGoals />
        )}
        {archived.length ? <ArchivedGoals plans={archived} facts={facts} onEdit={openDialog} /> : null}
      </div>
      <GoalDialog
        open={Boolean(dialog.plan)}
        onOpenChange={(open) => (open ? null : setDialog((value) => ({ ...value, plan: null })))}
        plan={dialog.plan}
        focus={dialog.focus}
      />
    </StudyPage>
  );
}

const FEATURE_CELLS = [
  "",
  "border-t @3xl/goals:border-l @3xl/goals:border-t-0",
  "border-t @5xl/goals:border-l @5xl/goals:border-t-0",
  "border-t @3xl/goals:border-l @5xl/goals:border-t-0",
];

function FeatureCell({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 border-[var(--border)] px-5 py-4", FEATURE_CELLS[index])}>
      <h3 className="mb-3 text-[12.5px] font-medium text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Objetivo ativo em destaque: prova, edital, semana e ritmo lado a lado. */
function FeaturedGoal({ plan, fact, onEdit }: { plan: StudyPlan; fact: GoalFacts; onEdit: (plan: StudyPlan, focus?: GoalField) => void }) {
  const { st, textDir, duration, language } = useStudyT();
  const { today, settings } = useStudy();
  const { summary, timeline } = fact;
  const weeks = useMemo(() => recentWeeks(timeline, today, settings.weekStartsOn), [settings.weekStartsOn, timeline, today]);
  const name = plan.name || st("untitled_goal");
  const subtitle = [plan.institution, plan.role].filter(Boolean).join(" · ");
  const studied = summary.subjects.reduce((sum, entry) => sum + entry.studied, 0);
  const hasHistory = weeks.some((week) => week.minutes > 0);
  return (
    <section className={PANEL} aria-label={name}>
      <div className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-hover)]">
        <GoalMark icon={plan.icon} name={name} seed={plan.id} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              href={`/home/study/goals/${plan.id}`}
              dir={textDir}
              className="line-clamp-2 min-w-0 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-ink outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 focus-visible:underline"
            >
              {name}
            </Link>
            <ActiveMark />
          </div>
          {subtitle ? (
            <p dir={textDir} className="truncate text-[13px] text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-[13px] text-muted transition group-hover:text-ink @xl/goals:inline-flex">
          {st("goals_view_details")}
          <ChevronRight className="size-3.5" />
        </span>
        <GoalActionsMenu plan={plan} onEdit={() => onEdit(plan)} triggerClassName="relative z-10" />
      </div>
      <div className="grid grid-cols-1 border-t border-[var(--border)] @3xl/goals:grid-cols-2 @5xl/goals:grid-cols-4">
        <FeatureCell index={0} title={st("goal_prop_exam")}>
          <ExamCountdown plan={plan} startDay={timeline.goalStart} onSetDate={() => onEdit(plan, "examDate")} />
        </FeatureCell>
        <FeatureCell index={1} title={st("goal_col_syllabus")}>
          <SyllabusSummary done={summary.coverage.done} studied={studied} total={summary.coverage.total} />
        </FeatureCell>
        <FeatureCell index={2} title={st("goals_this_week")}>
          <div className="space-y-3">
            <WeekMeter
              label={st("col_time")}
              value={duration(summary.weekMinutes * 60)}
              goal={plan.weeklyGoalMinutes ? duration(plan.weeklyGoalMinutes * 60) : null}
              ratio={plan.weeklyGoalMinutes ? summary.weekMinutes / plan.weeklyGoalMinutes : null}
            />
            <WeekMeter
              label={st("questions_label")}
              value={formatNumber(summary.weekQuestions, language)}
              goal={plan.weeklyGoalQuestions ? formatNumber(plan.weeklyGoalQuestions, language) : null}
              ratio={plan.weeklyGoalQuestions ? summary.weekQuestions / plan.weeklyGoalQuestions : null}
            />
          </div>
        </FeatureCell>
        <FeatureCell index={3} title={st("goals_col_pace")}>
          {hasHistory ? (
            <WeekBars weeks={weeks} goalMinutes={plan.weeklyGoalMinutes} height={56} labels />
          ) : (
            <p className="text-[13px] text-muted">{st("goal_pace_empty")}</p>
          )}
        </FeatureCell>
      </div>
    </section>
  );
}

const TABLE_GRID =
  "@3xl/goals:grid @3xl/goals:grid-cols-[minmax(0,1fr)_10rem_8.5rem_2rem] @3xl/goals:items-center @3xl/goals:gap-x-6 @4xl/goals:grid-cols-[minmax(0,1fr)_10rem_8rem_8.5rem_2rem] @5xl/goals:grid-cols-[minmax(0,1fr)_10rem_6.5rem_8rem_8.5rem_2rem]";

function GoalTable({ plans, facts, onEdit }: { plans: StudyPlan[]; facts: Map<string, GoalFacts>; onEdit: (plan: StudyPlan, focus?: GoalField) => void }) {
  const newGoalGate = useGoalGates().newGoal;
  const { st } = useStudyT();
  return (
    <div className={PANEL}>
      <div className={cn("hidden h-9 border-b border-[var(--border)] px-4 text-[12px] text-muted", TABLE_GRID)}>
        <span>{st("goals_col_goal")}</span>
        <span>{st("goal_col_syllabus")}</span>
        <span className="hidden @5xl/goals:block" title={st("goals_pace_hint")}>
          {st("goals_col_pace")}
        </span>
        <span className="hidden @4xl/goals:block">{st("goals_this_week")}</span>
        <span>{st("goal_prop_exam")}</span>
        <span />
      </div>
      <ul>
        {plans.map((plan) => {
          const fact = facts.get(plan.id);
          return fact ? <GoalRow key={plan.id} plan={plan} fact={fact} onEdit={onEdit} /> : null;
        })}
      </ul>
      {newGoalGate.allowed ? (
        <Link
          href="/home/study/goals/new"
          className="flex h-11 items-center gap-2 border-t border-[var(--border)] px-4 text-[13px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Plus className="size-3.5" />
          {st("goal_switch_new")}
        </Link>
      ) : (
        <div
          aria-disabled="true"
          title={newGoalGate.reason ?? undefined}
          className="flex min-h-11 cursor-not-allowed flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-[var(--border)] px-4 py-2 text-[13px] text-faint"
        >
          <Lock className="size-3.5" />
          <span>{st("goal_switch_new")}</span>
          {newGoalGate.reason ? <span className="w-full text-[11.5px] leading-snug">{newGoalGate.reason}</span> : null}
        </div>
      )}
    </div>
  );
}

function ActiveMark() {
  const { st } = useStudyT();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[var(--accent)]">
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--accent)]" />
      {st("goal_status_active")}
    </span>
  );
}

function ExamCell({ plan, onSetDate, align = "start" }: { plan: StudyPlan; onSetDate: () => void; align?: "start" | "end" }) {
  const { st, locale } = useStudyT();
  const { today } = useStudy();
  if (!plan.examDate) {
    return (
      <button
        type="button"
        onClick={onSetDate}
        className="relative z-10 text-[13px] text-muted underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
      >
        {st("goals_set_date")}
      </button>
    );
  }
  const days = diffDays(today, plan.examDate);
  const date = formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" });
  return (
    <span className={cn("flex flex-col leading-tight", align === "end" && "items-end")}>
      <span className="text-[13px] tabular-nums text-ink">{date}</span>
      <span className={cn("mt-0.5 text-[12px] tabular-nums", days < 0 ? "text-faint" : days <= 14 ? "text-[var(--accent)]" : "text-muted")}>
        {days < 0 ? st("goals_exam_done") : days === 0 ? st("goals_exam_today_sub") : st("in_days", { count: days })}
      </span>
    </span>
  );
}

function GoalRow({ plan, fact, onEdit }: { plan: StudyPlan; fact: GoalFacts; onEdit: (plan: StudyPlan, focus?: GoalField) => void }) {
  const { st, textDir, duration } = useStudyT();
  const { activePlan, today, settings } = useStudy();
  const { summary, timeline } = fact;
  const active = activePlan?.id === plan.id;
  const name = plan.name || st("untitled_goal");
  const subtitle = [plan.institution, plan.role].filter(Boolean).join(" · ");
  const weeks = useMemo(() => recentWeeks(timeline, today, settings.weekStartsOn), [settings.weekStartsOn, timeline, today]);
  const coverage = summary.coverage;
  const percent = Math.round(coverage.ratio * 100);

  const menu = (
    <GoalActionsMenu
      plan={plan}
      onEdit={() => onEdit(plan)}
      triggerClassName="relative z-10 @3xl/goals:opacity-0 @3xl/goals:group-hover:opacity-100 @3xl/goals:group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
    />
  );

  return (
    <li className={cn("group relative border-t border-[var(--border)] px-4 py-3.5 transition-colors first:border-t-0 hover:bg-[var(--surface-hover)]", TABLE_GRID)}>
      {/* Objetivo */}
      <div className="flex min-w-0 items-center gap-3">
        <GoalMark icon={plan.icon} name={name} seed={plan.id} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/home/study/goals/${plan.id}`}
              dir={textDir}
              className="truncate text-[14.5px] font-medium text-ink outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {name}
            </Link>
            {active ? <ActiveMark /> : null}
          </div>
          {subtitle ? (
            <p dir={textDir} className="truncate text-[12.5px] text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 @3xl/goals:hidden">
          <ExamCell plan={plan} onSetDate={() => onEdit(plan, "examDate")} align="end" />
          {menu}
        </div>
      </div>

      {/* Edital */}
      <div className="mt-3 flex items-center gap-2.5 @3xl/goals:mt-0" title={st("kpi_coverage_hint", { done: coverage.done, total: coverage.total })}>
        {coverage.total ? (
          <>
            <ProgressBar value={coverage.done} max={coverage.total} className="flex-1" />
            <span className="w-9 shrink-0 text-end text-[12.5px] tabular-nums text-muted">{percent}%</span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">{st("goal_subject_no_topics")}</span>
        )}
      </div>

      {/* Ritmo */}
      <div className="hidden @5xl/goals:block">
        <WeekBars weeks={weeks} goalMinutes={plan.weeklyGoalMinutes} height={22} />
      </div>

      {/* Esta semana */}
      <div className="hidden text-[13px] tabular-nums leading-tight @4xl/goals:block">
        {summary.weekMinutes ? (
          <>
            <span className="text-ink">{duration(summary.weekMinutes * 60)}</span>
            {plan.weeklyGoalMinutes ? <span className="block text-[12px] text-muted">{st("goals_of_goal", { goal: duration(plan.weeklyGoalMinutes * 60) })}</span> : null}
          </>
        ) : (
          <span className="text-faint">–</span>
        )}
      </div>

      {/* Prova */}
      <div className="hidden @3xl/goals:block">
        <ExamCell plan={plan} onSetDate={() => onEdit(plan, "examDate")} />
      </div>

      <div className="hidden justify-end @3xl/goals:flex">{menu}</div>
    </li>
  );
}

function EmptyGoals() {
  const { st, textDir } = useStudyT();
  const router = useRouter();
  const [value, setValue] = useState("");
  const newGoalGate = useGoalGates().newGoal;
  const submit = () => {
    if (!newGoalGate.allowed) return;
    useStudyUi.getState().setNewGoalDraft(value.trim());
    router.push("/home/study/goals/new");
  };
  return (
    <form
      className={cn(PANEL, "px-5 py-8 sm:px-8 sm:py-10")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="max-w-[36rem]">
        <label htmlFor="goals-empty-name" className="block text-[17px] font-semibold tracking-[-0.015em] text-ink">
          {st("goals_empty_prompt")}
        </label>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{st("goals_empty_desc")}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            id="goals-empty-name"
            dir={textDir}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={st("goals_empty_examples")}
            maxLength={160}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--canvas)] px-3 text-[14px] text-ink outline-none transition placeholder:text-faint focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <Button type="submit" variant="primary" className="h-10" disabled={!newGoalGate.allowed} title={newGoalGate.reason ?? undefined}>
            {newGoalGate.allowed ? null : <Lock />}
            {st("goals_empty_continue")}
          </Button>
        </div>
        {newGoalGate.reason ? <p className="mt-2 text-[12px] leading-relaxed text-faint">{newGoalGate.reason}</p> : null}
      </div>
    </form>
  );
}

function ArchivedGoals({
  plans,
  facts,
  onEdit,
}: {
  plans: StudyPlan[];
  facts: Map<string, GoalFacts>;
  onEdit: (plan: StudyPlan, focus?: GoalField) => void;
}) {
  const { st, locale, duration, textDir } = useStudyT();
  const { actions } = useStudy();
  const unarchiveGate = useGoalGates().unarchive;
  const open = useStudyUi((state) => state.goalsArchivedOpen);
  const setOpen = useStudyUi((state) => state.setGoalsArchivedOpen);
  const reactivate = async (plan: StudyPlan) => {
    await actions.archivePlan(plan.id, false);
    toast.success(st("goal_unarchived"));
  };
  return (
    <section className="mt-8">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-md py-1 pe-2 text-[13px] font-medium text-muted transition hover:text-ink"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {st("goals_archived_toggle", { count: plans.length })}
      </button>
      {open ? (
        <ul className={cn(PANEL, "mt-2")}>
          {plans.map((plan) => {
            const summary = facts.get(plan.id)?.summary;
            const name = plan.name || st("untitled_goal");
            const meta = [
              plan.examDate ? formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" }) : "",
              summary?.coverage.total ? st("kpi_coverage_hint", { done: summary.coverage.done, total: summary.coverage.total }) : "",
              summary?.seconds ? st("goal_hours_studied", { value: duration(summary.seconds) }) : "",
            ].filter(Boolean);
            return (
              <li
                key={plan.id}
                className="group relative flex items-center gap-3 border-t border-[var(--border)] px-4 py-3 transition-colors first:border-t-0 hover:bg-[var(--surface-hover)]"
              >
                <GoalMark icon={plan.icon} name={name} seed={plan.id} size={32} className="opacity-60 grayscale" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/home/study/goals/${plan.id}`}
                    dir={textDir}
                    className="block truncate text-[14px] font-medium text-muted outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {name}
                  </Link>
                  {meta.length ? <p className="truncate text-[12px] tabular-nums text-faint">{meta.join(" · ")}</p> : null}
                </div>
                <div className="relative z-10 flex items-center gap-1">
                  <GateTooltip gate={unarchiveGate}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!unarchiveGate.allowed}
                      onClick={() => void reactivate(plan)}
                    >
                      {unarchiveGate.allowed ? <ArchiveRestore /> : <Lock />}
                      {st("goals_unarchive")}
                    </Button>
                  </GateTooltip>
                  <GoalActionsMenu plan={plan} onEdit={() => onEdit(plan)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function GoalActionsMenu({
  plan,
  onEdit,
  triggerClassName,
  trigger,
}: {
  plan: StudyPlan;
  onEdit: () => void;
  triggerClassName?: string;
  trigger?: ReactNode;
}) {
  const { st } = useStudyT();
  const router = useRouter();
  const { actions, activePlan } = useStudy();
  const goalGates = useGoalGates();
  const writeGate = usePlanGates().write;
  const archiveGate = plan.archived ? goalGates.unarchive : goalGates.archive;
  const isActive = activePlan?.id === plan.id;
  return (
    <Menu>
      <MenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")} className={triggerClassName} onClick={(event) => event.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="end">
        {plan.archived ? null : (
          <MenuItem disabled={!writeGate.allowed} onSelect={onEdit}>
            <Pencil /> {st("edit")}
            <PlanLockBadge gate={writeGate} />
          </MenuItem>
        )}
        {!plan.archived && !isActive ? (
          <MenuItem
            onSelect={async () => {
              await actions.setActivePlan(plan.id);
              toast.success(st("goal_activated"));
            }}
          >
            <Check /> {st("goals_set_active")}
          </MenuItem>
        ) : null}
        <MenuItem
          disabled={!archiveGate.allowed}
          onSelect={async () => {
            await actions.archivePlan(plan.id, !plan.archived);
            toast.success(plan.archived ? st("goal_unarchived") : st("goal_archived"));
          }}
        >
          {plan.archived ? <ArchiveRestore /> : <Archive />} {plan.archived ? st("goals_unarchive") : st("goals_archive")}
          <PlanLockBadge gate={archiveGate} />
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          destructive
          onSelect={async () => {
            if (!window.confirm(st("goals_delete_confirm", { name: plan.name || st("untitled_goal") }))) return;
            await actions.deletePlan(plan.id);
            toast.success(st("goal_deleted"));
            router.push("/home/study/goals");
          }}
        >
          <Trash2 /> {st("goals_delete")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
