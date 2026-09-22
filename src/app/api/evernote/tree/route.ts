import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { getEvernoteClient, markEvernoteSync } from "@/lib/evernote/store";
import { listEvernoteNotebooks, listEvernoteNotes } from "@/lib/evernote/api";
import type { ImportTreeNode } from "@/types/models";

export const runtime = "nodejs";

const UNFILED_ID = "evernote_unfiled";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const query = url.searchParams.get("q")?.trim() || "";
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, workspaceId);
    const client = await getEvernoteClient(workspaceId);

    const notebooks = await listEvernoteNotebooks(client);
    const notes = await listEvernoteNotes(client, { query, limit: 300 });

    const notesByNotebook = new Map<string, ImportTreeNode[]>();
    const unfiled: ImportTreeNode[] = [];

    const notebookByName = new Map(
      notebooks.map((notebook) => [notebook.name.toLowerCase(), notebook])
    );

    for (const note of notes) {
      const node: ImportTreeNode = {
        id: note.id,
        title: note.title,
        kind: "document",
        modifiedTime: note.updatedAt,
      };

      const matched =
        (note.notebookId && notebooks.find((notebook) => notebook.id === note.notebookId)) ||
        (note.notebookName && notebookByName.get(note.notebookName.toLowerCase())) ||
        null;

      if (!matched) {
        unfiled.push(node);
        continue;
      }
      const bucket = notesByNotebook.get(matched.id) ?? [];
      bucket.push(node);
      notesByNotebook.set(matched.id, bucket);
    }

    if (!notes.length && notebooks.length) {
      for (const notebook of notebooks.slice(0, 25)) {
        const scoped = await listEvernoteNotes(client, {
          query,
          notebookId: notebook.id,
          notebookName: notebook.name,
          limit: 100,
        });
        if (!scoped.length) continue;
        notesByNotebook.set(
          notebook.id,
          scoped.map((note) => ({
            id: note.id,
            title: note.title,
            kind: "document" as const,
            modifiedTime: note.updatedAt,
          }))
        );
      }
    }

    const stacks = new Map<string, ImportTreeNode>();
    const roots: ImportTreeNode[] = [];

    for (const notebook of notebooks) {
      const children = notesByNotebook.get(notebook.id) ?? [];
      if (query && !children.length) continue;

      const node: ImportTreeNode = {
        id: notebook.id,
        title: notebook.name,
        kind: "container",
        icon: "📓",
        subtitle: notebook.stack ?? undefined,
        children,
      };

      if (notebook.stack) {
        const stackId = `evernote_stack_${notebook.stack}`;
        let stack = stacks.get(stackId);
        if (!stack) {
          stack = {
            id: stackId,
            title: notebook.stack,
            kind: "container",
            icon: "🗂️",
            children: [],
          };
          stacks.set(stackId, stack);
          roots.push(stack);
        }
        stack.children!.push(node);
        continue;
      }

      roots.push(node);
    }

    if (unfiled.length) {
      roots.push({
        id: UNFILED_ID,
        title: "Evernote",
        kind: "container",
        icon: "📓",
        children: unfiled,
      });
    }

    await markEvernoteSync(workspaceId);

    return Response.json({ tree: roots });
  } catch (error) {
    return jsonError(error);
  }
}
