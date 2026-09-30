"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, CalendarDays, Check, ChevronDown, ChevronRight, Circle, CircleDot, ClipboardPaste, Clock, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useStudy, type SubjectDraft } from "@/lib/study/provider";
import { studyTranslateParts, useStudyT } from "@/lib/study/i18n";
import { useStudyUi, type GoalSubjectSort } from "@/lib/study/ui-store";
import { performanceBand, streakInfo } from "@/lib/study/metrics";
import { diffDays, formatDay } from "@/lib/study/dates";
import { formatNumber } from "@/lib/study/format";
import { roundProgress } from "@/lib/study/cycle";
import { projectSyllabus, recentWeeks, type SubjectSummary } from "@/lib/study/goal-summary";
import type { PerformanceBand, StudyPlan, StudySubject } from "@/types/study";
import { GoalDialog, type GoalField } from "../dialogs";
import { SubjectDialog } from "../subject-dialog";
import { ExamDialog } from "../exam-dialog";
import { DraftEditor, PasteImporter, useDraftMerge } from "../syllabus-import";
import { CoveragePie, ExamCountdown, ProgressBar, SyllabusSummary, WeekBars, WeekMeter } from "../goal-visuals";
import { GoalMark, StudyEmpty, StudyLoading, StudyPage } from "../ui";
import { CycleWheel } from "./schedule";
import { GoalActionsMenu, PANEL, useGoalFacts, type GoalFacts } from "./goals";

const SORTS: { id: GoalSubjectSort; key: "goal_sort_syllabus" | "goal_sort_coverage" | "goal_sort_accuracy" | "goal_sort_reviews" }[] = [
  { id: "syllabus", key: "goal_sort_syllabus" },
  { id: "coverage", key: "goal_sort_coverage" },
  { id: "accuracy", key: "goal_sort_accuracy" },
  { id: "reviews", key: "goal_sort_reviews" },
];

const bandText = (band: PerformanceBand | null) => (band ? `var(--band-${band}-text)` : "var(--text-faint)");

export function GoalDetailPage({ goalId }: { goalId: string }) {
  const { st } = useStudyT();
  const params = useSearchParams();
  const { ready, plans } = useStudy();
  const facts = useGoalFacts();
  const plan = plans.find((entry) => entry.id === goalId) ?? null;
  const fact = plan ? facts.get(plan.id) : undefined;
  const [bulkOpen, setBulkOpen] = useState(params.get("bulk") === "1");

  if (!ready) return <StudyLoading />;
  if (!plan || !fact) {
    return (
      <StudyPage>
        <StudyEmpty
          title={st("goal_not_found")}
          description={st("goal_not_found_desc")}
          action={
            <Button variant="secondary" asChild>
              <Link href="/home/study/goals">{st("back")}</Link>
            </Button>
          }
        />
      </StudyPage>
    );
  }
  return <GoalDocument plan={plan} fact={fact} bulkOpen={bulkOpen} setBulkOpen={setBulkOpen} />;
}

function GoalDocument({
  plan,
  fact,
  bulkOpen,
  setBulkOpen,
}: {
  plan: StudyPlan;
  fact: GoalFacts;
  bulkOpen: boolean;
  setBulkOpen: (open: boolean) => void;
}) {
  const { st, textDir } = useStudyT();
  const { activePlan, actions } = useStudy();
  const [dialog, setDialog] = useState<{ open: boolean; focus: GoalField }>({ open: false, focus: "name" });
  const [subjectDialog, setSubjectDialog] = useState<{ open: boolean; subject: StudySubject | null }>({ open: false, subject: null });
  const [examOpen, setExamOpen] = useState(false);
  const isActive = activePlan?.id === plan.id;
  const edit = (focus: GoalField = "name") => setDialog({ open: true, focus });
  const name = plan.name || st("untitled_goal");
  const subtitle = [plan.institution, plan.role].filter(Boolean).join(" · ");

  const activate = async () => {
    await actions.setActivePlan(plan.id);
    toast.success(st("goal_activated"));
  };
  const reactivate = async () => {
    await actions.archivePlan(plan.id, false);
    toast.success(st("goal_unarchived"));
  };

  return (
    <StudyPage>
      <div className="@container/goal">
        <div className="flex h-9 items-center justify-between gap-3">
          <nav aria-label={st("nav_goals")} className="flex min-w-0 items-center gap-1 text-[13px]">
            <Link href="/home/study/goals" className="shrink-0 text-muted transition hover:text-ink">
              {st("nav_goals")}
            </Link>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" />
            <span dir={textDir} className="truncate text-ink">
              {name}
            </span>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            {plan.archived ? (
              <Button variant="secondary" size="sm" onClick={() => void reactivate()}>
                {st("goals_unarchive")}
              </Button>
            ) : !isActive ? (
              <Button variant="secondary" size="sm" onClick={() => void activate()}>
                <Check />
                {st("goals_set_active")}
              </Button>
            ) : null}
            <GoalActionsMenu plan={plan} onEdit={() => edit()} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 @5xl/goal:grid-cols-[minmax(0,1fr)_20rem] @5xl/goal:grid-rows-[auto_1fr] @6xl/goal:gap-x-12">
          <div className="min-w-0 @5xl/goal:col-start-1 @5xl/goal:row-start-1">
            <button
              type="button"
              onClick={() => edit("icon")}
              aria-label={st("goal_icon")}
              className="block rounded-[12px] outline-none transition hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
            >
              <GoalMark icon={plan.icon} name={name} seed={plan.id} size={52} />
            </button>
            <h1 dir={textDir} className="mt-4">
              <button
                type="button"
                onClick={() => edit("name")}
                className={cn(
                  "text-start text-[26px] font-semibold leading-tight tracking-[-0.025em] outline-none [overflow-wrap:anywhere] focus-visible:underline @3xl/goal:text-[30px]",
                  plan.name ? "text-ink" : "text-faint"
                )}
              >
                {name}
              </button>
            </h1>
            {subtitle ? (
              <p dir={textDir} className="mt-1 text-[14.5px] text-muted">
                {subtitle}
              </p>
            ) : null}
            <PropertyChips plan={plan} onEdit={edit} />
            {plan.archived ? (
              <p className="mt-4 text-[13px] text-muted">
                {st("goal_archived_notice")}{" "}
                <button type="button" onClick={() => void reactivate()} className="text-[var(--accent)] underline-offset-4 hover:underline">
                  {st("goals_unarchive")}
                </button>
              </p>
            ) : null}
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <Notes plan={plan} />
            </div>
          </div>

          <aside className="min-w-0 @5xl/goal:sticky @5xl/goal:top-6 @5xl/goal:col-start-2 @5xl/goal:row-span-2 @5xl/goal:row-start-1 @5xl/goal:self-start">
            <Overview plan={plan} fact={fact} onEdit={edit} />
          </aside>

          <div className="min-w-0 space-y-10 @5xl/goal:col-start-1 @5xl/goal:row-start-2">
            <Ledger fact={fact} onAdd={() => setSubjectDialog({ open: true, subject: null })} onBulk={() => setBulkOpen(true)} />
            <ExamsSection fact={fact} canLog={isActive} onLog={() => setExamOpen(true)} />
          </div>
        </div>
      </div>

      <GoalDialog open={dialog.open} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} plan={plan} focus={dialog.focus} />
      <SubjectDialog
        open={subjectDialog.open}
        onOpenChange={(open) => setSubjectDialog((value) => ({ ...value, open }))}
        planId={plan.id}
        subject={subjectDialog.subject}
      />
      <BulkSubjectsDialog open={bulkOpen} onOpenChange={setBulkOpen} planId={plan.id} />
      {isActive ? <ExamDialog open={examOpen} onOpenChange={setExamOpen} /> : null}
    </StudyPage>
  );
}

function Chip({ icon, children, onClick, muted, label }: { icon: ReactNode; children: ReactNode; onClick?: () => void; muted?: boolean; label?: string }) {
  const className = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] tabular-nums outline-none transition [&_svg]:size-3.5 [&_svg]:shrink-0",
    onClick && "hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
    muted ? "text-muted" : "text-ink"
  );
  if (!onClick) {
    return (
      <span className={className}>
        {icon}
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={className}>
      {icon}
      {children}
    </button>
  );
}

function PropertyChips({ plan, onEdit }: { plan: StudyPlan; onEdit: (focus: GoalField) => void }) {
  const { st, locale, duration } = useStudyT();
  const { activePlan, actions, today } = useStudy();
  const isActive = activePlan?.id === plan.id;
  const days = plan.examDate ? diffDays(today, plan.examDate) : null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {plan.archived ? (
        <Chip icon={<Archive className="text-muted" />} onClick={() => void actions.archivePlan(plan.id, false).then(() => toast.success(st("goal_unarchived")))}>
          {st("goal_status_archived")}
        </Chip>
      ) : isActive ? (
        <Chip icon={<CircleDot className="text-[var(--accent)]" />}>{st("goal_status_active")}</Chip>
      ) : (
        <Chip icon={<Circle className="text-muted" />} onClick={() => void actions.setActivePlan(plan.id).then(() => toast.success(st("goal_activated")))} label={st("goals_set_active")}>
          {st("goal_status_inactive")}
        </Chip>
      )}
      <Chip icon={<CalendarDays className="text-muted" />} onClick={() => onEdit("examDate")} muted={!plan.examDate}>
        {plan.examDate ? (
          <>
            {formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" })}
            {days !== null && days >= 0 ? <span className="text-muted">· {days === 0 ? st("goals_exam_today_sub") : st("in_days", { count: days })}</span> : null}
          </>
        ) : (
          st("goal_exam_date")
        )}
      </Chip>
      <Chip icon={<Clock className="text-muted" />} onClick={() => onEdit("weekly")} muted={!plan.weeklyGoalMinutes}>
        {plan.weeklyGoalMinutes ? st("goal_chip_weekly", { time: duration(plan.weeklyGoalMinutes * 60) }) : st("goal_prop_weekly")}
      </Chip>
      {plan.weeklyGoalQuestions ? (
        <Chip icon={<ListChecks className="text-muted" />} onClick={() => onEdit("weekly")}>
          {st("goal_chip_questions", { count: plan.weeklyGoalQuestions })}
        </Chip>
      ) : null}
    </div>
  );
}

function Notes({ plan }: { plan: StudyPlan }) {
  const { st, textDir } = useStudyT();
  const { actions } = useStudy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan.notes);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || editing) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1 || expanded);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [editing, expanded, plan.notes]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!editing || !area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [draft, editing]);

  const start = () => {
    cancelled.current = false;
    setDraft(plan.notes);
    setEditing(true);
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    });
  };
  const finish = async () => {
    setEditing(false);
    if (cancelled.current || draft === plan.notes) return;
    try {
      await actions.savePlan({ id: plan.id, notes: draft });
      toast.success(st("goal_notes_saved"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  const metrics = "text-[14.5px] leading-[1.7]";
  if (editing) {
    return (
      <textarea
        ref={areaRef}
        dir={textDir}
        value={draft}
        aria-label={st("goal_notes")}
        maxLength={4000}
        placeholder={st("goal_notes_prompt")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void finish()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            setDraft(plan.notes);
            event.currentTarget.blur();
          }
        }}
        className={cn("block min-h-[3rem] w-full max-w-[70ch] resize-none overflow-hidden bg-transparent p-0 text-ink caret-[var(--accent)] outline-none placeholder:text-faint", metrics)}
      />
    );
  }
  if (!plan.notes.trim()) {
    return (
      <button type="button" onClick={start} className={cn("block text-start text-faint transition hover:text-muted", metrics)}>
        {st("goal_notes_prompt")}
      </button>
    );
  }
  return (
    <div className="max-w-[70ch]">
      <p
        ref={textRef}
        dir={textDir}
        role="button"
        tabIndex={0}
        onClick={start}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            start();
          }
        }}
        className={cn(
          "cursor-text whitespace-pre-wrap text-ink/90 outline-none [overflow-wrap:anywhere] focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
          metrics,
          !expanded && "line-clamp-6"
        )}
      >
        {plan.notes}
      </p>
      {overflows ? (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-[13px] text-[var(--accent)] underline-offset-4 hover:underline">
          {expanded ? st("goal_notes_less") : st("goal_notes_more")}
        </button>
      ) : null}
    </div>
  );
}

function OverviewSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--border)] px-4 py-4 first:border-t-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[12.5px] font-medium text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Overview({ plan, fact, onEdit }: { plan: StudyPlan; fact: GoalFacts; onEdit: (focus: GoalField) => void }) {
  const { st, duration, language } = useStudyT();
  const { activePlan, cycles, subjectById, settings, today } = useStudy();
  const setSort = useStudyUi((state) => state.setGoalSubjectSort);
  const { summary, timeline } = fact;
  const isActive = activePlan?.id === plan.id;

  const weeks = useMemo(() => recentWeeks(timeline, today, settings.weekStartsOn), [settings.weekStartsOn, timeline, today]);
  const streak = useMemo(() => streakInfo(summary.studiedDays, today, settings.studyWeekdays), [settings.studyWeekdays, summary.studiedDays, today]);
  const cycle = cycles.find((entry) => entry.planId === plan.id) ?? null;
  const progress = useMemo(() => (cycle && cycle.items.length ? roundProgress(cycle) : null), [cycle]);
  const current = cycle && cycle.items.length ? cycle.items[cycle.pointer % cycle.items.length] : null;
  const currentSubject = current ? subjectById(current.subjectId) : undefined;
  const nextTopic = currentSubject?.topics.find((topic) => !topic.done) ?? null;
  const weakest = summary.subjects
    .filter((entry) => (entry.agg?.questions ?? 0) >= 20 && entry.agg?.accuracy !== null && entry.agg?.accuracy !== undefined)
    .sort((a, b) => (a.agg!.accuracy ?? 0) - (b.agg!.accuracy ?? 0))[0];

  const coverage = summary.coverage;
  const studied = summary.subjects.reduce((sum, entry) => sum + entry.studied, 0);
  const projection = projectSyllabus(timeline, today, plan.examDate);
  const hasHistory = weeks.some((week) => week.minutes > 0);

  return (
    <div className={PANEL}>
      <OverviewSection title={st("goal_prop_exam")}>
        <ExamCountdown plan={plan} startDay={timeline.goalStart} onSetDate={() => onEdit("examDate")} />
      </OverviewSection>

      <OverviewSection title={st("goal_col_syllabus")}>
        <SyllabusSummary done={coverage.done} studied={studied} total={coverage.total} />
        {coverage.total ? <Projection projection={projection} /> : null}
      </OverviewSection>

      <OverviewSection
        title={st("goals_this_week")}
        action={
          <button type="button" onClick={() => onEdit("weekly")} className="text-[12px] text-muted underline-offset-4 transition hover:text-[var(--accent)] hover:underline">
            {plan.weeklyGoalMinutes || plan.weeklyGoalQuestions ? st("edit") : st("goal_weekly_set")}
          </button>
        }
      >
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
        {streak.best > 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">
            {streak.current >= 2 ? st("goal_streak_value", { count: streak.current, best: streak.best }) : st("goal_streak_none", { best: streak.best })}
          </p>
        ) : null}
      </OverviewSection>

      <OverviewSection title={st("goals_col_pace")}>
        {hasHistory ? (
          <WeekBars weeks={weeks} goalMinutes={plan.weeklyGoalMinutes} height={56} labels />
        ) : (
          <p className="text-[13px] text-muted">{st("goal_pace_empty")}</p>
        )}
      </OverviewSection>

      {cycle && current && progress ? (
        <OverviewSection title={st("goal_prop_cycle")}>
          <CycleSummary
            linked={isActive}
            wheel={<CycleWheel cycle={cycle} progress={progress} compact className="size-9" />}
            now={st("goal_cycle_now", { subject: currentSubject?.name ?? st("untitled_subject"), time: duration(current.minutes * 60) })}
            detail={[nextTopic ? st("goal_cycle_next_topic", { topic: nextTopic.name }) : "", st("cycle_round", { n: cycle.round + 1 })].filter(Boolean).join(" · ")}
          />
        </OverviewSection>
      ) : isActive ? (
        <OverviewSection title={st("goal_prop_cycle")}>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/home/study/schedule?setup=1">{st("goal_cycle_build")}</Link>
          </Button>
        </OverviewSection>
      ) : null}

      {weakest || summary.pendingReviews > 0 ? (
        <OverviewSection title={st("goal_attention")}>
          <dl className="space-y-2 text-[13px]">
            {weakest ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted">{st("goal_prop_weakest")}</dt>
                <dd className="min-w-0 text-end">
                  <button
                    type="button"
                    className="max-w-full truncate text-ink underline-offset-4 hover:underline"
                    onClick={() => {
                      setSort("accuracy");
                      document.getElementById("goal-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {weakest.subject.name} ·{" "}
                    <span className="font-medium tabular-nums" style={{ color: bandText(performanceBand(weakest.agg!.accuracy, settings)) }}>
                      {Math.round((weakest.agg!.accuracy ?? 0) * 100)}%
                    </span>
                  </button>
                </dd>
              </div>
            ) : null}
            {summary.pendingReviews > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{st("goal_prop_reviews")}</dt>
                <dd className="text-ink">
                  {isActive ? (
                    <Link href="/home/study/reviews" className="underline-offset-4 hover:text-[var(--accent)] hover:underline">
                      {st("goal_reviews_value", { count: summary.pendingReviews })}
                    </Link>
                  ) : (
                    st("goal_reviews_value", { count: summary.pendingReviews })
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        </OverviewSection>
      ) : null}
    </div>
  );
}

function Projection({ projection }: { projection: ReturnType<typeof projectSyllabus> }) {
  const { st, locale, language } = useStudyT();
  const num = (value: ReactNode, color?: string) => (
    <span className="font-medium tabular-nums text-ink" style={color ? { color } : undefined}>
      {value}
    </span>
  );
  const pace = Math.round(projection.pace * 10) / 10;
  const paceText = formatNumber(pace, language, 1);
  const finish = projection.finish ? formatDay(projection.finish, locale, { day: "numeric", month: "short" }) : "";
  let sentence: ReactNode = null;
  if (projection.kind === "stalled") sentence = st("goal_projection_stalled");
  else if (projection.kind === "done") sentence = st("goal_projection_done");
  else if (projection.kind === "undated" || (projection.kind === "ahead" && projection.weeksEarly < 1)) {
    sentence = studyTranslateParts(language, "goal_projection_undated", { paceCount: pace }, { pace: num(paceText), date: num(finish) });
  } else if (projection.kind === "ahead") {
    sentence = studyTranslateParts(language, "goal_projection_ahead", { paceCount: pace, weeks: projection.weeksEarly }, {
      pace: num(paceText),
      date: num(finish),
      weeks: num(projection.weeksEarly, "var(--band-high-text)"),
    });
  } else if (projection.kind === "behind") {
    sentence = studyTranslateParts(language, "goal_projection_behind", { need: projection.need }, {
      percent: num(`${Math.round(projection.atExam * 100)}%`, projection.atExam < 0.8 ? "var(--band-low-text)" : "var(--band-mid-text)"),
      need: num(projection.need),
    });
  }
  return sentence ? <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{sentence}</p> : null;
}

function CycleSummary({ linked, wheel, now, detail }: { linked: boolean; wheel: ReactNode; now: string; detail: string }) {
  const body = (
    <span className="flex items-center gap-3">
      {wheel}
      <span className="min-w-0 text-[13px]">
        <span className="block truncate text-ink">{now}</span>
        {detail ? <span className="block truncate text-[12px] text-muted">{detail}</span> : null}
      </span>
    </span>
  );
  return linked ? (
    <Link href="/home/study/schedule" className="-m-1.5 block rounded-lg p-1.5 transition hover:bg-[var(--surface-hover)]">
      {body}
    </Link>
  ) : (
    body
  );
}

const LEDGER_GRID = "@3xl/goal:grid @3xl/goal:grid-cols-[minmax(0,1fr)_11rem_6rem_7.5rem_1rem] @3xl/goal:items-center @3xl/goal:gap-x-6";

function sortSubjects(entries: SubjectSummary[], sort: GoalSubjectSort): SubjectSummary[] {
  const list = [...entries];
  if (sort === "coverage") return list.sort((a, b) => (a.total ? a.ratio : 2) - (b.total ? b.ratio : 2) || a.subject.order - b.subject.order);
  if (sort === "accuracy") {
    return list.sort((a, b) => {
      const left = a.agg?.questions ? (a.agg.accuracy ?? 0) : 2;
      const right = b.agg?.questions ? (b.agg.accuracy ?? 0) : 2;
      return left - right || a.subject.order - b.subject.order;
    });
  }
  if (sort === "reviews") return list.sort((a, b) => b.pendingReviews - a.pendingReviews || a.subject.order - b.subject.order);
  return list.sort((a, b) => a.subject.order - b.subject.order);
}

function SectionHeader({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
        {title}
        {count ? <span className="ms-1.5 text-[13px] font-normal tabular-nums text-faint">{count}</span> : null}
      </h2>
      {children ? <div className="flex flex-wrap items-center gap-1.5">{children}</div> : null}
    </div>
  );
}

function AccuracyValue({ questions, accuracy }: { questions: number; accuracy: number | null }) {
  const { language } = useStudyT();
  const { settings } = useStudy();
  if (!questions) return <span className="text-faint">–</span>;
  return (
    <span className="tabular-nums">
      <span className="text-ink">{formatNumber(questions, language)}</span>
      {accuracy !== null ? (
        <span className="ms-1.5 font-medium" style={{ color: bandText(performanceBand(accuracy, settings)) }}>
          {Math.round(accuracy * 100)}%
        </span>
      ) : null}
    </span>
  );
}

function Ledger({ fact, onAdd, onBulk }: { fact: GoalFacts; onAdd: () => void; onBulk: () => void }) {
  const { st, duration } = useStudyT();
  const storedSort = useStudyUi((state) => state.goalSubjectSort);
  const setSort = useStudyUi((state) => state.setGoalSubjectSort);
  const sort = SORTS.some((entry) => entry.id === storedSort) ? storedSort : "syllabus";
  const { summary } = fact;
  const rows = useMemo(() => sortSubjects(summary.subjects, sort), [sort, summary.subjects]);

  return (
    <section id="goal-ledger" className="scroll-mt-6" aria-labelledby="goal-ledger-title">
      <SectionHeader id="goal-ledger-title" title={st("nav_subjects")} count={summary.subjects.length}>
        {summary.subjects.length > 1 ? (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={st("goal_sort_label")}>
                {st(SORTS.find((entry) => entry.id === sort)!.key)}
                <ChevronDown />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {SORTS.map((entry) => (
                <MenuItem key={entry.id} onSelect={() => setSort(entry.id)}>
                  <Check className={entry.id === sort ? "opacity-100" : "opacity-0"} /> {st(entry.key)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onBulk}>
          <ClipboardPaste />
          {st("goal_bulk_subjects")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus />
          {st("goal_add_subject")}
        </Button>
      </SectionHeader>

      {summary.subjects.length ? (
        <div className={PANEL}>
          <div className={cn("hidden h-9 border-b border-[var(--border)] px-4 text-[12px] text-muted", LEDGER_GRID)}>
            <span>{st("col_subject")}</span>
            <span>{st("goal_col_syllabus")}</span>
            <span className="text-end">{st("col_time")}</span>
            <span className="text-end">{st("questions_label")}</span>
            <span />
          </div>
          <ul>
            {rows.map((entry) => (
              <LedgerRow key={entry.subject.id} entry={entry} />
            ))}
          </ul>
          <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3 text-[13px]", LEDGER_GRID)}>
            <span className="font-medium text-ink">{st("goal_total")}</span>
            <span className="flex items-center gap-2.5">
              <ProgressBar value={summary.coverage.done} max={summary.coverage.total} className="hidden flex-1 @3xl/goal:block" />
              <span className="shrink-0 tabular-nums text-muted">
                {summary.coverage.done}/{summary.coverage.total}
              </span>
            </span>
            <span
              className="tabular-nums text-ink @3xl/goal:text-end"
              title={summary.examSeconds ? st("goal_total_exam_time", { time: duration(summary.examSeconds) }) : undefined}
            >
              {summary.seconds ? duration(summary.seconds) : <span className="text-faint">–</span>}
            </span>
            <span className="@3xl/goal:text-end">
              <AccuracyValue questions={summary.total.questions} accuracy={summary.total.accuracy} />
            </span>
            <span className="hidden @3xl/goal:block" />
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="flex h-10 w-full items-center gap-2 border-t border-[var(--border)] px-4 text-[13px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <Plus className="size-3.5" />
            {st("goal_add_subject")}
          </button>
        </div>
      ) : (
        <div className={cn(PANEL, "px-5 py-6")}>
          <p className="max-w-[56ch] text-[14px] leading-relaxed text-muted">{st("goal_subjects_empty")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onBulk}>
              <ClipboardPaste />
              {st("goal_bulk_subjects")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onAdd}>
              <Plus />
              {st("goal_add_subject")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function LedgerRow({ entry }: { entry: SubjectSummary }) {
  const { st, duration } = useStudyT();
  const { subject, done, total, studied, agg, pendingReviews } = entry;
  const next = subject.topics.find((topic) => !topic.done) ?? null;
  return (
    <li className="border-t border-[var(--border)] first:border-t-0">
      <Link
        href={`/home/study/subjects/${subject.id}`}
        aria-label={st("goal_subject_aria", { subject: subject.name, done, total, studied, reviews: pendingReviews })}
        className={cn("group block px-4 py-3 outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]", LEDGER_GRID)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <CoveragePie done={done} total={total} color={subject.color} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium text-ink">{subject.name}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-muted @3xl/goal:hidden">{agg?.seconds ? duration(agg.seconds) : ""}</span>
            </span>
            <span className="block truncate text-[12.5px] text-muted">
              {!total ? st("goal_subject_no_topics") : next ? st("goal_subject_next", { topic: next.name }) : st("goal_subject_complete")}
              {pendingReviews ? <span className="text-[var(--accent)]"> · {st("goal_subject_reviews", { count: pendingReviews })}</span> : null}
            </span>
          </span>
        </span>
        <span className="mt-2.5 flex items-center gap-2.5 @3xl/goal:mt-0">
          {total ? (
            <>
              <ProgressBar value={done} max={total} color={subject.color} className="flex-1" />
              <span className="w-10 shrink-0 text-end text-[12.5px] tabular-nums text-muted">
                {done}/{total}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] text-faint">–</span>
          )}
        </span>
        <span className="hidden text-end text-[13px] tabular-nums @3xl/goal:block">
          {agg?.seconds ? <span className="text-ink">{duration(agg.seconds)}</span> : <span className="text-faint">–</span>}
        </span>
        <span className="hidden text-end text-[13px] @3xl/goal:block">
          <AccuracyValue questions={agg?.questions ?? 0} accuracy={agg?.accuracy ?? null} />
        </span>
        <ChevronRight className="hidden size-3.5 text-faint opacity-0 transition group-hover:opacity-100 @3xl/goal:block" />
      </Link>
    </li>
  );
}

function ExamsSection({ fact, canLog, onLog }: { fact: GoalFacts; canLog: boolean; onLog: () => void }) {
  const { st, locale } = useStudyT();
  const { settings } = useStudy();
  const exams = fact.summary.exams;
  const latest = exams
    .map((entry, index) => ({ ...entry, previous: index > 0 ? exams[index - 1].percent : null }))
    .reverse()
    .slice(0, 5);
  return (
    <section aria-labelledby="goal-exams-title">
      <SectionHeader id="goal-exams-title" title={st("nav_exams")} count={exams.length}>
        {canLog ? (
          <Button variant="ghost" size="sm" onClick={onLog}>
            <Plus />
            {st("exams_new")}
          </Button>
        ) : null}
      </SectionHeader>
      {exams.length ? (
        <div className={PANEL}>
          <ul>
            {latest.map(({ exam, percent, previous }) => {
              const delta = percent !== null && previous !== null ? Math.round(percent * 100) - Math.round(previous * 100) : null;
              return (
                <li key={exam.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_3rem] items-baseline gap-x-3 border-t border-[var(--border)] px-4 py-3 first:border-t-0">
                  <span className="text-[12.5px] tabular-nums text-muted">{formatDay(exam.day, locale, { day: "numeric", month: "short" })}</span>
                  <span className="truncate text-[14px] text-ink">{exam.name || exam.board || st("nav_exams")}</span>
                  <span className="text-end text-[14px] font-semibold tabular-nums" style={{ color: bandText(performanceBand(percent, settings)) }}>
                    {percent !== null ? `${Math.round(percent * 100)}%` : "–"}
                  </span>
                  <span className="text-end text-[12px] tabular-nums text-muted">{delta === null ? "" : delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0"}</span>
                </li>
              );
            })}
          </ul>
          {canLog ? (
            <Link
              href="/home/study/exams"
              className="flex h-10 items-center gap-1 border-t border-[var(--border)] px-4 text-[13px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              {st("goal_exams_all")}
              <ChevronRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={cn(PANEL, "px-4 py-4 text-[13.5px] text-muted")}>{st("goal_exams_empty")}</div>
      )}
    </section>
  );
}

function BulkSubjectsDialog({ open, onOpenChange, planId }: { open: boolean; onOpenChange: (open: boolean) => void; planId: string }) {
  const { st } = useStudyT();
  const { actions } = useStudy();
  const [drafts, setDrafts] = useState<SubjectDraft[]>([]);
  const absorb = useDraftMerge(drafts, setDrafts);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const count = await actions.addSubjects(planId, drafts.filter((draft) => draft.name.trim()));
      toast.success(st("goal_bulk_added", { count }));
      setDrafts([]);
      onOpenChange(false);
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-3.5 pt-4 pr-12">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{st("goal_bulk_subjects")}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">{st("goal_bulk_desc")}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <PasteImporter onParsed={absorb} />
        <DraftEditor drafts={drafts} onChange={setDrafts} />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {st("cancel")}
        </Button>
        <Button variant="primary" disabled={!drafts.some((draft) => draft.name.trim()) || saving} onClick={() => void submit()}>
          {st("add")}
        </Button>
      </div>
    </DialogShell>
  );
}
