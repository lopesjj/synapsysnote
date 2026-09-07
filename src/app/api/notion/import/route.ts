import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { enqueueNotionImport, runNotionImportStep } from "@/lib/notion/server/run-import";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/notion/import
 *
 * Enqueues an import job via Firebase Admin and returns the jobId.
 * The client then pumps steps via PUT /api/notion/import while the wizard
 * listens to the job document for live progress.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      selection?: { notionIds: string[]; importAll: boolean };
      targetNotebookId?: string | null;
      options?: {
        downloadMedia?: boolean;
        preserveHierarchy?: boolean;
        runOcr?: boolean;
        createBacklinks?: boolean;
      };
      items?: { notionId: string; title: string; type: "page" | "database" }[];
    };

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }
    if (!body.selection?.notionIds?.length) {
      return Response.json({ error: "Seleção vazia" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, workspaceId);
    const jobId = await enqueueNotionImport({
      workspaceId,
      uid: user.uid,
      selection: body.selection,
      targetNotebookId: body.targetNotebookId ?? null,
      options: {
        downloadMedia: body.options?.downloadMedia ?? true,
        preserveHierarchy: body.options?.preserveHierarchy ?? true,
        runOcr: body.options?.runOcr ?? true,
        createBacklinks: body.options?.createBacklinks ?? true,
      },
      items: body.items ?? [],
    });

    return Response.json({ jobId });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * PUT /api/notion/import  { workspaceId, jobId }
 *
 * Runs a slice/batch of the import job within an active HTTP connection.
 * Guarantees 100% CPU on Google Cloud Run without hitting serverless timeouts.
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string; jobId?: string };
    if (!body.workspaceId || !body.jobId) {
      return Response.json({ error: "workspaceId e jobId são obrigatórios" }, { status: 400 });
    }
    await requireWorkspaceEditor(request, body.workspaceId);
    const result = await runNotionImportStep(body.workspaceId, body.jobId);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
