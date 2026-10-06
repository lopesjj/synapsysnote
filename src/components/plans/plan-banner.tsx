"use client";

import { useState } from "react";
import { AlertTriangle, Clock, X } from "lucide-react";
import { DAY_MS, TRIAL_WARNING_DAYS } from "@/lib/plans/definitions";
import { daysUntil } from "@/lib/plans/entitlements";
import { openPlanDialog, useEntitlements, usePlanNow } from "@/lib/plans/client";
import { planNameKey, usePlanT } from "@/lib/plans/i18n";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "synapsys.plan-banner.dismissed";

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string) {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, value);
  } catch {}
}

export function PlanBanner() {
  const { tp } = usePlanT();
  const entitlements = useEntitlements();
  const now = usePlanNow();
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readDismissed()
  );

  if (entitlements.provisional || entitlements.status === "guest" || entitlements.status === "owner") return null;

  let message: string | null = null;
  let tone: "danger" | "warning" = "warning";
  let key = "";

  if (entitlements.readOnly) {
    tone = "danger";
    key = `read-only:${entitlements.status}`;
    message = tp(entitlements.status === "expired" ? "banner_read_only_expired" : "banner_read_only_trial");
  } else if (entitlements.status === "trial") {
    const days = daysUntil(entitlements.trialEndsAt, now);
    if (days !== null && days <= TRIAL_WARNING_DAYS) {
      key = `trial:${Math.floor(now / DAY_MS)}`;
      message = days <= 1 ? tp("banner_trial_last_day") : tp("banner_trial_ending", { days });
    }
  } else if (entitlements.status === "active" && entitlements.expiresAt && entitlements.plan !== "guest") {
    const days = daysUntil(entitlements.expiresAt, now);
    if (days !== null && days <= TRIAL_WARNING_DAYS) {
      const plan = tp(planNameKey(entitlements.plan));
      key = `expiring:${Math.floor(now / DAY_MS)}`;
      message = days <= 1 ? tp("banner_plan_last_day", { plan }) : tp("banner_plan_ending", { plan, days });
    }
  }

  if (!message || dismissed === key) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 border-b px-4 py-2 text-[12px] sm:items-center",
        tone === "danger"
          ? "border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_9%,var(--surface))] text-ink"
          : "border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,var(--surface))] text-ink"
      )}
    >
      {tone === "danger" ? (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)] sm:mt-0" />
      ) : (
        <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)] sm:mt-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 leading-relaxed">{message}</span>
        <button
          type="button"
          onClick={openPlanDialog}
          className="self-start whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11.5px] font-medium text-ink transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:self-auto"
        >
          {tp("view_plans")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          writeDismissed(key);
          setDismissed(key);
        }}
        className="shrink-0 rounded p-1 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
        aria-label={tp("banner_dismiss")}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
