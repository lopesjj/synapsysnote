"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, FileText, Link2, Link2Off, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/primitives";
import { DialogShell } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { buildNoteDirectory } from "@/lib/study/material";
import { groupSessions, performanceBand, topicKey, coverageOf } from "@/lib/study/metrics";
import { formatDay } from "@/lib/study/dates";
import type { StudyAggregate, StudySubject, StudyTopic } from "@/types/study";
import { Meter } from "../charts";
import { Combobox } from "../combobox";
import { SubjectDialog } from "../subject-dialog";
import { AccuracyTag, FocusButton, Segmented, StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";

type Filter = "all" | "pending" | "done";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function SyllabusPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_syllabus")}>
      <SyllabusBody />
    </StudyGate>
  );
}

function SyllabusBody() {
  const { st } = useStudyT();
  const params = useSearchParams();
  const focusSubject = params.get("subject");
  const { activePlan, planSubjects, planSessions, settings } = useStudy();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => (focusSubject ? { [focusSubject]: true } : {}));
  const [editing, setEditing] = useState<StudySubject | null>(null);
  const [linking, setLinking] = useState<{ subject: StudySubject; topic: StudyTopic } | null>(null);

  useEffect(() => {
    if (!focusSubject) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`subject-${focusSubject}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusSubject]);

  const byTopic = useMemo(() => groupSessions(planSessions, (session) => topicKey(session.subjectId, session.topicId)), [planSessions]);
  const bySubject = useMemo(() => groupSessions(planSessions, (session) => session.subjectId), [planSessions]);
  const coverage = coverageOf(planSubjects);
  const q = normalize(query.trim());

  if (!activePlan) return null;

  const visibleTopics = (subject: StudySubject) =>
    subject.topics.filter((topic) => {
      if (filter === "pending" && topic.done) return false;
      if (filter === "done" && !topic.done) return false;
      if (q && !normalize(topic.name).includes(q) && !normalize(subject.name).includes(q)) return false;
      return true;
    });

  const sections = planSubjects.map((subject) => ({ subject, topics: visibleTopics(subject) })).filter((entry) => (!q && filter === "all" ? true : entry.topics.length > 0));
  const allOpen = sections.length > 0 && sections.every((entry) => open[entry.subject.id]);

  return (
    <StudyPage>
      <StudyHeader title={st("nav_syllabus")} subtitle={st("syllabus_subtitle")} />
      <section className="mb-5 rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-muted">{st("kpi_coverage")}</p>
            <p className="mt-1 text-[13px] text-ink">{st("syllabus_progress", { done: coverage.done, total: coverage.total })}</p>
          </div>
          <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">
            {Math.round(coverage.ratio * 100)}
            <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted">%</span>
          </span>
        </div>
        <Meter value={coverage.done} max={coverage.total} className="mt-3 h-2" label={st("kpi_coverage")} />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          size="md"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: st("syllabus_filter_all") },
            { value: "pending", label: st("syllabus_filter_pending") },
            { value: "done", label: st("syllabus_filter_done") },
          ]}
        />
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={st("syllabus_search")} className="pl-8" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() =>
            setOpen(allOpen ? {} : Object.fromEntries(sections.map((entry) => [entry.subject.id, true])))
          }
        >
          {allOpen ? st("syllabus_collapse_all") : st("syllabus_expand_all")}
        </Button>
      </div>

      {sections.length ? (
        <div className="space-y-2">
          {sections.map(({ subject, topics }) => {
            const agg = bySubject.get(subject.id);
            const done = subject.topics.filter((topic) => topic.done).length;
            const expanded = Boolean(open[subject.id]) || Boolean(q);
            return (
              <section
                key={subject.id}
                id={`subject-${subject.id}`}
                className="scroll-mt-4 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen((value) => ({ ...value, [subject.id]: !value[subject.id] }))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={expanded}
                  >
                    <ChevronRight className={cn("size-4 shrink-0 text-faint transition-transform", expanded && "rotate-90")} />
                    <span className="block h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{subject.name}</span>
                  </button>
                  <div className="hidden items-center gap-4 text-[12px] tabular-nums md:flex">
                    <span className="text-muted">
                      <span className="text-[var(--band-high)]">{agg?.correct ?? 0}</span>
                      <span className="text-faint"> / </span>
                      <span className="text-[var(--band-low)]">{agg?.wrong ?? 0}</span>
                    </span>
                    <AccuracyTag accuracy={agg?.accuracy ?? null} band={performanceBand(agg?.accuracy ?? null, settings)} />
                  </div>
                  <div className="flex w-28 items-center gap-2 max-sm:w-20">
                    <Meter value={done} max={subject.topics.length} label={st("col_coverage")} />
                    <span className="shrink-0 text-[11px] tabular-nums text-faint">
                      {done}/{subject.topics.length}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={st("edit")} onClick={() => setEditing(subject)}>
                    <Pencil />
                  </Button>
                </div>
                {expanded ? (
                  <ul className="border-t border-[var(--border)]">
                    {topics.length ? (
                      topics.map((topic) => (
                        <TopicLine
                          key={topic.id}
                          subject={subject}
                          topic={topic}
                          stats={byTopic.get(topicKey(subject.id, topic.id))}
                          onLink={() => setLinking({ subject, topic })}
                        />
                      ))
                    ) : (
                      <li className="px-12 py-3 text-[12px] text-faint">{st("subject_topics_empty")}</li>
                    )}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : planSubjects.length ? (
        <StudyEmpty title={st("syllabus_no_match")} />
      ) : (
        <StudyEmpty art="subjects" title={st("empty_subjects_title")} description={st("empty_subjects_desc")} />
      )}

      <SubjectDialog open={Boolean(editing)} onOpenChange={(value) => !value && setEditing(null)} planId={activePlan.id} subject={editing} />
      <LinkNoteDialog target={linking} onClose={() => setLinking(null)} />
    </StudyPage>
  );
}

function TopicLine({
  subject,
  topic,
  stats,
  onLink,
}: {
  subject: StudySubject;
  topic: StudyTopic;
  stats: StudyAggregate | undefined;
  onLink: () => void;
}) {
  const { st, locale, duration } = useStudyT();
  const router = useRouter();
  const { actions, settings } = useStudy();
  const { adapter, pageById } = useWorkspace();
  const note = topic.pageId ? pageById(topic.pageId) : undefined;
  const noteAlive = Boolean(note && !note.deletedAt);

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
    <li className="group flex items-center gap-3 border-b border-[var(--border)] px-4 py-2 pl-11 last:border-b-0 hover:bg-[var(--surface-hover)]">
      <Checkbox
        checked={topic.done}
        onCheckedChange={(value) => void actions.updateTopic(subject.id, topic.id, { done: value === true })}
        aria-label={topic.done ? st("topic_mark_pending") : st("topic_mark_done")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] leading-snug", topic.done ? "text-muted" : "text-ink")}>{topic.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-faint">
          {stats ? (
            <>
              {stats.seconds ? <span>{duration(stats.seconds)}</span> : null}
              {stats.questions ? <span>{st("questions_count", { count: stats.questions })}</span> : null}
              {stats.lastDay ? <span>{formatDay(stats.lastDay, locale)}</span> : null}
            </>
          ) : (
            <span>{st("topic_no_stats")}</span>
          )}
          {noteAlive ? (
            <button type="button" onClick={() => router.push(`/home/p/${topic.pageId}`)} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
              <FileText className="size-3" />
              {note?.title || st("topic_open_note")}
            </button>
          ) : null}
        </p>
      </div>
      <AccuracyTag accuracy={stats?.accuracy ?? null} band={performanceBand(stats?.accuracy ?? null, settings)} className="hidden sm:inline-flex" />
      <div className="flex items-center gap-0.5 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <FocusButton variant="ghost" size="icon-sm" subjectId={subject.id} topicId={topic.id} label={st("subject_start_focus")} />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => useStudyUi.getState().openLog({ subjectId: subject.id, topicId: topic.id })}>
              <Plus /> {st("logform_title_new")}
            </MenuItem>
            <MenuSeparator />
            {noteAlive ? (
              <MenuItem onSelect={() => router.push(`/home/p/${topic.pageId}`)}>
                <FileText /> {st("topic_open_note")}
              </MenuItem>
            ) : (
              <MenuItem onSelect={() => void createNote()}>
                <FileText /> {st("topic_create_note")}
              </MenuItem>
            )}
            <MenuItem onSelect={onLink}>
              <Link2 /> {st("topic_link_note")}
            </MenuItem>
            {topic.pageId ? (
              <MenuItem onSelect={() => void actions.updateTopic(subject.id, topic.id, { pageId: null })}>
                <Link2Off /> {st("topic_unlink_note")}
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
      </div>
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
