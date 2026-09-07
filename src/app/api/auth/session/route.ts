import { ApiError, jsonError } from "@/lib/api/errors";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { clearSessionCookie, sessionExpiresInMs, setSessionCookie } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      throw new ApiError(503, "Firebase Admin não configurado.");
    }

    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
      remember?: boolean;
    };
    const idToken = body.idToken?.trim();
    if (!idToken) throw new ApiError(400, "Token de sessão ausente.");

    const remember = body.remember !== false;
    const expiresIn = sessionExpiresInMs(remember);
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn });
    await setSessionCookie(session, remember);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[auth-session] Erro ao criar cookie de sessão:", error);
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
