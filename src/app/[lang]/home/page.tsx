"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  Layers,
  NotebookText,
  Plus,
  RotateCcw,
  Star,
  Sunrise,
  Sunset,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox, EmptyState } from "@/components/ui/primitives";
import { cn, formatRelative } from "@/lib/utils";
import { WorkspaceIcon, isIconUrl } from "@/lib/icons/workspace-icon";
import { coverPresetById } from "@/lib/covers/presets";
import { notebookSubtreeIds } from "@/lib/data/notebook-tree";
import { sortNotebooks } from "@/lib/data/list-sort";
import { useUiStore } from "@/lib/store/ui-store";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { usePlanMetrics } from "@/lib/study/hooks";
import { openBlankTimer, useStudyUi } from "@/lib/study/ui-store";
import { usePlanning } from "@/lib/study/planning";
import type { PlanningTask } from "@/lib/study/planning-bridge";
import { projectSchedule, type PlannedBlock } from "@/lib/study/cycle";
import { subjectTone } from "@/lib/study/defaults";
import { resolvedDayOf } from "@/lib/study/review-queue";
import { cardStage, startOfDay } from "@/lib/flashcards/srs";
import { addDays, capitalizeFirst, dayKeyOf, diffDays, formatDay, minuteOfDay, startOfWeek, weekDays, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import { secondsByDay } from "@/lib/study/metrics";
import { FocusButton, GoalSwitcher } from "@/components/study/ui";
import { KpiBand } from "@/components/study/widgets";
import { TaskCheck, TaskDialog, type TaskDialogState } from "@/components/study/tasks";
import type { DayKey, StudyReminder, StudyReview } from "@/types/study";
import type { Notebook, Page } from "@/types/models";
import { EDITORIAL_SERIF, SERIF_LANGUAGES } from "@/lib/typography";

const SERIF = EDITORIAL_SERIF;
const TILE = "rounded-[22px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]";
const LIFT =
  "transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--border-strong),0_18px_36px_-20px_rgba(15,44,76,0.38)]";
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")";

type SkyPhase = "night" | "dawn" | "morning" | "afternoon" | "dusk";

const STARS = Array.from({ length: 26 }, (_, index) => ({
  left: (index * 37 + 11) % 100,
  top: (index * 53 + 7) % 64,
  size: index % 6 === 0 ? 2 : 1,
  opacity: 0.3 + ((index * 29) % 55) / 100,
}));

const ARC = { width: 240, height: 120, start: [12, 100], control: [120, -28], end: [228, 100] } as const;

function phaseOf(minute: number): SkyPhase {
  if (minute < 300) return "night";
  if (minute < 420) return "dawn";
  if (minute < 720) return "morning";
  if (minute < 1020) return "afternoon";
  if (minute < 1170) return "dusk";
  return "night";
}

function arcPoint(t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * ARC.start[0] + 2 * u * t * ARC.control[0] + t * t * ARC.end[0],
    u * u * ARC.start[1] + 2 * u * t * ARC.control[1] + t * t * ARC.end[1],
  ];
}

function subscribeClock(callback: () => void) {
  const id = window.setInterval(callback, 30_000);
  return () => window.clearInterval(id);
}

function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => Math.floor(Date.now() / 60_000) * 60_000
  );
}

function greetingFor(minute: number, t: (key: TranslationKey) => string) {
  if (minute < 300) return t("greeting_early_morning");
  if (minute < 720) return t("greeting_morning");
  if (minute < 1080) return t("greeting_afternoon");
  return t("greeting_evening");
}

function noteCountLabel(count: number, t: (key: TranslationKey) => string) {
  return count === 1 ? `1 ${t("note_singular")}` : `${count} ${t("notes_plural")}`;
}

function excerptOf(page: Page) {
  return page.plainText.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 460);
}

function Cover({ url, position, className }: { url?: string | null; position?: number | null; className?: string }) {
  const preset = coverPresetById(url);
  const objectPosition = `center ${Math.round((position ?? 0.5) * 100)}%`;
  if (!url) {
    return (
      <span
        className={cn("block bg-[var(--surface-2)]", className)}
        style={{ backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1.2px)", backgroundSize: "14px 14px", backgroundPosition: "7px 7px" }}
      />
    );
  }
  if (preset) return <span className={cn("block", className, preset.className)} style={{ ...preset.style, backgroundPosition: objectPosition }} />;
  return <img src={url} alt="" draggable={false} className={cn("block object-cover", className)} style={{ objectPosition }} />;
}

function Glyph({ icon, size, kind }: { icon?: string | null; size: number; kind: "note" | "page" }) {
  if (icon?.trim()) {
    if (isIconUrl(icon)) {
      return (
        <span
          className="flex items-center justify-center overflow-hidden rounded-[9px] bg-white shadow-[0_0_0_1px_var(--border),0_2px_6px_-2px_rgba(15,44,76,0.2)]"
          style={{ width: size + 8, height: size + 8 }}
        >
          <WorkspaceIcon icon={icon} size={size} />
        </span>
      );
    }
    return <WorkspaceIcon icon={icon} size={size} />;
  }
  const Icon = kind === "note" ? FileText : NotebookText;
  return (
    <span
      className="flex items-center justify-center rounded-[10px] bg-[var(--surface)] text-muted shadow-[0_0_0_1px_var(--border),0_2px_6px_-2px_rgba(15,44,76,0.18)]"
      style={{ width: size + 8, height: size + 8 }}
    >
      <Icon style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={1.6} />
    </span>
  );
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.022em] text-ink">{title}</h2>
      {action}
    </div>
  );
}

function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch className="inline-flex items-center gap-0.5 text-[13px] text-muted transition hover:text-ink">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function WorkspaceHome() {
  const router = useRouter();
  const { t } = useTranslation();
  const { livePages, adapter, notebooks, notebookById, rootNotebooks, ready } = useWorkspace();
  const studyReady = useStudy().ready;

  const recent = useMemo(() => [...livePages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10), [livePages]);
  const notebooksSort = useUiStore((state) => state.notebooksSort);
  const notebooksSortDirection = useUiStore((state) => state.notebooksSortDirection);
  const sortedRootNotebooks = useMemo(
    () => sortNotebooks(rootNotebooks, notebooksSort, notebooksSortDirection),
    [rootNotebooks, notebooksSort, notebooksSortDirection]
  );

  const createNote = async () => {
    const page = await adapter.createPage({ title: t("untitled") });
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  const createRootPage = async () => {
    const notebook = await adapter.createNotebook({ name: t("new_page") });
    router.push(`/home/n/${notebook.id}`);
  };

  if (!ready || !studyReady) {
    return <div className="mx-auto w-full max-w-[70rem] px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8 2xl:max-w-[78rem] 3xl:max-w-[92rem] 4xl:max-w-[104rem]" />;
  }

  return (
    <div className="mx-auto w-full max-w-[70rem] px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8 2xl:max-w-[78rem] 3xl:max-w-[92rem] 4xl:max-w-[104rem]">
      <Reveal>
        <SkyHero onCreateNote={() => void createNote()} />
      </Reveal>

      <div className="mt-11 space-y-12">
        <Reveal delay={0.08}>
          <StudyOverview />
        </Reveal>

        <Reveal delay={0.12}>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PlanningTile />
            <TodayReviewsTile />
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <section aria-label={t("continue_where_left")}>
            <SectionTitle title={t("continue_where_left")} action={recent.length ? <QuietLink href="/home/notes">{t("view_all")}</QuietLink> : null} />
            {recent.length ? (
              <PaperShelf pages={recent} notebookById={notebookById} onCreate={() => void createNote()} />
            ) : (
              <EmptyState
                title={t("workspace_empty")}
                description={t("workspace_empty_desc")}
                action={
                  <Button variant="primary" onClick={() => void createNote()}>
                    <Plus />
                    {t("create_note")}
                  </Button>
                }
              />
            )}
          </section>
        </Reveal>

        <Reveal delay={0.2}>
          <section aria-label={t("pages")}>
            <SectionTitle
              title={t("pages")}
              action={
                <button
                  type="button"
                  onClick={() => void createRootPage()}
                  className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink"
                >
                  <Plus className="size-3.5" />
                  {t("new_page")}
                </button>
              }
            />
            {sortedRootNotebooks.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-4">
                {sortedRootNotebooks.map((notebook) => (
                  <PageCard key={notebook.id} notebook={notebook} notebooks={notebooks} livePages={livePages} />
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void createRootPage()}
                className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-[var(--border-strong)] text-[13px] text-muted transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                <Plus className="size-[18px]" />
                {t("new_page")}
              </button>
            )}
          </section>
        </Reveal>
      </div>
    </div>
  );
}

function SkyHero({ onCreateNote }: { onCreateNote: () => void }) {
  const { user } = useAuth();
  const { t, textDir, language } = useTranslation();
  const { st, locale } = useStudyT();
  const study = useStudy();
  const now = useNow();
  const minute = minuteOfDay(now, study.settings.timeZone);
  const phase = phaseOf(minute);
  const serif = SERIF_LANGUAGES.has(language);

  const dayT = (minute - 360) / 720;
  const isDay = dayT >= 0 && dayT <= 1;
  const t01 = isDay ? dayT : ((minute >= 1080 ? minute - 1080 : minute + 360) / 720);
  const [bodyX, bodyY] = arcPoint(Math.min(1, Math.max(0, t01)));
  const glowAt = `right ${Math.round(32 + ARC.width - bodyX)}px top ${Math.round(30 + bodyY)}px`;

  const plan = study.activePlan;
  const today = study.today;
  const goalName = plan ? plan.name || st("untitled_goal") : "";
  const examDays = plan?.examDate ? diffDays(today, plan.examDate) : null;
  const brief: string[] = [];
  if (plan && examDays !== null && examDays > 0 && examDays <= 365) brief.push(st("home_brief_exam", { count: examDays, goal: goalName }));
  else if (plan && examDays === 0) brief.push(st("home_brief_exam_today", { goal: goalName }));
  const firstName = user?.displayName?.split(" ")[0] ?? "";
  const greeting = greetingFor(minute, t);
  const showStars = phase === "night" || phase === "dawn" || phase === "dusk";

  return (
    <section
      data-phase={phase}
      suppressHydrationWarning
      className="home-sky @container relative isolate overflow-hidden rounded-[28px] px-6 pb-6 pt-7 transition-[background] duration-1000 sm:px-9 sm:pb-8 sm:pt-9 3xl:px-12 3xl:pb-10 3xl:pt-12"
      style={{ ["--sky-at" as string]: glowAt }}
    >
      {showStars ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: "var(--sky-stars)" }}>
          {STARS.slice(0, phase === "night" ? STARS.length : 10).map((star, index) => (
            <span
              key={index}
              className="absolute rounded-full bg-white"
              style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, opacity: star.opacity * (phase === "night" ? 1 : 0.5) }}
            />
          ))}
        </div>
      ) : null}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <SunArc t={t01} isDay={isDay} />

      <div className="relative @2xl:pr-[15.5rem]">
        <p suppressHydrationWarning className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--sky-muted)]">
          {capitalizeFirst(formatDay(today, locale, { weekday: "long", day: "numeric", month: "long" }))}
        </p>
        <h1
          suppressHydrationWarning
          dir={textDir}
          className={cn(
            "mt-2.5 text-balance text-[2.125rem] leading-[1.04] @lg:text-[2.625rem] @3xl:text-[3.25rem] @6xl:text-[3.75rem]",
            serif ? "font-normal tracking-[-0.02em]" : "font-semibold tracking-[-0.035em]"
          )}
          style={serif ? { fontFamily: SERIF } : undefined}
        >
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
        <p
          dir={textDir}
          aria-hidden={brief.length ? undefined : true}
          className="mt-3 min-h-[1lh] max-w-xl text-pretty text-[14.5px] leading-relaxed text-[var(--sky-muted)]"
        >
          {brief.join(" ")}
        </p>
      </div>

      <div className="relative mt-6 flex flex-col gap-5 border-t border-[var(--sky-ring)] pt-5 @lg:mt-8 @lg:pt-6 @3xl:flex-row @3xl:items-end @3xl:justify-between @3xl:gap-10">
        <SkyWeek />
        <button
          type="button"
          onClick={onCreateNote}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-[var(--sky-cta-bg)] px-4 text-[13px] font-semibold text-[var(--sky-cta-fg)] shadow-[0_6px_18px_-8px_rgba(4,10,20,0.45)] transition hover:-translate-y-px active:translate-y-0 @3xl:self-end"
        >
          <Plus className="size-4" />
          {t("new_note")}
        </button>
      </div>
    </section>
  );
}

function SkyWeek() {
  const { st, locale, duration } = useStudyT();
  const { sessions, exams, settings, today, ready } = useStudy();
  const days = useMemo(() => weekDays(startOfWeek(today, settings.weekStartsOn)), [settings.weekStartsOn, today]);
  const byDay = useMemo(() => secondsByDay(sessions, exams), [exams, sessions]);
  if (!ready) return <div className="h-[5.25rem] w-full min-w-0 @3xl:max-w-[42rem]" />;
  const values = days.map((day) => byDay.get(day) ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const studied = values.filter((value) => value > 0).length;
  const top = Math.max(...values);
  const scale = Math.max(top, 1800);
  const peak = top > 0 ? values.indexOf(top) : -1;

  return (
    <Link
      href="/home/study/log"
      prefetch
      className="group flex w-full min-w-0 flex-col gap-5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-ring)] @lg:flex-row @lg:items-end @lg:gap-9 @3xl:max-w-[42rem]"
    >
      <div className="shrink-0 @lg:pb-0.5">
        <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-[var(--sky-muted)]">
          {st("home_week_all_title")}
          <ChevronRight className="size-3 -translate-x-0.5 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 rtl:rotate-180" />
        </p>
        <p className={cn("mt-2 whitespace-nowrap text-[30px] font-semibold leading-none tracking-[-0.035em] tabular-nums", !total && "opacity-50")}>
          {duration(total)}
        </p>
        <p className="mt-2 text-[12px] leading-snug text-[var(--sky-muted)]">
          {st("home_week_days_studied", { count: studied })}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative grid h-[5.25rem] grid-cols-7 border-b border-dashed border-[var(--sky-ring)] pt-5">
          {days.map((day, index) => {
            const value = values[index];
            const height = value ? Math.max(8, (value / scale) * 100) : 0;
            const isToday = day === today;
            const future = day > today;
            const showValue = value > 0 && (index === peak || isToday);
            const label = `${capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" }))}${value ? ` · ${duration(value)}` : ""}`;
            return (
              <div key={day} title={label} className="relative flex h-full items-end justify-center">
                {showValue ? (
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold leading-none tabular-nums",
                      isToday ? "text-[var(--sky-ink)]" : "text-[var(--sky-muted)]"
                    )}
                    style={{ bottom: `calc(${height}% + 7px)` }}
                  >
                    {duration(value)}
                  </span>
                ) : null}
                {value ? (
                  <span
                    className="block w-2 rounded-full transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] @lg:w-2.5"
                    style={{
                      height: `${height}%`,
                      background: isToday
                        ? "var(--sky-bar-today)"
                        : "linear-gradient(to top, color-mix(in oklab, var(--sky-bar) 45%, transparent), var(--sky-bar))",
                      boxShadow: isToday ? "0 0 18px -2px color-mix(in oklab, var(--sky-bar-today) 70%, transparent)" : undefined,
                    }}
                  />
                ) : (
                  <span
                    className={cn("mb-[-3px] block size-[5px] rounded-full bg-[var(--sky-muted)]", future ? "opacity-25" : "opacity-50", isToday && "opacity-90")}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2.5 grid grid-cols-7">
          {days.map((day) => {
            const isToday = day === today;
            return (
              <span
                key={day}
                className={cn(
                  "text-center text-[10.5px] uppercase leading-none tracking-[0.06em]",
                  isToday ? "font-bold text-[var(--sky-ink)]" : "text-[var(--sky-muted)]",
                  day > today && "opacity-60"
                )}
              >
                {weekdayLabel(weekdayOf(day), locale, "short").replace(".", "")}
              </span>
            );
          })}
        </div>
      </div>
    </Link>
  );
}

function SunArc({ t, isDay }: { t: number; isDay: boolean }) {
  const id = useId().replace(/:/g, "");
  const progress = Math.min(1, Math.max(0, t));
  const [x, y] = arcPoint(progress);
  const path = `M ${ARC.start[0]} ${ARC.start[1]} Q ${ARC.control[0]} ${ARC.control[1]} ${ARC.end[0]} ${ARC.end[1]}`;
  return (
    <div aria-hidden className="pointer-events-none absolute right-8 top-[1.875rem] hidden @2xl:block">
      <svg width={ARC.width} height={ARC.height + 18} viewBox={`0 0 ${ARC.width} ${ARC.height + 18}`} fill="none">
        <defs>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0%" stopColor={isDay ? "#ffe3a1" : "#e9ecff"} stopOpacity="0.9" />
            <stop offset="100%" stopColor={isDay ? "#ffe3a1" : "#e9ecff"} stopOpacity="0" />
          </radialGradient>
          <mask id={`${id}-moon`}>
            <circle cx={x} cy={y} r="7.5" fill="white" />
            <circle cx={x + 3.6} cy={y - 2.6} r="6.4" fill="black" />
          </mask>
        </defs>
        <line x1="0" y1={ARC.start[1]} x2={ARC.width} y2={ARC.start[1]} stroke="currentColor" strokeOpacity="0.28" />
        <path d={path} stroke="currentColor" strokeOpacity="0.32" strokeDasharray="2 5" strokeLinecap="round" />
        <path d={path} stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" pathLength={1} strokeDasharray={`${progress} 1`} strokeLinecap="round" />
        <circle cx={x} cy={y} r="22" fill={`url(#${id}-halo)`} />
        {isDay ? (
          <circle cx={x} cy={y} r="7.5" fill="#ffd66e" stroke="#fff3cf" strokeWidth="1.5" />
        ) : (
          <circle cx={x} cy={y} r="7.5" fill="#f4f1e6" mask={`url(#${id}-moon)`} />
        )}
        <g transform={`translate(4 ${ARC.start[1] + 5})`} opacity="0.7">
          <Sunrise width={13} height={13} />
        </g>
        <g transform={`translate(${ARC.width - 17} ${ARC.start[1] + 5})`} opacity="0.7">
          <Sunset width={13} height={13} />
        </g>
      </svg>
    </div>
  );
}

function PaperShelf({
  pages,
  notebookById,
  onCreate,
}: {
  pages: Page[];
  notebookById: (id: string) => Notebook | undefined;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => {
      const max = node.scrollWidth - node.clientWidth;
      setEdges({ start: node.scrollLeft > 4, end: node.scrollLeft < max - 4 });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [pages.length]);

  const move = (direction: 1 | -1) => {
    const node = scroller.current;
    if (node) node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  };

  const mask: CSSProperties = {
    maskImage: `linear-gradient(to right, ${edges.start ? "transparent" : "#000"} 0, #000 32px, #000 calc(100% - 32px), ${edges.end ? "transparent" : "#000"} 100%)`,
  };

  return (
    <div className="group/shelf relative -mx-4 sm:mx-0">
      <div
        ref={scroller}
        style={mask}
        className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page) => (
          <PaperCard key={page.id} page={page} notebook={notebookById(page.notebookId ?? "")} />
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="flex h-[14.5rem] w-[11.25rem] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-[var(--border-strong)] text-[13px] text-muted transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface)] shadow-[0_0_0_1px_var(--border)]">
            <Plus className="size-4" />
          </span>
          {t("new_note")}
        </button>
      </div>
      {edges.start ? <ShelfArrow side="start" onClick={() => move(-1)} /> : null}
      {edges.end ? <ShelfArrow side="end" onClick={() => move(1)} /> : null}
    </div>
  );
}

function ShelfArrow({ side, onClick }: { side: "start" | "end"; onClick: () => void }) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-hidden
      tabIndex={-1}
      className={cn(
        "absolute top-[45%] hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface)] text-muted opacity-0 shadow-[0_0_0_1px_var(--border),0_8px_20px_-8px_rgba(15,44,76,0.35)] transition hover:text-ink group-hover/shelf:opacity-100 md:flex",
        side === "start" ? "-left-4" : "-right-4"
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function PaperCard({ page, notebook }: { page: Page; notebook?: Notebook }) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { st } = useStudyT();
  const title = page.title || t("untitled");
  const excerpt = excerptOf(page);
  const hasIcon = Boolean(page.icon?.trim());
  return (
    <Link
      href={`/home/p/${page.id}`}
      prefetch
      title={notebook ? `${notebook.name} › ${title}` : title}
      onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
      onClick={() => useUiStore.getState().closeMenu()}
      className={cn("relative flex h-[14.5rem] w-[11.25rem] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]", LIFT)}
    >
      {page.coverUrl ? <Cover url={page.coverUrl} position={page.coverPosition} className="h-12 w-full shrink-0" /> : null}
      <span className="flex min-h-0 flex-1 flex-col px-4 pt-3.5">
        {hasIcon ? (
          <span className={cn("mb-2 block", page.coverUrl && "-mt-7")}>
            <Glyph icon={page.icon} size={22} kind="note" />
          </span>
        ) : null}
        <span className="line-clamp-2 text-[14px] font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{title}</span>
        <span
          className={cn(
            "mt-2 min-h-0 flex-1 overflow-hidden whitespace-pre-line break-words text-[11px] leading-[1.62]",
            excerpt ? "text-muted" : "italic text-faint"
          )}
          style={{ maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)" }}
        >
          {excerpt || st("home_note_empty")}
        </span>
      </span>
      <span className="flex items-center gap-1.5 border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-faint">
        {page.favorite ? <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" /> : null}
        {notebook ? <span className="min-w-0 truncate">{notebook.name}</span> : null}
        {notebook ? <span aria-hidden>·</span> : null}
        <span className="shrink-0">{formatRelative(page.updatedAt, language)}</span>
      </span>
    </Link>
  );
}

function PlanningTile() {
  const { st } = useStudyT();
  const { today } = useStudy();
  const pendingOnly = useStudyUi((state) => state.homePendingOnly);
  const [picked, setPicked] = useState<{ day: DayKey | null; direction: 1 | -1 }>({ day: null, direction: 1 });
  const selected = picked.day ?? today;
  const select = (day: DayKey) => {
    if (day === selected) return;
    setPicked({ day: day === today ? null : day, direction: day > selected ? 1 : -1 });
  };
  return (
    <section aria-label={st("nav_schedule")} className={cn(TILE, "@container flex min-w-0 flex-col p-5 sm:p-6")}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{st("nav_schedule")}</h2>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-muted transition hover:text-ink">
            <Checkbox checked={pendingOnly} onCheckedChange={(value) => useStudyUi.getState().setHomePendingOnly(value === true)} />
            {st("home_pending_only")}
          </label>
          <QuietLink href="/home/study/schedule">{st("open")}</QuietLink>
        </div>
      </header>
      <WeekStrip selected={selected} onSelect={select} />
      <Agenda anchor={selected} direction={picked.direction} pendingOnly={pendingOnly} />
    </section>
  );
}

type DayMark = "review" | "task" | "event";

/**
 * Semana com o que está marcado em cada dia, na mesma linguagem do Planejamento:
 * traço na cor da disciplina, anel para revisão, quadrado para tarefa. Tocar num
 * dia mostra a agenda dele logo abaixo.
 */
function WeekStrip({ selected, onSelect }: { selected: DayKey; onSelect: (day: DayKey) => void }) {
  const { st, locale, duration } = useStudyT();
  const reduceMotion = useReducedMotion();
  const study = useStudy();
  const metrics = usePlanMetrics();
  const { tasks } = usePlanning();
  const { today, activePlan: plan, planCycle, planReviews, reminders, settings, subjectById } = study;
  const week = useMemo(() => weekDays(startOfWeek(today, settings.weekStartsOn)), [today, settings.weekStartsOn]);

  const plannedByDay = useMemo(() => {
    const map = new Map<DayKey, { colors: string[]; minutes: number }>();
    if (!planCycle) return map;
    for (const [day, blocks] of projectSchedule(planCycle, week[0], week[6], today)) {
      const colors: string[] = [];
      let minutes = 0;
      for (const block of blocks) {
        const subject = subjectById(block.subjectId);
        if (!subject || block.status === "skipped" || block.status === "missed") continue;
        if (block.status === "planned") minutes += block.minutes;
        const tone = subjectTone(subject.color);
        if (!colors.includes(tone)) colors.push(tone);
      }
      if (colors.length) map.set(day, { colors, minutes });
    }
    return map;
  }, [planCycle, subjectById, today, week]);

  const marks = useMemo(() => {
    const first = week[0];
    const last = week[6];
    const map = new Map<string, Set<DayMark>>();
    const add = (day: string | null | undefined, kind: DayMark) => {
      if (!day || day < first || day > last) return;
      const set = map.get(day) ?? new Set();
      set.add(kind);
      map.set(day, set);
    };
    for (const task of tasks) add(task.day, "task");
    if (plan) {
      for (const review of planReviews) if (review.status === "pending") add(review.dueDay < today ? today : review.dueDay, "review");
      add(plan.examDate, "event");
    }
    for (const reminder of reminders) {
      if (!reminder.done && (!reminder.planId || reminder.planId === plan?.id)) add(reminder.day, "event");
    }
    return map;
  }, [plan, planReviews, reminders, tasks, today, week]);

  return (
    <div className="mb-5 grid grid-cols-7 gap-1 rounded-[16px] bg-[var(--surface-2)] p-1">
      {week.map((day) => {
        const isToday = day === today;
        const isSelected = day === selected;
        const kinds = marks.get(day);
        const planned = plannedByDay.get(day);
        const seconds = metrics.byDay.get(day) ?? 0;
        const label = [
          capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })),
          planned?.minutes ? `${st("week_planned_label")} ${duration(planned.minutes * 60)}` : null,
          seconds ? `${st("week_done_label")} ${duration(seconds)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={day}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isSelected}
            onClick={() => onSelect(day)}
            className={cn(
              "group/day relative flex min-w-0 flex-col items-center gap-1 rounded-[12px] pb-2 pt-1.5 outline-none transition-[background-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-[0.95]",
              !isSelected && "hover:bg-[var(--surface-hover)]"
            )}
          >
            {/* O cartão do dia escolhido desliza até o dia tocado. */}
            {isSelected ? (
              <motion.span
                layoutId="home-week-selected"
                initial={false}
                aria-hidden
                className="absolute inset-0 rounded-[12px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_8px_18px_-10px_rgba(15,44,76,0.5)]"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.9 }}
              />
            ) : null}
            <span className={cn("relative text-[10.5px] font-medium", isToday ? "text-[var(--accent)]" : "text-faint")}>
              {weekdayLabel(weekdayOf(day), locale, "short").replace(".", "")}
            </span>
            <span
              className={cn(
                "relative text-[16px] font-semibold tabular-nums leading-none tracking-[-0.02em] transition-colors duration-200",
                isSelected || isToday ? "text-ink" : day < today ? "text-faint group-hover/day:text-muted" : "text-muted group-hover/day:text-ink"
              )}
            >
              {Number(day.slice(8, 10))}
            </span>
            <span aria-hidden className="relative flex h-2 max-w-full items-center gap-[3px] overflow-hidden">
              {planned?.colors.slice(0, 3).map((color) => (
                <span key={color} className="h-2 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color, opacity: day < today ? 0.5 : 1 }} />
              ))}
              {kinds?.has("review") ? <span className="size-[6px] shrink-0 rounded-full border-[1.5px] border-[var(--accent)]" /> : null}
              {kinds?.has("task") ? <span className="size-[5px] shrink-0 rounded-[1.5px] bg-[var(--text-faint)]" /> : null}
              {kinds?.has("event") ? <span className="size-[5px] shrink-0 rounded-full bg-[var(--warning)]" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StudyOverview() {
  const router = useRouter();
  const { st } = useStudyT();
  const study = useStudy();
  const plan = study.activePlan;

  if (!study.ready) {
    return (
      <div className="space-y-4">
        <div className="h-11 w-60 animate-pulse rounded-[14px] bg-[var(--surface-2)]" />
        <div className="h-32 animate-pulse rounded-[22px] bg-[var(--surface-2)]" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={cn(TILE, "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6")}>
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">{st("home_study_intro_title")}</p>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">{st("home_study_intro_desc")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button variant="primary" size="sm" onClick={() => router.push("/home/study/goals/new")}>
            {st("home_study_intro_cta")}
          </Button>
          <Button variant="ghost" size="sm" onClick={openBlankTimer}>
            <Timer />
            {st("home_quick_focus")}
          </Button>
        </div>
      </div>
    );
  }

  // O objetivo ativo abre o painel dos números, como o cabeçalho de um projeto no Linear.
  return (
    <section aria-label={plan.name || st("untitled_goal")} className={cn(TILE, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4 px-5 pb-4 pt-5 sm:px-6">
        <GoalSwitcher />
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Sessão nova começa em branco: a disciplina é escolhida no relógio. */}
          <Button variant="primary" size="sm" onClick={openBlankTimer}>
            <Timer />
            {st("next_up_start")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useStudyUi.getState().openLog()}>
            <Plus />
            {st("logform_title_new")}
          </Button>
        </div>
      </div>
      <KpiBand className="rounded-none border-t border-[var(--border)] shadow-none" />
    </section>
  );
}

type AgendaItem =
  | { kind: "exam"; key: string }
  | { kind: "study"; key: string; block: PlannedBlock }
  | { kind: "review"; key: string; review: StudyReview }
  | { kind: "cards"; key: string; total: number; fresh: number; done: boolean }
  | { kind: "reminder"; key: string; reminder: StudyReminder }
  | { kind: "task"; key: string; task: PlanningTask; overdue: boolean };

const AGENDA_ORDER: Record<AgendaItem["kind"], number> = { exam: 0, study: 1, review: 2, cards: 3, reminder: 4, task: 5 };
const DAY_LIMIT = 12;

/** Item já feito: continua no dia, riscado, e só sai com "Só pendentes". */
function agendaItemDone(item: AgendaItem): boolean {
  if (item.kind === "study") return item.block.status === "done" || item.block.status === "skipped";
  if (item.kind === "review") return item.review.status === "done";
  if (item.kind === "reminder") return item.reminder.done;
  if (item.kind === "task") return item.task.done;
  if (item.kind === "cards") return item.done;
  return false;
}

const CARD_DAY_KEY = "synapsys.home.cardDay";

function readCardDay(day: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CARD_DAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day?: unknown; ids?: unknown };
    if (parsed.day !== day || !Array.isArray(parsed.ids)) return [];
    return parsed.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeCardDay(day: string, ids: string[]) {
  try {
    window.localStorage.setItem(CARD_DAY_KEY, JSON.stringify({ day, ids }));
  } catch {}
}

function reviewedTodayIds(cards: { id: string; lastReviewedAt: number | null }[], due: Set<string>) {
  const start = startOfDay();
  return cards
    .filter((card) => {
      const at = Number(card.lastReviewedAt) || 0;
      return at >= start && !due.has(card.id);
    })
    .map((card) => card.id);
}

/**
 * Agenda do dia escolhido na semana (hoje, por padrão), com tudo o que o
 * Planejamento mostra: disciplinas do ciclo e dos dias fixos, revisões,
 * flashcards, lembretes, prova e tarefas. Trocar de dia desliza o conteúdo na
 * direção do dia tocado.
 */
function Agenda({ anchor, direction, pendingOnly }: { anchor: DayKey; direction: 1 | -1; pendingOnly: boolean }) {
  const { st, locale } = useStudyT();
  const reduceMotion = useReducedMotion();
  const study = useStudy();
  const { dueFlashcards, flashcards, flashcardsReady } = useWorkspace();
  const { tasks } = usePlanning();
  const [dialog, setDialog] = useState<TaskDialogState>({ open: false, task: null, day: null });
  const [rememberedCards, setRememberedCards] = useState<string[]>(() => readCardDay(study.today));
  const { today, activePlan: plan, planCycle, planReviews, reminders, settings, subjectById } = study;

  useEffect(() => {
    if (!flashcardsReady) return;
    const known = new Set(flashcards.map((card) => card.id));
    const dueIds = dueFlashcards.map((card) => card.id);
    const due = new Set(dueIds);
    const stored = readCardDay(today).filter((id) => known.has(id));
    let next = [...new Set([...stored, ...dueIds])];
    if (!next.length) next = reviewedTodayIds(flashcards, due);
    writeCardDay(today, next);
    setRememberedCards((current) => (current.join("\0") === next.join("\0") ? current : next));
  }, [flashcardsReady, today, dueFlashcards, flashcards]);

  const items = useMemo(() => {
    const list: AgendaItem[] = [];
    for (const task of tasks) {
      if (!task.day) continue;
      if (task.day === anchor) list.push({ kind: "task", key: task.id, task, overdue: !task.done && task.day < today });
      else if (anchor === today && task.day < today && !task.done) list.push({ kind: "task", key: task.id, task, overdue: true });
    }
    if (plan) {
      if (planCycle) {
        for (const block of projectSchedule(planCycle, anchor, anchor, today).get(anchor) ?? []) {
          if (subjectById(block.subjectId)) list.push({ kind: "study", key: block.key, block });
        }
      }
      for (const review of planReviews) {
        // Pendente atrasada vai para hoje, como no Planejamento; feita fica no dia em que foi feita.
        const day =
          review.status === "pending"
            ? review.dueDay < today
              ? today
              : review.dueDay
            : review.status === "done"
              ? resolvedDayOf(review, settings.timeZone)
              : null;
        if (day === anchor) list.push({ kind: "review", key: review.id, review });
      }
      if (plan.examDate === anchor) list.push({ kind: "exam", key: "exam" });
    }
    for (const reminder of reminders) {
      if (reminder.day !== anchor || (reminder.planId && reminder.planId !== plan?.id)) continue;
      list.push({ kind: "reminder", key: reminder.id, reminder });
    }
    if (anchor === today) {
      const known = new Set(flashcards.map((card) => card.id));
      const dueIds = dueFlashcards.map((card) => card.id);
      const due = new Set(dueIds);
      let queue = [...new Set([...rememberedCards.filter((id) => known.has(id)), ...dueIds])];
      if (!queue.length) queue = reviewedTodayIds(flashcards, due);
      const finished = queue.filter((id) => !due.has(id));
      const done = dueFlashcards.length === 0 && finished.length > 0;
      if (dueFlashcards.length > 0 || done) {
        list.push({
          kind: "cards",
          key: "cards",
          total: done ? finished.length : dueFlashcards.length,
          fresh: done ? 0 : dueFlashcards.filter((card) => cardStage(card) === "new").length,
          done,
        });
      }
    }
    // Ordem estável por tipo: marcar algo como feito não faz a linha pular de lugar.
    return list.sort((a, b) => AGENDA_ORDER[a.kind] - AGENDA_ORDER[b.kind]);
  }, [anchor, dueFlashcards, flashcards, plan, planCycle, planReviews, rememberedCards, reminders, settings.timeZone, subjectById, tasks, today]);

  const visible = pendingOnly ? items.filter((item) => !agendaItemDone(item)) : items;
  const shown = visible.slice(0, DAY_LIMIT);
  const hidden = visible.length - shown.length;
  const trackable = items.filter((item) => item.kind !== "exam");
  const doneCount = trackable.filter(agendaItemDone).length;
  const offset = reduceMotion ? 0 : 20;
  const title =
    anchor === today
      ? st("today")
      : anchor === addDays(today, 1)
        ? st("tomorrow")
        : anchor === addDays(today, -1)
          ? st("yesterday")
          : capitalizeFirst(formatDay(anchor, locale, { weekday: "long" }));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={anchor}
          initial={{ opacity: 0, x: direction * offset }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, x: -direction * offset, transition: { duration: 0.12, ease: "easeIn" } }}
          className="min-w-0"
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="text-[13px] font-semibold text-ink">{title}</span>
              <span className="text-[12px] text-faint">{formatDay(anchor, locale, { day: "numeric", month: "short" })}</span>
            </p>
            {trackable.length ? (
              <span className="shrink-0 text-[12px] tabular-nums text-faint">{st("home_day_progress", { done: doneCount, total: trackable.length })}</span>
            ) : null}
          </div>
          {shown.length ? (
            <ul>
              <AnimatePresence>
                {shown.map((item, index) => (
                  <AgendaRow
                    key={item.key}
                    item={item}
                    day={anchor}
                    index={index}
                    onOpenTask={(task) => setDialog({ open: true, task, day: task.day })}
                  />
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="py-1.5 text-[13px] text-faint">
              {items.length ? st("home_day_all_done") : anchor === today ? st("home_today_clear") : st("home_day_clear")}
            </p>
          )}
          {hidden > 0 ? (
            <Link href="/home/study/schedule" prefetch className="mt-0.5 inline-block pl-7 text-[12px] text-muted transition hover:text-ink">
              {st("more_items", { count: hidden })}
            </Link>
          ) : null}
        </motion.div>
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setDialog({ open: true, task: null, day: anchor < today ? today : anchor })}
        className="-mx-2 mt-auto flex items-center gap-3 self-start rounded-[var(--radius-sm)] px-2 py-1.5 pt-4 text-[13px] text-muted transition hover:text-ink"
      >
        <span className="flex w-4 justify-center">
          <Plus className="size-4" />
        </span>
        {st("task_new")}
      </button>
      <TaskDialog state={dialog} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} />
    </div>
  );
}

function AgendaRow({
  item,
  day,
  index,
  onOpenTask,
}: {
  item: AgendaItem;
  day: DayKey;
  index: number;
  onOpenTask: (task: PlanningTask) => void;
}) {
  const { st, locale, duration } = useStudyT();
  const reduceMotion = useReducedMotion();
  const study = useStudy();
  const done = agendaItemDone(item);
  const motionProps = reduceMotion
    ? {}
    : {
        layout: "position" as const,
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.24, delay: Math.min(index, 8) * 0.035, ease: [0.16, 1, 0.3, 1] as const } },
        exit: { opacity: 0, x: -10, transition: { duration: 0.16 } },
      };
  const row = "-mx-2 flex min-w-0 gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]";
  const rail = (color: string, opacity = 1) => (
    <span className="flex w-4 shrink-0 justify-center self-stretch py-[3px]">
      <span className="w-[3px] rounded-full" style={{ background: color, opacity }} />
    </span>
  );
  const text = (title: string, meta?: string | null) => (
    <span className="min-w-0 flex-1">
      <span className={cn("block truncate text-[13.5px] leading-5", done ? "text-faint line-through" : "text-ink")}>{title}</span>
      {meta ? <span className="block truncate text-[12px] leading-4 text-faint">{meta}</span> : null}
    </span>
  );

  if (item.kind === "study") {
    const { block } = item;
    const subject = study.subjectById(block.subjectId);
    const entry = block.fixed ? study.planCycle?.agenda.find((candidate) => candidate.id === block.itemId) : undefined;
    const topicId = entry ? entry.topicId : (subject?.topics.find((topic) => !topic.done)?.id ?? null);
    const topicText = (entry?.topicId ? study.topicById(block.subjectId, entry.topicId)?.name : null) ?? (entry?.note || null);
    const planned = block.status === "planned";
    const status =
      block.status === "missed" ? (
        <span className="text-[var(--band-low-text)]">{st("agenda_missed")}</span>
      ) : block.status === "skipped" ? (
        <span>{st("agenda_skipped")}</span>
      ) : block.isNext ? (
        <span className="font-medium text-[var(--accent)]">{st("cycle_state_current")}</span>
      ) : null;
    return (
      <motion.li {...motionProps} className={cn(row, "group/study items-center")}>
        {rail(subject?.color ? subjectTone(subject.color) : "var(--text-faint)", planned ? 1 : 0.45)}
        <Link href="/home/study/schedule" prefetch className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13.5px] leading-5", planned ? "text-ink" : "text-faint", block.status === "done" && "line-through")}>
            {subject?.name || st("untitled_subject")}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-faint">
            {block.status === "done" ? <Check className="size-3 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden /> : null}
            <span className="shrink-0 tabular-nums">{duration(block.minutes * 60)}</span>
            {topicText ? <span className="min-w-0 truncate">· {topicText}</span> : null}
            {status ? <span className="shrink-0">·</span> : null}
            {status}
          </span>
        </Link>
        {planned && day === study.today ? (
          <FocusButton
            variant="ghost"
            size="icon-sm"
            subjectId={block.subjectId}
            topicId={topicId}
            label={st("next_up_start")}
            className="shrink-0 opacity-0 transition focus-visible:opacity-100 group-hover/study:opacity-100 [@media(hover:none)]:opacity-100"
          />
        ) : null}
      </motion.li>
    );
  }

  if (item.kind === "review") {
    const { review } = item;
    const subject = study.subjectById(review.subjectId);
    const topic = study.topicById(review.subjectId, review.topicId);
    const color = subject?.color ?? "var(--accent)";
    const late = !done && review.dueDay < study.today ? diffDays(review.dueDay, study.today) : 0;
    const meta = [st("home_review_meta", { count: review.intervalDays }), topic?.name].filter(Boolean).join(" · ");
    const toggle = async () => {
      await study.actions.resolveReviews([review.id], done ? "pending" : "done");
      if (!done) {
        toast.success(st("review_done_toast", { count: 1 }), {
          action: { label: st("review_restore"), onClick: () => void study.actions.resolveReviews([review.id], "pending") },
        });
      }
    };
    return (
      <motion.li {...motionProps} className={cn(row, "group/review items-center")}>
        <span className="flex w-4 shrink-0 justify-center">
          <button
            type="button"
            onClick={() => void toggle()}
            aria-pressed={done}
            aria-label={done ? st("review_restore") : st("review_complete")}
            title={done ? st("review_restore") : st("review_complete")}
            className="group/check flex size-[17px] items-center justify-center rounded-full border-2 transition-[background-color,transform] duration-200 active:scale-90"
            style={{ borderColor: color, backgroundColor: done ? color : "transparent" }}
          >
            <Check
              className={cn("size-2.5 transition-opacity duration-150", done ? "text-white" : "opacity-0 group-hover/check:opacity-100")}
              style={done ? undefined : { color }}
              strokeWidth={3.5}
            />
          </button>
        </span>
        <Link href="/home/study/reviews" prefetch className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13.5px] leading-5 transition-colors", done ? "text-faint line-through" : "text-ink")}>
            {subject?.name || st("untitled_subject")}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-faint">
            <span className={cn("min-w-0 truncate", done && "line-through")}>{meta}</span>
            {late ? <span className="shrink-0 text-[var(--band-low-text)]">· {st("review_late_by", { count: late })}</span> : null}
          </span>
        </Link>
        {!done && day === study.today ? (
          <FocusButton
            variant="ghost"
            size="icon-sm"
            subjectId={review.subjectId}
            topicId={review.topicId}
            reviewId={review.id}
            label={st("review_start")}
            className="shrink-0 opacity-0 transition focus-visible:opacity-100 group-hover/review:opacity-100 [@media(hover:none)]:opacity-100"
          />
        ) : null}
      </motion.li>
    );
  }

  if (item.kind === "task") {
    const { task } = item;
    return (
      <motion.li {...motionProps} className={cn(row, "items-center")}>
        <span className="flex w-4 shrink-0 justify-center">
          <TaskCheck task={task} />
        </span>
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className={cn("min-w-0 flex-1 truncate text-left text-[13.5px] leading-5", task.done ? "text-faint line-through" : "text-ink")}
        >
          {task.title || "—"}
        </button>
        {item.overdue && task.day ? (
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--danger)]">{formatDay(task.day, locale, { day: "numeric", month: "short" })}</span>
        ) : null}
      </motion.li>
    );
  }

  if (item.kind === "cards") {
    const reviewCards = item.total - item.fresh;
    const split = !item.done && item.fresh && reviewCards ? `${st("reviews_cards_new", { count: item.fresh })} · ${st("reviews_cards_review", { count: reviewCards })}` : null;
    const meta = item.done
      ? st("reviews_cards_done", { count: item.total })
      : [st("reviews_cards_count", { count: item.total }), split].filter(Boolean).join(" · ");
    return (
      <motion.li {...motionProps}>
        <Link href="/home/flashcards" prefetch className={cn(row, "items-center")}>
          <span className={cn("flex w-4 shrink-0 justify-center", item.done ? "text-faint" : "text-[var(--accent)]")}>
            <Layers className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13.5px] leading-5", item.done ? "text-faint line-through" : "text-ink")}>
              {st("reviews_cards_title")}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-faint">
              {item.done ? <Check className="size-3 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden /> : null}
              <span className={cn("min-w-0 truncate", item.done && "line-through")}>{meta}</span>
            </span>
          </span>
        </Link>
      </motion.li>
    );
  }

  if (item.kind === "exam") {
    const plan = study.activePlan;
    return (
      <motion.li {...motionProps}>
        <Link href={plan ? `/home/study/goals/${plan.id}` : "/home/study"} prefetch className={row}>
          <span className="flex w-4 shrink-0 justify-center pt-[3px] text-[var(--danger)]">
            <Flag className="size-3.5" />
          </span>
          {text(st("reminder_kind_exam"), plan?.name ?? null)}
        </Link>
      </motion.li>
    );
  }

  const { reminder } = item;
  return (
    <motion.li {...motionProps}>
      <Link href="/home/study/schedule" prefetch className={row}>
        {rail(reminder.kind === "exam" ? "var(--danger)" : "var(--warning)", done ? 0.45 : 1)}
        {text(reminder.title, st(`reminder_kind_${reminder.kind}`))}
      </Link>
    </motion.li>
  );
}

function PageCard({ notebook, notebooks, livePages }: { notebook: Notebook; notebooks: Notebook[]; livePages: Page[] }) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { count, last } = useMemo(() => {
    const subtree = new Set(notebookSubtreeIds(notebooks, notebook.id));
    let total = 0;
    let latest = 0;
    for (const page of livePages) {
      if (!page.notebookId || !subtree.has(page.notebookId)) continue;
      total += 1;
      if (page.updatedAt > latest) latest = page.updatedAt;
    }
    return { count: total, last: latest };
  }, [livePages, notebook.id, notebooks]);

  return (
    <Link
      href={`/home/n/${notebook.id}`}
      prefetch
      onMouseEnter={() => router.prefetch(`/home/n/${notebook.id}`)}
      className={cn(TILE, LIFT, "group relative flex flex-col overflow-hidden rounded-[20px]")}
    >
      <span className="relative block h-24 overflow-hidden">
        <Cover
          url={notebook.coverUrl}
          position={notebook.coverPosition}
          className="absolute inset-0 size-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        />
      </span>
      <span className="absolute left-4 top-[4.4rem]">
        <Glyph icon={notebook.emoji} size={30} kind="page" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-7">
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">{notebook.name || t("untitled")}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-faint">{noteCountLabel(count, t)}</span>
        </span>
        <span className="mt-1 text-[12px] text-faint">{last ? formatRelative(last, language) : "\u00a0"}</span>
      </span>
    </Link>
  );
}

function TodayReviewsTile() {
  const { st } = useStudyT();
  const study = useStudy();
  const plan = study.activePlan;
  const { planReviews, reviews, actions, today, settings, subjectById, topicById } = study;

  const targetReviews = plan ? planReviews : reviews;

  const { dueToday, overdue, doneToday } = useMemo(() => {
    const dueToday: StudyReview[] = [];
    const overdue: StudyReview[] = [];
    const doneToday: StudyReview[] = [];

    for (const review of targetReviews) {
      if (review.status === "pending") {
        if (review.dueDay === today) {
          dueToday.push(review);
        } else if (review.dueDay < today) {
          overdue.push(review);
        }
      } else if (review.status === "done") {
        const resolvedDay = review.resolvedAt ? dayKeyOf(review.resolvedAt, settings.timeZone) : review.dueDay;
        if (resolvedDay === today) {
          doneToday.push(review);
        }
      }
    }

    overdue.sort((a, b) => a.dueDay.localeCompare(b.dueDay));
    dueToday.sort((a, b) => a.dueDay.localeCompare(b.dueDay));

    return { dueToday, overdue, doneToday };
  }, [plan, planReviews, reviews, settings.timeZone, targetReviews, today]);

  const pendingReviews = useMemo(() => [...overdue, ...dueToday], [overdue, dueToday]);
  const totalPending = pendingReviews.length;
  const visiblePending = pendingReviews.slice(0, 5);
  const remainingCount = totalPending - visiblePending.length;

  if (!study.ready) {
    return (
      <div className={cn(TILE, "flex h-72 animate-pulse rounded-[22px] bg-[var(--surface)] p-5 sm:p-6")} />
    );
  }

  if (!plan) {
    return (
      <section aria-label={st("home_today_reviews_title")} className={cn(TILE, "@container flex min-w-0 flex-col p-5 sm:p-6")}>
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{st("home_today_reviews_title")}</h2>
          <QuietLink href="/home/study/reviews">{st("open")}</QuietLink>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[13.5px] font-medium text-ink">{st("home_study_intro_title")}</p>
          <p className="mt-1 max-w-xs text-[12.5px] text-muted">{st("home_study_intro_desc")}</p>
          <Link
            href="/home/study/goals/new"
            prefetch
            className="mt-4 inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-medium text-white shadow-sm transition hover:opacity-90"
          >
            <Plus className="size-3.5" />
            {st("home_study_intro_cta")}
          </Link>
        </div>
      </section>
    );
  }

  const handleComplete = async (review: StudyReview) => {
    await actions.resolveReviews([review.id], "done");
    toast.success(st("review_done_toast", { count: 1 }), {
      action: {
        label: st("review_restore"),
        onClick: () => void actions.resolveReviews([review.id], "pending"),
      },
    });
  };

  return (
    <section aria-label={st("home_today_reviews_title")} className={cn(TILE, "@container flex min-w-0 flex-col p-5 sm:p-6")}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{st("home_today_reviews_title")}</h2>
          {totalPending > 0 ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                overdue.length > 0
                  ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "bg-[var(--accent)]/10 text-[var(--accent)]"
              )}
            >
              {totalPending}
            </span>
          ) : null}
        </div>
        <QuietLink href="/home/study/reviews">{st("open")}</QuietLink>
      </header>

      {totalPending > 0 ? (
        <div className="flex flex-1 flex-col justify-between">
          <ul className="space-y-2">
            {visiblePending.map((review) => {
              const subject = subjectById(review.subjectId);
              const topic = topicById(review.subjectId, review.topicId);
              const isOverdue = review.dueDay < today;
              const daysLate = isOverdue ? diffDays(review.dueDay, today) : 0;

              return (
                <li
                  key={review.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-[14px] border px-3 py-2.5 transition",
                    isOverdue
                      ? "border-[var(--danger)]/30 bg-[var(--danger)]/[0.02] hover:border-[var(--danger)]/50"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void handleComplete(review)}
                    title={st("review_complete")}
                    aria-label={st("review_complete")}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-transparent transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] group-hover:border-[var(--accent)]/60"
                  >
                    <Check className="size-3" />
                  </button>

                  <span
                    className="h-8 w-[3px] shrink-0 rounded-full"
                    style={{ backgroundColor: subject?.color ? subjectTone(subject.color) : "var(--accent)" }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-[13.5px] font-semibold text-ink">
                        {subject?.name ?? st("untitled_subject")}
                      </span>
                      <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[10.5px] tabular-nums text-muted">
                        {st("review_interval", { count: review.intervalDays })}
                      </span>
                      {isOverdue ? (
                        <span className="rounded-full bg-[var(--danger)]/10 px-1.5 py-px text-[10.5px] font-medium text-[var(--danger)] tabular-nums">
                          {st("review_late_by", { count: daysLate })}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[12px] text-muted">
                      {topic?.name ?? st("no_topic")}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <FocusButton
                      variant="ghost"
                      size="icon-sm"
                      subjectId={review.subjectId}
                      topicId={review.topicId}
                      reviewId={review.id}
                      label={st("review_start")}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-col gap-2">
            {remainingCount > 0 ? (
              <Link
                href="/home/study/reviews"
                prefetch
                className="inline-block text-[12px] text-muted transition hover:text-ink"
              >
                {st("more_items", { count: remainingCount })}
              </Link>
            ) : null}

            {doneToday.length > 0 ? (
              <p className="text-[11.5px] text-faint">
                {st("review_done_toast", { count: doneToday.length })}
              </p>
            ) : null}
          </div>
        </div>
      ) : doneToday.length > 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-7 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="mt-3 text-[14px] font-semibold text-ink">{st("home_all_reviews_done")}</p>
          <p className="mt-1 text-[12px] text-muted">{st("review_done_toast", { count: doneToday.length })}</p>
          <Link
            href="/home/study/reviews"
            prefetch
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
          >
            {st("tab_done")}
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-7 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
            <RotateCcw className="size-5" />
          </div>
          <p className="mt-3 text-[14px] font-semibold text-ink">{st("reviews_empty_due")}</p>
          <Link
            href="/home/study/reviews"
            prefetch
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
          >
            {st("tab_upcoming")}
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}
