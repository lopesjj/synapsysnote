import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { recordAccess } from "@/lib/auth/access-log-server";

export const runtime = "nodejs";

/**
 * Abertura do app com a sessao do Firebase ja guardada no navegador. O login
 * em si e registrado pelo servidor ao criar o cookie de sessao.
 */
export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const user = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { event?: string };
    await recordAccess(request, user, body?.event === "login" ? "login" : "session");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Falha ao registrar acesso" }, { status: 401 });
  }
}
