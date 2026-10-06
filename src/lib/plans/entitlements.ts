import {
  ALL_FEATURES,
  DAY_MS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  READ_ONLY_FEATURES,
  TRIAL_MS,
  TRIAL_TIER,
  UNLIMITED,
  isPaidPlan,
  isPlanId,
  type PlanFeatures,
  type PlanId,
  type PlanLimits,
  type PlanTier,
} from "./definitions";

const PLAN_SOURCES = ["signup", "admin", "cli", "owner-env", "system"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export interface AccountPlanRecord {
  uid: string;
  email: string;
  plan: PlanId;
  trialStartedAt: number;
  trialEndsAt: number;
  expiresAt: number | null;
  readOnlyAfter: number | null;
  source: PlanSource;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
}

export interface PlanHistoryEntry {
  id: string;
  at: number;
  by: string | null;
  byEmail: string | null;
  source: PlanSource;
  note: string | null;
  from: { plan: PlanId; expiresAt: number | null; trialEndsAt: number } | null;
  to: { plan: PlanId; expiresAt: number | null; trialEndsAt: number };
}

export type PlanStatus = "guest" | "owner" | "active" | "trial" | "trial_ended" | "expired";

export interface Entitlements {
  plan: PlanId | "guest";
  tier: PlanTier | null;
  status: PlanStatus;
  readOnly: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
  trialEndsAt: number | null;
  expiresAt: number | null;
  provisional: boolean;
}

function millis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    const result = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(result) ? result : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readOnlyAfterOf(record: Pick<AccountPlanRecord, "plan" | "trialEndsAt" | "expiresAt">): number | null {
  if (record.plan === "owner") return null;
  if (isPaidPlan(record.plan)) {
    if (record.expiresAt === null) return null;
    return Math.max(record.expiresAt, record.trialEndsAt);
  }
  return record.trialEndsAt;
}

export function normalizePlanRecord(raw: unknown, uid: string): AccountPlanRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!isPlanId(data.plan)) return null;
  const createdAt = millis(data.createdAt) ?? millis(data.trialStartedAt) ?? 0;
  const trialStartedAt = millis(data.trialStartedAt) ?? createdAt;
  const trialEndsAt = millis(data.trialEndsAt) ?? trialStartedAt + TRIAL_MS;
  const expiresAt = isPaidPlan(data.plan) ? millis(data.expiresAt) : null;
  const source = typeof data.source === "string" && (PLAN_SOURCES as readonly string[]).includes(data.source)
    ? (data.source as PlanSource)
    : "system";
  const record: AccountPlanRecord = {
    uid,
    email: (text(data.email) ?? "").toLowerCase(),
    plan: data.plan,
    trialStartedAt,
    trialEndsAt,
    expiresAt,
    readOnlyAfter: null,
    source,
    note: text(data.note),
    createdAt,
    updatedAt: millis(data.updatedAt) ?? createdAt,
    updatedBy: text(data.updatedBy),
  };
  record.readOnlyAfter = readOnlyAfterOf(record);
  return record;
}

export function normalizeHistoryEntry(id: string, raw: unknown): PlanHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const snapshot = (value: unknown): PlanHistoryEntry["to"] | null => {
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (!isPlanId(entry.plan)) return null;
    return {
      plan: entry.plan,
      expiresAt: millis(entry.expiresAt),
      trialEndsAt: millis(entry.trialEndsAt) ?? 0,
    };
  };
  const to = snapshot(data.to);
  if (!to) return null;
  const source = typeof data.source === "string" && (PLAN_SOURCES as readonly string[]).includes(data.source)
    ? (data.source as PlanSource)
    : "system";
  return {
    id,
    at: millis(data.at) ?? 0,
    by: text(data.by),
    byEmail: text(data.byEmail),
    source,
    note: text(data.note),
    from: snapshot(data.from),
    to,
  };
}

export function guestEntitlements(): Entitlements {
  return {
    plan: "guest",
    tier: "owner",
    status: "guest",
    readOnly: false,
    limits: UNLIMITED,
    features: ALL_FEATURES,
    trialEndsAt: null,
    expiresAt: null,
    provisional: false,
  };
}

function provisionalEntitlements(): Entitlements {
  return {
    plan: "free",
    tier: TRIAL_TIER,
    status: "trial",
    readOnly: false,
    limits: PLAN_LIMITS[TRIAL_TIER],
    features: PLAN_FEATURES[TRIAL_TIER],
    trialEndsAt: null,
    expiresAt: null,
    provisional: true,
  };
}

export function resolveEntitlements(record: AccountPlanRecord | null, now: number): Entitlements {
  if (!record) return provisionalEntitlements();

  if (record.plan === "owner") {
    return {
      plan: "owner",
      tier: "owner",
      status: "owner",
      readOnly: false,
      limits: PLAN_LIMITS.owner,
      features: PLAN_FEATURES.owner,
      trialEndsAt: null,
      expiresAt: null,
      provisional: false,
    };
  }

  if (isPaidPlan(record.plan) && (record.expiresAt === null || now < record.expiresAt)) {
    return {
      plan: record.plan,
      tier: record.plan,
      status: "active",
      readOnly: false,
      limits: PLAN_LIMITS[record.plan],
      features: PLAN_FEATURES[record.plan],
      trialEndsAt: record.trialEndsAt,
      expiresAt: record.expiresAt,
      provisional: false,
    };
  }

  if (now < record.trialEndsAt) {
    return {
      plan: record.plan,
      tier: TRIAL_TIER,
      status: "trial",
      readOnly: false,
      limits: PLAN_LIMITS[TRIAL_TIER],
      features: PLAN_FEATURES[TRIAL_TIER],
      trialEndsAt: record.trialEndsAt,
      expiresAt: record.expiresAt,
      provisional: false,
    };
  }

  return {
    plan: record.plan,
    tier: null,
    status: record.plan === "free" ? "trial_ended" : "expired",
    readOnly: true,
    limits: UNLIMITED,
    features: READ_ONLY_FEATURES,
    trialEndsAt: record.trialEndsAt,
    expiresAt: record.expiresAt,
    provisional: false,
  };
}

export function daysUntil(timestamp: number | null, now: number): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.ceil((timestamp - now) / DAY_MS));
}

export function nextChangeAt(record: AccountPlanRecord | null, now: number): number | null {
  if (!record || record.plan === "owner") return null;
  const moments = [record.trialEndsAt, record.expiresAt].filter(
    (value): value is number => typeof value === "number" && value > now
  );
  return moments.length ? Math.min(...moments) : null;
}

export function newPlanRecord(input: {
  uid: string;
  email: string;
  plan: PlanId;
  now: number;
  source: PlanSource;
  updatedBy: string | null;
}): AccountPlanRecord {
  const record: AccountPlanRecord = {
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    plan: input.plan,
    trialStartedAt: input.now,
    trialEndsAt: input.now + TRIAL_MS,
    expiresAt: null,
    readOnlyAfter: null,
    source: input.source,
    note: null,
    createdAt: input.now,
    updatedAt: input.now,
    updatedBy: input.updatedBy,
  };
  record.readOnlyAfter = readOnlyAfterOf(record);
  return record;
}
