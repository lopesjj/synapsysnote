"use client";

import { useMemo, useState } from "react";
import { ListTree, MoreHorizontal, NotebookPen, Pencil, Plus } from "lucide-react";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { usePlanMetrics } from "@/lib/study/hooks";
import { useStudyUi } from "@/lib/study/ui-store";
import { performanceBand } from "@/lib/study/metrics";
import { diffDays } from "@/lib/study/dates";
import type { StudySubject } from "@/types/study";
import { Meter } from "../charts";
import { SubjectDialog } from "../subject-dialog";
import { AccuracyTag, FocusButton, StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";
import { relativeDay } from "../widgets";
import { cn } from "@/lib/utils";

type SortKey = "custom" | "time" | "accuracy" | "coverage" | "stale";

export function SubjectsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_subjects")}>
      <SubjectsBody />
    </StudyGate>
  );
}

function SubjectsBody() {
  const { st, duration, locale } = useStudyT();
  const router = useRouter();
  const { activePlan, planSubjects, settings, today } = useStudy();
  const metrics = usePlanMetrics();
  const [sort, setSort] = useState<SortKey>("custom");
  const [dialog, setDialog] = useState<{ open: boolean; subject: StudySubject | null }>({ open: false, subject: null });

  const rows = useMemo(() => {
    const list = planSubjects.map((subject) => {
      const agg = metrics.bySubject.get(subject.id);
      const done = subject.topics.filter((topic) => topic.done).length;
      return {
        subject,
        agg,
        done,
        ratio: subject.topics.length ? done / subject.topics.length : 0,
        stale: agg?.lastDay ? diffDays(agg.lastDay, today) : Number.POSITIVE_INFINITY,
      };
    });
    if (sort === "time") list.sort((a, b) => (b.agg?.seconds ?? 0) - (a.agg?.seconds ?? 0));
    if (sort === "accuracy") list.sort((a, b) => (a.agg?.accuracy ?? 2) - (b.agg?.accuracy ?? 2));
    if (sort === "coverage") list.sort((a, b) => a.ratio - b.ratio);
    if (sort === "stale") list.sort((a, b) => b.stale - a.stale);
    return list;
  }, [metrics.bySubject, planSubjects, sort, today]);

  if (!activePlan) return null;

  const sortLabels: Record<SortKey, string> = {
    custom: st("sort_custom"),
    time: st("sort_time"),
    accuracy: st("sort_accuracy"),
    coverage: st("sort_coverage"),
    stale: st("sort_stale"),
  };

  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_subjects")}
        subtitle={st("subjects_subtitle", { goal: activePlan.name || st("untitled_goal") })}
        actions={
          <>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">
                  {st("sort_label")}: {sortLabels[sort]}
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLabel>{st("sort_label")}</MenuLabel>
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <MenuItem key={key} onSelect={() => setSort(key)}>
                    <span className={key === sort ? "font-medium text-[var(--accent)]" : undefined}>{sortLabels[key]}</span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Button variant="secondary" onClick={() => setDialog({ open: true, subject: null })}>
              <Plus />
              {st("goal_add_subject")}
            </Button>
          </>
        }
      />
      {rows.length ? (
        <div className="overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_7rem] gap-3 border-b border-[var(--border)] px-5 py-2.5 text-[11px] font-medium text-faint lg:grid">
            <span>{st("col_subject")}</span>
            <span className="text-right">{st("col_time")}</span>
            <span className="text-right">{st("questions_label")}</span>
            <span>{st("col_accuracy")}</span>
            <span>{st("col_coverage")}</span>
            <span className="text-right">{st("col_last")}</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map(({ subject, agg, done, stale }) => (
              <li key={subject.id} className="group relative grid grid-cols-1 gap-2 px-5 py-3.5 transition hover:bg-[var(--surface-hover)] lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_7rem] lg:items-center lg:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="block h-8 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => router.push(`/home/study/subjects/${subject.id}`)}
                      className="block max-w-full truncate text-left text-[13.5px] font-medium text-ink hover:underline"
                    >
                      {subject.name}
                    </button>
                    <p className="text-[11.5px] text-faint">{st("topics_count", { count: subject.topics.length })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <FocusButton variant="ghost" size="icon-sm" subjectId={subject.id} label={st("subject_start_focus")} />
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => useStudyUi.getState().openLog({ subjectId: subject.id })}>
                          <Plus /> {st("logform_title_new")}
                        </MenuItem>
                        <MenuItem onSelect={() => router.push(`/home/study/syllabus?subject=${subject.id}`)}>
                          <ListTree /> {st("subject_view_syllabus")}
                        </MenuItem>
                        {subject.notebookId ? (
                          <MenuItem onSelect={() => router.push(`/home/n/${subject.notebookId}`)}>
                            <NotebookPen /> {st("subject_open_notebook")}
                          </MenuItem>
                        ) : null}
                        <MenuSeparator />
                        <MenuItem onSelect={() => setDialog({ open: true, subject })}>
                          <Pencil /> {st("edit")}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-[15px] text-[12px] lg:contents">
                  <span className="tabular-nums text-ink lg:text-right">{agg?.seconds ? duration(agg.seconds) : "–"}</span>
                  <span className="tabular-nums text-muted lg:text-right">
                    {agg?.questions ? `${agg.correct}/${agg.questions}` : "–"}
                  </span>
                  <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
                  <span className="flex min-w-[8rem] items-center gap-2">
                    <Meter value={done} max={subject.topics.length} className="w-20" label={st("col_coverage")} />
                    <span className="text-[11.5px] tabular-nums text-faint">
                      {done}/{subject.topics.length}
                    </span>
                  </span>
                  <span
                    className={cn("whitespace-nowrap text-[11.5px] tabular-nums lg:text-right", stale > 14 ? "text-[var(--band-low)]" : "text-faint")}
                    title={Number.isFinite(stale) && stale > 0 ? st("next_up_reason_stale", { count: stale }) : undefined}
                  >
                    {agg?.lastDay ? relativeDay(agg.lastDay, today, locale, st) : st("never")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <StudyEmpty
          art="subjects"
          title={st("empty_subjects_title")}
          description={st("empty_subjects_desc")}
          action={
            <Button variant="primary" onClick={() => setDialog({ open: true, subject: null })}>
              <Plus />
              {st("empty_subjects_cta")}
            </Button>
          }
        />
      )}
      <SubjectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((value) => ({ ...value, open }))}
        planId={activePlan.id}
        subject={dialog.subject}
      />
    </StudyPage>
  );
}
