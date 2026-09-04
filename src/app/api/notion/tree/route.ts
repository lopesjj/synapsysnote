import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { getNotionClient } from "@/lib/notion/server/client";
import { listNotionTree } from "@/lib/notion/server/tree";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/notion/tree?workspaceId=…
 *
 * Returns the hierarchical Notion tree for the Import Wizard using the Admin
 * SDK (no Cloud Function required).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }
    await requireWorkspaceEditor(request, workspaceId);
    const notion = await getNotionClient(workspaceId);
    const tree = await listNotionTree(notion);
    return Response.json({ tree });
  } catch (error) {
    return jsonError(error);
  }
}
