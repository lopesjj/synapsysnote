import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { revokeSessions } from "@/lib/account/account-server";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const user = await requireUser(request);
    await revokeSessions(user.uid);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
