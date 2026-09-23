import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { deleteAccount } from "@/lib/account/account-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const RECENT_LOGIN_SECONDS = 10 * 60;

export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    if (!isAdminConfigured()) throw new ApiError(503, "Firebase Admin não configurado.");
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new ApiError(401, "Login obrigatório");

    let decoded: Awaited<ReturnType<ReturnType<typeof adminAuth>["verifyIdToken"]>>;
    try {
      decoded = await adminAuth().verifyIdToken(header.slice(7), true);
    } catch {
      throw new ApiError(401, "Sessão inválida ou expirada");
    }
    if (Date.now() / 1000 - decoded.auth_time > RECENT_LOGIN_SECONDS) {
      throw new ApiError(401, "RECENT_LOGIN_REQUIRED");
    }

    const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
    if (body.confirm !== true) throw new ApiError(400, "Confirmação ausente");

    const summary = await deleteAccount(decoded.uid);
    await clearSessionCookie();
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    return jsonError(error);
  }
}
