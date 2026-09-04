import { ensureWorkspace, requireUser, workspaceIdFor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";

export const runtime = "nodejs";

/**
 * POST /api/workspace/bootstrap
 *
 * Provisions the signed-in user's workspace and owner membership through the
 * Admin SDK so the first write is never rejected by security rules.
 */
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
