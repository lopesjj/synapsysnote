"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, Link2, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Tooltip } from "@/components/ui/primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { notifyPlanError } from "@/lib/plans/client";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { addDays, formatDay, minuteLabel } from "@/lib/study/dates";
import { absorbExamQuestions, aggregate, groupSessions, percentLabel, performanceBand, topicKey } from "@/lib/study/metrics";
import { formatNumber, clockLabel } from "@/lib/study/format";
import { safeUrl } from "@/lib/study/normalize";
import { subjectTone } from "@/lib/study/defaults";
import type { StudyAggregate, StudySession, StudySubject, StudyTopic } from "@/types/study";
import { Meter, Sparkbars } from "../charts";
import { SubjectDialog } from "../subject-dialog";
import { AccuracyTag, CategoryChip, DurationFigure, FocusButton, MaterialLink, Panel, PanelLink, StudyEmpty, StudyLoading, StudyPage } from "../ui";
import { ReviewRow } from "../widgets";

export function SubjectDetailPage({ subjectId }: { subjectId: string }) {
  const { st, textDir, language } = useStudyT();
  const { ready, subjects, sessions, exams, reviews, plans, settings, today } = useStudy();
  const subject = subjects.find((entry) => entry.id === subjectId) ?? null;
  const plan = plans.find((entry) => entry.id === subject?.planId) ?? null;
  const locked = Boolean(plan?.archived);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (plan?.archived) useStudyUi.getState().setBrowsePlanId(plan.id);
  }, [plan?.archived, plan?.id]);

  const data = useMemo(() => {
    const own = sessions.filter((session) => session.subjectId === subjectId);
    const planId = subjects.find((entry) => entry.id === subjectId)?.planId;
    const planSubjects = subjects.filter((entry) => entry.planId === planId);
    const byDay = new Map<string, number>();
    for (const session of own) byDay.set(session.day, (byDay.get(session.day) ?? 0) + session.durationSec);
    return {
      sessions: own,
      total: absorbExamQuestions(
        aggregate(own),
        exams.filter((exam) => exam.planId === planId),
        planSubjects,
        subjectId
      ),
      byTopic: groupSessions(own, (session) => topicKey(session.subjectId, session.topicId)),
      byDay,
      pending: reviews
        .filter((review) => review.subjectId === subjectId && review.status === "pending" && review.dueDay <= addDays(today, 7))
        .sort((a, b) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : 0)),
    };
  }, [exams, reviews, sessions, subjectId, subjects, today]);

  if (!ready) return <StudyLoading />;
  if (!subject) {
    return (
      <StudyPage>
        <StudyEmpty
          art="subjects"
          title={st("subject_not_found")}
          description={st("subject_not_found_desc")}
          action={
            <Button variant="secondary" asChild>
              <Link href="/home/study/subjects">{st("back")}</Link>
            </Button>
          }
        />
      </StudyPage>
    );
  }

  const done = subject.topics.filter((topic) => topic.done).length;
  const band = performanceBand(data.total.accuracy, settings);

  return (
    <StudyPage>
      <Link href="/home/study/subjects" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition hover:text-ink">
        <ArrowLeft className="size-3.5" />
        {st("nav_subjects")}
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border)] pb-5">
        <div className="flex min-w-0 flex-[1_1_22rem] items-stretch gap-4">
          <span className="block w-1.5 shrink-0 rounded-full" style={{ backgroundColor: subjectTone(subject.color) }} />
          <div className="min-w-0">
            <h1 dir={textDir} className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
              {subject.name}
            </h1>
            <p className="mt-1.5 text-[13px] text-muted">
              {plan?.name ?? st("untitled_goal")} · {st("topics_count", { count: subject.topics.length })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {locked ? null : (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil />
              {st("edit")}
            </Button>
          )}
          <FocusButton variant="secondary" size="md" subjectId={subject.id} label={st("subject_start_focus")} />
          {locked ? null : (
            <Button variant="primary" onClick={() => useStudyUi.getState().openLog({ subjectId: subject.id })}>
              <Plus />
              {st("logform_title_new")}
            </Button>
          )}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--border)] lg:grid-cols-3">
        <div className="bg-[var(--surface)] px-5 py-4">
          <p className="text-[12px] font-medium text-muted">{st("kpi_time")}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <DurationFigure seconds={data.total.seconds} size="md" />
            <Sparkbars values={Array.from({ length: 14 }, (_, index) => data.byDay.get(addDays(today, index - 13)) ?? 0)} />
          </div>
        </div>
        <div className="bg-[var(--surface)] px-5 py-4">
          <p className="text-[12px] font-medium text-muted">{st("kpi_accuracy")}</p>
          <div className="mt-2">
            <AccuracyTag accuracy={data.total.accuracy} band={band} showLabel className="text-[15px] font-semibold" />
          </div>
          <p className="mt-1.5 text-[11.5px] tabular-nums text-faint">
            {data.total.questions
              ? st("kpi_accuracy_hint", { correct: formatNumber(data.total.correct, language), wrong: formatNumber(data.total.wrong, language) })
              : st("kpi_accuracy_empty")}
          </p>
        </div>
        <div className="col-span-2 bg-[var(--surface)] px-5 py-4 sm:col-span-1 lg:col-span-1">
          <p className="text-[12px] font-medium text-muted">{st("kpi_coverage")}</p>
          <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">
            {subject.topics.length ? Math.round((done / subject.topics.length) * 100) : 0}
            <span className="ml-0.5 text-[12px] font-medium tracking-normal text-muted">%</span>
          </p>
          <Meter value={done} max={subject.topics.length} className="mt-2" label={st("kpi_coverage")} />
          <p className="mt-1.5 text-[11.5px] text-faint">{st("kpi_coverage_hint", { done, total: subject.topics.length })}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TopicsPanel subject={subject} byTopic={data.byTopic} locked={locked} />
        <Panel
          title={st("subject_detail_reviews")}
          action={<PanelLink href="/home/study/reviews">{st("view_all")}</PanelLink>}
          className="self-start"
        >
          {data.pending.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.pending.map((review) => (
                <ReviewRow key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <p className="py-3 text-[12.5px] text-faint">{st("subject_detail_reviews_empty")}</p>
          )}
        </Panel>
      </div>

      <RecordsPanel subject={subject} sessions={data.sessions} locked={locked} />

      {locked ? null : <SubjectDialog open={editing} onOpenChange={setEditing} planId={subject.planId} subject={subject} />}
    </StudyPage>
  );
}

function TopicsPanel({
  subject,
  byTopic,
  locked = false,
}: {
  subject: StudySubject;
  byTopic: Map<string, StudyAggregate>;
  locked?: boolean;
}) {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const { actions, settings } = useStudy();
  const { adapter, pageById } = useWorkspace();

  const createNote = async (topic: StudyTopic) => {
    try {
      const page = await adapter.createPage({ title: topic.name, notebookId: subject.notebookId ?? null });
      await actions.updateTopic(subject.id, topic.id, { pageId: page.id });
      toast.success(st("topic_note_created"));
      router.push(`/home/p/${page.id}`);
    } catch (error) {
      if (!notifyPlanError(error)) toast.error(st("error_generic"));
    }
  };

  return (
    <Panel title={st("subject_detail_topics")} description={st("subject_detail_topics_desc")} bodyClassName="px-0 pb-1">
      {subject.topics.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-[12.5px]">
            <thead>
              <tr className="border-y border-[var(--border)] text-left text-[11px] text-faint">
                <th className="py-2 pl-5 pr-2 font-medium">{st("col_topic")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("correct_label")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("wrong_label")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("col_total")}</th>
                <th className="px-2 py-2 font-medium">{st("col_accuracy")}</th>
                <th className="px-2 py-2 font-medium">{st("col_last")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("col_sessions")}</th>
                <th className="py-2 pl-2 pr-5 text-right font-medium">{st("col_links")}</th>
              </tr>
            </thead>
            <tbody>
              {subject.topics.map((topic) => {
                const stats = byTopic.get(topicKey(subject.id, topic.id));
                const note = topic.pageId ? pageById(topic.pageId) : undefined;
                const noteAlive = Boolean(note && !note.deletedAt);
                return (
                  <tr key={topic.id} className={cn("border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]", topic.done && "bg-[var(--accent-soft)]/30")}>
                    <td className="max-w-[18rem] py-2 pl-5 pr-2">
                      <label className="flex items-start gap-2.5">
                        <Checkbox
                          checked={topic.done}
                          disabled={locked}
                          className="mt-[2px]"
                          onCheckedChange={(value) => {
                            if (locked) return;
                            void actions.updateTopic(subject.id, topic.id, { done: value === true });
                          }}
                          aria-label={topic.done ? st("topic_mark_pending") : st("topic_mark_done")}
                        />
                        <span className={cn("leading-snug", topic.done ? "text-muted" : "text-ink")}>{topic.name}</span>
                      </label>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--band-high)]">{stats?.correct ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--band-low)]">{stats?.wrong ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{stats?.questions ?? 0}</td>
                    <td className="px-2 py-2">
                      <AccuracyTag accuracy={stats?.accuracy ?? null} band={performanceBand(stats?.accuracy ?? null, settings)} />
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted">
                      {stats?.lastDay ? formatDay(stats.lastDay, locale, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{stats?.sessions ?? 0}</td>
                    <td className="py-1.5 pl-2 pr-5">
                      <div className="flex items-center justify-end gap-0.5">
                        {noteAlive ? (
                          <Tooltip label={note?.title || st("topic_open_note")}>
                            <Button variant="ghost" size="icon-sm" aria-label={st("topic_open_note")} onClick={() => router.push(`/home/p/${topic.pageId}`)}>
                              <FileText className="!text-[var(--accent)]" />
                            </Button>
                          </Tooltip>
                        ) : locked ? null : (
                          <Tooltip label={st("topic_create_note")}>
                            <Button variant="ghost" size="icon-sm" aria-label={st("topic_create_note")} onClick={() => void createNote(topic)}>
                              <FileText />
                            </Button>
                          </Tooltip>
                        )}
                        <TopicLinkButton subject={subject} topic={topic} locked={locked} />
                        <FocusButton variant="ghost" size="icon-sm" subjectId={subject.id} topicId={topic.id} label={st("subject_start_focus")} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-[12.5px] text-faint">{st("subject_topics_empty")}</p>
      )}
    </Panel>
  );
}

function TopicLinkButton({ subject, topic, locked = false }: { subject: StudySubject; topic: StudyTopic; locked?: boolean }) {
  const { st } = useStudyT();
  const { actions } = useStudy();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(topic.url ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = draft.trim();
    if (value && !safeUrl(value)) {
      setError(st("topic_link_invalid"));
      return;
    }
    await actions.updateTopic(subject.id, topic.id, { url: value || null });
    setOpen(false);
  };

  return (
    <div className="flex items-center">
      {topic.url ? (
        <Tooltip label={st("topic_link_open")}>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={topic.url} target="_blank" rel="noopener noreferrer" aria-label={st("topic_link_open")}>
              <ExternalLink className="!text-[var(--accent)]" />
            </a>
          </Button>
        </Tooltip>
      ) : null}
      {locked ? null : (
      <Popover
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setDraft(topic.url ?? "");
            setError(null);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={topic.url ? st("topic_link_edit") : st("topic_link_add")}>
            <Link2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2 p-3">
          <p className="text-[12px] font-medium text-ink">{topic.url ? st("topic_link_edit") : st("topic_link_add")}</p>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Input autoFocus type="url" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={st("topic_link_placeholder")} />
            {error ? <p className="text-[11.5px] text-[var(--danger)]">{error}</p> : null}
            <div className="flex justify-between gap-1.5">
              {topic.url ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-[var(--danger)]"
                  onClick={async () => {
                    await actions.updateTopic(subject.id, topic.id, { url: null });
                    setOpen(false);
                  }}
                >
                  {st("topic_link_remove")}
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" variant="primary">
                {st("save")}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
      )}
    </div>
  );
}

function RecordsPanel({ subject, sessions, locked = false }: { subject: StudySubject; sessions: StudySession[]; locked?: boolean }) {
  const { st, locale } = useStudyT();
  const { actions } = useStudy();
  const visible = sessions.slice(0, 60);
  const topicName = (id: string | null) => subject.topics.find((topic) => topic.id === id)?.name ?? st("no_topic");

  const remove = async (session: StudySession) => {
    if (!window.confirm(st("session_delete_confirm"))) return;
    try {
      await actions.deleteSession(session.id);
      toast.success(st("session_deleted"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <Panel
      className="mt-4"
      title={st("subject_detail_records")}
      description={st("subject_detail_records_desc")}
      action={<PanelLink href={`/home/study/log?subject=${subject.id}`}>{st("subject_detail_view_log")}</PanelLink>}
      bodyClassName="px-0 pb-1"
    >
      {visible.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-[12.5px]">
            <thead>
              <tr className="border-y border-[var(--border)] text-left text-[11px] text-faint">
                <th className="py-2 pl-5 pr-2 font-medium">{st("col_date")}</th>
                <th className="px-2 py-2 font-medium">{st("col_category")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("col_time")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("correct_label")}</th>
                <th className="px-2 py-2 text-right font-medium">{st("wrong_label")}</th>
                <th className="px-2 py-2 text-right font-medium">%</th>
                <th className="px-2 py-2 font-medium">{st("col_material")}</th>
                <th className="px-2 py-2 font-medium">{st("col_topic")}</th>
                <th className="py-2 pl-2 pr-5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((session) => {
                const total = session.correct + session.wrong;
                return (
                  <tr key={session.id} className="group border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                    <td className="whitespace-nowrap py-2 pl-5 pr-2 tabular-nums text-ink">
                      {formatDay(session.day, locale, { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {session.startMinute !== null ? <span className="ml-1.5 text-faint">{minuteLabel(session.startMinute)}</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      <CategoryChip id={session.categoryId} />
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-ink">{clockLabel(session.durationSec, true)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--band-high)]">{session.correct}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--band-low)]">{session.wrong}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{total ? percentLabel(session.correct / total) : "–"}</td>
                    <td className="max-w-[11rem] px-2 py-2 text-muted">
                      <MaterialLink material={session.material} pageId={session.pageId} />
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-2 text-ink" title={topicName(session.topicId)}>
                      {topicName(session.topicId)}
                    </td>
                    <td className="py-1.5 pl-2 pr-5">
                      <div className="flex items-center justify-end gap-0.5">
                        {session.comment ? (
                          <Tooltip label={session.comment.slice(0, 280)}>
                            <span className="flex size-7 items-center justify-center text-faint">
                              <MessageSquareText className="size-3.5" />
                            </span>
                          </Tooltip>
                        ) : null}
                        {locked ? null : (
                          <Button variant="ghost" size="icon-sm" aria-label={st("edit")} onClick={() => useStudyUi.getState().openLog(null, session.id)}>
                            <Pencil />
                          </Button>
                        )}
                        {locked ? null : (
                        <Button variant="ghost" size="icon-sm" aria-label={st("delete")} className="hover:text-[var(--danger)]" onClick={() => void remove(session)}>
                          <Trash2 />
                        </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-[12.5px] text-faint">{st("log_empty")}</p>
      )}
    </Panel>
  );
}
