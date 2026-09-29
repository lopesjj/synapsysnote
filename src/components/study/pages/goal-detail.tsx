"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, ClipboardPaste, Plus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog";
import { useStudy, type SubjectDraft } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { aggregate, coverageOf, groupSessions, performanceBand } from "@/lib/study/metrics";
import { diffDays, formatDay } from "@/lib/study/dates";
import { formatNumber } from "@/lib/study/format";
import type { StudySubject } from "@/types/study";
import { Meter } from "../charts";
import { GoalDialog } from "../dialogs";
import { SubjectDialog } from "../subject-dialog";
import { DraftEditor, PasteImporter, useDraftMerge } from "../syllabus-import";
import { AccuracyTag, DurationFigure, Figure, GoalMark, StudyEmpty, StudyLoading, StudyPage } from "../ui";
import { GoalActionsMenu } from "./goals";

export function GoalDetailPage({ goalId }: { goalId: string }) {
  const { st, locale, duration, language, textDir } = useStudyT();
  const params = useSearchParams();
  const { ready, plans, subjects, sessions, exams, activePlan, actions, settings, today } = useStudy();
  const plan = plans.find((entry) => entry.id === goalId) ?? null;
  const [editing, setEditing] = useState(false);
  const [subjectDialog, setSubjectDialog] = useState<{ open: boolean; subject: StudySubject | null }>({ open: false, subject: null });
  const [bulkOpen, setBulkOpen] = useState(params.get("bulk") === "1");

  const data = useMemo(() => {
    const list = subjects.filter((subject) => subject.planId === goalId);
    const planSessions = sessions.filter((session) => session.planId === goalId);
    const examSeconds = exams.filter((exam) => exam.planId === goalId).reduce((sum, exam) => sum + exam.durationSec, 0);
    return {
      subjects: list,
      total: aggregate(planSessions),
      examSeconds,
      bySubject: groupSessions(planSessions, (session) => session.subjectId),
      coverage: coverageOf(list),
    };
  }, [exams, goalId, sessions, subjects]);

  if (!ready) return <StudyLoading />;
  if (!plan) {
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

  const isActive = activePlan?.id === plan.id;
  const days = plan.examDate ? diffDays(today, plan.examDate) : null;

  return (
    <StudyPage>
      <Link href="/home/study/goals" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition hover:text-ink">
        <ArrowLeft className="size-3.5" />
        {st("nav_goals")}
      </Link>
      <header className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <GoalMark icon={plan.icon} name={plan.name || st("untitled_goal")} seed={plan.id} size={64} />
          <div className="min-w-0">
            <h1 dir={textDir} className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              {plan.name || st("untitled_goal")}
            </h1>
            <p className="mt-1 text-[13px] text-muted">{[plan.institution, plan.role].filter(Boolean).join(" · ")}</p>
            <p className="mt-1.5 text-[12px] text-faint">
              {plan.examDate
                ? `${st(days !== null && days < 0 ? "countdown_past" : "goal_exam_on", { date: formatDay(plan.examDate, locale, { day: "numeric", month: "long", year: "numeric" }) })}${days !== null && days > 0 ? ` · ${st("in_days", { count: days })}` : ""}`
                : st("goal_no_exam")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">{st("goals_active_badge")}</span>
          ) : !plan.archived ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await actions.setActivePlan(plan.id);
                toast.success(st("goal_activated"));
              }}
            >
              <Check />
              {st("goals_set_active")}
            </Button>
          ) : null}
          <GoalActionsMenu plan={plan} onEdit={() => setEditing(true)} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] md:grid-cols-4">
        <div className="px-5 py-4">
          <p className="text-[12px] font-medium text-muted">{st("time_label")}</p>
          <div className="mt-2">
            <DurationFigure seconds={data.total.seconds + data.examSeconds} size="md" />
          </div>
        </div>
        <div className="border-l border-[var(--border)] px-5 py-4">
          <p className="text-[12px] font-medium text-muted">{st("questions_label")}</p>
          <div className="mt-2">
            <Figure value={formatNumber(data.total.questions, language)} size="md" />
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4 md:border-l md:border-t-0">
          <p className="text-[12px] font-medium text-muted">{st("accuracy_label")}</p>
          <div className="mt-2.5">
            <AccuracyTag accuracy={data.total.accuracy} band={performanceBand(data.total.accuracy, settings)} showLabel className="text-[15px] font-semibold" />
          </div>
        </div>
        <div className="border-l border-t border-[var(--border)] px-5 py-4 md:border-t-0">
          <p className="text-[12px] font-medium text-muted">{st("kpi_coverage")}</p>
          <div className="mt-2 space-y-1.5">
            <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{Math.round(data.coverage.ratio * 100)}%</span>
            <Meter value={data.coverage.done} max={data.coverage.total} label={st("kpi_coverage")} />
          </div>
        </div>
      </section>

      {plan.notes ? (
        <section className="mb-6 rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] px-5 py-4">
          <p className="mb-1 text-[12px] font-medium text-muted">{st("goal_notes")}</p>
          <p dir={textDir} className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
            {plan.notes}
          </p>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            {st("nav_subjects")} <span className="text-[12px] font-normal tabular-nums text-faint">· {data.subjects.length}</span>
          </h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste />
              {st("goal_bulk_subjects")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setSubjectDialog({ open: true, subject: null })}>
              <Plus />
              {st("goal_add_subject")}
            </Button>
          </div>
        </div>
        {data.subjects.length ? (
          <div className="overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
            <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_6.5rem_8.5rem_1rem] gap-4 border-b border-[var(--border)] px-5 py-2 text-[11px] text-faint md:grid">
              <span>{st("col_subject")}</span>
              <span>{st("col_coverage")}</span>
              <span className="text-right">{st("col_time")}</span>
              <span className="text-right">{st("questions_label")}</span>
              <span />
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {data.subjects.map((subject) => {
                const agg = data.bySubject.get(subject.id);
                const done = subject.topics.filter((topic) => topic.done).length;
                const total = subject.topics.length;
                return (
                  <li key={subject.id}>
                    <Link
                      href={`/home/study/subjects/${subject.id}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-[var(--surface-hover)] md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_6.5rem_8.5rem_1rem]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="block h-8 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-ink">{subject.name}</span>
                          <span className="block text-[11.5px] text-faint">{st("topics_count", { count: total })}</span>
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted md:order-last" />
                      <span className="col-span-2 flex items-center gap-2.5 md:col-span-1">
                        <Meter value={done} max={total} className="max-w-[9rem]" label={st("col_coverage")} />
                        <span className="shrink-0 text-[11.5px] tabular-nums text-muted">
                          {done}/{total}
                        </span>
                      </span>
                      <span className="text-[12.5px] tabular-nums text-ink md:text-right">{agg?.seconds ? duration(agg.seconds) : "–"}</span>
                      <span className="flex items-center justify-end gap-2 text-[12.5px] tabular-nums text-muted">
                        {agg?.questions ? formatNumber(agg.questions, language) : "–"}
                        <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <StudyEmpty art="subjects" title={st("empty_subjects_title")} description={st("empty_subjects_desc")} />
        )}
      </section>

      <GoalDialog open={editing} onOpenChange={setEditing} plan={plan} />
      <SubjectDialog
        open={subjectDialog.open}
        onOpenChange={(open) => setSubjectDialog((value) => ({ ...value, open }))}
        planId={plan.id}
        subject={subjectDialog.subject}
      />
      <BulkSubjectsDialog open={bulkOpen} onOpenChange={setBulkOpen} planId={plan.id} />
    </StudyPage>
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
