import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { buildGoogleDriveTree, markGoogleSync } from "@/lib/google/docs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const query = url.searchParams.get("q")?.trim() || "";
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, workspaceId);

    const tree = await buildGoogleDriveTree(workspaceId, query);
    await markGoogleSync(workspaceId);

    return Response.json({ tree });
  } catch (error) {
    return jsonError(error);
  }
}
