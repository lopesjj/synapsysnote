"use client";

import { useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Flag,
  LayoutDashboard,
  NotebookPen,
  NotebookText,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Timer,
} from "lucide-react";
import { StudyIcon, DisciplinesIcon } from "@/lib/icons/study-icons";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Kbd, Tooltip } from "@/components/ui/primitives";
import { cn, isMac } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { useTranslation } from "@/lib/i18n/translations";
import { isTimerArmed, openBlankTimer, pauseTimer, startTimer, useStudyUi, type StudyModule } from "@/lib/study/ui-store";
import { clockLabel } from "@/lib/study/format";
import { displaySeconds, useNow } from "./focus-timer";
import { SubjectDot } from "./ui";

export function useActiveModule(): StudyModule {
  return useStudyUi((state) => state.module);
}

export function useSwitchModule() {
  return useCallback((next: StudyModule) => {
    useStudyUi.getState().setModule(next);
  }, []);
}

export function ModuleSwitch({
  className,
  layoutId = "synapsys-module-thumb",
}: {
  className?: string;
  layoutId?: string;
}) {
  const { st } = useStudyT();
  const active = useActiveModule();
  const switchModule = useSwitchModule();
  const options: { id: StudyModule; label: string; icon: ReactNode }[] = [
    { id: "notes", label: st("module_notes"), icon: <NotebookText className="size-3.5 shrink-0" /> },
    { id: "study", label: st("module_study"), icon: <StudyIcon className="size-3.5 shrink-0" /> },
  ];
  return (
    <div
      role="tablist"
      aria-label={st("module_switch_label")}
      className={cn("relative grid grid-cols-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-[3px]", className)}
    >
      {options.map((option) => {
        const selected = active === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) switchModule(option.id);
            }}
            className={cn(
              "relative z-0 flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-[12.5px] font-medium transition-colors [@media(pointer:fine)]:h-7",
              selected ? "text-ink" : "text-muted hover:text-ink"
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                className="pointer-events-none absolute inset-0 -z-10 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,44,76,0.08)]"
              />
            ) : null}
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const STUDY_NAV: { href: string; key: StudyKey; icon: ReactNode; exact?: boolean }[] = [
  { href: "/home/study", key: "nav_overview", icon: <LayoutDashboard className="size-3.5" />, exact: true },
  { href: "/home/study/goals", key: "nav_goals", icon: <Flag className="size-3.5" /> },
  { href: "/home/study/subjects", key: "nav_subjects", icon: <DisciplinesIcon className="size-3.5" /> },
  { href: "/home/study/schedule", key: "nav_schedule", icon: <CalendarDays className="size-3.5" /> },
  { href: "/home/study/reviews", key: "nav_reviews", icon: <RotateCcw className="size-3.5" /> },
  { href: "/home/study/log", key: "nav_log", icon: <NotebookPen className="size-3.5" /> },
  { href: "/home/study/insights", key: "nav_insights", icon: <BarChart3 className="size-3.5" /> },
  { href: "/home/study/exams", key: "nav_exams", icon: <ClipboardCheck className="size-3.5" /> },
];

function isActiveRoute(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function useDueReviews() {
  const { planReviews, today } = useStudy();
  return planReviews.filter((review) => review.status === "pending" && review.dueDay <= today).length;
}

function FocusDock() {
  const { st } = useStudyT();
  const timer = useStudyUi((state) => state.timer);
  const { subjectById, focusPlan, planReadOnly, settings } = useStudy();
  const active = timer.status !== "idle";
  const armed = isTimerArmed(timer);
  const now = useNow(timer.status === "running", 1000);
  const subject = subjectById(timer.subjectId);
  if (active || armed) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--accent)]/35 bg-[var(--accent-soft)]/60 px-2 py-1.5">
        <button
          type="button"
          onClick={() => (timer.status === "running" ? pauseTimer() : startTimer())}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition hover:brightness-110"
          aria-label={timer.status === "running" ? st("timer_pause") : armed ? st("timer_start") : st("timer_resume")}
        >
          {timer.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-[1px]" />}
        </button>
        <button type="button" onClick={() => useStudyUi.getState().setTimerOpen(true)} className="min-w-0 flex-1 text-left">
          <span className="block font-mono text-[13px] font-semibold tabular-nums text-ink">{clockLabel(displaySeconds(timer, settings, now), true)}</span>
          <span className={cn("flex items-center gap-1.5 truncate text-[11px]", armed ? "font-medium text-[var(--accent)]" : "text-muted")}>
            {subject && !armed ? <SubjectDot color={subject.color} /> : null}
            <span className="truncate">
              {armed
                ? st("timer_armed_hint")
                : (subject?.name ?? (timer.status === "paused" ? st("sidebar_focus_paused") : st("timer_no_subject")))}
            </span>
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
      <Button variant="primary" size="sm" className="h-10 justify-center gap-2 leading-none [@media(pointer:fine)]:h-8" disabled={planReadOnly} onClick={openBlankTimer}>
        <Timer className="size-4 shrink-0" />
        <span className="truncate leading-none">{st("sidebar_focus_idle")}</span>
      </Button>
      <Tooltip label={st("logform_title_new")}>
        <Button variant="secondary" size="icon" className="size-10 [@media(pointer:fine)]:size-8" disabled={!focusPlan || planReadOnly} onClick={() => useStudyUi.getState().openLog()} aria-label={st("logform_title_new")}>
          <Plus />
        </Button>
      </Tooltip>
      <Tooltip label={st("nav_scratchpad")}>
        <Button
          variant="secondary"
          size="icon"
          className="size-10 [@media(pointer:fine)]:size-8"
          onClick={() => useStudyUi.getState().setPadOpen(!useStudyUi.getState().padOpen)}
          aria-label={st("nav_scratchpad")}
        >
          <StickyNote />
        </Button>
      </Tooltip>
    </div>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => router.prefetch(href)}
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] transition hover:bg-[var(--surface-hover)] [&_svg]:shrink-0",
        active ? "bg-[var(--surface-hover)] font-medium text-ink" : "text-muted hover:text-ink"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function StudySidebarBody({ homeLink }: { homeLink: ReactNode }) {
  const { st } = useStudyT();
  const { t } = useTranslation();
  const pathname = usePathname();
  const due = useDueReviews();
  const closeMobile = () => useUiStore.getState().setMobileSidebarOpen(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-0.5 px-3">
        <button
          type="button"
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate">{t("search")}</span>
          <Kbd className="ml-auto">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        {homeLink}
        {STUDY_NAV.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            active={isActiveRoute(pathname, item.href, item.exact)}
            icon={item.icon}
            onClick={closeMobile}
          >
            <span className="min-w-0 flex-1 truncate">{st(item.key)}</span>
            {item.key === "nav_reviews" && due ? (
              <span className="ml-auto rounded-full bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--accent)]">
                {due}
              </span>
            ) : null}
          </SidebarLink>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-y-contain px-3 pb-4">
        <div>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">{st("sidebar_tools")}</p>
          <FocusDock />
        </div>
      </div>
    </div>
  );
}

export function StudyRailItems() {
  const { st } = useStudyT();
  const pathname = usePathname();
  const due = useDueReviews();
  const timer = useStudyUi((state) => state.timer);
  return (
    <>
      {STUDY_NAV.map((item) => (
        <Tooltip key={item.href} label={st(item.key)} side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn("relative", isActiveRoute(pathname, item.href, item.exact) && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href={item.href} aria-label={st(item.key)}>
              {item.icon}
              {item.key === "nav_reviews" && due ? (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--accent)]" />
              ) : null}
            </Link>
          </Button>
        </Tooltip>
      ))}
      <Tooltip label={st("nav_focus")} side="right">
        <Button
          variant="ghost"
          size="icon"
          onClick={openBlankTimer}
          aria-label={st("nav_focus")}
          className={cn((timer.status !== "idle" || isTimerArmed(timer)) && "text-[var(--accent)]")}
        >
          <Timer />
        </Button>
      </Tooltip>
    </>
  );
}

export function RailModuleToggle() {
  const { st } = useStudyT();
  const active = useActiveModule();
  const switchModule = useSwitchModule();
  const next: StudyModule = active === "study" ? "notes" : "study";
  const label = `${st("module_switch_label")}: ${next === "study" ? st("module_study") : st("module_notes")}`;
  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        onClick={() => switchModule(next)}
        aria-label={label}
        className="relative flex h-9 w-11 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-ink transition hover:border-[var(--border-strong)]"
      >
        {active === "study" ? <StudyIcon className="size-4" /> : <NotebookText className="size-4" />}
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted">
          {next === "study" ? <StudyIcon className="size-2.5" /> : <NotebookText className="size-2.5" />}
        </span>
      </button>
    </Tooltip>
  );
}
