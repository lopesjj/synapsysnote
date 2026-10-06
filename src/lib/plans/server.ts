import "server-only";

import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isDevSessionUser } from "@/lib/api/app-session";
import { isPaidPlan, isPlanId, type FeatureKey, type PlanId } from "./definitions";
import {
  newPlanRecord,
  normalizeHistoryEntry,
  normalizePlanRecord,
  readOnlyAfterOf,
  resolveEntitlements,
  type AccountPlanRecord,
  type Entitlements,
  type PlanHistoryEntry,
  type PlanSource,
} from "./entitlements";
import { PlanError } from "./errors";
import type { GoalState, WorkspaceState } from "./usage";

export const ACCOUNT_PLANS = "account_plans";
const NOTE_MAX = 500;

export class OwnerLockedError extends Error {
  constructor() {
    super("owner_locked");
    this.name = "OwnerLockedError";
  }
}

export interface PlanIdentity {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
}

export interface PlanActor {
  uid: string | null;
  email: string | null;
  source: PlanSource;
}

export interface PlanChange {
  plan: PlanId;
  expiresAt?: number | null;
  trialEndsAt?: number;
  note?: string | null;
}

export function ownerEmails(): Set<string> {
  return new Set(
    (process.env.OWNER_EMAILS ?? "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function planRef(uid: string): DocumentReference {
  return adminDb().collection(ACCOUNT_PLANS).doc(uid);
}

function recordDoc(record: AccountPlanRecord): Record<string, unknown> {
  return {
    uid: record.uid,
    email: record.email,
    plan: record.plan,
    trialStartedAt: record.trialStartedAt,
    trialEndsAt: record.trialEndsAt,
    expiresAt: record.expiresAt,
    readOnlyAfter: record.readOnlyAfter,
    source: record.source,
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

function writeHistory(
  tx: Transaction,
  ref: DocumentReference,
  previous: AccountPlanRecord | null,
  next: AccountPlanRecord,
  actor: PlanActor
) {
  tx.set(ref.collection("history").doc(), {
    at: next.updatedAt,
    by: actor.uid,
    byEmail: actor.email,
    source: actor.source,
    note: next.note,
    from: previous
      ? { plan: previous.plan, expiresAt: previous.expiresAt, trialEndsAt: previous.trialEndsAt }
      : null,
    to: { plan: next.plan, expiresAt: next.expiresAt, trialEndsAt: next.trialEndsAt },
  });
}

async function resolveIdentity(input: PlanIdentity): Promise<{ email: string; emailVerified: boolean }> {
  if (typeof input.email === "string" && typeof input.emailVerified === "boolean") {
    return { email: input.email, emailVerified: input.emailVerified };
  }
  const user = await adminAuth()
    .getUser(input.uid)
    .catch(() => null);
  return {
    email: input.email ?? user?.email ?? "",
    emailVerified: input.emailVerified ?? user?.emailVerified ?? false,
  };
}

function isOwnerIdentity(identity: { email: string; emailVerified: boolean }): boolean {
  return identity.emailVerified && Boolean(identity.email) && ownerEmails().has(identity.email.trim().toLowerCase());
}

export async function loadAccountPlan(uid: string): Promise<AccountPlanRecord | null> {
  const snap = await planRef(uid).get();
  return snap.exists ? normalizePlanRecord(snap.data(), uid) : null;
}

export async function ensureAccountPlan(input: PlanIdentity): Promise<AccountPlanRecord> {
  const ref = planRef(input.uid);
  const current = await ref.get();
  if (current.exists) {
    const record = normalizePlanRecord(current.data(), input.uid);
    if (record) {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      if (email && email !== record.email) {
        await ref.update({ email }).catch(() => undefined);
        record.email = email;
      }
      if (record.plan === "owner" || typeof input.emailVerified !== "boolean") return record;
      const identity = { email: email || record.email, emailVerified: input.emailVerified };
      if (!isOwnerIdentity(identity)) return record;
      return setAccountPlan(
        input.uid,
        { plan: "owner" },
        { uid: null, email: null, source: "owner-env" },
        { identity }
      );
    }
  }

  const identity = await resolveIdentity(input);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? normalizePlanRecord(snap.data(), input.uid) : null;
    if (existing) return existing;
    const owner = isOwnerIdentity(identity);
    const record = newPlanRecord({
      uid: input.uid,
      email: identity.email,
      plan: owner ? "owner" : "free",
      now: Date.now(),
      source: owner ? "owner-env" : "signup",
      updatedBy: null,
    });
    tx.set(ref, recordDoc(record));
    writeHistory(tx, ref, null, record, { uid: null, email: null, source: record.source });
    return record;
  });
}

export async function setAccountPlan(
  uid: string,
  change: PlanChange,
  actor: PlanActor,
  options: { identity?: { email: string; emailVerified: boolean }; protectOwner?: boolean } = {}
): Promise<AccountPlanRecord> {
  if (!isPlanId(change.plan)) throw new Error("invalid_plan");
  const identity = options.identity ?? (await resolveIdentity({ uid }));
  const ref = planRef(uid);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? normalizePlanRecord(snap.data(), uid) : null;
    if (options.protectOwner && previous?.plan === "owner") throw new OwnerLockedError();
    const now = Date.now();
    const base =
      previous ??
      newPlanRecord({ uid, email: identity.email, plan: "free", now, source: actor.source, updatedBy: actor.uid });
    const keepExpiry = isPaidPlan(base.plan) ? base.expiresAt : null;
    const next: AccountPlanRecord = {
      ...base,
      email: (identity.email || base.email).trim().toLowerCase(),
      plan: change.plan,
      expiresAt: isPaidPlan(change.plan)
        ? change.expiresAt !== undefined
          ? change.expiresAt
          : keepExpiry
        : null,
      trialEndsAt: typeof change.trialEndsAt === "number" ? change.trialEndsAt : base.trialEndsAt,
      source: actor.source,
      note:
        change.note !== undefined
          ? (change.note ?? "").trim().slice(0, NOTE_MAX) || null
          : base.note,
      updatedAt: now,
      updatedBy: actor.uid,
    };
    next.readOnlyAfter = readOnlyAfterOf(next);
    tx.set(ref, recordDoc(next));
    writeHistory(tx, ref, previous, next, actor);
    return next;
  });
}

export async function listPlanHistory(uid: string, limit = 20): Promise<PlanHistoryEntry[]> {
  const snap = await planRef(uid).collection("history").orderBy("at", "desc").limit(limit).get();
  return snap.docs
    .map((doc) => normalizeHistoryEntry(doc.id, doc.data()))
    .filter((entry): entry is PlanHistoryEntry => entry !== null);
}

export async function entitlementsFor(identity: PlanIdentity): Promise<Entitlements> {
  const record = await ensureAccountPlan(identity);
  return resolveEntitlements(record, Date.now());
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function loadWorkspaceUsageState(workspaceId: string): Promise<WorkspaceState> {
  const workspace = adminDb().collection("workspaces").doc(workspaceId);
  const [notebooks, pages] = await Promise.all([
    workspace.collection("notebooks").select("parentId", "archived", "archivedFromParentId", "deletedAt", "trashedWith").get(),
    workspace.collection("pages").select("notebookId", "parentPageId", "path", "archived", "deletedAt", "trashedWith").get(),
  ]);
  return {
    notebooks: notebooks.docs.map((doc) => ({
      id: doc.id,
      parentId: optionalString(doc.get("parentId")),
      archived: doc.get("archived") === true,
      archivedFromParentId: optionalString(doc.get("archivedFromParentId")),
      deletedAt: doc.get("deletedAt") ? 1 : null,
      trashedWith: optionalString(doc.get("trashedWith")),
    })),
    pages: pages.docs.map((doc) => {
      const path = doc.get("path");
      return {
        id: doc.id,
        notebookId: optionalString(doc.get("notebookId")),
        parentPageId: optionalString(doc.get("parentPageId")),
        path: Array.isArray(path) ? path.filter((entry): entry is string => typeof entry === "string") : [],
        archived: doc.get("archived") === true,
        deletedAt: doc.get("deletedAt") ? 1 : null,
        trashedWith: optionalString(doc.get("trashedWith")),
      };
    }),
  };
}

export async function loadGoalStates(workspaceId: string): Promise<GoalState[]> {
  const snap = await adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("study_plans")
    .select("archived")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, archived: doc.get("archived") === true }));
}

export interface PlanRequirement {
  write?: boolean;
  feature?: FeatureKey;
}

export async function assertPlanAllows(uid: string | null, requirement: PlanRequirement): Promise<Entitlements | null> {
  if (!uid || isDevSessionUser(uid)) return null;
  const entitlements = await entitlementsFor({ uid });
  if (requirement.write && entitlements.readOnly) throw PlanError.readOnly();
  if (requirement.feature && !entitlements.features[requirement.feature]) {
    throw entitlements.readOnly ? PlanError.readOnly() : PlanError.feature(requirement.feature);
  }
  return entitlements;
}
