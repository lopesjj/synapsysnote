"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, MessageSquareText, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { useLiveNote } from "@/lib/study/hooks";
import { addDays, capitalizeFirst, formatDay, minuteLabel } from "@/lib/study/dates";
import { absorbExamQuestions, aggregate, examTotals, EXAM_OTHER_SUBJECT, percentLabel, resolveExamSubjectId } from "@/lib/study/metrics";
import { formatNumber } from "@/lib/study/format";
import { subjectTone } from "@/lib/study/defaults";
import type { MockExam, StudySession } from "@/types/study";
import { CategoryChip, DurationFigure, MaterialLink, Segmented, SelectFilter, StudyEmpty, StudyGate, StudyHeader, StudyPage, useCategoryLabel } from "../ui";
import { ExamDialog } from "../exam-dialog";
import { relativeDay } from "../widgets";
import { usePlanGates } from "@/lib/plans/gates";

type Period = "7" | "30" | "90" | "365" | "all";

type LogRow = { kind: "session"; session: StudySession } | { kind: "exam"; exam: MockExam };

export function LogPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("log_title")}>
      <LogBody />
    </StudyGate>
  );
}

function LogBody() {
  const { st, locale, duration, language } = useStudyT();
  const categoryLabel = useCategoryLabel();
  const { planSessions, planExams, planSubjects, settings, topicById, actions, today, planArchived } = useStudy();
  const writeGate = usePlanGates().write;
  const editLock = writeGate.allowed ? null : writeGate.reason;
  const [examDialog, setExamDialog] = useState<{ open: boolean; exam: MockExam | null }>({ open: false, exam: null });
  const liveNote = useLiveNote();
  const materialText = useCallback(
    (session: StudySession) =>
      [liveNote(session.pageId)?.title ?? "", session.material]
        .filter((part, index, list) => part && list.indexOf(part) === index)
        .join(" · "),
    [liveNote]
  );
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>(() => (params.get("subject") ? "all" : "30"));
  const [subjectId, setSubjectId] = useState(() => params.get("subject") ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const from = period === "all" ? null : addDays(today, -(Number(period) - 1));
    const q = query.trim().toLowerCase();
    const sessions = planSessions.filter((session) => {
      if (from && session.day < from) return false;
      if (subjectId && session.subjectId !== subjectId) return false;
      if (categoryId && session.categoryId !== categoryId) return false;
      if (q) {
        const topic = topicById(session.subjectId, session.topicId)?.name ?? "";
        const haystack = `${topic} ${materialText(session)} ${session.comment}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const exams = categoryId
      ? []
      : planExams.filter((exam) => {
          if (from && exam.day < from) return false;
          if (subjectId && !exam.rows.some((row) => resolveExamSubjectId(row, planSubjects) === subjectId)) return false;
          if (q) {
            const subjects = exam.rows.map((row) => row.name).join(" ");
            const haystack = `${exam.name} ${exam.board} ${exam.comment} ${subjects}`.toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        });
    return { sessions, exams };
  }, [categoryId, materialText, period, planExams, planSessions, planSubjects, query, subjectId, today, topicById]);

  const totals = useMemo(() => {
    const base = absorbExamQuestions(aggregate(filtered.sessions), filtered.exams, planSubjects, subjectId || null);
    base.seconds += filtered.exams.reduce((sum, exam) => sum + Math.max(0, exam.durationSec), 0);
    return base;
  }, [filtered.exams, filtered.sessions, planSubjects, subjectId]);
  const groups = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    const push = (day: string, row: LogRow) => {
      const list = map.get(day);
      if (list) list.push(row);
      else map.set(day, [row]);
    };
    for (const session of filtered.sessions) push(session.day, { kind: "session", session });
    for (const exam of filtered.exams) push(exam.day, { kind: "exam", exam });
    for (const list of map.values()) {
      list.sort((a, b) => {
        const minute = (row: LogRow) => (row.kind === "session" ? (row.session.startMinute ?? -1) : -1);
        const created = (row: LogRow) => (row.kind === "session" ? row.session.createdAt : row.exam.createdAt);
        return minute(b) - minute(a) || created(b) - created(a);
      });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [filtered.exams, filtered.sessions]);

  const remove = async (session: StudySession) => {
    if (!window.confirm(st("session_delete_confirm"))) return;
    try {
      await actions.deleteSession(session.id);
      toast.success(st("session_deleted"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  const removeExam = async (exam: MockExam) => {
    if (!window.confirm(st("exam_delete_confirm", { name: exam.name || st("cat_exam") }))) return;
    try {
      await actions.deleteExam(exam.id);
      toast.success(st("exam_deleted"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <StudyPage>
      <StudyHeader title={st("log_title")} subtitle={st("log_subtitle")} />

      <section className="mb-5 grid grid-cols-1 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] sm:grid-cols-3">
        <Stat label={st("time_label")}>
          <DurationFigure seconds={totals.seconds} size="md" />
        </Stat>
        <Stat label={st("kpi_accuracy")} className="border-t border-[var(--border)] sm:border-l sm:border-t-0" hint={totals.questions ? st("questions_count", { count: totals.questions }) : st("no_questions")}>
          <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{percentLabel(totals.accuracy)}</span>
        </Stat>
        <Stat label={st("log_entries")} className="border-t border-[var(--border)] sm:border-l sm:border-t-0">
          <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{formatNumber(totals.sessions + filtered.exams.length, language)}</span>
        </Stat>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Segmented<Period>
            size="md"
            value={period}
            onChange={setPeriod}
            ariaLabel={st("period_label")}
            options={[
              { value: "7", label: st("period_7") },
              { value: "30", label: st("period_30") },
              { value: "90", label: st("period_90") },
              { value: "365", label: st("period_365") },
              { value: "all", label: st("period_all") },
            ]}
          />
        </div>
        <SelectFilter
          label={st("col_subject")}
          value={subjectId}
          onChange={setSubjectId}
          options={[{ value: "", label: st("filter_all_subjects") }, ...planSubjects.map((subject) => ({ value: subject.id, label: subject.name }))]}
        />
        <SelectFilter
          label={st("col_category")}
          value={categoryId}
          onChange={setCategoryId}
          options={[{ value: "", label: st("filter_all_categories") }, ...settings.categories.map((category) => ({ value: category.id, label: categoryLabel(category.id) }))]}
        />
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={st("syllabus_search")} className="h-8 pl-8" />
        </div>
      </div>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map(([day, rows]) => {
            const dayTotal = rows.reduce((sum, row) => sum + (row.kind === "session" ? row.session.durationSec : row.exam.durationSec), 0);
            return (
              <section key={day} className="@container/log">
                <div className="mb-2 grid grid-cols-[3px_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 @min-[720px]/log:grid-cols-[3px_minmax(0,1fr)_3rem_8rem_8.5rem_3.5rem_minmax(0,0.7fr)_6rem]">
                  <span className="col-start-1" aria-hidden />
                  <h2 className="col-start-2 min-w-0 text-[13px] font-semibold text-ink">
                    {day === today || day === addDays(today, -1) ? (
                      <>
                        {relativeDay(day, today, locale, st)}
                        <span className="ml-2 text-[12px] font-normal text-faint">{formatDay(day, locale, { day: "numeric", month: "long", year: "numeric" })}</span>
                      </>
                    ) : (
                      <>
                        {capitalizeFirst(formatDay(day, locale, { weekday: "long" }))}
                        <span className="ml-2 text-[12px] font-normal text-faint">
                          {formatDay(day, locale, day.slice(0, 4) === today.slice(0, 4) ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </>
                    )}
                  </h2>
                  <span className="col-start-3 text-end text-[12px] tabular-nums text-muted @min-[720px]/log:col-start-4">{duration(dayTotal)}</span>
                </div>
                <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
                  {rows.map((row) =>
                    row.kind === "session" ? (
                      <SessionLogRow
                        key={row.session.id}
                        session={row.session}
                        editLock={editLock}
                        onRemove={planArchived ? undefined : () => void remove(row.session)}
                      />
                    ) : (
                      <ExamLogRow
                        key={row.exam.id}
                        exam={row.exam}
                        subjects={planSubjects}
                        editLock={editLock}
                        onEdit={planArchived ? undefined : () => setExamDialog({ open: true, exam: row.exam })}
                        onRemove={planArchived ? undefined : () => void removeExam(row.exam)}
                      />
                    )
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <StudyEmpty art="log" title={st("log_empty")} />
      )}
      <ExamDialog open={examDialog.open} exam={examDialog.exam} onOpenChange={(open) => setExamDialog((value) => ({ ...value, open }))} />
    </StudyPage>
  );
}

function SessionLogRow({
  session,
  editLock,
  onRemove,
}: {
  session: StudySession;
  editLock: string | null;
  onRemove?: () => void;
}) {
  const { st, duration } = useStudyT();
  const { subjectById, topicById } = useStudy();
  const subject = subjectById(session.subjectId);
  const topic = topicById(session.subjectId, session.topicId);
  const answered = session.correct + session.wrong;
  return (
    <LogEntryRow
      color={subject?.color ? subjectTone(subject.color) : "var(--border-strong)"}
      title={subject?.name ?? st("untitled_subject")}
      detail={topic?.name ?? st("no_topic")}
      time={minuteLabel(session.startMinute) || "–"}
      durationLabel={session.durationSec ? duration(session.durationSec) : "–"}
      correct={answered ? session.correct : null}
      wrong={answered ? session.wrong : null}
      percent={answered ? percentLabel(session.correct / answered) : null}
      comment={session.comment}
      onEdit={onRemove ? () => useStudyUi.getState().openLog(null, session.id) : undefined}
      editLock={editLock}
      onRemove={onRemove}
      meta={
        <>
          <CategoryChip id={session.categoryId} />
          {session.material || session.pageId ? (
            <MaterialLink material={session.material} pageId={session.pageId} className="max-w-[12rem] text-[11.5px] text-faint" />
          ) : null}
          {session.pages ? <span className="text-[11.5px] text-faint">{st("pages_count", { count: session.pages })}</span> : null}
        </>
      }
    />
  );
}

function ExamLogRow({
  exam,
  subjects,
  editLock,
  onEdit,
  onRemove,
}: {
  exam: MockExam;
  subjects: { id: string; name: string }[];
  editLock: string | null;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const { st, duration } = useStudyT();
  const totals = examTotals(exam);
  const names = [...new Set(exam.rows.map((row) => {
    const id = resolveExamSubjectId(row, subjects);
    if (id === EXAM_OTHER_SUBJECT) return st("exam_other_subject");
    return subjects.find((subject) => subject.id === id)?.name ?? row.name;
  }).filter(Boolean))];
  const detail = [exam.board, names.join(" · ")].filter(Boolean).join(" · ");
  const answered = totals.correct + totals.wrong;
  return (
    <LogEntryRow
      color={subjectTone("#607489")}
      title={exam.name || st("cat_exam")}
      detail={detail || st("cat_exam")}
      time="–"
      durationLabel={exam.durationSec ? duration(exam.durationSec) : "–"}
      correct={answered ? totals.correct : null}
      wrong={answered ? totals.wrong : null}
      percent={answered ? percentLabel(totals.percent) : null}
      comment={exam.comment}
      onEdit={onEdit}
      editLock={editLock}
      onRemove={onRemove}
      meta={
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
          <span className="truncate">{st("cat_exam")}</span>
        </span>
      }
    />
  );
}

function LogEntryRow({
  color,
  title,
  detail,
  time,
  durationLabel,
  correct,
  wrong,
  percent,
  meta,
  comment,
  onEdit,
  editLock,
  onRemove,
}: {
  color: string;
  title: string;
  detail: string;
  time: string;
  durationLabel: string;
  correct: number | null;
  wrong: number | null;
  percent: string | null;
  meta: React.ReactNode;
  comment: string;
  onEdit?: () => void;
  editLock?: string | null;
  onRemove?: () => void;
}) {
  const { st } = useStudyT();
  return (
    <li className="group grid grid-cols-[3px_minmax(0,1fr)_6rem] items-start gap-x-3 gap-y-1.5 px-4 py-3 @min-[720px]/log:grid-cols-[3px_minmax(0,1fr)_3rem_8rem_8.5rem_3.5rem_minmax(0,0.7fr)_6rem] @min-[720px]/log:items-center @min-[720px]/log:gap-y-0">
      <span className="col-start-1 row-start-1 mt-1 block h-8 w-[3px] justify-self-center rounded-full @min-[720px]/log:mt-0" style={{ backgroundColor: color }} />
      <div className="col-start-2 row-start-1 min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{title}</p>
        <p className="truncate text-[12px] text-muted">{detail}</p>
      </div>
      <div className="col-span-3 row-start-2 grid min-w-0 grid-cols-[5.75rem_minmax(0,1fr)_3rem] items-center gap-x-3 pl-[calc(3px+0.75rem)] @min-[720px]/log:contents">
        <span className="hidden text-end text-[12px] tabular-nums text-faint @min-[720px]/log:col-start-3 @min-[720px]/log:row-start-1 @min-[720px]/log:block">{time}</span>
        <span className="text-end text-[12.5px] tabular-nums whitespace-nowrap text-ink @min-[720px]/log:col-start-4 @min-[720px]/log:row-start-1">{durationLabel}</span>
        {correct !== null && wrong !== null ? (
          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_0.7rem_minmax(0,1fr)] items-baseline text-[12px] tabular-nums @min-[720px]/log:col-start-5 @min-[720px]/log:row-start-1">
            <span className="text-end text-[var(--band-high)]">{correct}</span>
            <span className="text-center text-faint">/</span>
            <span className="text-end text-[var(--band-low)]">{wrong}</span>
          </span>
        ) : (
          <span className="@min-[720px]/log:col-start-5 @min-[720px]/log:row-start-1" />
        )}
        <span className="text-end text-[12px] tabular-nums whitespace-nowrap text-faint @min-[720px]/log:col-start-6 @min-[720px]/log:row-start-1">{percent ?? "–"}</span>
      </div>
      <div className="col-span-3 row-start-3 flex min-w-0 flex-wrap items-center gap-1.5 pl-[calc(3px+0.75rem)] @min-[720px]/log:col-span-1 @min-[720px]/log:col-start-7 @min-[720px]/log:row-start-1 @min-[720px]/log:pl-0">
        {meta}
      </div>
      <div className="col-start-3 row-start-1 flex w-full items-center justify-end @min-[720px]/log:col-start-8">
        {comment ? (
          <Tooltip label={comment.slice(0, 280)}>
            <span className="flex size-7 items-center justify-center text-faint">
              <MessageSquareText className="size-3.5" />
            </span>
          </Tooltip>
        ) : (
          <span className="size-7 shrink-0" aria-hidden />
        )}
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={st("edit")}
            disabled={Boolean(editLock)}
            title={editLock ?? undefined}
            onClick={onEdit}
          >
            {editLock ? <Lock /> : <Pencil />}
          </Button>
        ) : null}
        {onRemove ? (
          <Button variant="ghost" size="icon-sm" aria-label={st("delete")} onClick={onRemove} className="hover:text-[var(--danger)]">
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Stat({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <div className="mt-2 flex items-baseline">{children}</div>
      {hint ? <p className="mt-1 text-[11.5px] text-faint">{hint}</p> : null}
    </div>
  );
}
