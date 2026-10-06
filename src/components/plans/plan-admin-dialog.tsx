"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import {
  ASSIGNABLE_PLANS,
  PLAN_IDS,
  isPaidPlan,
  type AssignablePlanId,
  type PlanId,
} from "@/lib/plans/definitions";
import {
  normalizeHistoryEntry,
  normalizePlanRecord,
  resolveEntitlements,
  type AccountPlanRecord,
  type PlanHistoryEntry,
  type PlanSource,
} from "@/lib/plans/entitlements";
import { usePlanStore, type AdminTab } from "@/lib/plans/client";
import {
  planFormExpiryInvalid,
  planFormPayload,
  planFormTrialConflict,
  timestampToDateInput,
  type PlanForm,
} from "@/lib/plans/admin";
import { planNameKey, statusNameKey, usePlanT, type PlanKey, type PlanT } from "@/lib/plans/i18n";
import { cn } from "@/lib/utils";
import { PlanMark, StatusDot } from "./plan-mark";
import { SubscriptionPanel } from "./subscription-panel";

/** O Select do Radix não aceita valor vazio; "todos" vira uma opção de verdade. */
const ALL_PLANS = "all";

interface AccountRow {
  uid: string;
  email: string;
  displayName: string | null;
  disabled: boolean;
  createdAt: number | null;
  lastSignInAt: number | null;
  record: AccountPlanRecord | null;
}

const SOURCE_LABEL: Record<PlanSource, PlanKey> = {
  signup: "admin_source_signup",
  admin: "admin_source_admin",
  cli: "admin_source_cli",
  "owner-env": "admin_source_owner_env",
  system: "admin_source_system",
};

const ERROR_LABEL: Record<string, PlanKey> = {
  owner_only: "admin_forbidden",
  forbidden: "admin_forbidden",
  owner_locked: "admin_owner_locked",
  self_locked: "admin_self_locked",
  invalid_expiry: "admin_invalid_expiry",
  account_not_found: "admin_not_found",
};

function errorText(error: unknown, tp: PlanT): string {
  const message = error instanceof Error ? error.message : "";
  const key = ERROR_LABEL[message];
  return key ? tp(key) : tp("admin_error_generic");
}

function normalizeRow(raw: unknown): AccountRow | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.uid !== "string") return null;
  return {
    uid: data.uid,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    disabled: data.disabled === true,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : null,
    lastSignInAt: typeof data.lastSignInAt === "number" ? data.lastSignInAt : null,
    record: normalizePlanRecord(data.record, data.uid),
  };
}

function planLabel(tp: PlanT, plan: PlanId | null | undefined): string {
  return plan ? tp(planNameKey(plan)) : "—";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[12px] font-medium text-ink">{children}</span>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-[11px] leading-relaxed text-faint">{children}</span>;
}

/** Painel do proprietário: o próprio plano e as contas, em uma só janela. */
export function PlanAdminDialog() {
  const open = usePlanStore((state) => state.adminOpen);
  const tab = usePlanStore((state) => state.adminTab);
  const setAdminOpen = usePlanStore((state) => state.setAdminOpen);
  const { tp } = usePlanT();

  const tabs: { id: AdminTab; label: string }[] = [
    { id: "plan", label: tp("menu_my_plan") },
    { id: "accounts", label: tp("manage_accounts") },
  ];

  return (
    <DialogShell
      open={open}
      onOpenChange={(value) => setAdminOpen(value)}
      className="h-[88dvh] max-w-4xl sm:h-[85dvh] md:h-[680px]"
      closeAriaLabel={tp("close")}
    >
      <DialogHeader title={tp("menu_admin")} description={tp("admin_description")} className="pr-12" />

      <div
        role="tablist"
        aria-label={tp("menu_admin")}
        className="flex shrink-0 items-center gap-5 border-b border-[var(--border)] px-5 sm:px-6"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setAdminOpen(true, item.id)}
              className={cn(
                "relative py-2.5 text-[12.5px] font-medium transition",
                active ? "text-ink" : "text-muted hover:text-ink"
              )}
            >
              {item.label}
              {active ? (
                <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--accent)]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "plan" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <SubscriptionPanel />
        </div>
      ) : (
        <AccountsPanel />
      )}
    </DialogShell>
  );
}

function AccountsPanel() {
  const { tp } = usePlanT();
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanId | "">("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (planFilter) params.set("plan", planFilter);
        const response = await firebaseJson<{ accounts?: unknown[]; now?: number }>(
          `/api/admin/plans?${params.toString()}`
        );
        if (cancelled) return;
        setAccounts((response.accounts ?? []).map(normalizeRow).filter((row): row is AccountRow => Boolean(row)));
        if (typeof response.now === "number") setNow(response.now);
        setError(null);
      } catch (failure) {
        if (!cancelled) setError(errorText(failure, tp));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [planFilter, query, reloadKey, tp]);

  return (
    <div className="flex min-h-0 flex-1 md:flex-row">
      <aside
        className={cn(
          "min-h-0 w-full flex-col border-[var(--border)] md:flex md:w-[304px] md:shrink-0 md:border-r",
          selected ? "hidden md:flex" : "flex"
        )}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tp("admin_search_placeholder")}
              className="h-9 ps-8"
              type="search"
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={planFilter || ALL_PLANS}
              onValueChange={(value) => setPlanFilter(value === ALL_PLANS ? "" : (value as PlanId))}
            >
              <SelectTrigger className="h-8 min-w-0 flex-1" aria-label={tp("admin_plan_label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PLANS}>{tp("admin_filter_all")}</SelectItem>
                {PLAN_IDS.map((plan) => (
                  <SelectItem key={plan} value={plan}>
                    {tp(planNameKey(plan))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length ? (
              <span className="shrink-0 text-[11px] tabular-nums text-faint">
                {tp("admin_accounts_total", { count: accounts.length })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="px-5 py-8 text-[12.5px] leading-relaxed text-[var(--danger)]">{error}</p>
          ) : loading && !accounts.length ? (
            <p className="flex items-center gap-2 px-5 py-8 text-[12.5px] text-muted">
              <Loader2 className="size-3.5 animate-spin" /> {tp("admin_loading")}
            </p>
          ) : !accounts.length ? (
            <p className="px-5 py-8 text-[12.5px] text-muted">{tp("admin_empty")}</p>
          ) : (
            <ul>
              {accounts.map((account) => (
                <li key={account.uid}>
                  <AccountListItem
                    account={account}
                    now={now}
                    active={selected === account.uid}
                    onOpen={() => setSelected(account.uid)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {selected ? (
          <AccountDetail
            uid={selected}
            onBack={() => setSelected(null)}
            onSaved={() => setReloadKey((key) => key + 1)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-10">
            <p className="max-w-[26ch] text-center text-[12.5px] leading-relaxed text-faint">
              {tp("admin_accounts_hint")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function AccountListItem({
  account,
  now,
  active,
  onOpen,
}: {
  account: AccountRow;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const { tp } = usePlanT();
  const entitlements = account.record ? resolveEntitlements(account.record, now) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-2.5 px-4 py-2.5 text-start transition sm:px-5",
        active ? "bg-[var(--surface-2)]/70" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      {active ? (
        <span aria-hidden className="absolute inset-y-0 start-0 w-[2px] bg-[var(--accent)]" />
      ) : null}
      <PlanMark plan={account.record?.plan ?? "guest"} size={15} muted={!account.record} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{account.email || account.uid}</span>
        <span className="mt-0.5 block truncate text-[11px] text-faint">
          {account.record && entitlements
            ? `${planLabel(tp, account.record.plan)} · ${tp(statusNameKey(entitlements.status))}`
            : tp("admin_no_record")}
        </span>
      </span>
      {account.disabled ? <StatusDot tone="danger">{tp("admin_disabled")}</StatusDot> : null}
    </button>
  );
}

function AccountDetail({ uid, onBack, onSaved }: { uid: string; onBack: () => void; onSaved: () => void }) {
  const { tp, date } = usePlanT();
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<AssignablePlanId>("free");
  const [expires, setExpires] = useState("");
  const [trial, setTrial] = useState("");
  const [savedTrial, setSavedTrial] = useState("");
  const [note, setNote] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    firebaseJson<{ account?: unknown; history?: unknown[]; now?: number }>(
      `/api/admin/plans?uid=${encodeURIComponent(uid)}`
    )
      .then((response) => {
        if (cancelled) return;
        const row = normalizeRow(response.account);
        setAccount(row);
        setHistory(
          (response.history ?? [])
            .map((entry) => {
              const raw = entry as { id?: unknown };
              return normalizeHistoryEntry(typeof raw.id === "string" ? raw.id : "", entry);
            })
            .filter((entry): entry is PlanHistoryEntry => Boolean(entry))
        );
        if (typeof response.now === "number") setNow(response.now);
        const record = row?.record ?? null;
        const trialInput = timestampToDateInput(record?.trialEndsAt ?? null);
        setPlan(record && record.plan !== "owner" ? record.plan : "free");
        setExpires(timestampToDateInput(record?.expiresAt ?? null));
        setTrial(trialInput);
        setSavedTrial(trialInput);
        setNote(record?.note ?? "");
        setError(null);
      })
      .catch((failure) => {
        if (!cancelled) setError(errorText(failure, tp));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, tp, uid]);

  const record = account?.record ?? null;
  const entitlements = useMemo(() => (record ? resolveEntitlements(record, now) : null), [now, record]);
  const ownerLocked = record?.plan === "owner";
  const selfLocked = user?.uid === uid;
  const locked = ownerLocked || selfLocked;

  const form: PlanForm = { plan, expires, trial, loadedTrial: savedTrial, note };
  const trialConflict = planFormTrialConflict(form);

  const save = async () => {
    if (locked || saving) return;
    if (planFormExpiryInvalid(form)) {
      toast.error(tp("admin_invalid_expiry"));
      return;
    }
    setSaving(true);
    try {
      await firebaseJson("/api/admin/plans", {
        method: "POST",
        body: JSON.stringify({ uid, ...planFormPayload(form) }),
      });
      toast.success(tp("admin_saved"));
      onSaved();
      setReloadKey((key) => key + 1);
    } catch (failure) {
      toast.error(errorText(failure, tp));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2 md:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ms-1.5">
          <ArrowLeft /> {tp("admin_back")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        {loading && !account ? (
          <p className="flex items-center gap-2 py-8 text-[12.5px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {tp("admin_loading")}
          </p>
        ) : error ? (
          <p className="py-8 text-[12.5px] leading-relaxed text-[var(--danger)]">{error}</p>
        ) : !account ? (
          <p className="py-8 text-[12.5px] text-muted">{tp("admin_not_found")}</p>
        ) : (
          <>
            <header>
              <h3 className="break-all text-[17px] font-semibold leading-tight tracking-[-0.02em] text-ink">
                {account.email || account.uid}
              </h3>
              {account.displayName ? (
                <p className="mt-1 text-[12.5px] text-muted">{account.displayName}</p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11.5px]">
                <span className="inline-flex items-center gap-1.5">
                  <PlanMark plan={record?.plan ?? "guest"} size={15} muted={!record} />
                  <span className={cn("font-medium", record ? "text-ink" : "text-faint")}>
                    {record ? planLabel(tp, record.plan) : tp("admin_no_record")}
                  </span>
                </span>
                {entitlements ? (
                  <>
                    <span aria-hidden className="text-faint">
                      ·
                    </span>
                    <span className="text-muted">{tp(statusNameKey(entitlements.status))}</span>
                  </>
                ) : null}
                {account.disabled ? <StatusDot tone="danger">{tp("admin_disabled")}</StatusDot> : null}
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                {account.createdAt ? tp("admin_created", { date: date(account.createdAt) }) : null}
                {account.createdAt && account.lastSignInAt ? " · " : null}
                {account.lastSignInAt ? tp("admin_last_sign_in", { date: date(account.lastSignInAt) }) : null}
              </p>
            </header>

            {locked ? (
              <p className="mt-5 border-s-2 border-[var(--border-strong)] ps-3 text-[12px] leading-relaxed text-muted">
                {ownerLocked ? tp("admin_owner_locked") : tp("admin_self_locked")}
              </p>
            ) : null}

            <section className="mt-7 border-t border-[var(--border)] pt-5">
              <h4 className="text-[14.5px] font-semibold tracking-[-0.015em] text-ink">{tp("admin_edit")}</h4>

              <div
                className="mt-3.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                role="radiogroup"
                aria-label={tp("admin_plan_label")}
              >
                {ASSIGNABLE_PLANS.map((option) => {
                  const active = plan === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={locked}
                      onClick={() => setPlan(option)}
                      className={cn(
                        "flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-start transition disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      <PlanMark plan={option} size={15} muted={!active} />
                      <span
                        className={cn(
                          "min-w-0 truncate text-[12.5px] font-medium",
                          active ? "text-[var(--accent)]" : "text-ink"
                        )}
                      >
                        {tp(planNameKey(option))}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={cn("block", !isPaidPlan(plan) && "opacity-50")}>
                  <FieldLabel>{tp("admin_expires_label")}</FieldLabel>
                  <Input
                    type="date"
                    value={isPaidPlan(plan) ? expires : ""}
                    onChange={(event) => setExpires(event.target.value)}
                    disabled={locked || !isPaidPlan(plan)}
                    className="h-9"
                  />
                  <FieldHint>{tp("admin_expires_hint")}</FieldHint>
                </label>
                <label className="block">
                  <FieldLabel>{tp("admin_trial_label")}</FieldLabel>
                  <Input
                    type="date"
                    value={trial}
                    onChange={(event) => setTrial(event.target.value)}
                    disabled={locked}
                    className="h-9"
                  />
                  <FieldHint>
                    {tp("admin_trial_hint")} {tp("admin_trial_clear")}
                  </FieldHint>
                </label>
              </div>

              {trialConflict !== null ? (
                <p className="mt-3.5 border-s-2 border-[var(--warning)] ps-3 text-[11.5px] leading-relaxed text-muted">
                  {tp("admin_trial_conflict", { date: date(trialConflict) })}
                </p>
              ) : null}

              <label className="mt-4 block">
                <FieldLabel>{tp("admin_note_label")}</FieldLabel>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 500))}
                  placeholder={tp("admin_note_placeholder")}
                  disabled={locked}
                  rows={2}
                />
              </label>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => void save()}
                  disabled={locked || saving}
                  className="w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {tp("admin_save")}
                </Button>
              </div>
            </section>

            <section className="mt-7 border-t border-[var(--border)] pt-5">
              <h4 className="text-[14.5px] font-semibold tracking-[-0.015em] text-ink">{tp("admin_history")}</h4>
              {history.length ? (
                <ol className="mt-3.5 border-s border-[var(--border)] ps-4">
                  {history.map((entry) => (
                    <li key={entry.id} className="relative pb-4 last:pb-0">
                      <span
                        aria-hidden
                        className="absolute -start-[20.5px] top-[5px] size-[7px] rounded-full bg-[var(--border-strong)] ring-2 ring-[var(--surface)]"
                      />
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] text-ink">
                        <span className="font-medium">
                          {entry.from ? `${planLabel(tp, entry.from.plan)} → ` : ""}
                          {planLabel(tp, entry.to.plan)}
                        </span>
                        {entry.to.expiresAt ? (
                          <span className="text-[11.5px] text-faint">
                            {tp("status_active_until", { date: date(entry.to.expiresAt) })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {entry.at ? date(entry.at) : tp("admin_never")} · {tp(SOURCE_LABEL[entry.source])}
                        {entry.byEmail ? ` · ${tp("admin_by", { email: entry.byEmail })}` : ""}
                      </p>
                      {entry.note ? (
                        <p className="mt-1 break-words text-[11.5px] leading-relaxed text-muted">{entry.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-[12px] text-faint">{tp("admin_history_empty")}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
