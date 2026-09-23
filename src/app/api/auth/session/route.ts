import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { clearSessionCookie, sessionExpiresInMs, setSessionCookie } from "@/lib/auth/session-cookie";
import { recordAccess } from "@/lib/auth/access-log-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Um formulario de outro site (text/plain) poderia entrar aqui com o token
    // de outra conta e logar a vitima nela.
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new ApiError(415, "Formato de requisição inválido.");
    }
    if (!isAdminConfigured()) {
      throw new ApiError(503, "Firebase Admin não configurado.");
    }

    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
      remember?: boolean;
    };
    const idToken = body.idToken?.trim();
    if (!idToken) throw new ApiError(400, "Token de sessão ausente.");

    let decoded: Awaited<ReturnType<ReturnType<typeof adminAuth>["verifyIdToken"]>>;
    try {
      decoded = await adminAuth().verifyIdToken(idToken);
    } catch {
      throw new ApiError(401, "Sessão inválida ou expirada");
    }

    const remember = body.remember !== false;
    const expiresIn = sessionExpiresInMs(remember);
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn });
    await setSessionCookie(session, remember);
    await recordAccess(request, { uid: decoded.uid, email: decoded.email }, "login");
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
