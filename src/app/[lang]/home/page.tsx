"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  Layers,
  NotebookText,
  PenLine,
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
import { EmptyState } from "@/components/ui/primitives";
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
import { useStudyUi } from "@/lib/study/ui-store";
import { usePlanning } from "@/lib/study/planning";
import type { PlanningTask } from "@/lib/study/planning-bridge";
import { nextUp } from "@/lib/study/suggest";
import { addDays, capitalizeFirst, dayKeyOf, diffDays, formatDay, minuteOfDay, startOfWeek, weekDays, weekdayLabel, weekdayOf } from "@/lib/study/dates";
import { FocusButton, GoalSwitcher, SubjectDot } from "@/components/study/ui";
import { KpiBand } from "@/components/study/widgets";
import { TaskCheck, TaskDialog, type TaskDialogState } from "@/components/study/tasks";
import type { StudyReminder, StudyReview } from "@/types/study";
import type { Notebook, Page } from "@/types/models";
import { EDITORIAL_SERIF, SERIF_LANGUAGES } from "@/lib/typography";

const SERIF = EDITORIAL_SERIF;
const TILE = "rounded-[22px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]";
const LIFT =
  "transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--border-strong),0_18px_36px_-20px_rgba(15,44,76,0.38)]";
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")";

type SkyPhase = "night" | "dawn" | "morning" | "afternoon" | "dusk";

const SKY: Record<SkyPhase, { base: string; bright: boolean; glow: string }> = {
  night: { base: "linear-gradient(168deg, #081229 0%, #14224d 52%, #2c2f66 100%)", bright: true, glow: "rgba(196, 208, 255, 0.26)" },
  dawn: { base: "linear-gradient(168deg, #1c2a57 0%, #6d4a86 42%, #d98a8a 76%, #f4c39b 100%)", bright: true, glow: "rgba(255, 200, 150, 0.55)" },
  morning: { base: "linear-gradient(168deg, #b9dcff 0%, #d9ecff 46%, #fbefd9 100%)", bright: false, glow: "rgba(255, 236, 186, 0.9)" },
  afternoon: { base: "linear-gradient(168deg, #86c3f2 0%, #bfe0fa 52%, #eaf5ff 100%)", bright: false, glow: "rgba(255, 246, 210, 0.85)" },
  dusk: { base: "linear-gradient(168deg, #27265c 0%, #7f4679 46%, #e2835f 84%, #f5bd78 100%)", bright: true, glow: "rgba(255, 178, 112, 0.6)" },
};

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

function useNow(): number | null {
  const minute = useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 60_000),
    () => -1
  );
  return minute < 0 ? null : minute * 60_000;
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
            ) : !ready ? (
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="h-[14.5rem] w-[11.25rem] shrink-0 animate-pulse rounded-[18px] bg-[var(--surface-2)]" />
                ))}
              </div>
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

        {ready ? (
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
        ) : null}
      </div>
    </div>
  );
}

function SkyHero({ onCreateNote }: { onCreateNote: () => void }) {
  const { user } = useAuth();
  const { t, textDir, language } = useTranslation();
  const { st, locale, duration } = useStudyT();
  const { livePages, dueFlashcards } = useWorkspace();
  const study = useStudy();
  const metrics = usePlanMetrics();
  const now = useNow();
  const minute = now === null ? 540 : minuteOfDay(now, study.settings.timeZone);
  const phase = phaseOf(minute);
  const sky = SKY[phase];
  const serif = SERIF_LANGUAGES.has(language);

  const dayT = (minute - 360) / 720;
  const isDay = dayT >= 0 && dayT <= 1;
  const t01 = isDay ? dayT : ((minute >= 1080 ? minute - 1080 : minute + 360) / 720);
  const [bodyX, bodyY] = arcPoint(Math.min(1, Math.max(0, t01)));
  const glow = `radial-gradient(300px circle at right ${Math.round(32 + ARC.width - bodyX)}px top ${Math.round(30 + bodyY)}px, ${sky.glow}, transparent 70%)`;

  const plan = study.activePlan;
  const examDays = plan?.examDate ? diffDays(study.today, plan.examDate) : null;
  const weekStart = startOfWeek(study.today, study.settings.weekStartsOn);
  const notesThisWeek = useMemo(
    () => livePages.filter((page) => page.updatedAt && dayKeyOf(page.updatedAt, study.settings.timeZone) >= weekStart).length,
    [livePages, study.settings.timeZone, weekStart]
  );

  const chips: { key: string; href: string; icon: ReactNode; label: string }[] = [];
  if (plan && metrics.todaySeconds > 0) {
    chips.push({ key: "studied", href: "/home/study/log", icon: <Timer />, label: st("home_chip_studied", { time: duration(metrics.todaySeconds) }) });
  }
  if (plan && metrics.dueReviews.length) {
    chips.push({ key: "reviews", href: "/home/study/reviews", icon: <RotateCcw />, label: st("home_agenda_reviews", { count: metrics.dueReviews.length }) });
  }
  if (dueFlashcards.length) {
    chips.push({ key: "cards", href: "/home/flashcards", icon: <Layers />, label: st("home_agenda_cards", { count: dueFlashcards.length }) });
  }
  if (plan && examDays !== null && examDays > 0 && examDays <= 365) {
    chips.push({ key: "exam", href: `/home/study/goals/${plan.id}`, icon: <Flag />, label: st("sidebar_exam_in", { count: examDays }) });
  }
  if (notesThisWeek) {
    chips.push({ key: "notes", href: "/home/notes", icon: <PenLine />, label: st("home_chip_notes", { count: notesThisWeek }) });
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "";
  const greeting = greetingFor(minute, t);
  const ink = sky.bright ? "#ffffff" : "var(--sky-ink-soft)";
  const chipStyle: CSSProperties = sky.bright
    ? { background: "rgba(255,255,255,0.12)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)" }
    : { background: "var(--sky-chip-soft)", boxShadow: "inset 0 0 0 1px var(--sky-chip-soft-ring)" };
  const ctaStyle: CSSProperties = sky.bright
    ? { background: "#ffffff", color: "#10243d" }
    : { background: "var(--sky-cta-soft-bg)", color: "var(--sky-cta-soft-fg)" };

  return (
    <section
      className="@container relative isolate overflow-hidden rounded-[28px] px-6 pb-6 pt-7 transition-[background] duration-1000 sm:px-9 sm:pb-8 sm:pt-9 3xl:px-12 3xl:pb-10 3xl:pt-12"
      style={{ background: now === null ? "var(--surface-2)" : `${glow}, ${sky.base}`, color: ink }}
    >
      {sky.bright && now !== null ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {STARS.slice(0, phase === "night" ? STARS.length : 10).map((star, index) => (
            <span
              key={index}
              className="absolute rounded-full bg-white"
              style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, opacity: star.opacity * (phase === "night" ? 1 : 0.5) }}
            />
          ))}
        </div>
      ) : null}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#040a14]" style={{ opacity: "var(--sky-dim)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      {now !== null ? <SunArc t={t01} isDay={isDay} /> : null}

      <div className="relative @2xl:pr-[15.5rem]">
        <p className="text-[13px] font-medium opacity-80">
          {capitalizeFirst(formatDay(study.today, locale, { weekday: "long", day: "numeric", month: "long" }))}
        </p>
        <h1
          dir={textDir}
          className={cn(
            "mt-2 text-balance text-[2.125rem] leading-[1.04] @lg:text-[2.625rem] @3xl:text-[3.25rem] @6xl:text-[3.75rem]",
            serif ? "font-normal tracking-[-0.02em]" : "font-semibold tracking-[-0.035em]"
          )}
          style={serif ? { fontFamily: SERIF } : undefined}
        >
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
      </div>

      <div className="relative mt-6 flex flex-col gap-3 @lg:mt-9 @lg:flex-row @lg:items-end @lg:justify-between @lg:gap-4">
        {chips.length ? (
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] @lg:mx-0 @lg:flex-1 @lg:flex-wrap @lg:overflow-visible @lg:px-0 [&::-webkit-scrollbar]:hidden">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.href}
                prefetch
                style={chipStyle}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium backdrop-blur-md transition hover:brightness-110 [&_svg]:size-3.5 [&_svg]:opacity-80"
              >
                {chip.icon}
                {chip.label}
              </Link>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCreateNote}
          style={ctaStyle}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full px-4 text-[13px] font-semibold shadow-[0_6px_18px_-8px_rgba(4,10,20,0.45)] transition hover:-translate-y-px active:translate-y-0 @lg:ml-auto @lg:self-auto"
        >
          <Plus className="size-4" />
          {t("new_note")}
        </button>
      </div>
    </section>
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
  return (
    <section aria-label={st("nav_schedule")} className={cn(TILE, "@container flex min-w-0 flex-col p-5 sm:p-6")}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{st("nav_schedule")}</h2>
        <QuietLink href="/home/study/schedule">{st("open")}</QuietLink>
      </header>
      <WeekStrip />
      <Agenda />
    </section>
  );
}

function WeekStrip() {
  const { locale, duration } = useStudyT();
  const study = useStudy();
  const metrics = usePlanMetrics();
  const { tasks } = usePlanning();
  const { today, activePlan: plan, planReviews, reminders, settings } = study;
  const week = useMemo(() => weekDays(startOfWeek(today, settings.weekStartsOn)), [today, settings.weekStartsOn]);

  const marks = useMemo(() => {
    const first = week[0];
    const last = week[6];
    const map = new Map<string, Set<"task" | "review" | "event">>();
    const add = (day: string | null | undefined, kind: "task" | "review" | "event") => {
      if (!day || day < first || day > last) return;
      const set = map.get(day) ?? new Set();
      set.add(kind);
      map.set(day, set);
    };
    for (const task of tasks) add(task.day, "task");
    if (plan) {
      for (const review of planReviews) if (review.status === "pending") add(review.dueDay, "review");
      add(plan.examDate, "event");
    }
    for (const reminder of reminders) {
      if (!reminder.done && (!reminder.planId || reminder.planId === plan?.id)) add(reminder.day, "event");
    }
    return map;
  }, [plan, planReviews, reminders, tasks, week]);

  const color = { task: "var(--text-faint)", review: "var(--accent)", event: "var(--warning)" } as const;

  return (
    <div className="mb-5 grid grid-cols-7 gap-1 rounded-[16px] bg-[var(--surface-2)] p-1">
      {week.map((day) => {
        const isToday = day === today;
        const kinds = marks.get(day);
        const seconds = metrics.byDay.get(day) ?? 0;
        const label = [capitalizeFirst(formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })), seconds ? duration(seconds) : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <Link
            key={day}
            href="/home/study/schedule"
            prefetch
            title={label}
            aria-label={label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-[12px] pb-2 pt-1.5 transition",
              isToday ? "bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_4px_10px_-6px_rgba(15,44,76,0.3)]" : "hover:bg-[var(--surface-hover)]"
            )}
          >
            <span className={cn("text-[10.5px] font-medium", isToday ? "text-[var(--accent)]" : "text-faint")}>
              {weekdayLabel(weekdayOf(day), locale, "short").replace(".", "")}
            </span>
            <span className={cn("text-[16px] font-semibold tabular-nums leading-none tracking-[-0.02em]", isToday ? "text-ink" : day < today ? "text-faint" : "text-muted")}>
              {Number(day.slice(8, 10))}
            </span>
            <span className="flex h-1.5 items-center gap-[3px]">
              {(["review", "task", "event"] as const)
                .filter((kind) => kinds?.has(kind))
                .map((kind) => (
                  <span key={kind} className="size-[5px] rounded-full" style={{ background: color[kind] }} />
                ))}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function StudyOverview() {
  const router = useRouter();
  const { st, locale } = useStudyT();
  const study = useStudy();
  const plan = study.activePlan;
  const suggestion = useMemo(
    () => (plan ? nextUp(study.planSubjects, study.planSessions, study.planCycle, study.today, study.settings) : null),
    [plan, study.planCycle, study.planSessions, study.planSubjects, study.settings, study.today]
  );

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
          <Button variant="ghost" size="sm" onClick={() => useStudyUi.getState().setTimerOpen(true)}>
            <Timer />
            {st("home_quick_focus")}
          </Button>
        </div>
      </div>
    );
  }

  const examDays = plan.examDate ? diffDays(study.today, plan.examDate) : null;
  const examDate = plan.examDate ? formatDay(plan.examDate, locale, { day: "numeric", month: "short", year: "numeric" }) : "";
  const examLine = !plan.examDate
    ? st("goal_no_exam")
    : examDays !== null && examDays > 0
      ? st("sidebar_exam_in", { count: examDays })
      : examDays === 0
        ? st("countdown_today")
        : st("countdown_past", { date: examDate });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <GoalSwitcher detail={<span title={examDate || undefined}>{examLine}</span>} />
        <div className="flex flex-wrap items-center gap-1.5">
          <FocusButton
            variant="primary"
            subjectId={suggestion?.subject.id ?? null}
            topicId={suggestion?.topic?.id ?? null}
            label={st("next_up_start")}
          />
          <Button variant="ghost" size="sm" onClick={() => useStudyUi.getState().openLog()}>
            <Plus />
            {st("logform_title_new")}
          </Button>
        </div>
      </div>
      <KpiBand />
    </div>
  );
}

type AgendaItem =
  | { kind: "exam"; key: string }
  | { kind: "reviews"; key: string; count: number; subjects: string[] }
  | { kind: "cards"; key: string; count: number }
  | { kind: "reminder"; key: string; reminder: StudyReminder }
  | { kind: "task"; key: string; task: PlanningTask; overdue: boolean };

const AGENDA_ORDER: Record<AgendaItem["kind"], number> = { exam: 0, reviews: 1, cards: 2, reminder: 3, task: 4 };
const TODAY_LIMIT = 7;
const LATER_LIMIT = 4;
const LATER_DAYS = 2;

function Agenda() {
  const { st, locale } = useStudyT();
  const study = useStudy();
  const { dueFlashcards } = useWorkspace();
  const { tasks } = usePlanning();
  const [dialog, setDialog] = useState<TaskDialogState>({ open: false, task: null, day: null });
  const { today, activePlan: plan, planReviews, planSubjects, reminders } = study;
  const cardsDue = dueFlashcards.length;

  const groups = useMemo(() => {
    const horizon = addDays(today, 6);
    const byDay = new Map<string, AgendaItem[]>();
    const push = (day: string, item: AgendaItem) => {
      const list = byDay.get(day);
      if (list) list.push(item);
      else byDay.set(day, [item]);
    };
    for (const task of tasks) {
      if (!task.day) continue;
      if (task.day < today) {
        if (!task.done) push(today, { kind: "task", key: task.id, task, overdue: true });
      } else if (task.day <= horizon) {
        push(task.day, { kind: "task", key: task.id, task, overdue: false });
      }
    }
    if (plan) {
      const counts = new Map<string, number>();
      const names = new Map<string, Set<string>>();
      const subjectName = new Map(planSubjects.map((subject) => [subject.id, subject.name]));
      for (const review of planReviews) {
        if (review.status !== "pending") continue;
        const day = review.dueDay < today ? today : review.dueDay;
        if (day > horizon) continue;
        counts.set(day, (counts.get(day) ?? 0) + 1);
        const set = names.get(day) ?? new Set<string>();
        const name = subjectName.get(review.subjectId);
        if (name) set.add(name);
        names.set(day, set);
      }
      for (const [day, count] of counts) push(day, { kind: "reviews", key: `reviews-${day}`, count, subjects: [...(names.get(day) ?? [])] });
      if (plan.examDate && plan.examDate >= today && plan.examDate <= horizon) push(plan.examDate, { kind: "exam", key: "exam" });
    }
    for (const reminder of reminders) {
      if (reminder.done || reminder.day < today || reminder.day > horizon) continue;
      if (reminder.planId && reminder.planId !== plan?.id) continue;
      push(reminder.day, { kind: "reminder", key: reminder.id, reminder });
    }
    if (cardsDue) push(today, { kind: "cards", key: "cards", count: cardsDue });

    const rank = (item: AgendaItem) => AGENDA_ORDER[item.kind] * 10 + (item.kind === "task" && item.task.done ? 5 : 0);
    const later = [...byDay.keys()].filter((day) => day > today).sort().slice(0, LATER_DAYS);
    return [today, ...later].map((day) => ({ day, items: (byDay.get(day) ?? []).sort((a, b) => rank(a) - rank(b)) }));
  }, [cardsDue, plan, planReviews, planSubjects, reminders, tasks, today]);

  const dayTitle = (day: string) => {
    if (day === today) return st("today");
    if (day === addDays(today, 1)) return st("tomorrow");
    return capitalizeFirst(formatDay(day, locale, { weekday: "long" }));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="grid gap-x-8 gap-y-5 @xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @5xl:grid-cols-3">
        {groups.map(({ day, items }, index) => {
          const visible = items.slice(0, day === today ? TODAY_LIMIT : LATER_LIMIT);
          const hidden = items.length - visible.length;
          return (
            <div key={day} className={cn("min-w-0", index === 0 && "@xl:row-span-2 @5xl:row-span-1")}>
              <p className="mb-1.5 flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-ink">{dayTitle(day)}</span>
                <span className="text-[12px] text-faint">{formatDay(day, locale, { day: "numeric", month: "short" })}</span>
              </p>
              {visible.length ? (
                <ul>
                  {visible.map((item) => (
                    <AgendaRow key={item.key} item={item} onOpenTask={(task) => setDialog({ open: true, task, day: task.day })} />
                  ))}
                </ul>
              ) : (
                <p className="py-1.5 text-[13px] text-faint">{st("home_today_clear")}</p>
              )}
              {hidden > 0 ? (
                <Link href="/home/study/schedule" prefetch className="mt-0.5 inline-block pl-7 text-[12px] text-muted transition hover:text-ink">
                  {st("more_items", { count: hidden })}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setDialog({ open: true, task: null, day: today })}
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

function AgendaRow({ item, onOpenTask }: { item: AgendaItem; onOpenTask: (task: PlanningTask) => void }) {
  const { st, locale } = useStudyT();
  const study = useStudy();
  const row = "-mx-2 flex min-w-0 gap-3 rounded-[10px] px-2 py-1.5 transition hover:bg-[var(--surface-hover)]";
  const rail = (color: string) => (
    <span className="flex w-4 shrink-0 justify-center self-stretch py-[3px]">
      <span className="w-[3px] rounded-full" style={{ background: color }} />
    </span>
  );
  const text = (title: string, meta?: string | null) => (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13.5px] leading-5 text-ink">{title}</span>
      {meta ? <span className="block truncate text-[12px] leading-4 text-faint">{meta}</span> : null}
    </span>
  );

  if (item.kind === "task") {
    const { task } = item;
    return (
      <li className={cn(row, "items-center")}>
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
      </li>
    );
  }

  if (item.kind === "reviews") {
    const shown = item.subjects.slice(0, 2).join(", ");
    const extra = item.subjects.length - 2;
    return (
      <li>
        <Link href="/home/study/reviews" prefetch className={row}>
          {rail("var(--accent)")}
          {text(st("home_agenda_reviews", { count: item.count }), extra > 0 ? `${shown} ${st("more_items", { count: extra })}` : shown)}
        </Link>
      </li>
    );
  }

  if (item.kind === "cards") {
    return (
      <li>
        <Link href="/home/flashcards" prefetch className={cn(row, "items-center")}>
          {rail("var(--rating-good)")}
          {text(st("home_agenda_cards", { count: item.count }))}
        </Link>
      </li>
    );
  }

  if (item.kind === "exam") {
    const plan = study.activePlan;
    return (
      <li>
        <Link href={plan ? `/home/study/goals/${plan.id}` : "/home/study"} prefetch className={row}>
          <span className="flex w-4 shrink-0 justify-center pt-[3px] text-[var(--danger)]">
            <Flag className="size-3.5" />
          </span>
          {text(st("reminder_kind_exam"), plan?.name ?? null)}
        </Link>
      </li>
    );
  }

  const { reminder } = item;
  return (
    <li>
      <Link href="/home/study/schedule" prefetch className={row}>
        {rail(reminder.kind === "exam" ? "var(--danger)" : "var(--warning)")}
        {text(reminder.title, st(`reminder_kind_${reminder.kind}`))}
      </Link>
    </li>
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
  const { dueFlashcards } = useWorkspace();
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
                    style={{ backgroundColor: subject?.color || "var(--accent)" }}
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

            {dueFlashcards.length > 0 ? (
              <Link
                href="/home/flashcards"
                prefetch
                className="mt-1 flex items-center justify-between gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                <span className="flex items-center gap-2 truncate">
                  <Layers className="size-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{st("flashcards_due_callout", { count: dueFlashcards.length })}</span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-faint" />
              </Link>
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
          {dueFlashcards.length > 0 ? (
            <Link
              href="/home/flashcards"
              prefetch
              className="mt-4 flex w-full items-center justify-between gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="size-3.5 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{st("flashcards_due_callout", { count: dueFlashcards.length })}</span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-faint" />
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-7 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
            <RotateCcw className="size-5" />
          </div>
          <p className="mt-3 text-[14px] font-semibold text-ink">{st("reviews_empty_due")}</p>
          <p className="mt-1 max-w-xs text-[12px] text-muted">{st("home_today_reviews_empty_hint")}</p>
          <Link
            href="/home/study/reviews"
            prefetch
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
          >
            {st("tab_upcoming")}
            <ChevronRight className="size-3.5" />
          </Link>
          {dueFlashcards.length > 0 ? (
            <Link
              href="/home/flashcards"
              prefetch
              className="mt-4 flex w-full items-center justify-between gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="size-3.5 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{st("flashcards_due_callout", { count: dueFlashcards.length })}</span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-faint" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
