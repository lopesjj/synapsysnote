"use client";

import { TRIAL_WARNING_DAYS } from "@/lib/plans/definitions";
import { daysUntil, type Entitlements } from "@/lib/plans/entitlements";
import { useEntitlements, usePlanNow } from "@/lib/plans/client";
import { planNameKey, usePlanT, type PlanT } from "@/lib/plans/i18n";
import { cn } from "@/lib/utils";

export type PlanBadgeTone = "accent" | "warning" | "danger" | "neutral";

export interface PlanBadgeInfo {
  text: string;
  tone: PlanBadgeTone;
}

export function planBadgeInfo(entitlements: Entitlements, now: number, tp: PlanT): PlanBadgeInfo | null {
  if (entitlements.provisional) return null;
  if (entitlements.status === "guest") return { text: tp("plan_guest"), tone: "neutral" };
  if (entitlements.status === "owner") return { text: tp("plan_owner"), tone: "accent" };
  if (entitlements.readOnly) return { text: tp("badge_read_only"), tone: "danger" };
  if (entitlements.status === "trial") {
    const days = daysUntil(entitlements.trialEndsAt, now) ?? 0;
    return {
      text: days <= 1 ? tp("badge_trial_last_day") : tp("badge_trial", { days }),
      tone: days <= TRIAL_WARNING_DAYS ? "warning" : "accent",
    };
  }
  return { text: tp(planNameKey(entitlements.plan)), tone: "accent" };
}

export function usePlanBadge(): PlanBadgeInfo | null {
  const entitlements = useEntitlements();
  const now = usePlanNow();
  const { tp } = usePlanT();
  return planBadgeInfo(entitlements, now, tp);
}

const TONES: Record<PlanBadgeTone, string> = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  warning: "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]",
  danger: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]",
  neutral: "bg-[var(--surface-2)] text-muted",
};

export function PlanBadge({ info, className }: { info: PlanBadgeInfo | null; className?: string }) {
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full font-semibold uppercase",
        TONES[info.tone],
        className
      )}
    >
      {info.text}
    </span>
  );
}
