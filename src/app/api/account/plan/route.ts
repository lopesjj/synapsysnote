import { requireUser } from "@/lib/api/session";
import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { ensureAccountPlan } from "@/lib/plans/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "forbidden");
    const user = await requireUser(request);
    const record = await ensureAccountPlan({
      uid: user.uid,
      email: user.email ?? "",
      emailVerified: user.emailVerified === true,
    });
    return Response.json({ record, now: Date.now() });
  } catch (error) {
    return jsonError(error);
  }
}
