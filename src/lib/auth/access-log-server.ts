import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clientIpOf } from "@/lib/api/client-ip";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";

/**
 * Registro de acesso exigido pelo art. 15 do Marco Civil (6 meses). A folga
 * cobre o mes mais longo: 180 dias ficavam abaixo de 6 meses de calendario.
 * O TTL do Firestore em `expiresAt` apaga os registros vencidos.
 */
export const ACCESS_LOG_RETENTION_DAYS = 190;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessLogEvent = "login" | "session";

export async function recordAccess(
  request: Request,
  user: { uid: string; email?: string | null },
  event: AccessLogEvent,
  clientUserAgentOverride?: string | null,
  clientIpOverride?: string | null
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    const rawClientHeader = request.headers.get("x-client-user-agent");
    let headerUserAgent = "";
    if (rawClientHeader) {
      try {
        headerUserAgent = decodeURIComponent(rawClientHeader);
      } catch {
        headerUserAgent = rawClientHeader;
      }
    }
    const serverUserAgent = (request.headers.get("user-agent") || "").slice(0, 512);
    const candidate =
      (clientUserAgentOverride?.trim()) ||
      (headerUserAgent?.trim()) ||
      (serverUserAgent !== "Google" ? serverUserAgent : "") ||
      serverUserAgent;

    const resolvedIp = clientIpOverride?.trim() || clientIpOf(request);

    await adminDb()
      .collection("access_logs")
      .add({
        uid: user.uid,
        email: user.email || null,
        ip: resolvedIp,
        userAgent: candidate.slice(0, 512),
        event,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ACCESS_LOG_RETENTION_DAYS * DAY_MS),
      });
  } catch (error) {
    console.error("[access-log] falha ao registrar acesso", error);
  }
}
