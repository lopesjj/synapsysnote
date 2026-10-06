"use client";

import type { PlanId } from "@/lib/plans/definitions";
import { cn } from "@/lib/utils";

/** Degraus acesos na marca: cresce com o plano. */
const STEPS: Record<PlanId | "guest", number> = {
  free: 1,
  guest: 1,
  basic: 2,
  pro: 3,
  ultra: 4,
  owner: 4,
};

const BARS = [0, 1, 2, 3];

/**
 * Marca do plano: quatro degraus, acesos até o nível do plano. Sem moldura nem
 * fundo — herda a cor de quem a usa, para ler igual em 14px e em 24px.
 */
export function PlanMark({
  plan,
  size = 20,
  muted = false,
  className,
}: {
  plan: PlanId | "guest";
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const steps = STEPS[plan] ?? 1;
  return (
    <svg
      width={size}
      height={Math.round(size * 0.75)}
      viewBox="0 0 16 12"
      fill="none"
      aria-hidden
      className={cn("shrink-0", muted ? "text-faint" : "text-[var(--accent)]", className)}
    >
      {BARS.map((index) => {
        const height = 4.5 + index * 2.5;
        return (
          <rect
            key={index}
            x={index * 4.35}
            y={12 - height}
            width={2.5}
            height={height}
            rx={1.25}
            fill="currentColor"
            opacity={index < steps ? 1 : 0.2}
          />
        );
      })}
    </svg>
  );
}

export type PlanTone = "accent" | "warning" | "danger" | "neutral";

const DOT_CLASS: Record<PlanTone, string> = {
  accent: "bg-[var(--accent)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
  neutral: "bg-[var(--border-strong)]",
};

const DOT_TEXT: Record<PlanTone, string> = {
  accent: "text-[var(--accent)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  neutral: "text-muted",
};

/** Estado em uma palavra: um ponto colorido e o texto, sem cápsula. */
export function StatusDot({
  tone,
  children,
  className,
}: {
  tone: PlanTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium",
        className
      )}
    >
      <span aria-hidden className={cn("size-[5px] shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className={cn("truncate", DOT_TEXT[tone])}>{children}</span>
    </span>
  );
}
