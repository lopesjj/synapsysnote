import { ensureWorkspace, requireUser, workspaceIdFor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
    const workspaceId = await ensureWorkspace(user, body.workspaceId || workspaceIdFor(user.uid));
    return Response.json({ workspaceId });
  } catch (error) {
    return jsonError(error);
  }
}
