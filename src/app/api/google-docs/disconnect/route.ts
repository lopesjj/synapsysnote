import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";

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

      await db.runTransaction(async (tx) => {
        tx.set(
          integrationRef,
          {
            connected: false,
            revokedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.delete(integrationRef.collection("secure").doc("token"));
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
