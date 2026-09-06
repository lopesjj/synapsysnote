import { ApiError, jsonError } from "@/lib/api/errors";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { readSessionCookies } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

/**
 * GET /api/auth/session/token
 *
 * The app host has no IndexedDB session from the apex login. Verify the shared
 * cookie and mint a custom token so the client can `signInWithCustomToken`.
 */
export async function GET() {
  try {
    if (!isAdminConfigured()) {
      throw new ApiError(503, "Firebase Admin não configurado.");
    }

    const cookies = await readSessionCookies();
    if (!cookies.length) throw new ApiError(401, "Sessão ausente");

    // A browser can send a legacy host-only cookie together with the current
    // parent-domain cookie. Verify each candidate instead of rejecting a valid
    // session just because the first value is stale.
    for (const cookie of cookies) {
      try {
        const decoded = await adminAuth().verifySessionCookie(cookie, true);
        const token = await adminAuth().createCustomToken(decoded.uid);
        return Response.json({ token });
      } catch {
        // Try the next cookie; the final response below remains deliberately
        // indistinguishable from a missing session.
      }
    }

    throw new ApiError(401, "Sessão inválida ou expirada");
  } catch (error) {
    console.error("[auth-session-token] Erro ao recuperar token de sessão:", error);
    if (error instanceof ApiError) return jsonError(error);
    return jsonError(new ApiError(401, "Sessão inválida ou expirada"));
  }
}
