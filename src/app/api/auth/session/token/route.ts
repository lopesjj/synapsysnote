import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { readSessionCookies } from "@/lib/auth/session-cookie";
import { recordAccess } from "@/lib/auth/access-log-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    if (!isAdminConfigured()) {
      throw new ApiError(503, "Firebase Admin não configurado.");
    }

    const cookies = await readSessionCookies();
    if (!cookies.length) throw new ApiError(401, "Sessão ausente");

    for (const cookie of cookies) {
      try {
        const decoded = await adminAuth().verifySessionCookie(cookie, true);
        const token = await adminAuth().createCustomToken(decoded.uid);
        await recordAccess(request, { uid: decoded.uid, email: decoded.email }, "session");
        return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
      } catch {}
    }

    throw new ApiError(401, "Sessão inválida ou expirada");
  } catch (error) {
    console.error("[auth-session-token] Erro ao recuperar token de sessão:", error);
    if (error instanceof ApiError) return jsonError(error);
    return jsonError(new ApiError(401, "Sessão inválida ou expirada"));
  }
}
