import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { clearEvernoteConnection } from "@/lib/evernote/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, body.workspaceId);
    await clearEvernoteConnection(body.workspaceId);

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
