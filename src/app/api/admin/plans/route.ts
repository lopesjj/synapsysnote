import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/api/session";
import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import {
  ACCOUNT_PLANS,
  OwnerLockedError,
  ensureAccountPlan,
  listPlanHistory,
  loadAccountPlan,
  setAccountPlan,
} from "@/lib/plans/server";
import { normalizePlanRecord, type AccountPlanRecord } from "@/lib/plans/entitlements";
import { isAssignablePlan, isPaidPlan, isPlanId } from "@/lib/plans/definitions";

export const runtime = "nodejs";

const LIST_LIMIT = 50;
const QUERY_MAX = 200;

interface AccountRow {
  uid: string;
  email: string;
  displayName: string | null;
  disabled: boolean;
  createdAt: number | null;
  lastSignInAt: number | null;
  record: AccountPlanRecord | null;
}

async function requireOwner(request: Request) {
  if (isCrossSiteRequest(request)) throw new ApiError(403, "forbidden");
  const user = await requireUser(request);
  const record = await ensureAccountPlan({
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified === true,
  });
  if (record.plan !== "owner") throw new ApiError(403, "owner_only");
  return user;
}

function timeOf(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function describe(entries: Array<{ uid: string; record: AccountPlanRecord | null }>): Promise<AccountRow[]> {
  if (!entries.length) return [];
  const found = await adminAuth().getUsers(entries.map((entry) => ({ uid: entry.uid })));
  const byUid = new Map(found.users.map((user) => [user.uid, user]));
  return entries.map(({ uid, record }) => {
    const user = byUid.get(uid);
    return {
      uid,
      email: (user?.email ?? record?.email ?? "").toLowerCase(),
      displayName: user?.displayName ?? null,
      disabled: Boolean(user?.disabled),
      createdAt: timeOf(user?.metadata.creationTime),
      lastSignInAt: timeOf(user?.metadata.lastSignInTime),
      record,
    };
  });
}

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const url = new URL(request.url);
    const uid = url.searchParams.get("uid")?.trim();
    if (uid) {
      const [rows, history] = await Promise.all([
        loadAccountPlan(uid).then((record) => describe([{ uid, record }])),
        listPlanHistory(uid),
      ]);
      return Response.json({ account: rows[0] ?? null, history, now: Date.now() });
    }

    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, QUERY_MAX);
    const planFilter = url.searchParams.get("plan");
    const collection = adminDb().collection(ACCOUNT_PLANS);
    let entries: Array<{ uid: string; record: AccountPlanRecord | null }> = [];

    if (query.includes("@")) {
      const user = await adminAuth()
        .getUserByEmail(query)
        .catch(() => null);
      if (user) entries.push({ uid: user.uid, record: await loadAccountPlan(user.uid) });
    }
    if (!entries.length) {
      const snap = query
        ? await collection
            .where("email", ">=", query)
            .where("email", "<", `${query}\uf8ff`)
            .orderBy("email")
            .limit(LIST_LIMIT)
            .get()
        : isPlanId(planFilter)
          ? await collection.where("plan", "==", planFilter).limit(LIST_LIMIT).get()
          : await collection.orderBy("updatedAt", "desc").limit(LIST_LIMIT).get();
      entries = snap.docs.map((doc) => ({ uid: doc.id, record: normalizePlanRecord(doc.data(), doc.id) }));
    }
    if (query && isPlanId(planFilter)) entries = entries.filter((entry) => entry.record?.plan === planFilter);

    return Response.json({ accounts: await describe(entries), now: Date.now() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = (await request.json().catch(() => ({}))) as {
      uid?: unknown;
      plan?: unknown;
      expiresAt?: unknown;
      trialEndsAt?: unknown;
      note?: unknown;
    };
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    if (!uid) throw new ApiError(400, "invalid_uid");
    if (!isAssignablePlan(body.plan)) throw new ApiError(400, "invalid_plan");
    if (uid === owner.uid) throw new ApiError(403, "self_locked");

    const target = await adminAuth()
      .getUser(uid)
      .catch(() => null);
    if (!target) throw new ApiError(404, "account_not_found");

    const now = Date.now();
    let expiresAt: number | null = null;
    if (isPaidPlan(body.plan) && body.expiresAt !== null && body.expiresAt !== undefined) {
      if (typeof body.expiresAt !== "number" || !Number.isFinite(body.expiresAt) || body.expiresAt <= now) {
        throw new ApiError(400, "invalid_expiry");
      }
      expiresAt = Math.round(body.expiresAt);
    }

    let trialEndsAt: number | undefined;
    if (body.trialEndsAt !== undefined && body.trialEndsAt !== null) {
      if (typeof body.trialEndsAt !== "number" || !Number.isFinite(body.trialEndsAt) || body.trialEndsAt < 0) {
        throw new ApiError(400, "invalid_trial");
      }
      trialEndsAt = Math.round(body.trialEndsAt);
    }

    const note = typeof body.note === "string" ? body.note : body.note === null ? null : undefined;

    const record = await setAccountPlan(
      uid,
      { plan: body.plan, expiresAt, trialEndsAt, note },
      { uid: owner.uid, email: owner.email ?? null, source: "admin" },
      { identity: { email: target.email ?? "", emailVerified: target.emailVerified }, protectOwner: true }
    ).catch((error) => {
      if (error instanceof OwnerLockedError) throw new ApiError(403, "owner_locked");
      throw error;
    });

    return Response.json({ record, now: Date.now() });
  } catch (error) {
    return jsonError(error);
  }
}
