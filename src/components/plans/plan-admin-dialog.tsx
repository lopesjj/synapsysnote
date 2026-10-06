"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Lock, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
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
import { usePlanStore } from "@/lib/plans/client";
import { planNameKey, statusNameKey, usePlanT, type PlanKey, type PlanT } from "@/lib/plans/i18n";
import { cn } from "@/lib/utils";

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

function toDateInput(timestamp: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = new Date(`${value}T23:59:59`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function planLabel(tp: PlanT, plan: PlanId | null | undefined): string {
  return plan ? tp(planNameKey(plan)) : "—";
}

export function PlanAdminDialog() {
  const open = usePlanStore((state) => state.adminOpen);
  const setOpen = usePlanStore((state) => state.setAdminOpen);
  const { tp } = usePlanT();
  return (
    <DialogShell open={open} onOpenChange={setOpen} className="max-w-2xl" closeAriaLabel={tp("close")}>
      <DialogHeader
        title={tp("admin_title")}
        description={tp("admin_description")}
        icon={<ShieldCheck className="size-4" />}
        iconClassName="bg-[var(--accent-soft)] text-[var(--accent)]"
        className="pr-12"
      />
      <AdminBody />
    </DialogShell>
  );
}

function AdminBody() {
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

  if (selected) {
    return (
      <AccountDetail
        uid={selected}
        onBack={() => setSelected(null)}
        onSaved={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:px-5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tp("admin_search_placeholder")}
            className="h-9 pl-8"
            type="search"
            autoComplete="off"
          />
        </div>
        <select
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value as PlanId | "")}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[12.5px] text-ink outline-none focus:border-[var(--accent)] sm:w-44"
          aria-label={tp("admin_plan_label")}
        >
          <option value="">{tp("admin_filter_all")}</option>
          {PLAN_IDS.map((plan) => (
            <option key={plan} value={plan}>
              {tp(planNameKey(plan))}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-[var(--danger)]">{error}</p>
        ) : loading && !accounts.length ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-[12.5px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {tp("admin_loading")}
          </p>
        ) : !accounts.length ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">{tp("admin_empty")}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {accounts.map((account) => (
              <li key={account.uid}>
                <AccountListItem account={account} now={now} onOpen={() => setSelected(account.uid)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AccountListItem({ account, now, onOpen }: { account: AccountRow; now: number; onOpen: () => void }) {
  const { tp, date } = usePlanT();
  const entitlements = account.record ? resolveEntitlements(account.record, now) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-[var(--surface-hover)] sm:flex-row sm:items-center sm:gap-3 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{account.email || account.uid}</p>
        <p className="truncate text-[11.5px] text-faint">
          {account.displayName ? `${account.displayName} · ` : ""}
          {account.lastSignInAt
            ? tp("admin_last_sign_in", { date: date(account.lastSignInAt) })
            : tp("admin_never")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {account.disabled ? (
          <span className="rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--danger)]">
            {tp("admin_disabled")}
          </span>
        ) : null}
        {account.record && entitlements ? (
          <>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">
              {planLabel(tp, account.record.plan)}
            </span>
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-muted">
              {tp(statusNameKey(entitlements.status))}
            </span>
          </>
        ) : (
          <span className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[10.5px] text-faint">
            {tp("admin_no_record")}
          </span>
        )}
      </div>
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
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await firebaseJson<{ account?: unknown; history?: unknown[]; now?: number }>(
        `/api/admin/plans?uid=${encodeURIComponent(uid)}`
      );
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
      setPlan(record && record.plan !== "owner" ? record.plan : "free");
      setExpires(toDateInput(record?.expiresAt ?? null));
      setTrial(toDateInput(record?.trialEndsAt ?? null));
      setNote(record?.note ?? "");
      setError(null);
    } catch (failure) {
      setError(errorText(failure, tp));
    } finally {
      setLoading(false);
    }
  }, [tp, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const record = account?.record ?? null;
  const entitlements = useMemo(() => (record ? resolveEntitlements(record, now) : null), [now, record]);
  const ownerLocked = record?.plan === "owner";
  const selfLocked = user?.uid === uid;
  const locked = ownerLocked || selfLocked;

  const save = async () => {
    if (locked || saving) return;
    const expiresAt = isPaidPlan(plan) && expires ? fromDateInput(expires) : null;
    if (isPaidPlan(plan) && expires && (!expiresAt || expiresAt <= Date.now())) {
      toast.error(tp("admin_invalid_expiry"));
      return;
    }
    setSaving(true);
    try {
      await firebaseJson("/api/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          uid,
          plan,
          expiresAt,
          trialEndsAt: trial ? fromDateInput(trial) : null,
          note: note.trim() ? note.trim() : null,
        }),
      });
      toast.success(tp("admin_saved"));
      onSaved();
      await load();
    } catch (failure) {
      toast.error(errorText(failure, tp));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 sm:px-5">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft /> {tp("admin_back")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {loading && !account ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {tp("admin_loading")}
          </p>
        ) : error ? (
          <p className="py-8 text-center text-[12.5px] text-[var(--danger)]">{error}</p>
        ) : !account ? (
          <p className="py-8 text-center text-[12.5px] text-muted">{tp("admin_not_found")}</p>
        ) : (
          <>
            <section className="space-y-1">
              <p className="break-all text-[15px] font-semibold text-ink">{account.email || account.uid}</p>
              {account.displayName ? <p className="text-[12.5px] text-muted">{account.displayName}</p> : null}
              <p className="text-[11.5px] text-faint">
                {account.createdAt ? tp("admin_created", { date: date(account.createdAt) }) : null}
                {account.createdAt && account.lastSignInAt ? " · " : null}
                {account.lastSignInAt ? tp("admin_last_sign_in", { date: date(account.lastSignInAt) }) : null}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                {record ? (
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">
                    {planLabel(tp, record.plan)}
                  </span>
                ) : (
                  <span className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[10.5px] text-faint">
                    {tp("admin_no_record")}
                  </span>
                )}
                {entitlements ? (
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-muted">
                    {tp(statusNameKey(entitlements.status))}
                  </span>
                ) : null}
                {account.disabled ? (
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--danger)]">
                    {tp("admin_disabled")}
                  </span>
                ) : null}
              </div>
            </section>

            {locked ? (
              <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                <span>{ownerLocked ? tp("admin_owner_locked") : tp("admin_self_locked")}</span>
              </p>
            ) : null}

            <section className="space-y-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{tp("admin_edit")}</h3>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink">{tp("admin_plan_label")}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label={tp("admin_plan_label")}>
                  {ASSIGNABLE_PLANS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={plan === option}
                      disabled={locked}
                      onClick={() => setPlan(option)}
                      className={cn(
                        "rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                        plan === option
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border)] text-ink hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      {tp(planNameKey(option))}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <label className={cn("block", !isPaidPlan(plan) && "opacity-50")}>
                  <span className="mb-1.5 block text-[12px] font-medium text-ink">{tp("admin_expires_label")}</span>
                  <Input
                    type="date"
                    value={isPaidPlan(plan) ? expires : ""}
                    onChange={(event) => setExpires(event.target.value)}
                    disabled={locked || !isPaidPlan(plan)}
                    className="h-9"
                  />
                  <span className="mt-1 block text-[11px] text-faint">{tp("admin_expires_hint")}</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-ink">{tp("admin_trial_label")}</span>
                  <Input
                    type="date"
                    value={trial}
                    onChange={(event) => setTrial(event.target.value)}
                    disabled={locked}
                    className="h-9"
                  />
                  <span className="mt-1 block text-[11px] text-faint">{tp("admin_trial_hint")}</span>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink">{tp("admin_note_label")}</span>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 500))}
                  placeholder={tp("admin_note_placeholder")}
                  disabled={locked}
                  rows={2}
                />
              </label>

              <div className="flex justify-end">
                <Button variant="primary" onClick={() => void save()} disabled={locked || saving} className="w-full sm:w-auto">
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {tp("admin_save")}
                </Button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{tp("admin_history")}</h3>
              {history.length ? (
                <ul className="space-y-1.5">
                  {history.map((entry) => (
                    <li key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink">
                        <span className="font-medium">
                          {entry.from ? `${planLabel(tp, entry.from.plan)} → ` : ""}
                          {planLabel(tp, entry.to.plan)}
                        </span>
                        {entry.to.expiresAt ? (
                          <span className="text-faint">{tp("status_active_until", { date: date(entry.to.expiresAt) })}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {entry.at ? date(entry.at) : tp("admin_never")} · {tp(SOURCE_LABEL[entry.source])}
                        {entry.byEmail ? ` · ${tp("admin_by", { email: entry.byEmail })}` : ""}
                      </p>
                      {entry.note ? <p className="mt-1 break-words text-[11.5px] text-muted">{entry.note}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-faint">{tp("admin_history_empty")}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
