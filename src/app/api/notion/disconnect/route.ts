import { FieldValue } from "firebase-admin/firestore";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { integrationRef } from "@/lib/notion/server/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }
    await requireWorkspaceEditor(request, body.workspaceId);
    const ref = integrationRef(body.workspaceId);
    await ref.set(
      { connected: false, revokedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await ref.collection("secure").doc("token").delete().catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
