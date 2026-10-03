"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  CheckCheck,
  EyeOff,
  Layers3,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog";
import { Checkbox, Tooltip } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/pickers";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useUiStore } from "@/lib/store/ui-store";
import { cardStage } from "@/lib/flashcards/srs";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { addDays, capitalizeFirst, diffDays, formatDay, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import {
  bucketReviews,
  resolvedDayOf,
  reviewForecast,
  reviewPunctuality,
  reviewStages,
  type ReviewBuckets,
  type ReviewPeriod,
  type ReviewStage,
  type ReviewTab,
} from "@/lib/study/review-queue";
import type { DayKey, StudyReview, StudySession } from "@/types/study";
import { subjectTone } from "@/lib/study/defaults";
import { CategoryChip, FocusButton, MaterialLink, Segmented, SelectFilter, StudyGate, StudyHeader, StudyPage } from "../ui";

const PANEL = "rounded-xl border border-[var(--border)] bg-[var(--surface)]";
const TABS: ReviewTab[] = ["due", "overdue", "upcoming", "done", "ignored"];
const TAB_LABEL = { due: "tab_due", overdue: "tab_overdue", upcoming: "tab_upcoming", done: "tab_done", ignored: "tab_ignored" } as const;
const FORECAST_DAYS = 14;
const PUNCTUALITY_DAYS = 30;
/** Colunas da lista larga: seleção, disciplina, etapa, sessão de origem e ações. */
const ROW_GRID = "@3xl/list:grid-cols-[1rem_minmax(0,1.3fr)_10.5rem_minmax(0,1fr)_auto] @3xl/list:gap-x-5";

function openStudyPreferences() {
  const ui = useUiStore.getState();
  ui.setPreferencesTab("study");
  ui.setPreferencesOpen(true);
}

export function ReviewsPage() {
  const { st } = useStudyT();
  return (
    <StudyGate title={st("nav_reviews")}>
      <ReviewsBody />
    </StudyGate>
  );
}

function ReviewsBody() {
  const { st } = useStudyT();
  const { planReviews } = useStudy();
  return (
    <StudyPage>
      <StudyHeader title={st("nav_reviews")} subtitle={st("reviews_subtitle")} />
      {planReviews.length ? <ReviewQueue /> : <ReviewsIntro />}
    </StudyPage>
  );
}

function ReviewQueue() {
  const { st, locale } = useStudyT();
  const { planReviews, planSubjects, sessions, actions, today, settings, planReadOnly } = useStudy();
  const [tab, setTab] = useState<ReviewTab>("due");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState<ReviewPeriod>("all");

  const buckets = useMemo(
    () => bucketReviews(planReviews, { today, timeZone: settings.timeZone, period, subjectId }),
    [period, planReviews, settings.timeZone, subjectId, today]
  );
  const stages = useMemo(() => reviewStages(planReviews), [planReviews]);
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const doneToday = useMemo(
    () =>
      planReviews.filter(
        (review) => review.status === "done" && (!subjectId || review.subjectId === subjectId) && resolvedDayOf(review, settings.timeZone) === today
      ).length,
    [planReviews, settings.timeZone, subjectId, today]
  );

  const list = buckets[tab];
  const resolvedTab = tab === "done" || tab === "ignored";
  const groups = useMemo(() => {
    const map = new Map<DayKey, StudyReview[]>();
    for (const review of list) {
      const key = resolvedTab ? resolvedDayOf(review, settings.timeZone) : review.dueDay;
      const entry = map.get(key);
      if (entry) entry.push(review);
      else map.set(key, [review]);
    }
    return [...map.entries()];
  }, [list, resolvedTab, settings.timeZone]);

  const hints = useMemo<Record<ReviewTab, string>>(() => {
    const oldest = buckets.overdue[0];
    const next = buckets.upcoming[0];
    return {
      due: buckets.due.length
        ? st("subjects_count", { count: new Set(buckets.due.map((review) => review.subjectId)).size })
        : st("reviews_hint_clear"),
      overdue: oldest ? st("reviews_hint_oldest", { count: diffDays(oldest.dueDay, today) }) : st("reviews_hint_on_track"),
      upcoming: !next
        ? st("reviews_hint_none")
        : next.dueDay === addDays(today, 1)
          ? st("reviews_hint_next_tomorrow")
          : st("reviews_hint_next_on", { date: formatDay(next.dueDay, locale, { weekday: "short", day: "numeric", month: "short" }) }),
      done: doneToday ? st("reviews_hint_done_today", { count: doneToday }) : "",
      ignored: "",
    };
  }, [buckets, doneToday, locale, st, today]);

  const selectedIds = list.filter((review) => selected.has(review.id)).map((review) => review.id);
  const allSelected = list.length > 0 && selectedIds.length === list.length;

  const selectTab = (next: ReviewTab) => {
    setTab(next);
    setSelected(new Set());
  };

  const toggle = (id: string, value: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  // Um dia da previsão abre a aba certa e rola até o grupo daquele dia.
  const jumpTo = (day: DayKey) => {
    selectTab(day === today ? "due" : "upcoming");
    if (day !== today && period !== "all" && diffDays(today, day) > Number(period)) setPeriod("all");
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => document.getElementById(`reviews-day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
    );
  };

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

  const removeSelected = async () => {
    if (!selectedIds.length || !window.confirm(st("reviews_delete_confirm", { count: selectedIds.length }))) return;
    try {
      await actions.deleteReviews(selectedIds);
      toast.success(st("reviews_deleted_toast", { count: selectedIds.length }));
      setSelected(new Set());
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <div className="@container/reviews">
      <QueueTabs buckets={buckets} hints={hints} tab={tab} onSelect={selectTab} />

      <div className="mt-5 grid grid-cols-1 items-start gap-5 @5xl/reviews:grid-cols-[minmax(0,1fr)_18.5rem] @7xl/reviews:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label={st(TAB_LABEL[tab])} className={cn(PANEL, "@container/list min-w-0 overflow-hidden")}>
          <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-2">
            <label className={cn("flex items-center gap-2.5 text-[12.5px] text-muted", list.length ? "cursor-pointer" : "opacity-50")}>
              <Checkbox
                checked={allSelected ? true : selectedIds.length ? "indeterminate" : false}
                disabled={!list.length}
                onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(list.map((review) => review.id)))}
              />
              {selectedIds.length ? st("selected_count", { count: selectedIds.length }) : st("select_all")}
            </label>
            {selectedIds.length && !planReadOnly ? (
              <div className="flex items-center gap-1.5">
                {resolvedTab ? (
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
                <Button size="sm" variant="ghost" className="text-[var(--danger)] hover:text-[var(--danger)]" onClick={() => void removeSelected()}>
                  <Trash2 />
                  {st("delete")}
                </Button>
              </div>
            ) : null}
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end">
              {tab !== "due" ? (
                <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <Segmented<ReviewPeriod>
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
                </div>
              ) : null}
              <SelectFilter
                label={st("col_subject")}
                value={subjectId}
                onChange={(value) => {
                  setSubjectId(value);
                  setSelected(new Set());
                }}
                options={[
                  { value: "", label: st("filter_all_subjects") },
                  ...planSubjects.map((subject) => ({ value: subject.id, label: subject.name || st("untitled_subject") })),
                ]}
              />
            </div>
          </div>

          {list.length ? (
            <>
              <div className={cn("hidden h-9 items-center border-b border-[var(--border)] px-4 text-[12px] text-muted @3xl/list:grid", ROW_GRID)}>
                <span />
                <span>{st("reviews_col_subject")}</span>
                <span>{st("reviews_col_stage")}</span>
                <span>{st("reviews_col_origin")}</span>
                <span />
              </div>
              {groups.map(([day, reviews]) => (
                <DayGroup key={day} day={day} late={tab === "overdue"} count={reviews.length}>
                  {reviews.map((review) => (
                    <ReviewRow
                      key={review.id}
                      review={review}
                      stage={stages.get(review.id)}
                      origin={sessionById.get(review.sessionId)}
                      selected={selected.has(review.id)}
                      onSelect={(value) => toggle(review.id, value)}
                    />
                  ))}
                </DayGroup>
              ))}
            </>
          ) : (
            <TabEmpty tab={tab} buckets={buckets} doneToday={doneToday} onSelect={selectTab} />
          )}
        </section>

        <aside className="grid min-w-0 gap-5 @3xl/reviews:grid-cols-2 @5xl/reviews:grid-cols-1">
          <ForecastPanel subjectId={subjectId} overdue={buckets.overdue.length} onPick={jumpTo} onOverdue={() => selectTab("overdue")} />
          <PunctualityPanel subjectId={subjectId} />
          <IntervalsPanel />
          <FlashcardsPanel />
        </aside>
      </div>
    </div>
  );
}

/** Abas com contagem, no formato dos filtros de status do Stripe: cada aba já diz quanto tem e o que vem a seguir. */
function QueueTabs({
  buckets,
  hints,
  tab,
  onSelect,
}: {
  buckets: ReviewBuckets;
  hints: Record<ReviewTab, string>;
  tab: ReviewTab;
  onSelect: (tab: ReviewTab) => void;
}) {
  const { st } = useStudyT();
  return (
    <div role="tablist" aria-label={st("nav_reviews")} className={cn(PANEL, "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>
      {TABS.map((id) => {
        const active = id === tab;
        const count = buckets[id].length;
        const alert = id === "overdue" && count > 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex min-w-[8.75rem] flex-1 flex-col items-start border-l border-[var(--border)] px-4 pb-3.5 pt-3 text-start outline-none transition-colors first:border-l-0 focus-visible:bg-[var(--surface-hover)]",
              active ? "bg-[color-mix(in_oklab,var(--accent)_7%,var(--surface))]" : "hover:bg-[var(--surface-hover)]"
            )}
          >
            <span className={cn("flex items-center gap-1.5 text-[12.5px] font-medium", active ? "text-ink" : "text-muted")}>
              {alert ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--band-low)]" /> : null}
              {st(TAB_LABEL[id])}
            </span>
            <span
              className={cn(
                "mt-2 text-[26px] font-semibold leading-none tracking-[-0.035em] tabular-nums",
                alert ? "text-[var(--band-low-text)]" : count ? "text-ink" : "text-faint"
              )}
            >
              {count}
            </span>
            <span className="mt-2 block w-full truncate text-[11.5px] text-faint">{hints[id] || " "}</span>
            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Cabeçalho de dia no estilo do "Upcoming" do Things: número grande e o nome do dia. */
function DayGroup({ day, late, count, children }: { day: DayKey; late: boolean; count: number; children: ReactNode }) {
  const { st, locale } = useStudyT();
  const { today } = useStudy();
  const title =
    day === today
      ? st("today")
      : day === addDays(today, 1)
        ? st("tomorrow")
        : day === addDays(today, -1)
          ? st("yesterday")
          : capitalizeFirst(formatDay(day, locale, { weekday: "long" }));
  // O mês só aparece quando o grupo cai fora do mês corrente.
  const month =
    day.slice(0, 7) === today.slice(0, 7)
      ? null
      : formatDay(day, locale, day.slice(0, 4) === today.slice(0, 4) ? { month: "long" } : { month: "long", year: "numeric" });
  const lateBy = late ? diffDays(day, today) : 0;
  return (
    <section id={`reviews-day-${day}`} aria-label={formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })} className="scroll-mt-4">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_55%,var(--surface))] px-4 py-2">
        <span className="min-w-6 text-[18px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{Number(day.slice(8, 10))}</span>
        <p className="min-w-0 flex-1 truncate text-[12.5px]">
          <span className="font-semibold text-ink">{title}</span>
          {month ? <span className="text-muted"> · {month}</span> : null}
          {lateBy > 0 ? <span className="text-[var(--band-low-text)]"> · {st("review_late_by", { count: lateBy })}</span> : null}
        </p>
        <span className="text-[12px] tabular-nums text-faint">{count}</span>
      </header>
      <ul>{children}</ul>
    </section>
  );
}

function RescheduleDialog({
  open,
  onOpenChange,
  subjectName,
  topicName,
  today,
  locale,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
  topicName?: string | null;
  today: string;
  locale: string;
  onSave: (date: string) => Promise<void>;
}) {
  const { st } = useStudyT();
  const [targetDay, setTargetDay] = useState(() => addDays(today, 1));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetDay(addDays(today, 1));
    }
  }, [open, today]);

  const quickOptions = [
    { label: "+1 dia", days: 1 },
    { label: "+3 dias", days: 3 },
    { label: "+7 dias", days: 7 },
    { label: "+15 dias", days: 15 },
  ];

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-md p-6">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-[var(--accent)]" />
            <h3 className="text-[15px] font-semibold text-ink">{st("review_reschedule")}</h3>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{subjectName}</span>
            {topicName ? <span> · {topicName}</span> : null}
          </p>
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            {st("agenda_day")}
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickOptions.map((opt) => {
              const dayVal = addDays(today, opt.days);
              const isSelected = targetDay === dayVal;
              return (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setTargetDay(dayVal)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-[var(--radius-sm)] border py-2 px-1 text-center transition",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-muted hover:border-[var(--border-strong)] hover:text-ink"
                  )}
                >
                  <span className="text-[12px]">{opt.label}</span>
                  <span className="text-[10.5px] text-faint tabular-nums">
                    {formatDay(dayVal, locale, { day: "numeric", month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            {st("agenda_more_options")}
          </span>
          <div className="mt-1.5">
            <DateField value={targetDay} min={today} onChange={(next) => next && setTargetDay(next)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {st("cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!targetDay || submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSave(targetDay);
                onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {st("save")}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

function ReviewRow({
  review,
  stage,
  origin,
  selected,
  onSelect,
}: {
  review: StudyReview;
  stage?: ReviewStage;
  origin?: StudySession;
  selected: boolean;
  onSelect: (value: boolean) => void;
}) {
  const { st, locale } = useStudyT();
  const { subjectById, topicById, actions, today, planReadOnly } = useStudy();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const subject = subjectById(review.subjectId);
  const topic = topicById(review.subjectId, review.topicId);
  const pending = review.status === "pending";
  const name = subject?.name || st("untitled_subject");

  const complete = async () => {
    await actions.resolveReviews([review.id], "done");
    toast.success(st("review_done_toast", { count: 1 }), {
      action: { label: st("review_restore"), onClick: () => void actions.resolveReviews([review.id], "pending") },
    });
  };

  return (
    <li
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 transition-colors last:border-b-0 @3xl/list:items-center",
        ROW_GRID,
        selected ? "bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      <Checkbox
        checked={selected}
        disabled={planReadOnly}
        onCheckedChange={(value) => onSelect(value === true)}
        aria-label={name}
        className="col-start-1 row-start-1 mt-[3px] @3xl/list:mt-0"
      />

      <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3">
        <span aria-hidden className="h-9 w-[3.5px] shrink-0 rounded-full" style={{ backgroundColor: subject?.color ? subjectTone(subject.color) : "var(--border-strong)" }} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink [overflow-wrap:anywhere] @3xl/list:line-clamp-1">{name}</p>
          <p className={cn("truncate text-[12px] leading-snug", topic ? "text-muted" : "text-faint")}>{topic?.name ?? st("no_topic")}</p>
        </div>
      </div>

      <div className="col-start-2 row-start-2 ps-[15px] @3xl/list:col-start-3 @3xl/list:row-start-1 @3xl/list:ps-0">
        <StageMark review={review} stage={stage} />
      </div>

      <div className="col-start-2 row-start-3 min-w-0 ps-[15px] @3xl/list:col-start-4 @3xl/list:row-start-1 @3xl/list:ps-0">
        <OriginInfo review={review} origin={origin} />
      </div>

      <div className="col-start-3 row-start-1 flex items-center justify-end gap-1 @3xl/list:col-start-5">
        {planReadOnly ? null : pending ? (
          <>
            <Tooltip label={st("review_start")}>
              <span className="inline-flex">
                <FocusButton
                  variant="ghost"
                  size="icon-sm"
                  subjectId={review.subjectId}
                  topicId={review.topicId}
                  reviewId={review.id}
                  label={st("review_start")}
                />
              </span>
            </Tooltip>
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
              <Button variant="ghost" size="icon-sm" aria-label={st("review_complete")} className="hover:text-[var(--accent)]" onClick={() => void complete()}>
                <Check />
              </Button>
            </Tooltip>
          </>
        ) : null}

        {planReadOnly ? null : (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${st("more_actions")}: ${name}`}>
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
            <MenuItem
              className="text-[var(--danger)]"
              onSelect={async () => {
                if (!window.confirm(st("reviews_delete_confirm", { count: 1 }))) return;
                try {
                  await actions.deleteReviews([review.id]);
                  toast.success(st("reviews_deleted_toast", { count: 1 }));
                } catch {
                  toast.error(st("error_generic"));
                }
              }}
            >
              <Trash2 /> {st("delete")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled className="text-[11px] text-faint">
              {formatDay(review.dueDay, locale, { day: "numeric", month: "long", year: "numeric" })}
            </MenuItem>
          </MenuContent>
        </Menu>
        )}

        <RescheduleDialog
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          subjectName={name}
          topicName={topic?.name}
          today={today}
          locale={locale}
          onSave={async (targetDate) => {
            await actions.rescheduleReview(review.id, targetDate);
            toast.success(st("review_rescheduled_toast", { date: formatDay(targetDate, locale) }));
          }}
        />
      </div>
    </li>
  );
}

function StageMark({ review, stage }: { review: StudyReview; stage?: ReviewStage }) {
  const { st } = useStudyT();
  const interval = st("review_interval", { count: review.intervalDays });
  if (!stage || stage.total < 2) {
    return (
      <span className="inline-flex items-center rounded-[var(--radius-xs)] bg-[var(--surface-2)] px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-muted">
        {interval}
      </span>
    );
  }
  const label = st("review_stage", { n: stage.index, total: stage.total });
  return (
    <div className="flex min-w-0 flex-col gap-1" title={`${label} · ${stage.steps.map((step) => st("review_interval", { count: step.intervalDays })).join(" · ")}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        <span className="text-[11px] tabular-nums text-faint">({interval})</span>
      </div>
      <div className="flex items-center gap-1">
        {stage.total <= 6 ? (
          <div aria-hidden className="flex shrink-0 items-center gap-1">
            {stage.steps.map((step) => {
              const current = step.id === review.id;
              return (
                <span
                  key={step.id}
                  className={cn("h-1.5 rounded-full transition-all", current ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-[var(--border-strong)] opacity-60")}
                  style={step.status === "done" ? { backgroundColor: "var(--accent)" } : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div aria-hidden className="flex h-1.5 w-16 shrink-0 gap-0.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            {stage.steps.map((step) => (
              <span
                key={step.id}
                className={cn("h-full flex-1", step.id === review.id ? "bg-[var(--accent)]" : "bg-[var(--border-strong)] opacity-50")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OriginInfo({ review, origin }: { review: StudyReview; origin?: StudySession }) {
  const { st, locale, duration } = useStudyT();
  const { settings } = useStudy();
  const lateBy = review.status === "done" ? diffDays(review.dueDay, resolvedDayOf(review, settings.timeZone)) : 0;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] tabular-nums text-muted">
      {origin ? (
        <>
          <span className="font-normal text-ink">{st("review_from_session", { date: formatDay(origin.day, locale, { day: "numeric", month: "short" }) })}</span>
          <CategoryChip id={origin.categoryId} />
          {origin.durationSec ? <span className="font-mono text-[11px] text-faint">{duration(origin.durationSec)}</span> : null}
          {origin.correct + origin.wrong ? (
            <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-xs)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
              <span className="text-[var(--band-high-text)]">{origin.correct}</span>
              <span className="text-faint">/</span>
              <span className="text-[var(--band-low-text)]">{origin.wrong}</span>
            </span>
          ) : null}
          {origin.material || origin.pageId ? <MaterialLink material={origin.material} pageId={origin.pageId} className="max-w-[13rem]" /> : null}
          {origin.comment ? (
            <Tooltip label={origin.comment.slice(0, 280)}>
              <span className="inline-flex cursor-help items-center text-faint hover:text-muted">
                <MessageSquareText className="size-3.5" />
              </span>
            </Tooltip>
          ) : null}
        </>
      ) : (
        <span className="text-faint">–</span>
      )}
      {lateBy > 0 ? <span className="basis-full text-[11.5px] text-[var(--band-mid-text)]">{st("review_done_late", { count: lateBy })}</span> : null}
      {review.status === "ignored" ? (
        <span className="basis-full text-[11.5px] text-faint">
          {st("review_was_due", { date: formatDay(review.dueDay, locale, { day: "numeric", month: "short" }) })}
        </span>
      ) : null}
    </div>
  );
}

function TabEmpty({
  tab,
  buckets,
  doneToday,
  onSelect,
}: {
  tab: ReviewTab;
  buckets: ReviewBuckets;
  doneToday: number;
  onSelect: (tab: ReviewTab) => void;
}) {
  const { st, locale } = useStudyT();
  const { subjectById, today } = useStudy();
  let icon: LucideIcon = CheckCheck;
  let title: string;
  let hint: string | null = null;
  let action: ReactNode = null;

  if (tab === "due") {
    title = st("reviews_empty_due");
    const next = buckets.upcoming[0];
    if (buckets.overdue.length) {
      hint = st("reviews_empty_overdue_hint", { count: buckets.overdue.length });
      action = (
        <Button variant="secondary" size="sm" onClick={() => onSelect("overdue")}>
          {st("reviews_see_overdue")}
        </Button>
      );
    } else {
      const parts: string[] = [];
      if (doneToday) parts.push(st("reviews_empty_done_today", { count: doneToday }));
      if (next) {
        const subject = subjectById(next.subjectId)?.name || st("untitled_subject");
        parts.push(
          next.dueDay === addDays(today, 1)
            ? st("reviews_empty_next_tomorrow", { subject })
            : st("reviews_empty_next_on", { subject, date: formatDay(next.dueDay, locale, { weekday: "short", day: "numeric", month: "short" }) })
        );
        action = (
          <Button variant="secondary" size="sm" onClick={() => onSelect("upcoming")}>
            {st("reviews_see_upcoming")}
          </Button>
        );
      }
      hint = parts.join(" ") || null;
    }
  } else if (tab === "overdue") {
    title = st("reviews_empty_overdue");
  } else if (tab === "upcoming") {
    icon = CalendarClock;
    title = st("reviews_empty_upcoming");
    hint = st("reviews_empty_upcoming_hint");
  } else if (tab === "done") {
    icon = Check;
    title = st("reviews_empty_done");
  } else {
    icon = EyeOff;
    title = st("reviews_empty_ignored");
  }

  const Icon = icon;
  return (
    <div className="flex flex-col items-start gap-4 px-5 py-9 sm:flex-row sm:items-center sm:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Carga das próximas duas semanas, como a previsão "Future due" do Anki, em forma de calendário. */
function ForecastPanel({
  subjectId,
  overdue,
  onPick,
  onOverdue,
}: {
  subjectId: string;
  overdue: number;
  onPick: (day: DayKey) => void;
  onOverdue: () => void;
}) {
  const { st, locale } = useStudyT();
  const { planReviews, today } = useStudy();
  const days = useMemo(() => reviewForecast(planReviews, today, FORECAST_DAYS, subjectId), [planReviews, subjectId, today]);
  const max = Math.max(0, ...days.map((entry) => entry.count));
  return (
    <section className={cn(PANEL, "min-w-0 px-4 pb-4 pt-3.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{st("reviews_forecast_title")}</h2>
        {overdue ? (
          <button
            type="button"
            onClick={onOverdue}
            className="shrink-0 text-[12px] font-medium text-[var(--band-low-text)] underline-offset-4 hover:underline"
          >
            {st("reviews_forecast_overdue", { count: overdue })}
          </button>
        ) : null}
      </div>
      {max ? (
        <div className="mt-3 grid grid-cols-7 gap-1">
          {days.map(({ day, count }) => {
            const isToday = day === today;
            const strength = count / max;
            const label = `${capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" }))} · ${st("goal_subject_reviews", { count })}`;
            return (
              <button
                key={day}
                type="button"
                disabled={!count}
                onClick={() => onPick(day)}
                title={label}
                aria-label={label}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-[10px] pb-1.5 pt-1 transition-colors disabled:cursor-default",
                  isToday ? "bg-[var(--surface-2)]" : count ? "hover:bg-[var(--surface-hover)]" : ""
                )}
              >
                <span className={cn("text-[10.5px] font-medium", isToday ? "text-[var(--accent)]" : "text-faint")}>
                  {weekdayLabel(weekdayOf(day), locale, "short").replace(".", "")}
                </span>
                <span className={cn("text-[12.5px] font-semibold leading-none tabular-nums", count || isToday ? "text-ink" : "text-faint")}>
                  {Number(day.slice(8, 10))}
                </span>
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
                  style={
                    count
                      ? {
                          backgroundColor: `color-mix(in oklab, var(--accent) ${Math.round(16 + strength * 46)}%, var(--surface))`,
                          color: strength > 0.6 ? "var(--accent-contrast)" : "var(--text)",
                        }
                      : undefined
                  }
                >
                  {count || <span aria-hidden className="size-1 rounded-full bg-[var(--border-strong)]" />}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{st("reviews_forecast_empty")}</p>
      )}
    </section>
  );
}

/** Como terminaram as revisões resolvidas no último mês. Some quando ainda não há nenhuma. */
function PunctualityPanel({ subjectId }: { subjectId: string }) {
  const { st } = useStudyT();
  const { planReviews, today, settings } = useStudy();
  const stats = useMemo(
    () => reviewPunctuality(planReviews, today, settings.timeZone, PUNCTUALITY_DAYS, subjectId),
    [planReviews, settings.timeZone, subjectId, today]
  );
  if (!stats.total) return null;
  const finished = stats.onTime + stats.late;
  const parts = [
    { key: "on-time", label: st("reviews_on_time"), value: stats.onTime, color: "var(--band-high)" },
    { key: "late", label: st("reviews_late"), value: stats.late, color: "var(--band-mid)" },
    { key: "ignored", label: st("tab_ignored"), value: stats.ignored, color: "var(--border-strong)" },
  ];
  return (
    <section className={cn(PANEL, "min-w-0 px-4 pb-4 pt-3.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{st("reviews_punctuality_title")}</h2>
        {finished ? (
          <span className="shrink-0 text-[12px] tabular-nums text-muted">
            {st("reviews_hint_on_time", { value: Math.round((stats.onTime / finished) * 100) })}
          </span>
        ) : null}
      </div>
      <div aria-hidden className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
        {parts
          .filter((part) => part.value)
          .map((part) => (
            <span key={part.key} className="h-full" style={{ flexGrow: part.value, backgroundColor: part.color }} />
          ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((part) => (
          <div key={part.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: part.color }} />
              <span className="truncate">{part.label}</span>
            </dt>
            <dd className="mt-0.5 ps-3.5 text-[14px] font-medium tabular-nums text-ink">{part.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function IntervalsPanel() {
  const { st } = useStudyT();
  const { settings } = useStudy();
  const intervals = settings.reviewIntervals;
  return (
    <section className={cn(PANEL, "min-w-0 px-4 pb-4 pt-3")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{st("prefs_reviews")}</h2>
        <Tooltip label={st("reviews_edit_intervals")}>
          <Button variant="ghost" size="icon-sm" aria-label={st("reviews_edit_intervals")} onClick={openStudyPreferences}>
            <SlidersHorizontal />
          </Button>
        </Tooltip>
      </div>
      {intervals.length ? (
        <>
          <IntervalTrack intervals={intervals} className="mt-2.5" />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">{st("reviews_intervals_desc", { count: intervals.length })}</p>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{st("reviews_intro_no_intervals")}</p>
      )}
    </section>
  );
}

/** A sessão e cada intervalo de revisão como marcos de uma linha. Com `from`, cada marco mostra a data em que cairia. */
function IntervalTrack({
  intervals,
  size = "sm",
  from,
  className,
}: {
  intervals: number[];
  size?: "sm" | "lg";
  from?: DayKey;
  className?: string;
}) {
  const { st, locale } = useStudyT();
  const steps = [
    { key: "session", label: st("reviews_intro_session"), date: from ? st("today") : null, start: true },
    ...intervals.map((days) => ({
      key: `d${days}`,
      label: st("review_interval", { count: days }),
      date: from ? formatDay(addDays(from, days), locale, { day: "numeric", month: "short" }) : null,
      start: false,
    })),
  ];
  const large = size === "lg";
  // Muitos intervalos não cabem numa linha: viram uma grade que quebra, com todos à vista.
  if (steps.length > 7) {
    return (
      <ol className={cn("grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1.5", className)}>
        {steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              "flex min-w-0 flex-col rounded-[9px] px-2 py-1.5",
              step.start ? "bg-[var(--accent-soft)]" : "shadow-[inset_0_0_0_1px_var(--border)]"
            )}
          >
            <span className={cn("truncate text-[12px] font-medium tabular-nums", step.start ? "text-[var(--accent)]" : "text-ink")}>{step.label}</span>
            {step.date ? <span className="truncate text-[11px] tabular-nums text-faint">{step.date}</span> : null}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn("flex overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.key} className={cn("flex flex-col pe-2", last ? "shrink-0" : "flex-1", large ? "min-w-[5.5rem]" : "min-w-[3.75rem]")}>
            <span className={cn("relative flex items-center", large ? "h-4" : "h-3")}>
              <span
                aria-hidden
                className={cn(
                  "relative z-10 shrink-0 rounded-full",
                  large ? "size-3.5" : "size-2.5",
                  step.start ? "bg-[var(--accent)]" : "border-2 border-[var(--accent)] bg-[var(--surface)]"
                )}
              />
              {last ? null : (
                <span aria-hidden className={cn("absolute right-[-0.5rem] top-1/2 h-px -translate-y-1/2 bg-[var(--border-strong)]", large ? "left-3.5" : "left-2.5")} />
              )}
            </span>
            <span className={cn("mt-2 whitespace-nowrap font-medium tabular-nums", large ? "text-[13px]" : "text-[12px]", step.start ? "text-muted" : "text-ink")}>
              {step.label}
            </span>
            {step.date ? <span className="mt-0.5 whitespace-nowrap text-[12px] tabular-nums text-faint">{step.date}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Cards das notas que vencem hoje. Novos e revisões ficam separados: card novo nunca é chamado de revisão. */
function FlashcardsPanel() {
  const { st } = useStudyT();
  const router = useRouter();
  const { dueFlashcards } = useWorkspace();
  const counts = useMemo(() => {
    const fresh = dueFlashcards.filter((card) => cardStage(card) === "new").length;
    return { total: dueFlashcards.length, fresh, review: dueFlashcards.length - fresh };
  }, [dueFlashcards]);
  if (!counts.total) return null;
  return (
    <section className={cn(PANEL, "flex min-w-0 items-center gap-3 px-4 py-3.5")}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
        <Layers3 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink">{st("reviews_cards_title")}</p>
        <p className="truncate text-[12px] text-muted">{st("reviews_cards_count", { count: counts.total })}</p>
        {counts.fresh && counts.review ? (
          <p className="truncate text-[11.5px] text-faint">
            {st("reviews_cards_new", { count: counts.fresh })} · {st("reviews_cards_review", { count: counts.review })}
          </p>
        ) : null}
      </div>
      <Button variant="secondary" size="sm" onClick={() => router.push("/home/flashcards")}>
        {st("open")}
      </Button>
    </section>
  );
}

/** Objetivo sem nenhuma revisão ainda: explica de onde elas vêm com os intervalos reais das preferências. */
function ReviewsIntro() {
  const { st } = useStudyT();
  const { settings, today, planReadOnly } = useStudy();
  const { dueFlashcards } = useWorkspace();
  const intervals = settings.reviewIntervals;
  return (
    <div className="@container/reviews">
      <div className={cn("grid grid-cols-1 items-start gap-5", dueFlashcards.length ? "@5xl/reviews:grid-cols-[minmax(0,1fr)_18.5rem]" : "")}>
        <section className={cn(PANEL, "@container/intro min-w-0 overflow-hidden")}>
          <div className="grid grid-cols-1 @3xl/intro:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <div className="px-5 py-6 sm:px-7 sm:py-7">
              <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{st("reviews_intro_title")}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                {intervals.length ? st("reviews_intro_desc") : st("reviews_intro_no_intervals")}
              </p>
              {intervals.length && !settings.autoReviews ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-faint">{st("reviews_intro_auto_off")}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {planReadOnly ? null : (
                  <Button variant="secondary" onClick={() => useStudyUi.getState().openLog()}>
                    <Plus />
                    {st("logform_title_new")}
                  </Button>
                )}
                <Button variant="ghost" onClick={openStudyPreferences}>
                  <SlidersHorizontal />
                  {st("reviews_edit_intervals")}
                </Button>
              </div>
            </div>
            {intervals.length ? (
              <div className="flex min-w-0 flex-col justify-center border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_45%,var(--surface))] px-5 py-6 sm:px-7 @3xl/intro:border-l @3xl/intro:border-t-0">
                <p className="text-[12.5px] font-medium text-muted">{st("reviews_intro_preview")}</p>
                <IntervalTrack intervals={intervals} size="lg" from={today} className="mt-5" />
              </div>
            ) : null}
          </div>
        </section>
        <FlashcardsPanel />
      </div>
    </div>
  );
}
