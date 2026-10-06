"use client";

import { useMemo } from "react";
import { Check, Crown, Lock, Mail, ShieldCheck, Users, X } from "lucide-react";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import { LEGAL_ENTITY } from "@/lib/legal/entity";
import {
  CATALOG_PLANS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  TRIAL_DAYS,
  catalogFeatures,
  catalogLimits,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@/lib/plans/definitions";
import type { Entitlements } from "@/lib/plans/entitlements";
import { useEntitlements, usePlanNow, usePlanStore } from "@/lib/plans/client";
import { planNameKey, statusNameKey, usePlanT, type PlanKey, type PlanT } from "@/lib/plans/i18n";
import { summarizeUsage, usageIndexOf } from "@/lib/plans/usage";
import { cn } from "@/lib/utils";
import { PlanBadge, planBadgeInfo } from "./plan-badge";

const USAGE_LABEL: Record<LimitKey, PlanKey> = {
  pages: "usage_pages",
  notebooksPerPage: "usage_notebooks",
  notesPerNotebook: "usage_notes",
  subnotesPerNote: "usage_subnotes",
  activeGoals: "usage_goals",
};

const LIMIT_FEATURE_LABEL: Record<LimitKey, PlanKey> = {
  pages: "feature_pages",
  notebooksPerPage: "feature_notebooks",
  notesPerNotebook: "feature_notes",
  subnotesPerNote: "feature_subnotes",
  activeGoals: "feature_goals",
};

const FEATURE_LABEL: Record<FeatureKey, PlanKey> = {
  video: "feature_video",
  transcription: "feature_transcription",
  flashcards: "feature_flashcards",
  aiFlashcards: "feature_aiFlashcards",
  archive: "feature_archive",
  goalArchive: "feature_goalArchive",
  awards: "feature_awards",
};

function mailtoHref(tp: PlanT, plan: string, email: string): string {
  const subject = tp("upgrade_mail_subject", { plan });
  const body = tp("upgrade_mail_body", { plan, email: email || "—" });
  return `mailto:${LEGAL_ENTITY.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function statusText(entitlements: Entitlements, tp: PlanT, date: (timestamp: number) => string): string {
  if (entitlements.provisional) return tp("status_provisional");
  switch (entitlements.status) {
    case "guest":
      return tp("status_guest");
    case "owner":
      return tp("status_owner");
    case "trial":
      return tp("status_trial", { date: entitlements.trialEndsAt ? date(entitlements.trialEndsAt) : "—" });
    case "trial_ended":
      return tp("status_trial_ended", { date: entitlements.trialEndsAt ? date(entitlements.trialEndsAt) : "—" });
    case "expired":
      return tp("status_expired", {
        plan: entitlements.plan === "guest" ? tp("plan_guest") : tp(planNameKey(entitlements.plan)),
        date: entitlements.expiresAt ? date(entitlements.expiresAt) : "—",
      });
    default:
      return entitlements.expiresAt
        ? tp("status_active_until", { date: date(entitlements.expiresAt) })
        : tp("status_active_forever");
  }
}

export function PlanDialog() {
  const open = usePlanStore((state) => state.dialogOpen);
  const setOpen = usePlanStore((state) => state.setDialogOpen);
  const { tp } = usePlanT();
  return (
    <DialogShell open={open} onOpenChange={setOpen} className="max-w-3xl" closeAriaLabel={tp("close")}>
      <DialogHeader
        title={tp("dialog_title")}
        description={tp("dialog_description")}
        icon={<Crown className="size-4" />}
        iconClassName="bg-[var(--accent-soft)] text-[var(--accent)]"
        className="pr-12"
      />
      <PlanDialogBody />
    </DialogShell>
  );
}

function PlanDialogBody() {
  const { tp, date } = usePlanT();
  const { user } = useAuth();
  const entitlements = useEntitlements();
  const now = usePlanNow();
  const { allNotebooks, pages } = useWorkspace();
  const { plans } = useStudy();

  const counts = useMemo(() => {
    const summary = summarizeUsage(usageIndexOf({ notebooks: allNotebooks, pages }));
    return {
      pages: summary.pages,
      notebooksPerPage: summary.maxNotebooksPerPage,
      notesPerNotebook: summary.maxNotesPerNotebook,
      subnotesPerNote: summary.maxSubnotesPerNote,
      activeGoals: plans.filter((plan) => !plan.archived).length,
    } satisfies Record<LimitKey, number>;
  }, [allNotebooks, pages, plans]);

  const badge = planBadgeInfo(entitlements, now, tp);
  const planName =
    entitlements.plan === "guest" ? tp("plan_guest") : tp(planNameKey(entitlements.plan));
  const currentColumn: PlanId | null =
    entitlements.status === "owner" || entitlements.status === "guest" ? null : (entitlements.plan as PlanId);
  const overLimit = LIMIT_KEYS.some((key) => {
    const limit = entitlements.limits[key];
    return !entitlements.readOnly && limit !== null && counts[key] > limit;
  });
  const isOwner = entitlements.status === "owner";
  const canUpgrade = entitlements.status !== "guest" && !isOwner;
  const email = user?.email ?? "";

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{planName}</p>
          {entitlements.provisional ? null : (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10.5px] font-medium text-muted">
              {tp(statusNameKey(entitlements.status))}
            </span>
          )}
          <PlanBadge info={badge} className="px-2 py-0.5 text-[10px] tracking-[0.05em]" />
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{statusText(entitlements, tp, date)}</p>
        {entitlements.readOnly ? (
          <p className="mt-2 flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-ink">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
            <span>{tp("read_only_explainer")}</span>
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {tp("usage_title")}
        </h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {LIMIT_KEYS.map((key) => {
            const limit = entitlements.readOnly ? null : entitlements.limits[key];
            const count = counts[key];
            const over = limit !== null && count > limit;
            const ratio = limit === null ? 0 : limit === 0 ? (count > 0 ? 100 : 0) : Math.min(100, (count / limit) * 100);
            return (
              <div
                key={key}
                className={cn(
                  "rounded-[var(--radius-md)] border bg-[var(--surface)] px-3 py-2.5",
                  over ? "border-[color-mix(in_oklab,var(--warning)_45%,transparent)]" : "border-[var(--border)]"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[12px] text-muted">{tp(USAGE_LABEL[key])}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[12.5px] font-semibold tabular-nums",
                      over ? "text-[var(--warning)]" : "text-ink"
                    )}
                  >
                    {limit === null
                      ? entitlements.readOnly
                        ? count
                        : `${count} · ${tp("usage_unlimited")}`
                      : tp("usage_of", { count, limit })}
                  </span>
                </div>
                {limit === null ? null : (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        over ? "bg-[var(--warning)]" : ratio >= 100 ? "bg-[var(--accent)]" : "bg-[var(--accent)]/80"
                      )}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {overLimit ? (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--warning)]">{tp("usage_over_hint")}</p>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">{tp("counting_note")}</p>
      </section>

      <section>
        <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {tp("compare_title")}
        </h3>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--surface)] py-2 pr-3 text-left text-[11px] font-medium text-faint">
                  {tp("compare_feature")}
                </th>
                {CATALOG_PLANS.map((plan) => (
                  <th
                    key={plan}
                    className={cn(
                      "px-2 py-2 text-center align-bottom",
                      currentColumn === plan && "rounded-t-[var(--radius-md)] bg-[var(--accent-soft)]"
                    )}
                  >
                    <span className="block text-[12.5px] font-semibold text-ink">{tp(planNameKey(plan))}</span>
                    {plan === "free" ? (
                      <span className="block text-[10.5px] font-normal text-faint">
                        {tp("compare_trial_days", { days: TRIAL_DAYS })}
                      </span>
                    ) : null}
                    {currentColumn === plan ? (
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
                        {tp("compare_current")}
                      </span>
                    ) : canUpgrade && plan !== "free" ? (
                      <a
                        href={mailtoHref(tp, tp(planNameKey(plan)), email)}
                        className="mt-0.5 inline-block text-[10.5px] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {tp("compare_choose")}
                      </a>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIMIT_KEYS.map((key) => (
                <tr key={key}>
                  <td className="sticky left-0 z-10 border-t border-[var(--border)] bg-[var(--surface)] py-2 pr-3 text-muted">
                    {tp(LIMIT_FEATURE_LABEL[key])}
                  </td>
                  {CATALOG_PLANS.map((plan) => {
                    const value = catalogLimits(plan)[key];
                    return (
                      <td
                        key={plan}
                        className={cn(
                          "border-t border-[var(--border)] px-2 py-2 text-center font-semibold tabular-nums text-ink",
                          currentColumn === plan && "bg-[var(--accent-soft)]"
                        )}
                      >
                        {value === null ? (
                          tp("usage_unlimited")
                        ) : value === 0 ? (
                          <X className="mx-auto size-3.5 text-faint" aria-label={tp("compare_not_included")} />
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {FEATURE_KEYS.map((key, index) => (
                <tr key={key}>
                  <td className="sticky left-0 z-10 border-t border-[var(--border)] bg-[var(--surface)] py-2 pr-3 text-muted">
                    {tp(FEATURE_LABEL[key])}
                  </td>
                  {CATALOG_PLANS.map((plan) => (
                    <td
                      key={plan}
                      className={cn(
                        "border-t border-[var(--border)] px-2 py-2 text-center",
                        currentColumn === plan && "bg-[var(--accent-soft)]",
                        currentColumn === plan && index === FEATURE_KEYS.length - 1 && "rounded-b-[var(--radius-md)]"
                      )}
                    >
                      {catalogFeatures(plan)[key] ? (
                        <Check className="mx-auto size-3.5 text-[var(--success)]" aria-label={tp("compare_included")} />
                      ) : (
                        <X className="mx-auto size-3.5 text-faint" aria-label={tp("compare_not_included")} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">{tp("compare_free_note", { days: TRIAL_DAYS })}</p>
      </section>

      {isOwner ? (
        <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            <p className="text-[12.5px] leading-relaxed text-muted">{tp("admin_description")}</p>
          </div>
          <Button
            variant="primary"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => {
              usePlanStore.getState().setDialogOpen(false);
              usePlanStore.getState().setAdminOpen(true);
            }}
          >
            <Users /> {tp("manage_accounts")}
          </Button>
        </section>
      ) : canUpgrade ? (
        <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">{tp("upgrade_title")}</p>
            <p className="mt-1 break-words text-[12px] leading-relaxed text-muted">
              {tp("upgrade_body", { email: LEGAL_ENTITY.contactEmail })}
            </p>
          </div>
          <Button variant="primary" className="w-full shrink-0 sm:w-auto" asChild>
            <a href={mailtoHref(tp, planName, email)}>
              <Mail /> {tp("upgrade_cta")}
            </a>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
