import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { integrationRef } from "@/lib/notion/server/client";
import {
  disconnectedIntegrationPatch,
  readStoredToken,
  revokeNotionToken,
} from "@/lib/import/integration-disconnect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }
    await requireWorkspaceEditor(request, body.workspaceId);
    const ref = integrationRef(body.workspaceId);
    const secureRef = ref.collection("secure").doc("token");
    const secret = await secureRef.get().catch(() => null);
    await revokeNotionToken(readStoredToken(secret?.get("accessTokenCipher")));
    await ref.set(disconnectedIntegrationPatch("notion"), { merge: true });
    await secureRef.delete().catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
