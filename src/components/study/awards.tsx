"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Clock, X } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyT } from "@/lib/study/i18n";
import { useAwardBook } from "@/lib/study/hooks";
import { useStudyUi } from "@/lib/study/ui-store";
import { formatDay } from "@/lib/study/dates";
import { CLAIM_WINDOW_DAYS, sortAwards, type Award, type StreakAward } from "@/lib/study/awards";
import { GoalMark, Panel } from "./ui";

const SEAL_TONES = ["#c96d42", "#1f7b78", "#4b56a4", "#8d3657", "#2f7049", "#b8860b", "#52606f", "#1c1e26"] as const;
const SEAL_INK = ["#fff1e6", "#e2f5f3", "#e8ebff", "#fde6ee", "#e3f4e9", "#fff8dc", "#eef2f6", "#e9c46a"] as const;

export function sealTone(tier: number): string {
  return SEAL_TONES[tier] ?? SEAL_TONES[SEAL_TONES.length - 1];
}

function seeded(seed: number) {
  let value = (seed * 9301 + 49297) % 233280;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function pleats(cx: number, cy: number, outer: number, inner: number, teeth: number, jitter = 0, seed = 1): string {
  const random = seeded(seed);
  const points: string[] = [];
  const total = teeth * 2;
  for (let index = 0; index < total; index += 1) {
    const base = index % 2 === 0 ? outer : inner;
    const radius = base + (jitter ? (random() - 0.5) * jitter : 0);
    const [x, y] = polar(cx, cy, radius, (index * 360) / total - 90);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function vivid(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  const channels = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    if (max === channels[0]) hue = ((channels[1] - channels[2]) / delta) % 6;
    else if (max === channels[1]) hue = (channels[2] - channels[0]) / delta + 2;
    else hue = (channels[0] - channels[1]) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const saturation = Math.min(0.78, (delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0) + 0.24);
  const next = Math.min(0.58, Math.max(0.4, lightness - 0.1));
  const chroma = (1 - Math.abs(2 * next - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const matchHue =
    hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const shift = next - chroma / 2;
  const hex = matchHue
    .map((channel) => Math.round((channel + shift) * 255).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

export function Rosette({ color, size = 64, className }: { color: string; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tone = vivid(color);
  const light = `color-mix(in oklab, ${tone} 55%, #fff)`;
  const deep = `color-mix(in oklab, ${tone} 72%, #0a0a0a)`;
  const star = pleats(50, 84, 12.5, 5.2, 5);
  return (
    <svg viewBox="0 0 100 124" width={size} height={(size * 124) / 100} className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: light }} />
          <stop offset="55%" style={{ stopColor: color }} />
          <stop offset="100%" style={{ stopColor: deep }} />
        </linearGradient>
        <linearGradient id={`${uid}-face`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: deep }} />
          <stop offset="60%" style={{ stopColor: color }} />
          <stop offset="100%" style={{ stopColor: light }} />
        </linearGradient>
        <radialGradient id={`${uid}-shine`} cx="30%" cy="22%" r="65%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M22 0 H42 L60 56 L46 61 Z" fill={deep} />
      <path d="M32 0 L52.5 58.5" stroke={light} strokeWidth="2.2" opacity={0.55} />
      <path d="M78 0 H58 L40 56 L54 61 Z" fill={tone} />
      <path d="M68 0 L47.5 58.5" stroke={light} strokeWidth="2.2" opacity={0.7} />
      <rect x="40" y="44" width="20" height="10" rx="3" fill={`url(#${uid}-rim)`} />
      <polygon points={pleats(50, 84, 35, 33.2, 40)} fill={deep} />
      <circle cx="50" cy="84" r="32.5" fill={`url(#${uid}-rim)`} />
      <circle cx="50" cy="84" r="26" fill={`url(#${uid}-face)`} />
      <circle cx="50" cy="84" r="26" fill="none" stroke={light} strokeWidth="0.9" opacity={0.65} />
      <circle cx="50" cy="84" r="22.5" fill="none" stroke="#fff" strokeWidth="0.6" strokeDasharray="1 2.2" opacity={0.4} />
      <polygon points={star} fill={deep} opacity={0.55} transform="translate(0 1.6)" />
      <polygon points={star} fill="#fff" opacity={0.95} strokeLinejoin="round" />
      <circle cx="50" cy="84" r="32.5" fill={`url(#${uid}-shine)`} opacity={0.7} />
      <path d="M23.7 74.4 A28 28 0 0 1 40.4 57.7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

function Branch({ side, color }: { side: 1 | -1; color: string }) {
  const leaves = Array.from({ length: 8 }, (_, index) => index);
  const from = 96;
  const to = 212;
  const cx = 60;
  const cy = 60;
  const radius = 46;
  const stem = leaves
    .map((index) => {
      const degrees = from + ((to - from) * index) / 7;
      const [x, y] = polar(cx, cy, radius, degrees);
      return `${index === 0 ? "M" : "L"}${(side === 1 ? 120 - x : x).toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <g>
      <path d={stem} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map((index) => {
        const degrees = from + ((to - from) * index) / 7;
        const [x, y] = polar(cx, cy, radius, degrees);
        const px = side === 1 ? 120 - x : x;
        const tangent = degrees + 90;
        const tilt = index % 2 === 0 ? 34 : -34;
        const rotate = side === 1 ? -(tangent + tilt) : tangent + tilt;
        const scale = 0.72 + 0.28 * Math.sin((index / 7) * Math.PI);
        return (
          <ellipse
            key={index}
            cx={px}
            cy={y}
            rx={4.1 * scale}
            ry={9.4 * scale}
            fill={color}
            opacity={0.92 - index * 0.025}
            transform={`rotate(${rotate.toFixed(1)} ${px.toFixed(2)} ${y.toFixed(2)})`}
          />
        );
      })}
    </g>
  );
}

export function Laurel({ size = 96, className, children, color = "var(--laurel)" }: { size?: number; className?: string; children?: ReactNode; color?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0" aria-hidden>
        <Branch side={-1} color={color} />
        <Branch side={1} color={color} />
      </svg>
      <span className="relative flex items-center justify-center" style={{ width: size * 0.46, height: size * 0.46 }}>
        {children}
      </span>
    </span>
  );
}

export function StreakSeal({
  award,
  size = 64,
  unit,
  className,
}: {
  award: StreakAward;
  size?: number;
  unit: string;
  className?: string;
}) {
  const earned = award.earnedAt !== null;
  const tone = sealTone(award.tier);
  const ink = SEAL_INK[award.tier] ?? SEAL_INK[SEAL_INK.length - 1];
  const digits = String(award.threshold).length;
  const fontSize = digits >= 3 ? 26 : 32;
  const circumference = 2 * Math.PI * 41;
  const lightId = `seal-light-${award.threshold}`;
  if (!earned) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={cn("shrink-0", className)} aria-hidden>
        <circle cx="50" cy="50" r="41" fill="var(--surface-2)" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="var(--border-strong)" strokeWidth="1.4" strokeDasharray="3 3.2" />
        {award.progress > 0 ? (
          <circle
            cx="50"
            cy="50"
            r="41"
            fill="none"
            stroke={tone}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={`${(circumference * award.progress).toFixed(2)} ${circumference.toFixed(2)}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={600} fill="var(--text-faint)" className="font-display tabular-nums">
          {award.threshold}
        </text>
        <text x="50" y="72" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" fill="var(--text-faint)" className="uppercase">
          {unit}
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cn("shrink-0", className)} aria-hidden>
      <polygon points={pleats(50, 50, 46, 42.5, 30, 1.8, award.threshold)} fill={tone} />
      <polygon points={pleats(50, 50, 43, 41, 30, 0.8, award.threshold + 7)} fill="#000" opacity={0.12} />
      <circle cx="50" cy="50" r="39" fill={tone} />
      <circle cx="50" cy="50" r="39" fill={`url(#${lightId})`} opacity={0.35} />
      <circle cx="50" cy="50" r="33.5" fill="none" stroke={ink} strokeWidth="0.9" opacity={0.55} />
      <circle cx="50" cy="50" r="31.5" fill="none" stroke={ink} strokeWidth="0.5" opacity={0.35} strokeDasharray="1.2 1.8" />
      <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={600} fill={ink} className="font-display tabular-nums">
        {award.threshold}
      </text>
      <text x="50" y="70" textAnchor="middle" fontSize="8" letterSpacing="1.8" fill={ink} opacity={0.85} className="uppercase">
        {unit}
      </text>
      <path d="M22 36 Q30 22 46 19" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity={0.28} />
      <defs>
        <radialGradient id={lightId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function AwardArt({ award, size = 64, className }: { award: Award; size?: number; className?: string }) {
  const { st } = useStudyT();
  const { activePlan } = useStudy();
  if (award.kind === "streak") return <StreakSeal award={award} size={size} unit={st("award_seal_unit")} className={className} />;
  if (award.kind === "subject") {
    if (award.earnedAt === null) {
      return (
        <svg viewBox="0 0 100 124" width={size} height={(size * 124) / 100} className={cn("shrink-0", className)} aria-hidden>
          <path d="M22 0 H42 L60 56 L46 61 Z" fill="var(--surface-2)" />
          <path d="M78 0 H58 L40 56 L54 61 Z" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="0.8" />
          <rect x="40" y="44" width="20" height="10" rx="3" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.8" />
          <circle cx="50" cy="84" r="32.5" fill="var(--surface)" />
          <circle cx="50" cy="84" r="32.5" fill="none" stroke="var(--border-strong)" strokeWidth="1.3" strokeDasharray="3 3" />
          <circle
            cx="50"
            cy="84"
            r="32.5"
            fill="none"
            stroke={vivid(award.color)}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeDasharray={`${(2 * Math.PI * 32.5 * award.progress).toFixed(2)} ${(2 * Math.PI * 32.5).toFixed(2)}`}
            transform="rotate(-90 50 84)"
          />
          <text x="50" y="86" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight={600} fill="var(--text-faint)" className="font-display tabular-nums">
            {Math.round(award.progress * 100)}%
          </text>
        </svg>
      );
    }
    return <Rosette color={award.color} size={size} className={className} />;
  }
  const earned = award.earnedAt !== null;
  return (
    <Laurel size={size} className={className} color={earned ? "var(--laurel)" : "var(--border-strong)"}>
      {activePlan ? (
        <GoalMark icon={activePlan.icon} name={activePlan.name} seed={activePlan.id} size={Math.round(size * 0.4)} raised={earned} className={cn(!earned && "opacity-50 grayscale")} />
      ) : null}
    </Laurel>
  );
}

const PAPER = ["var(--accent)", "#d2b19a", "#cfc08e", "#d2a8b6", "#93c0a8", "#b4abd2"];

export function PaperConfetti({ accent, pieces = 30, className }: { accent?: string; pieces?: number; className?: string }) {
  const strips = useMemo(() => {
    const random = seeded(pieces + (accent?.length ?? 0));
    return Array.from({ length: pieces }, (_, index) => {
      const palette = accent ? [accent, accent, ...PAPER] : PAPER;
      return {
        left: random() * 100,
        delay: random() * 0.9,
        duration: 2.4 + random() * 1.6,
        width: 5 + Math.round(random() * 5),
        height: 10 + Math.round(random() * 10),
        color: palette[index % palette.length],
        spin: 360 + Math.round(random() * 540),
        drift: (random() - 0.5) * 120,
      };
    });
  }, [accent, pieces]);
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {strips.map((strip, index) => (
        <span
          key={index}
          className="synapsys-paper absolute top-0 block rounded-[1px]"
          style={{
            left: `${strip.left}%`,
            width: strip.width,
            height: strip.height,
            backgroundColor: strip.color,
            animationDelay: `${strip.delay}s`,
            animationDuration: `${strip.duration}s`,
            ["--paper-spin" as string]: `${strip.spin}deg`,
            ["--paper-drift" as string]: `${strip.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function awardTitle(award: Award, st: StudyT): string {
  if (award.kind === "goal") return st("award_goal_title");
  if (award.kind === "subject") return award.name;
  return st("award_streak_title", { count: award.threshold });
}

export function awardDetail(award: Award, st: StudyT, locale: string): string {
  if (award.earnedAt !== null && award.earnedDay) {
    return st("award_earned_on", { date: formatDay(award.earnedDay, locale, { day: "numeric", month: "long", year: "numeric" }) });
  }
  if (award.kind === "goal") return st("award_goal_locked", { done: award.done, total: award.total });
  if (award.kind === "subject") return st("award_subject_locked", { done: award.done, total: award.total });
  return st("award_streak_locked", { current: award.current, count: award.threshold });
}

function AwardTile({ award }: { award: Award }) {
  const { st, locale } = useStudyT();
  const earned = award.earnedAt !== null;
  const title = awardTitle(award, st);
  const detail = awardDetail(award, st, locale);
  const body = (
    <div className={cn("flex w-[4.6rem] flex-col items-center gap-2 text-center", !earned && "opacity-80")}>
      <span className={cn("flex h-[4.2rem] items-center justify-center transition-transform duration-300 ease-[var(--ease-luxury)]", earned && "hover:-translate-y-0.5 hover:scale-[1.04]")}>
        <AwardArt award={award} size={award.kind === "subject" ? 54 : 60} />
      </span>
      <span className={cn("line-clamp-2 text-[11px] leading-[1.25]", earned ? "font-medium text-ink" : "text-muted")}>{title}</span>
    </div>
  );
  return (
    <Tooltip label={`${title} · ${detail}`} side="top">
      {award.kind === "subject" ? (
        <Link href={`/home/study/subjects/${award.subjectId}`} className="rounded-[10px] outline-none focus-visible:bg-[var(--surface-hover)]">
          {body}
        </Link>
      ) : (
        <span tabIndex={0} className="rounded-[10px] outline-none focus-visible:bg-[var(--surface-hover)]">
          {body}
        </span>
      )}
    </Tooltip>
  );
}

export function usePendingAwards(): Award[] {
  const book = useAwardBook();
  return useMemo(() => (book ? sortAwards(book.pending) : []), [book]);
}

export function AwardsPanel() {
  const { st } = useStudyT();
  const book = useAwardBook();
  if (!book) return null;
  const earned = sortAwards(book.kept);
  const locked = [
    ...(book.goal && book.goal.earnedAt === null ? [book.goal] : []),
    ...book.subjects.filter((award) => award.earnedAt === null).sort((a, b) => b.progress - a.progress).slice(0, 3),
    ...(book.nextStreak ? [book.nextStreak] : []),
  ];
  return (
    <Panel title={st("awards_title")} description={st("awards_desc", { earned: earned.length, total: book.all.length })}>
      {earned.length ? (
        <div className="-mx-1 flex flex-wrap gap-x-1 gap-y-4">
          {earned.map((award) => (
            <AwardTile key={award.id} award={award} />
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-muted">{st("awards_empty")}</p>
      )}
      {locked.length ? (
        <div className={cn(earned.length && "mt-5 border-t border-dashed border-[var(--border)] pt-4")}>
          <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">{st("awards_section_locked")}</p>
          <div className="-mx-1 flex flex-wrap gap-x-1 gap-y-4">
            {locked.map((award) => (
              <AwardTile key={award.id} award={award} />
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function celebrationCopy(award: Award, st: StudyT, goalName: string): { headline: string; body: string } {
  if (award.kind === "goal") {
    return { headline: st("celebration_goal_headline"), body: st("celebration_goal_body", { goal: goalName }) };
  }
  if (award.kind === "subject") {
    return {
      headline: st("celebration_subject_headline", { subject: award.name }),
      body: st("celebration_subject_body", { count: award.total }),
    };
  }
  return {
    headline: st("celebration_streak_headline", { count: award.threshold }),
    body: st("celebration_streak_body", { count: award.threshold }),
  };
}

export function CelebrationBanner() {
  const { st } = useStudyT();
  const { activePlan, actions } = useStudy();
  const celebrated = useStudyUi((state) => state.celebrated);
  const [settled, setSettled] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = usePendingAwards();
  const lead = pending[0];
  const leadId = lead?.id ?? null;
  const pendingKey = pending.map((award) => award.claimKey).join(",");
  useEffect(() => {
    if (!leadId) return;
    const timer = window.setTimeout(() => setSettled(leadId), 4200);
    return () => window.clearTimeout(timer);
  }, [leadId]);
  useEffect(() => {
    if (!pendingKey || !celebrated.length) return;
    const seen = new Set(celebrated);
    const keys = pendingKey.split(",").filter((key) => seen.has(key.slice(key.indexOf("~") + 1)));
    if (keys.length) void actions.claimAwards(keys);
  }, [actions, celebrated, pendingKey]);
  if (!lead || !activePlan || hidden === pendingKey) return null;
  const confetti = settled !== lead.id;
  const { headline, body } = celebrationCopy(lead, st, activePlan.name || st("untitled_goal"));
  const accent = lead.kind === "subject" ? lead.color : lead.kind === "streak" ? sealTone(lead.tier) : "var(--laurel)";
  const daysLeft = Math.min(...pending.map((award) => award.daysLeft ?? CLAIM_WINDOW_DAYS));
  const keep = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await actions.claimAwards(pending.map((award) => award.claimKey));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="relative overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border)]"
      style={{ ["--celebration" as string]: accent }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[12px] border border-[color-mix(in_oklab,var(--celebration)_45%,transparent)]" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-[var(--celebration)]" />
      {confetti ? <PaperConfetti accent={lead.kind === "goal" ? undefined : accent} /> : null}
      <div className="relative flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:gap-7 sm:px-8">
        <div className="shrink-0 self-start sm:self-center">
          <AwardArt award={lead} size={lead.kind === "goal" ? 104 : 88} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--celebration)]">
            {pending.length > 1 ? st("celebration_eyebrow_many", { count: pending.length }) : st("celebration_eyebrow")}
          </p>
          <h2 className="font-display mt-1.5 text-[28px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[34px]">{headline}</h2>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-muted">{body}</p>
          {pending.length > 1 ? (
            <p className="mt-2 text-[12px] text-faint">{st("celebration_more", { count: pending.length - 1 })}</p>
          ) : null}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--celebration)_12%,transparent)] px-2.5 py-1 text-[11.5px] font-medium text-[color-mix(in_oklab,var(--celebration)_70%,var(--text))]">
            <Clock className="size-3.5" />
            {daysLeft <= 1 ? st("celebration_expires_today") : st("celebration_expires", { count: daysLeft })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
          <Button variant="primary" onClick={() => void keep()} disabled={saving}>
            {st("celebration_keep")}
            <ArrowRight />
          </Button>
          {lead.kind === "subject" ? (
            <Button variant="ghost" asChild>
              <Link href={`/home/study/subjects/${lead.subjectId}`}>{st("celebration_open_subject")}</Link>
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setHidden(pendingKey)}
          aria-label={st("close")}
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink sm:hidden"
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}
