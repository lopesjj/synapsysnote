import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { clientIpOf } from "@/lib/api/client-ip";
import { requireUser } from "@/lib/api/session";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

const RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const event = typeof body?.event === "string" ? body.event.slice(0, 32) : "access";
    const ip = clientIpOf(request);
    const userAgent = (request.headers.get("user-agent") || "").slice(0, 512);

    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + RETENTION_DAYS * DAY_MS);

    await adminDb().collection("access_logs").add({
      uid: user.uid,
      email: user.email || null,
      ip,
      userAgent,
      event,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao registrar acesso" }, { status: 401 });
  }
}
