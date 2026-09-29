"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, EyeOff, Layers3, MessageSquareText, MoreHorizontal, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverAnchor, PopoverContent } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { addDays, capitalizeFirst, dayKeyOf, diffDays, formatDay } from "@/lib/study/dates";
import type { StudyReview } from "@/types/study";
import { CategoryChip, FocusButton, MaterialLink, Segmented, SelectFilter, StudyEmpty, StudyGate, StudyHeader, StudyPage } from "../ui";

type Tab = "due" | "overdue" | "upcoming" | "ignored" | "done";
type Period = "7" | "30" | "90" | "365" | "all";

export function ReviewsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_reviews")}>
      <ReviewsBody />
    </StudyGate>
  );
}

function ReviewsBody() {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const { planReviews, planSubjects, actions, today, settings } = useStudy();
  const { dueFlashcards } = useWorkspace();
  const [tab, setTab] = useState<Tab>("due");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState<Period>("all");

  const buckets = useMemo(() => {
    const due: StudyReview[] = [];
    const overdue: StudyReview[] = [];
    const upcoming: StudyReview[] = [];
    const ignored: StudyReview[] = [];
    const done: StudyReview[] = [];
    const span = period === "all" ? null : Number(period);
    const past = span === null ? null : addDays(today, -span);
    const future = span === null ? null : addDays(today, span);
    for (const review of planReviews) {
      if (subjectId && review.subjectId !== subjectId) continue;
      if (review.status !== "pending") {
        const resolvedDay = review.resolvedAt ? dayKeyOf(review.resolvedAt, settings.timeZone) : review.dueDay;
        if (past && resolvedDay < past) continue;
        if (review.status === "done") done.push(review);
        else ignored.push(review);
      } else if (review.dueDay === today) due.push(review);
      else if (review.dueDay < today) {
        if (past && review.dueDay < past) continue;
        overdue.push(review);
      } else {
        if (future && review.dueDay > future) continue;
        upcoming.push(review);
      }
    }
    const byResolved = (a: StudyReview, b: StudyReview) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0);
    done.sort(byResolved);
    ignored.sort(byResolved);
    return { due, overdue, upcoming, ignored, done };
  }, [period, planReviews, settings.timeZone, subjectId, today]);

  const list = buckets[tab];
  const groups = useMemo(() => {
    const map = new Map<string, StudyReview[]>();
    for (const review of list) {
      const key =
        tab === "done" || tab === "ignored"
          ? review.resolvedAt
            ? dayKeyOf(review.resolvedAt, settings.timeZone)
            : review.dueDay
          : review.dueDay;
      const entry = map.get(key);
      if (entry) entry.push(review);
      else map.set(key, [review]);
    }
    return [...map.entries()];
  }, [list, settings.timeZone, tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "due", label: st("tab_due") },
    { id: "overdue", label: st("tab_overdue") },
    { id: "upcoming", label: st("tab_upcoming") },
    { id: "ignored", label: st("tab_ignored") },
    { id: "done", label: st("tab_done") },
  ];

  const allSelected = list.length > 0 && list.every((review) => selected.has(review.id));
  const selectedIds = list.filter((review) => selected.has(review.id)).map((review) => review.id);

  const bulk = async (status: "done" | "ignored" | "pending") => {
    if (!selectedIds.length) return;
    await actions.resolveReviews(selectedIds, status);
    toast.success(
      status === "done"
        ? st("review_done_toast", { count: selectedIds.length })
        : status === "ignored"
          ? st("review_ignored_toast", { count: selectedIds.length })
          : st("review_restored_toast")
    );
    setSelected(new Set());
  };

  const emptyKey = {
    due: "reviews_empty_due",
    overdue: "reviews_empty_overdue",
    upcoming: "reviews_empty_upcoming",
    ignored: "reviews_empty_ignored",
    done: "reviews_empty_done",
  } as const;

  return (
    <StudyPage>
      <StudyHeader title={st("nav_reviews")} subtitle={st("reviews_subtitle")} />

      {dueFlashcards.length ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] px-4 py-3">
          <Layers3 className="size-4 text-[var(--accent)]" />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink">{st("flashcards_due_callout", { count: dueFlashcards.length })}</p>
          <Button variant="secondary" size="sm" onClick={() => router.push("/home/flashcards")}>
            {st("flashcards_open")}
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-[var(--border)]">
        {tabs.map((entry) => {
          const count = buckets[entry.id].length;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id);
                setSelected(new Set());
              }}
              className={cn(
                "relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition",
                active ? "border-[var(--accent)] text-ink" : "border-transparent text-muted hover:text-ink"
              )}
            >
              {entry.label}
              {count ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[10.5px] tabular-nums",
                    entry.id === "overdue" ? "bg-[color-mix(in_oklab,var(--band-low)_16%,transparent)] text-[var(--band-low)]" : "bg-[var(--surface-2)] text-muted"
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Period>
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setSelected(new Set());
          }}
          ariaLabel={st("period_label")}
          options={[
            { value: "7", label: st("period_7") },
            { value: "30", label: st("period_30") },
            { value: "90", label: st("period_90") },
            { value: "365", label: st("period_365") },
            { value: "all", label: st("period_all") },
          ]}
        />
        <SelectFilter
          label={st("col_subject")}
          value={subjectId}
          onChange={(value) => {
            setSubjectId(value);
            setSelected(new Set());
          }}
          options={[{ value: "", label: st("filter_all_subjects") }, ...planSubjects.map((subject) => ({ value: subject.id, label: subject.name || st("untitled_subject") }))]}
        />
      </div>

      {list.length ? (
        <>
          <div className="mb-3 flex min-h-8 flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
              <Checkbox
                checked={allSelected ? true : selectedIds.length ? "indeterminate" : false}
                onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(list.map((review) => review.id)))}
              />
              {selectedIds.length ? st("selected_count", { count: selectedIds.length }) : st("select_all")}
            </label>
            {selectedIds.length ? (
              <div className="flex items-center gap-1.5">
                {tab === "done" || tab === "ignored" ? (
                  <Button size="sm" variant="secondary" onClick={() => void bulk("pending")}>
                    <Undo2 />
                    {st("review_restore")}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => void bulk("done")}>
                      <Check />
                      {st("reviews_bulk_done")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void bulk("ignored")}>
                      <EyeOff />
                      {st("reviews_bulk_ignore")}
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-6">
            {groups.map(([day, reviews]) => (
              <section key={day} className="grid grid-cols-1 gap-2 md:grid-cols-[8.5rem_minmax(0,1fr)] md:gap-6">
                <div className="md:pt-3">
                  <p className="text-[13px] font-semibold text-ink">
                    {day === today ? st("today") : capitalizeFirst(formatDay(day, locale, { weekday: "long" }))}
                  </p>
                  <p className="text-[12px] tabular-nums text-muted">{formatDay(day, locale, { day: "numeric", month: "short", year: "numeric" })}</p>
                  {tab === "overdue" ? (
                    <p className="mt-0.5 text-[11px] text-[var(--band-low)]">{st("review_late_by", { count: diffDays(day, today) })}</p>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      selected={selected.has(review.id)}
                      onSelect={(value) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (value) next.add(review.id);
                          else next.delete(review.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : (
        <StudyEmpty art="reviews" title={st(emptyKey[tab])} />
      )}
    </StudyPage>
  );
}

function ReviewCard({ review, selected, onSelect }: { review: StudyReview; selected: boolean; onSelect: (value: boolean) => void }) {
  const { st, locale, duration } = useStudyT();
  const { subjectById, topicById, sessions, actions, today } = useStudy();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDay, setNewDay] = useState(addDays(today, 1));
  const subject = subjectById(review.subjectId);
  const topic = topicById(review.subjectId, review.topicId);
  const origin = sessions.find((session) => session.id === review.sessionId);
  const pending = review.status === "pending";

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-[var(--radius-lg)] border bg-[var(--surface)] px-3.5 py-3 transition",
        selected ? "border-[var(--accent)]/60" : "border-[var(--border)] hover:border-[var(--border-strong)]"
      )}
    >
      <Checkbox checked={selected} onCheckedChange={(value) => onSelect(value === true)} className="mt-1" aria-label={subject?.name} />
      <span className="mt-0.5 block h-9 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "var(--border-strong)" }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{subject?.name ?? st("untitled_subject")}</p>
          <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[10.5px] tabular-nums text-muted">
            {st("review_interval", { count: review.intervalDays })}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">{topic?.name ?? st("no_topic")}</p>
        {origin ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] tabular-nums text-faint">
            <span>{st("review_from_session", { date: formatDay(origin.day, locale, { day: "numeric", month: "short" }) })}</span>
            <CategoryChip id={origin.categoryId} />
            {origin.durationSec ? <span>{duration(origin.durationSec)}</span> : null}
            {origin.correct + origin.wrong ? (
              <span>
                <span className="text-[var(--band-high)]">{origin.correct}</span> / <span className="text-[var(--band-low)]">{origin.wrong}</span>
              </span>
            ) : null}
            {origin.material || origin.pageId ? (
              <MaterialLink material={origin.material} pageId={origin.pageId} className="max-w-[14rem]" />
            ) : null}
            {origin.comment ? (
              <Tooltip label={origin.comment.slice(0, 280)}>
                <span className="inline-flex cursor-help items-center">
                  <MessageSquareText className="size-3.5" />
                </span>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        {!pending && review.resolvedAt ? (
          <p className="mt-1.5 text-[11px] text-faint">{st("review_resolved_on", { date: formatDay(dayKeyOf(review.resolvedAt), locale) })}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {pending ? (
          <>
            <FocusButton variant="ghost" size="icon-sm" subjectId={review.subjectId} topicId={review.topicId} reviewId={review.id} label={st("review_start")} />
            <Tooltip label={st("review_log")}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={st("review_log")}
                onClick={() =>
                  useStudyUi.getState().openLog({
                    subjectId: review.subjectId,
                    topicId: review.topicId,
                    reviewId: review.id,
                    categoryId: "review",
                  })
                }
              >
                <Plus />
              </Button>
            </Tooltip>
            <Tooltip label={st("review_complete")}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={st("review_complete")}
                onClick={async () => {
                  await actions.resolveReviews([review.id], "done");
                  toast.success(st("review_done_toast", { count: 1 }), {
                    action: { label: st("review_restore"), onClick: () => void actions.resolveReviews([review.id], "pending") },
                  });
                }}
              >
                <Check />
              </Button>
            </Tooltip>
          </>
        ) : null}
        <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <PopoverAnchor asChild>
            <span className="inline-flex">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={st("more_actions")}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {pending ? (
                <>
                  <MenuItem onSelect={() => setRescheduleOpen(true)}>
                    <CalendarClock /> {st("review_reschedule")}
                  </MenuItem>
                  <MenuItem
                    onSelect={async () => {
                      await actions.resolveReviews([review.id], "ignored");
                      toast.success(st("review_ignored_toast", { count: 1 }));
                    }}
                  >
                    <EyeOff /> {st("review_ignore")}
                  </MenuItem>
                </>
              ) : (
                <MenuItem
                  onSelect={async () => {
                    await actions.resolveReviews([review.id], "pending");
                    toast.success(st("review_restored_toast"));
                  }}
                >
                  <Undo2 /> {st("review_restore")}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem disabled className="text-[11px] text-faint">
                {formatDay(review.dueDay, locale, { day: "numeric", month: "long", year: "numeric" })}
              </MenuItem>
            </MenuContent>
          </Menu>
            </span>
          </PopoverAnchor>
          <PopoverContent align="end" className="w-60 space-y-2 p-3">
            <p className="text-[12px] font-medium text-ink">{st("review_reschedule")}</p>
            <Input type="date" value={newDay} min={today} onChange={(event) => setNewDay(event.target.value)} />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setRescheduleOpen(false)}>
                {st("cancel")}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!newDay}
                onClick={async () => {
                  await actions.rescheduleReview(review.id, newDay);
                  toast.success(st("review_rescheduled_toast", { date: formatDay(newDay, locale) }));
                  setRescheduleOpen(false);
                }}
              >
                {st("save")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </li>
  );
}
