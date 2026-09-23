import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import {
  disconnectedIntegrationPatch,
  readStoredToken,
  revokeGoogleToken,
} from "@/lib/import/integration-disconnect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, body.workspaceId);

    if (isAdminConfigured()) {
      const db = adminDb();
      const integrationRef = db
        .collection("workspaces")
        .doc(body.workspaceId)
        .collection("integrations")
        .doc("google-docs");
      const secureRef = integrationRef.collection("secure").doc("token");

      const secret = await secureRef.get().catch(() => null);
      await revokeGoogleToken(
        readStoredToken(secret?.get("refreshTokenCipher")) ??
          readStoredToken(secret?.get("accessTokenCipher"))
      );

      await db.runTransaction(async (tx) => {
        tx.set(integrationRef, disconnectedIntegrationPatch("google-docs"), { merge: true });
        tx.delete(secureRef);
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
