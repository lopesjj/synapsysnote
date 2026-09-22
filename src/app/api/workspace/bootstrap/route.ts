import { ensureWorkspace, requireUser, workspaceIdFor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { isSupportedLanguage } from "@/lib/i18n/locale";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; language?: string };
    const language = isSupportedLanguage(body.language) ? body.language : undefined;
    const workspaceId = await ensureWorkspace(user, body.workspaceId || workspaceIdFor(user.uid), language);
    return Response.json({ workspaceId });
  } catch (error) {
    return jsonError(error);
  }
}
