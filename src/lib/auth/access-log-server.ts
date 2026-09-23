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
  event: AccessLogEvent
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    await adminDb()
      .collection("access_logs")
      .add({
        uid: user.uid,
        email: user.email || null,
        ip: clientIpOf(request),
        userAgent: (request.headers.get("user-agent") || "").slice(0, 512),
        event,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ACCESS_LOG_RETENTION_DAYS * DAY_MS),
      });
  } catch (error) {
    // O login nao pode falhar por causa do registro; o erro fica no log.
    console.error("[access-log] falha ao registrar acesso", error);
  }
}
