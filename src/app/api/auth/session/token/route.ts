import { ApiError, jsonError } from "@/lib/api/errors";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { readSessionCookies } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!isAdminConfigured()) {
      throw new ApiError(503, "Firebase Admin não configurado.");
    }

    const cookies = await readSessionCookies();
    if (!cookies.length) throw new ApiError(401, "Sessão ausente");

    for (const cookie of cookies) {
      try {
        const decoded = await adminAuth().verifySessionCookie(cookie, true);
        const token = await adminAuth().createCustomToken(decoded.uid);
        return Response.json({ token });
      } catch {}
    }

    throw new ApiError(401, "Sessão inválida ou expirada");
  } catch (error) {
    console.error("[auth-session-token] Erro ao recuperar token de sessão:", error);
    if (error instanceof ApiError) return jsonError(error);
    return jsonError(new ApiError(401, "Sessão inválida ou expirada"));
  }
}
