import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import type { ImportJobItem, ImportJobStatus } from "@/types/models";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RecordImportBody {
  workspaceId?: string;
  provider?: string;
  title?: string;
  totalPages?: number;
  processedPages?: number;
  totalFiles?: number;
  processedFiles?: number;
  status?: ImportJobStatus;
  items?: ImportJobItem[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordImportBody;
    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, workspaceId);
    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const ref = adminDb()
      .collection("workspaces")
      .doc(workspaceId)
      .collection("import_jobs")
      .doc(jobId);

    const items: ImportJobItem[] =
      body.items && body.items.length
        ? body.items
        : [
            {
              notionId: "import_item",
              title: body.title || "Importação",
              type: "page",
              status: "done",
            },
          ];

    await ref.set({
      id: jobId,
      provider: body.provider || "generic",
      status: body.status || "completed",
      currentStep: "Concluído",
      totalPages: body.totalPages ?? items.length,
      processedPages: body.processedPages ?? items.length,
      totalFiles: body.totalFiles ?? 0,
      processedFiles: body.processedFiles ?? 0,
      totalBytes: 0,
      errors: [],
      items,
      selection: { notionIds: [], importAll: false },
      targetNotebookId: null,
      options: {
        downloadMedia: true,
        preserveHierarchy: true,
        createBacklinks: false,
      },
      requestedBy: user.uid,
      startedAt: FieldValue.serverTimestamp(),
      finishedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ jobId });
  } catch (error) {
    return jsonError(error);
  }
}
