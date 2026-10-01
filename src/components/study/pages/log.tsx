"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, MessageSquareText, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { useLiveNote } from "@/lib/study/hooks";
import { addDays, capitalizeFirst, formatDay, minuteLabel } from "@/lib/study/dates";
import { aggregate, percentLabel } from "@/lib/study/metrics";
import { formatNumber } from "@/lib/study/format";
import type { StudySession } from "@/types/study";
import { CategoryChip, DurationFigure, MaterialLink, Segmented, SelectFilter, StudyEmpty, StudyGate, StudyHeader, StudyPage, useCategoryLabel } from "../ui";
import { relativeDay } from "../widgets";

type Period = "7" | "30" | "90" | "365" | "all";

function csvCell(value: string | number, delimiter: string) {
  const raw = String(value ?? "");
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

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
  const { planSessions, planSubjects, settings, subjectById, topicById, actions, today, activePlan } = useStudy();
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
    return planSessions.filter((session) => {
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
  }, [categoryId, period, planSessions, query, subjectId, today, topicById, materialText]);

  const totals = useMemo(() => aggregate(filtered), [filtered]);
  const groups = useMemo(() => {
    const map = new Map<string, StudySession[]>();
    for (const session of filtered) {
      const list = map.get(session.day);
      if (list) list.push(session);
      else map.set(session.day, [session]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.startMinute ?? -1) - (a.startMinute ?? -1) || b.createdAt - a.createdAt);
    }
    return [...map.entries()];
  }, [filtered]);

  const exportCsv = () => {
    const delimiter = ["en", "ja", "zh"].includes(language) ? "," : ";";
    const header = [
      st("csv_day"),
      st("csv_start"),
      st("csv_minutes"),
      st("csv_subject"),
      st("csv_topic"),
      st("csv_category"),
      st("csv_correct"),
      st("csv_wrong"),
      st("csv_material"),
      st("csv_comment"),
    ];
    const rows = [...filtered]
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.startMinute ?? 0) - (b.startMinute ?? 0)))
      .map((session) => [
        session.day,
        minuteLabel(session.startMinute),
        Math.round(session.durationSec / 60),
        subjectById(session.subjectId)?.name ?? "",
        topicById(session.subjectId, session.topicId)?.name ?? "",
        categoryLabel(session.categoryId),
        session.correct,
        session.wrong,
        materialText(session),
        session.comment,
      ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join("\r\n");
    const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(activePlan?.name || "synapsys").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60)}-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
    <StudyPage>
      <StudyHeader
        title={st("log_title")}
        subtitle={st("log_subtitle")}
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
            <Download />
            {st("log_export")}
          </Button>
        }
      />

      <section className="mb-5 grid grid-cols-1 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] sm:grid-cols-3">
        <Stat label={st("time_label")}>
          <DurationFigure seconds={totals.seconds} size="md" />
        </Stat>
        <Stat label={st("accuracy_label")} className="border-t border-[var(--border)] sm:border-l sm:border-t-0" hint={totals.questions ? st("questions_count", { count: totals.questions }) : st("no_questions")}>
          <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{percentLabel(totals.accuracy)}</span>
        </Stat>
        <Stat label={st("summary_sessions")} className="border-t border-[var(--border)] sm:border-l sm:border-t-0">
          <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{formatNumber(totals.sessions, language)}</span>
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
          {groups.map(([day, sessions]) => {
            const dayTotal = sessions.reduce((sum, session) => sum + session.durationSec, 0);
            return (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <h2 className="text-[13px] font-semibold text-ink">
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
                  <span className="text-[12px] tabular-nums text-muted">{duration(dayTotal)}</span>
                </div>
                <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
                  {sessions.map((session) => {
                    const subject = subjectById(session.subjectId);
                    const topic = topicById(session.subjectId, session.topicId);
                    return (
                      <li key={session.id} className="group flex items-start gap-3 px-4 py-3 md:items-center">
                        <span className="mt-0.5 block h-8 w-[3px] shrink-0 rounded-full md:mt-0" style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }} />
                        <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1.6fr)_3.5rem_5.5rem_7rem_minmax(0,1fr)] md:items-center md:gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-ink">{subject?.name ?? st("untitled_subject")}</p>
                            <p className="truncate text-[12px] text-muted">{topic?.name ?? st("no_topic")}</p>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                            <span className="text-[12px] tabular-nums text-faint max-md:hidden">{minuteLabel(session.startMinute) || "–"}</span>
                            <span className="text-[12.5px] tabular-nums text-ink">{session.durationSec ? duration(session.durationSec) : "–"}</span>
                            <span className="text-[12px] tabular-nums">
                              {session.correct + session.wrong ? (
                                <>
                                  <span className="text-[var(--band-high)]">{session.correct}</span>
                                  <span className="text-faint"> / </span>
                                  <span className="text-[var(--band-low)]">{session.wrong}</span>
                                  <span className="ml-1.5 text-faint">{percentLabel(session.correct / (session.correct + session.wrong))}</span>
                                </>
                              ) : (
                                <span className="text-faint">–</span>
                              )}
                            </span>
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <CategoryChip id={session.categoryId} />
                              {session.material || session.pageId ? (
                                <MaterialLink material={session.material} pageId={session.pageId} className="max-w-[12rem] text-[11.5px] text-faint" />
                              ) : null}
                              {session.pages ? <span className="text-[11.5px] text-faint">{st("pages_count", { count: session.pages })}</span> : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {session.comment ? (
                            <Tooltip label={session.comment.slice(0, 280)}>
                              <span className="flex size-7 items-center justify-center text-faint">
                                <MessageSquareText className="size-3.5" />
                              </span>
                            </Tooltip>
                          ) : null}
                          <Button variant="ghost" size="icon-sm" aria-label={st("edit")} onClick={() => useStudyUi.getState().openLog(null, session.id)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={st("delete")} onClick={() => void remove(session)} className="hover:text-[var(--danger)]">
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <StudyEmpty art="log" title={st("log_empty")} />
      )}
    </StudyPage>
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
