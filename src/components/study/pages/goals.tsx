"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { coverageOf } from "@/lib/study/metrics";
import { diffDays, formatDay } from "@/lib/study/dates";
import type { StudyPlan } from "@/types/study";
import { Meter } from "../charts";
import { GoalDialog } from "../dialogs";
import { GoalMark, StudyEmpty, StudyHeader, StudyLoading, StudyPage } from "../ui";

export function GoalsPage() {
  const { st } = useStudyT();
  const router = useRouter();
  const { ready, plans } = useStudy();
  const live = plans.filter((plan) => !plan.archived);
  const archived = plans.filter((plan) => plan.archived);
  if (!ready) return <StudyLoading />;
  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_goals")}
        subtitle={st("goals_subtitle")}
        showGoal={false}
        showLog={false}
        actions={
          <Button variant="primary" onClick={() => router.push("/home/study/goals/new")}>
            <Plus />
            {st("goal_switch_new")}
          </Button>
        }
      />
      {live.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {live.map((plan) => (
            <GoalCard key={plan.id} plan={plan} />
          ))}
        </div>
      ) : (
        <StudyEmpty
          art="goal"
          title={st("empty_goal_title")}
          description={st("empty_goal_desc")}
          action={
            <Button variant="primary" onClick={() => router.push("/home/study/goals/new")}>
              <Plus />
              {st("empty_goal_cta")}
            </Button>
          }
        />
      )}
      {archived.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-semibold text-muted">{st("goals_archived")}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((plan) => (
              <GoalCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      ) : null}
    </StudyPage>
  );
}

export function GoalActionsMenu({ plan, onEdit }: { plan: StudyPlan; onEdit: () => void }) {
  const { st } = useStudyT();
  const router = useRouter();
  const { actions, activePlan } = useStudy();
  const isActive = activePlan?.id === plan.id;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")} onClick={(event) => event.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
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
        <MenuItem onSelect={onEdit}>
          <Pencil /> {st("edit")}
        </MenuItem>
        <MenuItem
          onSelect={async () => {
            await actions.archivePlan(plan.id, !plan.archived);
            toast.success(plan.archived ? st("goal_unarchived") : st("goal_archived"));
          }}
        >
          {plan.archived ? <ArchiveRestore /> : <Archive />} {plan.archived ? st("goals_unarchive") : st("goals_archive")}
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

function GoalCard({ plan }: { plan: StudyPlan }) {
  const { st, locale, duration } = useStudyT();
  const { subjects, sessions, exams, activePlan, today } = useStudy();
  const [editing, setEditing] = useState(false);
  const stats = useMemo(() => {
    const planSubjects = subjects.filter((subject) => subject.planId === plan.id);
    const seconds =
      sessions.filter((session) => session.planId === plan.id).reduce((sum, session) => sum + session.durationSec, 0) +
      exams.filter((exam) => exam.planId === plan.id).reduce((sum, exam) => sum + exam.durationSec, 0);
    return { subjects: planSubjects.length, coverage: coverageOf(planSubjects), seconds };
  }, [exams, plan.id, sessions, subjects]);
  const isActive = activePlan?.id === plan.id;
  const days = plan.examDate ? diffDays(today, plan.examDate) : null;
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-panel)]",
        isActive ? "border-[var(--accent)]/45" : "border-[var(--border)]",
        plan.archived && "opacity-75"
      )}
    >
      <div className="flex items-start gap-3">
        <GoalMark icon={plan.icon} name={plan.name || st("untitled_goal")} seed={plan.id} size={44} />
        <div className="min-w-0 flex-1">
          <Link href={`/home/study/goals/${plan.id}`} className="block truncate text-[14.5px] font-semibold tracking-[-0.015em] text-ink after:absolute after:inset-0">
            {plan.name || st("untitled_goal")}
          </Link>
          <p className="truncate text-[12px] text-muted">{[plan.institution, plan.role].filter(Boolean).join(" · ") || String.fromCharCode(0xa0)}</p>
        </div>
        <div className="relative z-10 flex items-center gap-1">
          {isActive ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">{st("goals_active_badge")}</span>
          ) : null}
          <GoalActionsMenu plan={plan} onEdit={() => setEditing(true)} />
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-muted">
          {plan.examDate
            ? st(days !== null && days < 0 ? "countdown_past" : "goal_exam_on", {
                date: formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" }),
              })
            : st("goal_no_exam")}
        </span>
        {days !== null && days > 0 ? <span className="tabular-nums font-medium text-ink">{st("in_days", { count: days })}</span> : null}
      </div>
      <div className="mt-3 space-y-1.5">
        <Meter value={stats.coverage.done} max={stats.coverage.total} label={st("kpi_coverage")} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] tabular-nums text-faint">
          <span>{st("subjects_count", { count: stats.subjects })}</span>
          <span>{st("kpi_coverage_hint", { done: stats.coverage.done, total: stats.coverage.total })}</span>
          {stats.seconds ? <span>{st("goal_hours_studied", { value: duration(stats.seconds) })}</span> : null}
        </div>
      </div>
      <GoalDialog open={editing} onOpenChange={setEditing} plan={plan} />
    </article>
  );
}
