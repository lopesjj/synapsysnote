"use client";

import { useCallback, type ReactNode } from "react";
import {
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Flag,
  NotebookPen,
  Plus,
  RotateCcw,
  Settings2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { WorkspaceIcon, isIconUrl } from "@/lib/icons/workspace-icon";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { useLiveNote, useMaterialNote } from "@/lib/study/hooks";
import { splitDuration } from "@/lib/study/format";
import { BUILT_IN_CATEGORIES, SUBJECT_COLORS } from "@/lib/study/defaults";
import type { PerformanceBand, StudyCategory } from "@/types/study";

const MONOGRAM_SKIP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "the", "of", "and", "la", "le", "el", "di", "del", "der", "die", "und"]);

function monogram(name: string): string {
  const words = name
    .split(/[\s\-–—_/]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const letters = words.filter((word) => /\p{L}/u.test(word[0]) && !MONOGRAM_SKIP.has(word.toLowerCase()));
  const source = letters.length ? letters : words;
  if (!source.length) return "·";
  const first = source[0];
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}]/u.test(first)) return Array.from(first)[0];
  if (source.length === 1 || (first.length <= 4 && first === first.toUpperCase() && /\p{Lu}/u.test(first))) {
    return Array.from(first).slice(0, first === first.toUpperCase() ? 3 : 2).join("").toUpperCase();
  }
  return `${Array.from(first)[0]}${Array.from(source[1])[0]}`.toUpperCase();
}

function markColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

/** Sombra de ícone de app: a marca do objetivo sobe do fundo quando aparece grande. */
const MARK_LIFT = "0 1px 2px rgba(15, 44, 76, 0.1), 0 10px 20px -12px rgba(15, 44, 76, 0.5)";

/**
 * Marca do objetivo: logo enviado, ícone escolhido ou monograma. A partir de
 * 40px ela ganha relevo (`raised`), como um ícone de app, para se destacar.
 */
export function GoalMark({
  icon,
  name,
  seed,
  size,
  className,
  raised = size >= 40,
}: {
  icon: string | null | undefined;
  name: string;
  seed: string;
  size: number;
  className?: string;
  raised?: boolean;
}) {
  const borderRadius = Math.max(4, Math.round(size * (raised ? 0.27 : 0.24)));
  if (icon && isIconUrl(icon)) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-white", className)}
        style={{
          width: size,
          height: size,
          borderRadius,
          padding: size >= 28 ? Math.round(size * 0.12) : 1,
          boxShadow: raised ? `inset 0 0 0 1px rgba(15, 44, 76, 0.12), ${MARK_LIFT}` : "inset 0 0 0 1px var(--border)",
        }}
        aria-hidden
      >
        <img src={icon} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
      </span>
    );
  }
  if (icon) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
        style={{
          width: size,
          height: size,
          borderRadius,
          ...(raised ? { backgroundColor: "var(--surface-2)", boxShadow: `inset 0 0 0 1px var(--border), ${MARK_LIFT}` } : null),
        }}
        aria-hidden
      >
        <WorkspaceIcon icon={icon} size={Math.round(size * (raised ? 0.6 : 0.72))} />
      </span>
    );
  }
  const color = markColor(seed || name);
  const text = monogram(name);
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none tracking-[-0.02em]", className)}
      style={{
        width: size,
        height: size,
        borderRadius,
        fontSize: Math.max(8, Math.round(size * (text.length > 2 ? 0.34 : 0.42))),
        color,
        background: raised
          ? `linear-gradient(160deg, color-mix(in oklab, ${color} 26%, var(--surface)), color-mix(in oklab, ${color} 11%, var(--surface)))`
          : `color-mix(in oklab, ${color} 13%, var(--surface))`,
        boxShadow: raised
          ? `inset 0 0 0 1px color-mix(in oklab, ${color} 34%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 10px 22px -12px color-mix(in oklab, ${color} 80%, transparent)`
          : `inset 0 0 0 1px color-mix(in oklab, ${color} 26%, transparent)`,
      }}
      aria-hidden
    >
      {text}
    </span>
  );
}

export function StudyPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 pb-16 pt-7 md:px-8 md:pt-9 xl:max-w-7xl 2xl:max-w-[94rem]", className)}>
      {children}
    </div>
  );
}

export function StudyHeader({
  title,
  subtitle,
  actions,
  showGoal = true,
  showLog = true,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  showGoal?: boolean;
  showLog?: boolean;
}) {
  const { st, textDir } = useStudyT();
  const { activePlan } = useStudy();
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border)] pb-5">
      <div className="min-w-0 flex-[1_1_22rem]">
        <h1 dir={textDir} className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
          {title}
        </h1>
        {subtitle ? (
          <p dir={textDir} className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-sm:ml-0 max-sm:w-full max-sm:justify-start">
        {actions}
        {showGoal ? (
          <div className="max-sm:hidden">
            <GoalSwitcher />
          </div>
        ) : null}
        {showLog && activePlan ? (
          <Button variant="primary" size="md" onClick={() => useStudyUi.getState().openLog()}>
            <Plus />
            {st("logform_title_new")}
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export function GoalSwitcher({ compact = false, detail }: { compact?: boolean; detail?: ReactNode }) {
  const { st } = useStudyT();
  const router = useRouter();
  const { plans, activePlan, actions } = useStudy();
  const live = plans.filter((plan) => !plan.archived);
  const name = activePlan ? activePlan.name || st("untitled_goal") : st("sidebar_no_goal");
  return (
    <Menu>
      <MenuTrigger asChild>
        {detail !== undefined ? (
          <button
            type="button"
            className="group -m-2 flex min-w-0 items-center gap-4 rounded-[18px] p-2 text-left transition hover:bg-[var(--surface-hover)]"
            aria-label={st("goal_switch_label")}
          >
            {activePlan ? (
              <GoalMark icon={activePlan.icon} name={name} seed={activePlan.id} size={52} />
            ) : (
              <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-[var(--surface-2)] text-muted">
                <Flag className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="line-clamp-2 text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{name}</span>
                <ChevronDown className="size-4 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
              </span>
              {detail ? <span className="mt-0.5 block truncate text-[13px] text-muted">{detail}</span> : null}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "group inline-flex h-9 max-w-[18rem] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pe-2.5 ps-1.5 text-[13px] text-ink transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
              compact && "h-8 w-full max-w-none"
            )}
            aria-label={st("goal_switch_label")}
          >
            {activePlan ? (
              <GoalMark icon={activePlan.icon} name={activePlan.name} seed={activePlan.id} size={compact ? 20 : 24} />
            ) : (
              <Flag className="size-3.5 text-muted" />
            )}
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {activePlan ? activePlan.name || st("untitled_goal") : st("sidebar_no_goal")}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
          </button>
        )}
      </MenuTrigger>
      <MenuContent align={detail !== undefined ? "start" : "end"} className="w-64">
        <MenuLabel>{st("goal_switch_label")}</MenuLabel>
        {live.map((plan) => (
          <MenuItem key={plan.id} onSelect={() => void actions.setActivePlan(plan.id)}>
            <GoalMark icon={plan.icon} name={plan.name} seed={plan.id} size={20} />
            <span className="min-w-0 flex-1 truncate">{plan.name || st("untitled_goal")}</span>
            {plan.id === activePlan?.id ? <Check className="!text-[var(--accent)]" /> : null}
          </MenuItem>
        ))}
        {live.length ? <MenuSeparator /> : null}
        <MenuItem onSelect={() => router.push("/home/study/goals/new")}>
          <Plus /> {st("goal_switch_new")}
        </MenuItem>
        <MenuItem onSelect={() => router.push("/home/study/goals")}>
          <Settings2 /> {st("goal_switch_manage")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]", className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-3 px-5 pb-3.5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", !title && !action && "pt-5 sm:pt-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12px] font-medium text-[var(--accent)] hover:underline">
      {children}
    </Link>
  );
}

export function SubjectDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? "var(--text-faint)" }}
    />
  );
}

export function SubjectBar({ color }: { color?: string | null }) {
  return <span aria-hidden className="block w-[3px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: color ?? "var(--border-strong)" }} />;
}

export function DurationFigure({ seconds, className, size = "lg" }: { seconds: number; className?: string; size?: "lg" | "md" | "sm" }) {
  const { st } = useStudyT();
  const { h, m } = splitDuration(seconds);
  const valueClass = size === "lg" ? "text-[30px]" : size === "md" ? "text-[22px]" : "text-[16px]";
  const unitClass = size === "lg" ? "text-[13px]" : "text-[11.5px]";
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 font-semibold tracking-[-0.03em] text-ink", className)}>
      {h > 0 ? (
        <>
          <span className={valueClass}>{h}</span>
          <span className={cn(unitClass, "mr-1 font-medium tracking-normal text-muted")}>{st("unit_h")}</span>
        </>
      ) : null}
      <span className={valueClass}>{h > 0 ? String(m).padStart(2, "0") : m}</span>
      <span className={cn(unitClass, "font-medium tracking-normal text-muted")}>{st("unit_min")}</span>
    </span>
  );
}

export function Figure({
  value,
  unit,
  className,
  size = "lg",
}: {
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
  size?: "lg" | "md";
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 font-semibold tracking-[-0.03em] text-ink", className)}>
      <span className={cn("leading-none", size === "lg" ? "text-[30px]" : "text-[22px]")}>{value}</span>
      {unit ? <span className="text-[13px] font-medium tracking-normal text-muted">{unit}</span> : null}
    </span>
  );
}

const BAND_KEY: Record<PerformanceBand, StudyKey> = {
  low: "band_low",
  mid: "band_mid",
  high: "band_high",
};

export function bandColor(band: PerformanceBand | null): string {
  if (band === "low") return "var(--band-low)";
  if (band === "mid") return "var(--band-mid)";
  if (band === "high") return "var(--band-high)";
  return "var(--text-faint)";
}

export function AccuracyTag({
  accuracy,
  band,
  showLabel = false,
  className,
}: {
  accuracy: number | null;
  band: PerformanceBand | null;
  showLabel?: boolean;
  className?: string;
}) {
  const { st } = useStudyT();
  if (accuracy === null || !band) return <span className={cn("text-[12px] text-faint", className)}>–</span>;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] tabular-nums text-ink", className)}
      title={st(BAND_KEY[band])}
    >
      <BandGlyph band={band} />
      {Math.round(accuracy * 100)}%
      {showLabel ? <span className="text-muted">{st(BAND_KEY[band])}</span> : null}
    </span>
  );
}

export function BandGlyph({ band }: { band: PerformanceBand }) {
  const color = bandColor(band);
  if (band === "high") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 1.2 L8.8 8.4 H1.2 Z" fill={color} />
      </svg>
    );
  }
  if (band === "low") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 8.8 L1.2 1.6 H8.8 Z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="1.5" y="3.5" width="7" height="3" rx="1.5" fill={color} />
    </svg>
  );
}

export function useCategoryLabel() {
  const { st } = useStudyT();
  const { settings } = useStudy();
  return useCallback(
    (id: string) => {
      const category = settings.categories.find((entry) => entry.id === id);
      if (category?.name) return category.name;
      if (id === "exam") return st("cat_exam");
      if ((BUILT_IN_CATEGORIES as readonly string[]).includes(id)) return st(`cat_${id}` as StudyKey);
      return category?.name || id;
    },
    [settings.categories, st]
  );
}

export function categoryColor(categories: StudyCategory[], id: string): string {
  return categories.find((entry) => entry.id === id)?.color ?? "#607489";
}

export function CategoryChip({ id, className }: { id: string; className?: string }) {
  const label = useCategoryLabel();
  const { settings } = useStudy();
  const color = categoryColor(settings.categories, id);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted",
        className
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label(id)}</span>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[6px] font-medium transition-all",
            size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12px]",
            option.value === value ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StudyEmpty({
  title,
  description,
  action,
  art,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  art?: StudyEmptyIcon;
  className?: string;
}) {
  const Icon = art ? EMPTY_ICONS[art] : null;
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-5 rounded-[20px] bg-[var(--surface)] px-6 py-8 shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] sm:flex-row sm:items-center sm:gap-7 sm:px-10 sm:py-10",
        className
      )}
    >
      {Icon ? (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-[var(--surface-2)] text-muted shadow-[inset_0_0_0_1px_var(--border)]">
          <Icon className="size-6" strokeWidth={1.5} />
        </span>
      ) : null}
      <div className="max-w-lg space-y-3">
        <div className="space-y-1.5">
          <p className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</p>
          {description ? <p className="text-[13px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export type StudyEmptyIcon = "goal" | "subjects" | "schedule" | "reviews" | "exams" | "log";

const EMPTY_ICONS: Record<StudyEmptyIcon, LucideIcon> = {
  goal: Flag,
  subjects: BookOpenText,
  schedule: CalendarDays,
  reviews: RotateCcw,
  exams: ClipboardCheck,
  log: NotebookPen,
};

export function StudyLoading() {
  return (
    <StudyPage>
      <div className="mb-7 space-y-2 border-b border-[var(--border)] pb-5">
        <div className="h-7 w-48 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-4 w-80 animate-pulse rounded bg-[var(--surface-2)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-36 animate-pulse rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] lg:col-span-2" />
        <div className="h-36 animate-pulse rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]" />
        <div className="h-56 animate-pulse rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)] lg:col-span-3" />
      </div>
    </StudyPage>
  );
}

export function NoGoalState({ title }: { title: string }) {
  const { st } = useStudyT();
  const router = useRouter();
  return (
    <StudyPage>
      <StudyHeader title={title} showGoal={false} showLog={false} />
      <StudyEmpty
        art="goal"
        title={st("empty_goal_title")}
        description={st("empty_goal_desc")}
        action={
          <Button variant="primary" onClick={() => router.push("/home/study/goals/new")}>
            <Plus />
            {st("empty_goal_cta")}
          </Button>
        }
      />
    </StudyPage>
  );
}

export function StudyGate({ title, children }: { title: string; children: ReactNode }) {
  const { ready, activePlan } = useStudy();
  if (!ready) return <StudyLoading />;
  if (!activePlan) return <NoGoalState title={title} />;
  return <>{children}</>;
}

export function useStartFocus() {
  const router = useRouter();
  const materialNote = useMaterialNote();
  return useCallback(
    ({ subjectId, topicId, reviewId }: { subjectId?: string | null; topicId?: string | null; reviewId?: string | null }) => {
      const store = useStudyUi.getState();
      const idle = store.timer.status === "idle";
      const pageId = reviewId ? materialNote({ reviewId, subjectId, topicId }) : null;
      if (idle) {
        // Revisão abre sempre no cronômetro e parada: quem dá o play é a pessoa.
        store.resetTimer({
          ...(reviewId ? { mode: "stopwatch" as const } : null),
          subjectId: subjectId ?? null,
          topicId: topicId ?? null,
          reviewId: reviewId ?? null,
          pageId,
        });
      }
      if (pageId) {
        store.setTimerOpen(false);
        router.push(`/home/p/${pageId}`);
        return;
      }
      store.setTimerOpen(true);
    },
    [materialNote, router]
  );
}

export function FocusButton({
  subjectId,
  topicId,
  reviewId,
  label,
  variant = "secondary",
  size = "sm",
  className,
}: {
  subjectId?: string | null;
  topicId?: string | null;
  reviewId?: string | null;
  label?: string;
  variant?: "secondary" | "ghost" | "primary" | "subtle";
  size?: "sm" | "md" | "icon-sm";
  className?: string;
}) {
  const { st } = useStudyT();
  const startFocus = useStartFocus();
  const start = () => startFocus({ subjectId, topicId, reviewId });
  return (
    <Button variant={variant} size={size} onClick={start} className={className} aria-label={label ?? st("sidebar_focus_idle")}>
      <Timer />
      {size === "icon-sm" ? null : (label ?? st("sidebar_focus_idle"))}
    </Button>
  );
}

export function MaterialLink({
  material,
  pageId,
  className,
}: {
  material: string;
  pageId: string | null;
  className?: string;
}) {
  const { st } = useStudyT();
  const liveNote = useLiveNote();
  const note = liveNote(pageId);
  if (note) {
    const title = note.title || st("material_note_badge");
    const extra = material && material !== note.title ? material : "";
    return (
      <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}>
        <Link
          href={`/home/p/${note.id}`}
          title={st("material_open")}
          className="inline-flex min-w-0 shrink items-center gap-1 text-[var(--accent)] underline-offset-2 hover:underline"
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </Link>
        {extra ? (
          <span className="min-w-0 truncate" title={extra}>
            {extra}
          </span>
        ) : null}
      </span>
    );
  }
  if (!material) return <span className={className}>–</span>;
  return (
    <span className={cn("block truncate", className)} title={material}>
      {material}
    </span>
  );
}

export function SelectFilter({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "group inline-flex h-8 max-w-[15rem] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12.5px] font-normal text-ink shadow-sm outline-none transition",
            "hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] data-[state=open]:border-[var(--accent)] data-[state=open]:bg-[var(--surface-hover)]",
            className
          )}
        >
          <span className="truncate">{current?.label ?? label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="min-w-[12rem] max-h-72 overflow-y-auto p-1 shadow-[var(--shadow-float)]">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <MenuItem
              key={option.value || "__all__"}
              onSelect={() => onChange(option.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-[12.5px] transition-colors cursor-pointer",
                isSelected ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-ink hover:bg-[var(--surface-hover)]"
              )}
            >
              <span className="truncate">{option.label}</span>
              {isSelected ? <Check className="size-3.5 shrink-0 text-[var(--accent)]" /> : null}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

export function StudySelect<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "group inline-flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-ink outline-none transition",
            "hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] data-[state=open]:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className="truncate">{current?.label ?? placeholder ?? "—"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto p-1 shadow-[var(--shadow-float)]">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <MenuItem
              key={String(option.value)}
              onSelect={() => onChange(option.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-[12.5px] transition-colors cursor-pointer",
                isSelected ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-ink hover:bg-[var(--surface-hover)]"
              )}
            >
              <span className="truncate">{option.label}</span>
              {isSelected ? <Check className="size-3.5 shrink-0 text-[var(--accent)]" /> : null}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
