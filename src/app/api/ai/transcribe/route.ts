import { requireWorkspaceEditor } from "@/lib/api/session";
import { ApiError, jsonError } from "@/lib/api/errors";
import { applyTranscriptToPage, transcribeStoragePath } from "@/lib/ai/transcribe-audio";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ai/transcribe
 *
 * Fallback (and local-dev primary) for voice-note transcription. Cloud
 * Functions may be undeployed or reject `audio/webm;codecs=opus`; this route
 * uses Admin SDK + Gemini with a stripped MIME type.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      pageId?: string;
      storagePath?: string;
    };

    const { workspaceId, pageId, storagePath } = body;
    if (!workspaceId || !pageId || !storagePath) {
      return Response.json(
        { error: "workspaceId, pageId e storagePath são obrigatórios" },
        { status: 400 }
      );
    }
    if (!storagePath.startsWith(`workspaces/${workspaceId}/`)) {
      throw new ApiError(403, "Caminho de áudio fora deste workspace");
    }

    await requireWorkspaceEditor(request, workspaceId);
    const result = await transcribeStoragePath(storagePath);
    await applyTranscriptToPage(workspaceId, pageId, storagePath, result);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
