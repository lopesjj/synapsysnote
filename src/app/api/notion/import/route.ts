import { after } from "next/server";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { enqueueNotionImport, runNotionImportJob } from "@/lib/notion/server/run-import";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/notion/import
 *
 * Enqueues an import job via Firebase Admin and starts the worker after the
 * response is sent. The wizard listens to the job document for live progress.
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

    after(async () => {
      await runNotionImportJob(workspaceId, jobId);
    });

    return Response.json({ jobId });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * PUT /api/notion/import  { workspaceId, jobId }
 *
 * Resume/run a pending job. The client fires this as a backup in case `after()`
 * is not available on the hosting platform.
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string; jobId?: string };
    if (!body.workspaceId || !body.jobId) {
      return Response.json({ error: "workspaceId e jobId são obrigatórios" }, { status: 400 });
    }
    await requireWorkspaceEditor(request, body.workspaceId);
    await runNotionImportJob(body.workspaceId, body.jobId);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
