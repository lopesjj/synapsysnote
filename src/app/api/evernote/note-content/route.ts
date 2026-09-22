import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { getEvernoteClient } from "@/lib/evernote/store";
import { getEvernoteNote } from "@/lib/evernote/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      noteId?: string;
    };
    if (!body.workspaceId || !body.noteId) {
      return Response.json({ error: "workspaceId e noteId são obrigatórios" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, body.workspaceId);

    const client = await getEvernoteClient(body.workspaceId);
    const note = await getEvernoteNote(client, body.noteId);

    return Response.json({
      title: note.title,
      content: note.content,
      contentType: note.contentType,
      tags: note.tags,
    });
  } catch (error) {
    return jsonError(error);
  }
}
