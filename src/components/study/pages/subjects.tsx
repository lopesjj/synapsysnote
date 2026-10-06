"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Link2,
  Link2Off,
  Lock,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Kbd, Tooltip } from "@/components/ui/primitives";
import { DialogShell } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { buildNoteDirectory } from "@/lib/study/material";
import { coverageOf, groupSessions, groupWithExams, performanceBand, topicKey, type CoverageInfo } from "@/lib/study/metrics";
import { diffDays } from "@/lib/study/dates";
import { subjectTone } from "@/lib/study/defaults";
import type { StudyAggregate, StudySubject, StudyTopic } from "@/types/study";
import { Combobox } from "../combobox";
import { SubjectDialog } from "../subject-dialog";
import { AccuracyTag, CompletionMark, FocusButton, Segmented, StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";
import { relativeDay } from "../widgets";
import { usePlanGates } from "@/lib/plans/gates";
import { GateTooltip, PlanLockBadge } from "@/components/plans/plan-lock";

type SortKey = "custom" | "time" | "accuracy" | "coverage" | "stale";
type Filter = "all" | "pending" | "done";

interface SubjectRow {
  subject: StudySubject;
  agg: StudyAggregate | undefined;
  done: number;
  ratio: number;
  stale: number;
  topics: StudyTopic[];
  visible: boolean;
}

const GRID = "lg:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_5.5rem_6rem_7.5rem_4.25rem]";
const SEGMENTED_LIMIT = 8;
const CARD = "rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]";
const FILTER_KEY: Record<Filter, StudyKey> = {
  all: "syllabus_filter_all",
  pending: "syllabus_filter_pending",
  done: "syllabus_filter_done",
};
const SORT_KEY: Record<SortKey, StudyKey> = {
  custom: "sort_custom",
  time: "sort_time",
  accuracy: "sort_accuracy",
  coverage: "sort_coverage",
  stale: "sort_stale",
};

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function revealSubject(id: string) {
  window.setTimeout(() => {
    document.getElementById(`subject-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

export function SubjectsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_subjects")}>
      <Suspense fallback={null}>
        <SubjectsBody />
      </Suspense>
    </StudyGate>
  );
}

function SubjectsBody() {
  const { st } = useStudyT();
  const params = useSearchParams();
  const focusSubject = params.get("subject");
  const { focusPlan, planReadOnly, planArchived, planSubjects, planSessions, planExams, today } = useStudy();
  const writeGate = usePlanGates().write;
  const [sort, setSort] = useState<SortKey>("custom");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => (focusSubject ? { [focusSubject]: true } : {}));
  const [dialog, setDialog] = useState<{ open: boolean; subject: StudySubject | null }>({ open: false, subject: null });
  const [linking, setLinking] = useState<{ subject: StudySubject; topic: StudyTopic } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSubject) revealSubject(focusSubject);
  }, [focusSubject]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const bySubject = useMemo(() => groupWithExams(planSessions, planExams, planSubjects), [planExams, planSessions, planSubjects]);
  const byTopic = useMemo(() => groupSessions(planSessions, (session) => topicKey(session.subjectId, session.topicId)), [planSessions]);
  const coverage = useMemo(() => coverageOf(planSubjects), [planSubjects]);
  const q = fold(query.trim());

  const rows = useMemo(() => {
    const list: SubjectRow[] = planSubjects.map((subject) => {
      const agg = bySubject.get(subject.id);
      const done = subject.topics.filter((topic) => topic.done).length;
      const nameHit = Boolean(q) && fold(subject.name).includes(q);
      const topics = subject.topics.filter((topic) => {
        if (filter === "pending" && topic.done) return false;
        if (filter === "done" && !topic.done) return false;
        return !q || nameHit || fold(topic.name).includes(q);
      });
      return {
        subject,
        agg,
        done,
        ratio: subject.topics.length ? done / subject.topics.length : 0,
        stale: agg?.lastDay ? diffDays(agg.lastDay, today) : Number.POSITIVE_INFINITY,
        topics,
        visible: topics.length > 0 || (filter === "all" && (!q || nameHit)),
      };
    });
    if (sort === "time") list.sort((a, b) => (b.agg?.seconds ?? 0) - (a.agg?.seconds ?? 0));
    if (sort === "accuracy") list.sort((a, b) => (a.agg?.accuracy ?? 2) - (b.agg?.accuracy ?? 2));
    if (sort === "coverage") list.sort((a, b) => a.ratio - b.ratio);
    if (sort === "stale") list.sort((a, b) => b.stale - a.stale);
    return list.filter((row) => row.visible);
  }, [bySubject, filter, planSubjects, q, sort, today]);

  if (!focusPlan) return null;

  const filtering = Boolean(q) || filter !== "all";
  const allOpen = rows.length > 0 && rows.every((row) => open[row.subject.id]);
  const counts: Record<Filter, number> = { all: coverage.total, pending: coverage.total - coverage.done, done: coverage.done };

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
  };

  const toggleAll = () => setOpen(allOpen ? {} : Object.fromEntries(rows.map((row) => [row.subject.id, true])));

  const pick = (id: string) => {
    if (!rows.some((row) => row.subject.id === id)) clearFilters();
    setOpen((value) => ({ ...value, [id]: true }));
    revealSubject(id);
  };

  return (
    <StudyPage>
      <StudyHeader
        title={st("nav_subjects")}
        subtitle={st("subjects_subtitle", { goal: focusPlan.name || st("untitled_goal") })}
        actions={
          planArchived ? null : (
            <GateTooltip gate={writeGate}>
              <Button
                variant="secondary"
                disabled={!writeGate.allowed}
                onClick={() => setDialog({ open: true, subject: null })}
              >
                {writeGate.allowed ? <Plus /> : <Lock />}
                {st("goal_add_subject")}
              </Button>
            </GateTooltip>
          )
        }
      />

      {planSubjects.length ? (
        <>
          <CoverageMap subjects={planSubjects} coverage={coverage} onPick={pick} />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Segmented<Filter>
                size="md"
                value={filter}
                onChange={setFilter}
                ariaLabel={st("subject_topics")}
                options={(Object.keys(FILTER_KEY) as Filter[]).map((value) => ({
                  value,
                  label: (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {st(FILTER_KEY[value])}
                      <span className="tabular-nums text-faint">{counts[value]}</span>
                    </span>
                  ),
                }))}
              />
            </div>
            <label className="relative min-w-[10rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  setQuery("");
                  event.currentTarget.blur();
                }}
                placeholder={st("syllabus_search")}
                aria-label={st("syllabus_search")}
                className="h-8 pl-8 pr-8"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label={st("subjects_clear_filters")}
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-sm:hidden">/</Kbd>
              )}
            </label>
            <div className="flex w-full items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-end">
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={`${st("sort_label")}: ${st(SORT_KEY[sort])}`}>
                    <ArrowDownUp />
                    {st(SORT_KEY[sort])}
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuLabel>{st("sort_label")}</MenuLabel>
                  {(Object.keys(SORT_KEY) as SortKey[]).map((key) => (
                    <MenuItem key={key} onSelect={() => setSort(key)}>
                      <Check className={cn(key === sort ? "!text-[var(--accent)]" : "opacity-0")} />
                      {st(SORT_KEY[key])}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <ExpandAllButton expanded={allOpen || filtering} disabled={filtering || !rows.length} onClick={toggleAll} className="lg:hidden" />
            </div>
          </div>

          {rows.length ? (
            <div className={cn(CARD, "overflow-hidden")}>
              <div className={cn("hidden items-center gap-3 border-b border-[var(--border)] px-4 py-1.5 text-[11px] font-medium text-faint lg:grid", GRID)}>
                <span className="flex items-center gap-[23px]">
                  <ExpandAllButton expanded={allOpen || filtering} disabled={filtering} onClick={toggleAll} />
                  {st("col_subject")}
                </span>
                <span>{st("subject_topics")}</span>
                <span className="text-right">{st("col_time")}</span>
                <span className="text-right">{st("questions_label")}</span>
                <span>{st("col_accuracy")}</span>
                <span className="text-right">{st("col_last")}</span>
                <span aria-hidden />
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <SubjectGroup
                    key={row.subject.id}
                    row={row}
                    query={q}
                    expanded={filtering || Boolean(open[row.subject.id])}
                    composing={!filtering && !planReadOnly}
                    byTopic={byTopic}
                    onToggle={() => setOpen((value) => ({ ...value, [row.subject.id]: !value[row.subject.id] }))}
                    onEdit={() => setDialog({ open: true, subject: row.subject })}
                    onLink={(topic) => setLinking({ subject: row.subject, topic })}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <StudyEmpty
              title={st("syllabus_no_match")}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  {st("subjects_clear_filters")}
                </Button>
              }
            />
          )}
        </>
      ) : (
        <StudyEmpty
          art="subjects"
          title={st("empty_subjects_title")}
          description={st("empty_subjects_desc")}
          action={
            planArchived ? undefined : (
              <GateTooltip gate={writeGate}>
                <Button
                  variant="primary"
                  disabled={!writeGate.allowed}
                  onClick={() => setDialog({ open: true, subject: null })}
                >
                  {writeGate.allowed ? <Plus /> : <Lock />}
                  {st("empty_subjects_cta")}
                </Button>
              </GateTooltip>
            )
          }
        />
      )}

      <SubjectDialog
        open={dialog.open}
        onOpenChange={(value) => setDialog((current) => ({ ...current, open: value }))}
        planId={focusPlan.id}
        subject={dialog.subject}
      />
      <LinkNoteDialog target={linking} onClose={() => setLinking(null)} />
    </StudyPage>
  );
}

function ExpandAllButton({
  expanded,
  disabled,
  onClick,
  className,
}: {
  expanded: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  const { st } = useStudyT();
  const label = expanded ? st("syllabus_collapse_all") : st("syllabus_expand_all");
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={label} onClick={onClick} className={className}>
        {expanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
      </Button>
    </Tooltip>
  );
}

function CoverageMap({
  subjects,
  coverage,
  onPick,
}: {
  subjects: readonly StudySubject[];
  coverage: CoverageInfo;
  onPick: (id: string) => void;
}) {
  const { st } = useStudyT();
  const mapped = subjects.filter((subject) => subject.topics.length > 0);
  const pending = coverage.total - coverage.done;
  return (
    <section className={cn(CARD, "mb-6 px-5 pb-4 pt-4 sm:px-6")}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-muted">{st("kpi_coverage")}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink">
              {Math.round(coverage.ratio * 100)}
              <span className="ml-0.5 text-[14px] font-medium tracking-normal text-muted">%</span>
            </span>
            <span className="text-[12.5px] text-muted">{st("syllabus_progress", { done: coverage.done, total: coverage.total })}</span>
          </div>
        </div>
        <p className="text-[12px] tabular-nums text-faint">
          {st("subjects_count", { count: subjects.length })}
          {pending ? ` · ${st("topics_pending_long", { count: pending })}` : ""}
        </p>
      </div>
      {mapped.length ? (
        <div className="mt-4 flex items-center gap-[3px]">
          {mapped.map((subject) => {
            const done = subject.topics.filter((topic) => topic.done).length;
            const label = `${subject.name} · ${st("kpi_coverage_hint", { done, total: subject.topics.length })}`;
            return (
              <Tooltip key={subject.id} label={label} side="top">
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => onPick(subject.id)}
                  className="group/segment flex h-5 min-w-2 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
                  style={{ flex: `${subject.topics.length} 1 0%` }}
                >
                  <span
                    className="relative h-2.5 w-full overflow-hidden rounded-full transition-[height] duration-200 ease-out group-hover/segment:h-3.5"
                    style={{ backgroundColor: `color-mix(in oklab, ${subjectTone(subject.color)} 20%, var(--surface-2))` }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ width: `${(done / subject.topics.length) * 100}%`, backgroundColor: subjectTone(subject.color) }}
                    />
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function TopicTrack({ topics }: { topics: StudyTopic[] }) {
  const { st } = useStudyT();
  const total = topics.length;
  const done = topics.filter((topic) => topic.done).length;
  return (
    <span className="flex min-w-[6.5rem] items-center gap-2.5 sm:min-w-[8rem] lg:min-w-0">
      <span
        role="progressbar"
        aria-label={st("col_coverage")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="flex h-1.5 flex-1 gap-[2px]"
      >
        {total && total <= SEGMENTED_LIMIT ? (
          topics.map((topic) => (
            <span
              key={topic.id}
              className="h-full flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: topic.done ? "var(--text-muted)" : "var(--surface-2)" }}
            />
          ))
        ) : (
          <span className="relative h-full flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--text-muted)] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </span>
        )}
      </span>
      <span className={cn("min-w-[2.25rem] shrink-0 text-[11px] tabular-nums", total > 0 && done === total ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-faint")}>
        {done}/{total}
      </span>
    </span>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const folded = query ? fold(text) : "";
  const index = folded.indexOf(query);
  if (!query || index < 0 || folded.length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-[var(--accent-soft)] px-px text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function SubjectGroup({
  row,
  query,
  expanded,
  composing,
  byTopic,
  onToggle,
  onEdit,
  onLink,
}: {
  row: SubjectRow;
  query: string;
  expanded: boolean;
  composing: boolean;
  byTopic: Map<string, StudyAggregate>;
  onToggle: () => void;
  onEdit: () => void;
  onLink: (topic: StudyTopic) => void;
}) {
  const { st, duration, locale } = useStudyT();
  const { planArchived } = useStudy();
  const writeGate = usePlanGates().write;
  const router = useRouter();
  const { settings, today } = useStudy();
  const { subject, agg, done, stale, topics } = row;
  const total = subject.topics.length;
  const pending = total - done;
  const panelId = `topics-${subject.id}`;

  return (
    <li id={`subject-${subject.id}`} className="scroll-mt-6">
      <div className={cn("group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]", GRID)}>
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? st("subject_hide_topics") : st("subject_show_topics")}
            className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-faint transition hover:bg-[var(--surface-2)] hover:text-ink"
          >
            <ChevronRight className={cn("size-4 transition-transform duration-200 ease-out", expanded && "rotate-90")} />
          </button>
          <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subjectTone(subject.color) }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/home/study/subjects/${subject.id}`}
                className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-ink decoration-[var(--border-strong)] underline-offset-[3px] hover:underline"
              >
                <Highlight text={subject.name} query={query} />
              </Link>
              {total > 0 && done === total ? (
                <CompletionMark label={st("subject_complete_mark")} title={st("subject_completed_badge")} />
              ) : null}
            </div>
            <button type="button" onClick={onToggle} tabIndex={-1} className="mt-0.5 block max-w-full truncate text-left text-[11.5px] text-faint transition hover:text-muted">
              {st("topics_count", { count: total })}
              {total && pending ? ` · ${st("topics_pending_short", { count: pending })}` : ""}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-0.5 lg:order-last lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-within:opacity-100">
          <FocusButton variant="ghost" size="icon-sm" subjectId={subject.id} label={st("subject_start_focus")} />
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {planArchived ? null : (
                <MenuItem
                  disabled={!writeGate.allowed}
                  onSelect={() => useStudyUi.getState().openLog({ subjectId: subject.id })}
                >
                  <Plus /> {st("logform_title_new")}
                  <PlanLockBadge gate={writeGate} />
                </MenuItem>
              )}
              <MenuItem onSelect={() => router.push(`/home/study/subjects/${subject.id}`)}>
                <ArrowUpRight /> {st("subject_open")}
              </MenuItem>
              {subject.notebookId ? (
                <MenuItem onSelect={() => router.push(`/home/n/${subject.notebookId}`)}>
                  <NotebookPen /> {st("subject_open_notebook")}
                </MenuItem>
              ) : null}
              {planArchived ? null : (
                <>
                  <MenuSeparator />
                  <MenuItem disabled={!writeGate.allowed} onSelect={onEdit}>
                    <Pencil /> {st("edit")}
                    <PlanLockBadge gate={writeGate} />
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-9 text-[12px] sm:gap-x-4 sm:pl-[51px] lg:contents">
          <TopicTrack topics={subject.topics} />
          <span className="tabular-nums text-ink lg:text-right">{agg?.seconds ? duration(agg.seconds) : <span className="text-faint">–</span>}</span>
          <span className="tabular-nums lg:text-right" title={st("questions_label")}>
            {agg?.questions ? (
              <>
                <span className="text-ink">{agg.correct}</span>
                <span className="text-faint">/{agg.questions}</span>
              </>
            ) : (
              <span className="text-faint">–</span>
            )}
          </span>
          <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
          <span
            className={cn("whitespace-nowrap text-[11.5px] tabular-nums lg:text-right", stale > 14 ? "text-[var(--band-low)]" : "text-faint")}
            title={Number.isFinite(stale) && stale > 0 ? st("next_up_reason_stale", { count: stale }) : undefined}
          >
            {agg?.lastDay ? relativeDay(agg.lastDay, today, locale, st) : st("never")}
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="topics"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ul className="relative pb-2.5">
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-5 left-[55px] top-0 w-px"
                style={{ backgroundColor: `color-mix(in oklab, ${subjectTone(subject.color)} 38%, transparent)` }}
              />
              {topics.length ? (
                topics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    subject={subject}
                    topic={topic}
                    stats={byTopic.get(topicKey(subject.id, topic.id))}
                    query={query}
                    onLink={() => onLink(topic)}
                  />
                ))
              ) : (
                <li className="py-2 pl-[67px] pr-4 text-[12px] text-faint">{st("subject_topics_empty")}</li>
              )}
              {composing ? <TopicComposer subject={subject} /> : null}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function TopicRow({
  subject,
  topic,
  stats,
  query,
  onLink,
}: {
  subject: StudySubject;
  topic: StudyTopic;
  stats: StudyAggregate | undefined;
  query: string;
  onLink: () => void;
}) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const { actions, settings, today, planReadOnly, planArchived } = useStudy();
  const writeGate = usePlanGates().write;
  const { adapter, pageById } = useWorkspace();
  const note = topic.pageId ? pageById(topic.pageId) : undefined;
  const noteAlive = Boolean(note && !note.deletedAt);
  const band = performanceBand(stats?.accuracy ?? null, settings);
  const compact = [
    stats?.seconds ? duration(stats.seconds) : null,
    stats?.questions ? st("questions_count", { count: stats.questions }) : null,
    stats?.accuracy !== null && stats?.accuracy !== undefined ? `${Math.round(stats.accuracy * 100)}%` : null,
  ].filter(Boolean);

  const createNote = async () => {
    try {
      const page = await adapter.createPage({ title: topic.name, notebookId: subject.notebookId ?? null });
      await actions.updateTopic(subject.id, topic.id, { pageId: page.id });
      toast.success(st("topic_note_created"));
      router.push(`/home/p/${page.id}`);
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <li className={cn("group/topic grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-[7px] transition-colors hover:bg-[var(--surface-hover)]", GRID)}>
      <div className="flex min-w-0 items-start gap-2.5 pl-[51px] lg:col-span-2">
        <Checkbox
          checked={topic.done}
          disabled={planReadOnly}
          onCheckedChange={(value) => {
            if (planReadOnly) return;
            void actions.updateTopic(subject.id, topic.id, { done: value === true });
          }}
          aria-label={topic.done ? st("topic_mark_pending") : st("topic_mark_done")}
          className="mt-[2px] data-[state=checked]:border-[var(--topic)] data-[state=checked]:bg-[var(--topic)]"
          style={{ "--topic": subjectTone(subject.color) } as CSSProperties}
        />
        <div className="min-w-0">
          <p className={cn("text-[13px] leading-snug transition-colors", topic.done ? "text-muted" : "text-ink")}>
            <Highlight text={topic.name} query={query} />
          </p>
          {compact.length || noteAlive || topic.url ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-faint">
              {compact.length ? <span className="tabular-nums lg:hidden">{compact.join(" · ")}</span> : null}
              {noteAlive ? (
                <button
                  type="button"
                  onClick={() => router.push(`/home/p/${topic.pageId}`)}
                  className="inline-flex max-w-[18rem] items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate">{note?.title || st("topic_open_note")}</span>
                </button>
              ) : null}
              {topic.url ? (
                <a href={topic.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                  <ExternalLink className="size-3 shrink-0" />
                  {st("topic_link_open")}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-0.5 lg:order-last lg:opacity-0 lg:transition-opacity lg:group-hover/topic:opacity-100 lg:focus-within:opacity-100">
        <FocusButton variant="ghost" size="icon-sm" subjectId={subject.id} topicId={topic.id} label={st("subject_start_focus")} />
        {planArchived && !noteAlive ? null : (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            {planArchived ? null : (
              <MenuItem
                disabled={!writeGate.allowed}
                onSelect={() => useStudyUi.getState().openLog({ subjectId: subject.id, topicId: topic.id })}
              >
                <Plus /> {st("logform_title_new")}
                <PlanLockBadge gate={writeGate} />
              </MenuItem>
            )}
            {noteAlive ? (
              <MenuItem onSelect={() => router.push(`/home/p/${topic.pageId}`)}>
                <FileText /> {st("topic_open_note")}
              </MenuItem>
            ) : planArchived ? null : (
              <MenuItem disabled={!writeGate.allowed} onSelect={() => void createNote()}>
                <FileText /> {st("topic_create_note")}
                <PlanLockBadge gate={writeGate} />
              </MenuItem>
            )}
            {planArchived ? null : (
              <MenuItem disabled={!writeGate.allowed} onSelect={onLink}>
                <Link2 /> {st("topic_link_note")}
                <PlanLockBadge gate={writeGate} />
              </MenuItem>
            )}
            {topic.pageId && !planArchived ? (
              <MenuItem
                disabled={!writeGate.allowed}
                onSelect={() => void actions.updateTopic(subject.id, topic.id, { pageId: null })}
              >
                <Link2Off /> {st("topic_unlink_note")}
                <PlanLockBadge gate={writeGate} />
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
        )}
      </div>

      <span className="hidden text-right text-[12px] tabular-nums text-muted lg:block">{stats?.seconds ? duration(stats.seconds) : null}</span>
      <span className="hidden text-right text-[12px] tabular-nums lg:block">
        {stats?.questions ? (
          <>
            <span className="text-muted">{stats.correct}</span>
            <span className="text-faint">/{stats.questions}</span>
          </>
        ) : null}
      </span>
      <span className="hidden lg:block">{stats?.accuracy !== null && stats?.accuracy !== undefined ? <AccuracyTag accuracy={stats.accuracy} band={band} /> : null}</span>
      <span className="hidden whitespace-nowrap text-right text-[11.5px] tabular-nums text-faint lg:block">
        {stats?.lastDay ? relativeDay(stats.lastDay, today, locale, st) : null}
      </span>
    </li>
  );
}

function TopicComposer({ subject }: { subject: StudySubject }) {
  const { st } = useStudyT();
  const { actions } = useStudy();
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      await actions.addTopic(subject.id, clean);
      setName("");
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="pl-[63px] pr-4 pt-1">
      {active ? (
        <form
          className="flex max-w-xl items-center gap-2 py-0.5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              setName("");
              setActive(false);
            }}
            onBlur={() => {
              if (!name.trim()) setActive(false);
            }}
            placeholder={st("editor_add_topic")}
            aria-label={st("subject_topic_add")}
            className="h-8"
          />
          <Kbd className="shrink-0 max-sm:hidden">↵</Kbd>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="inline-flex h-7 items-center gap-2 rounded-[8px] px-1 pr-2 text-[12px] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Plus className="size-3.5" />
          {st("subject_topic_add")}
        </button>
      )}
    </li>
  );
}

function LinkNoteDialog({ target, onClose }: { target: { subject: StudySubject; topic: StudyTopic } | null; onClose: () => void }) {
  const { st } = useStudyT();
  const { livePages, notebooks } = useWorkspace();
  const { actions } = useStudy();
  const options = useMemo(
    () =>
      buildNoteDirectory(livePages, notebooks, st("material_note_badge"))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 600)
        .map((entry) => ({ id: entry.id, label: entry.title, detail: entry.trail.join(" › ") || st("material_no_notebook") })),
    [livePages, notebooks, st]
  );
  return (
    <DialogShell open={Boolean(target)} onOpenChange={(value) => !value && onClose()} className="max-w-md overflow-visible">
      {target ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <div className="pr-8">
            <h2 className="text-[15px] font-semibold text-ink">{st("topic_link_note")}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{target.topic.name}</p>
          </div>
          <Combobox
            autoFocus
            ariaLabel={st("logform_note")}
            options={options}
            value={target.topic.pageId}
            placeholder={st("logform_note")}
            onSelect={async (id) => {
              await actions.updateTopic(target.subject.id, target.topic.id, { pageId: id });
              onClose();
            }}
          />
        </div>
      ) : null}
    </DialogShell>
  );
}
