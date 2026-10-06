"use client";

import { useMemo } from "react";
import { Check, Mail } from "lucide-react";
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
  TRIAL_MS,
  TRIAL_WARNING_DAYS,
  catalogFeatures,
  catalogLimits,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@/lib/plans/definitions";
import { daysUntil, type Entitlements } from "@/lib/plans/entitlements";
import { useEntitlements, usePlanNow } from "@/lib/plans/client";
import { planNameKey, statusNameKey, usePlanT, type PlanKey, type PlanT } from "@/lib/plans/i18n";
import { summarizeUsage, usageIndexOf } from "@/lib/plans/usage";
import { cn } from "@/lib/utils";
import { PlanMark, StatusDot, type PlanTone } from "./plan-mark";

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

const USAGE_GROUPS: { label: PlanKey; keys: LimitKey[] }[] = [
  { label: "usage_group_content", keys: ["pages", "notebooksPerPage", "notesPerNotebook", "subnotesPerNote"] },
  { label: "usage_group_study", keys: ["activeGoals"] },
];

/** Perto do limite: a régua da linha troca de cor antes de estourar. */
const NEAR_LIMIT = 0.8;

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

function SectionHead({ title }: { title: string }) {
  return <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-ink">{title}</h3>;
}

function Masthead({ entitlements, now }: { entitlements: Entitlements; now: number }) {
  const { tp, date } = usePlanT();
  const planName = entitlements.plan === "guest" ? tp("plan_guest") : tp(planNameKey(entitlements.plan));
  const trialDays = daysUntil(entitlements.trialEndsAt, now);
  const trial = entitlements.status === "trial" && entitlements.trialEndsAt !== null;
  const ending = trial && trialDays !== null && trialDays <= TRIAL_WARNING_DAYS;
  const remaining =
    trial && entitlements.trialEndsAt !== null
      ? Math.max(0.025, Math.min(1, (entitlements.trialEndsAt - now) / TRIAL_MS))
      : 0;

  const marker = ((): { tone: PlanTone; text: string } | null => {
    if (entitlements.provisional) return null;
    if (entitlements.readOnly) return { tone: "danger", text: tp("badge_read_only") };
    if (entitlements.status === "trial") {
      return {
        tone: ending ? "warning" : "accent",
        text: trialDays && trialDays > 0 ? tp("trial_days_left", { days: trialDays }) : tp("trial_last_day"),
      };
    }
    // Proprietário e convidado já dizem tudo no nome do plano.
    if (entitlements.status === "owner" || entitlements.status === "guest") return null;
    return { tone: "accent", text: tp(statusNameKey(entitlements.status)) };
  })();

  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PlanMark plan={entitlements.plan} size={22} muted={entitlements.readOnly} />
        <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink @[30rem]/plan:text-[30px]">
          {planName}
        </h2>
        {marker ? <StatusDot tone={marker.tone}>{marker.text}</StatusDot> : null}
      </div>

      <p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
        {statusText(entitlements, tp, date)}
      </p>

      {entitlements.readOnly ? (
        <p className="mt-3.5 max-w-[62ch] border-s-2 border-[var(--danger)] ps-3 text-[12px] leading-relaxed text-muted">
          {tp("read_only_explainer")}
        </p>
      ) : null}

      {/* Régua do teste: fecha o cabeçalho e, no teste, mede o que ainda resta. */}
      <div className="mt-5 h-[2px] w-full overflow-hidden bg-[var(--border)]">
        {trial ? (
          <div
            className={cn(
              "h-full transition-[width] duration-700",
              ending ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
            )}
            style={{ width: `${remaining * 100}%` }}
          />
        ) : null}
      </div>
    </header>
  );
}

function UsageRow({
  limitKey,
  count,
  limit,
  showUnlimited,
}: {
  limitKey: LimitKey;
  count: number;
  limit: number | null;
  showUnlimited: boolean;
}) {
  const { tp } = usePlanT();
  const over = limit !== null && count > limit;
  const full = limit !== null && limit > 0 && count === limit;
  const ratio = limit !== null && limit > 0 ? Math.min(1, count / limit) : 0;
  const near = !over && !full && ratio >= NEAR_LIMIT;

  return (
    <li className="relative flex items-baseline gap-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{tp(USAGE_LABEL[limitKey])}</span>
      {over ? <StatusDot tone="warning">{tp("usage_state_over")}</StatusDot> : null}
      {full ? <StatusDot tone="accent">{tp("usage_state_full")}</StatusDot> : null}
      <span
        className={cn(
          "shrink-0 text-[13px] font-semibold tabular-nums",
          over ? "text-[var(--warning)]" : "text-ink"
        )}
      >
        {limit === null ? (
          <>
            {count}
            {showUnlimited ? (
              <span className="ms-1.5 text-[11px] font-normal text-faint">{tp("usage_unlimited")}</span>
            ) : null}
          </>
        ) : limit === 0 && count === 0 ? (
          <span className="text-[12px] font-normal text-faint">{tp("compare_not_included")}</span>
        ) : (
          tp("usage_of", { count, limit })
        )}
      </span>

      {/* A régua que separa as linhas é também a medida do uso. */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--border)]">
        {limit !== null && limit > 0 ? (
          <span
            className={cn(
              "block h-full transition-[width] duration-500",
              over || near ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
            )}
            style={{ width: `${(over ? 1 : ratio) * 100}%` }}
          />
        ) : null}
      </span>
    </li>
  );
}

function UsageSection({
  entitlements,
  counts,
}: {
  entitlements: Entitlements;
  counts: Record<LimitKey, number>;
}) {
  const { tp } = usePlanT();
  const overLimit = LIMIT_KEYS.some((key) => {
    const limit = entitlements.limits[key];
    return !entitlements.readOnly && limit !== null && counts[key] > limit;
  });

  return (
    <section className="mt-7">
      <SectionHead title={tp("usage_title")} />
      {USAGE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mt-4 text-[11.5px] font-medium text-faint">{tp(group.label)}</p>
          <ul>
            {group.keys.map((key) => (
              <UsageRow
                key={key}
                limitKey={key}
                count={counts[key]}
                limit={entitlements.readOnly ? null : entitlements.limits[key]}
                showUnlimited={!entitlements.readOnly}
              />
            ))}
          </ul>
        </div>
      ))}
      {overLimit ? (
        <p className="mt-3 max-w-[62ch] text-[11.5px] leading-relaxed text-[var(--warning)]">
          {tp("usage_over_hint")}
        </p>
      ) : null}
      <p className="mt-3 max-w-[62ch] text-[11px] leading-relaxed text-faint">{tp("counting_note")}</p>
    </section>
  );
}

function Included({ current }: { current: boolean }) {
  const { tp } = usePlanT();
  return (
    <>
      <span className="sr-only">{tp("compare_included")}</span>
      <Check
        aria-hidden
        strokeWidth={2.25}
        className={cn("mx-auto size-[15px]", current ? "text-[var(--accent)]" : "text-ink")}
      />
    </>
  );
}

function NotIncluded() {
  const { tp } = usePlanT();
  return (
    <>
      <span className="sr-only">{tp("compare_not_included")}</span>
      <span aria-hidden className="mx-auto block h-px w-3 bg-[var(--border-strong)]" />
    </>
  );
}

function CompareSection({
  currentColumn,
  canUpgrade,
  email,
}: {
  currentColumn: PlanId | null;
  canUpgrade: boolean;
  email: string;
}) {
  const { tp } = usePlanT();
  // Sem coluna atual nem link de troca (proprietário, convidado), a terceira
  // linha do cabeçalho não existe para ninguém: nada de espaço vazio.
  const hasColumnNote = canUpgrade || currentColumn !== null;

  const groups: {
    group: PlanKey;
    items: { key: string; label: PlanKey; value: (plan: PlanId, current: boolean) => React.ReactNode }[];
  }[] = [
    {
      group: "compare_group_capacity",
      items: LIMIT_KEYS.map((key) => ({
        key,
        label: LIMIT_FEATURE_LABEL[key],
        value: (plan: PlanId, current: boolean) => {
          const value = catalogLimits(plan as (typeof CATALOG_PLANS)[number])[key];
          if (value === 0) return <NotIncluded />;
          return (
            <span
              className={cn(
                "text-[12.5px] font-semibold tabular-nums",
                current ? "text-[var(--accent)]" : "text-ink"
              )}
            >
              {value === null ? tp("usage_unlimited") : value}
            </span>
          );
        },
      })),
    },
    {
      group: "compare_group_features",
      items: FEATURE_KEYS.map((key) => ({
        key,
        label: FEATURE_LABEL[key],
        value: (plan: PlanId, current: boolean) =>
          catalogFeatures(plan as (typeof CATALOG_PLANS)[number])[key] ? (
            <Included current={current} />
          ) : (
            <NotIncluded />
          ),
      })),
    },
  ];

  return (
    <section className="mt-8">
      <SectionHead title={tp("compare_title")} />
      <div className="-mx-4 mt-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[440px] border-collapse text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="w-[36%] p-0 text-start">
                <span className="sr-only">{tp("compare_feature")}</span>
              </th>
              {CATALOG_PLANS.map((plan) => {
                const current = currentColumn === plan;
                return (
                  <th
                    key={plan}
                    scope="col"
                    className={cn(
                      "px-1.5 pb-3 pt-3 text-center align-bottom",
                      current && "shadow-[inset_0_2px_0_0_var(--accent)]"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-[13px] font-semibold leading-tight tracking-[-0.015em]",
                        current ? "text-[var(--accent)]" : "text-ink"
                      )}
                    >
                      {tp(planNameKey(plan))}
                    </span>
                    {plan === "free" ? (
                      <span className="mt-0.5 block text-[10.5px] font-normal leading-tight text-faint">
                        {tp("compare_trial_days", { days: TRIAL_DAYS })}
                      </span>
                    ) : null}
                    {current ? (
                      <span className="mt-1.5 block text-[10.5px] font-medium leading-none text-[var(--accent)]">
                        {tp("compare_current")}
                      </span>
                    ) : canUpgrade && plan !== "free" ? (
                      <a
                        href={mailtoHref(tp, tp(planNameKey(plan)), email)}
                        className="mt-1.5 inline-block text-[10.5px] font-medium leading-none text-muted underline-offset-[3px] transition hover:text-[var(--accent)] hover:underline"
                      >
                        {tp("compare_choose")}
                      </a>
                    ) : hasColumnNote ? (
                      <span className="mt-1.5 block h-[11px]" aria-hidden />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={CATALOG_PLANS.length + 1}
                  className="pb-1 pt-5 text-start text-[12.5px] font-semibold tracking-[-0.01em] text-ink"
                >
                  {tp(group.group)}
                </th>
              </tr>
              {group.items.map((item) => (
                <tr key={item.key}>
                  <th
                    scope="row"
                    className="border-t border-[var(--border)] py-2.5 pe-3 text-start text-[12px] font-normal text-muted"
                  >
                    {tp(item.label)}
                  </th>
                  {CATALOG_PLANS.map((plan) => (
                    <td key={plan} className="border-t border-[var(--border)] px-1.5 py-2.5 text-center">
                      {item.value(plan, currentColumn === plan)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-3 max-w-[62ch] text-[11px] leading-relaxed text-faint">
        {tp("compare_free_note", { days: TRIAL_DAYS })}
      </p>
    </section>
  );
}

/**
 * Plano da conta: estado, uso e comparativo. Fica na guia Assinatura das
 * preferências e na guia Meu plano do painel do proprietário.
 */
export function SubscriptionPanel({ className }: { className?: string }) {
  const { tp } = usePlanT();
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

  const planName = entitlements.plan === "guest" ? tp("plan_guest") : tp(planNameKey(entitlements.plan));
  const currentColumn: PlanId | null =
    entitlements.status === "owner" || entitlements.status === "guest" ? null : (entitlements.plan as PlanId);
  const canUpgrade = entitlements.status !== "guest" && entitlements.status !== "owner";
  const email = user?.email ?? "";

  return (
    <div className={cn("@container/plan", className)}>
      <Masthead entitlements={entitlements} now={now} />
      <UsageSection entitlements={entitlements} counts={counts} />
      <CompareSection currentColumn={currentColumn} canUpgrade={canUpgrade} email={email} />

      {canUpgrade ? (
        <section className="mt-8 flex flex-col items-start gap-3.5 border-t border-[var(--border)] pt-5 @[34rem]/plan:flex-row @[34rem]/plan:items-center @[34rem]/plan:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{tp("upgrade_title")}</p>
            <p className="mt-1 max-w-[62ch] break-words text-[12px] leading-relaxed text-muted">
              {tp("upgrade_body", { email: LEGAL_ENTITY.contactEmail })}
            </p>
          </div>
          <Button variant="primary" className="w-full shrink-0 @[26rem]/plan:w-auto" asChild>
            <a href={mailtoHref(tp, planName, email)}>
              <Mail /> {tp("upgrade_cta")}
            </a>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
