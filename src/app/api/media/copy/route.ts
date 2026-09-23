import "server-only";

import { randomUUID } from "node:crypto";
import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { adminBucket, isAdminConfigured } from "@/lib/firebase/admin";
import { extractStoragePath } from "@/lib/trash/purge-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILES = 200;

function baseName(path: string): string {
  const name = path.split("/").pop() || "arquivo";
  // Tira o prefixo de tempo/id da copia anterior para o nome nao crescer a cada duplicacao.
  return name.replace(/^\d{10,}-[\w-]{6}-/, "").slice(-120) || "arquivo";
}

/**
 * Copia arquivos do Storage para a pasta da nota (ou dos icones) duplicada.
 * Sem isso a copia apontava para os mesmos objetos da original, e excluir uma
 * quebrava a outra.
 */
export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      pageId?: string;
      target?: "page" | "icons";
      sources?: unknown;
    };
    const { workspaceId } = body;
    if (!workspaceId) throw new ApiError(400, "workspaceId é obrigatório");
    await requireWorkspaceEditor(request, workspaceId);

    const target = body.target === "icons" ? "icons" : "page";
    const pageId = String(body.pageId ?? "");
    if (target === "page" && !/^[\w-]{1,80}$/.test(pageId)) throw new ApiError(400, "pageId inválido");
    if (!Array.isArray(body.sources)) throw new ApiError(400, "sources é obrigatório");
    if (body.sources.length > MAX_FILES) throw new ApiError(413, "Arquivos demais para copiar de uma vez");
    if (!isAdminConfigured()) return Response.json({ copies: {} });

    const bucket = adminBucket();
    const ownPrefix = `workspaces/${workspaceId}/`;
    const folder = target === "icons" ? `${ownPrefix}uploads/icons` : `${ownPrefix}uploads/${pageId}`;
    const copies: Record<string, { url: string; storagePath: string }> = {};

    for (const raw of body.sources) {
      if (typeof raw !== "string" || copies[raw]) continue;
      const source = extractStoragePath(raw);
      if (!source || !source.startsWith(ownPrefix)) continue;
      try {
        const token = randomUUID();
        const destination = `${folder}/${Date.now()}-${randomUUID().slice(0, 6)}-${baseName(source)}`;
        const destFile = bucket.file(destination);
        await bucket.file(source).copy(destFile);
        await destFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
        copies[raw] = {
          storagePath: destination,
          url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
            destination
          )}?alt=media&token=${token}`,
        };
      } catch (error) {
        // Arquivo sumido ou sem permissao: a copia fica com a referencia antiga.
        console.warn("[media-copy] falha ao copiar", source, error);
      }
    }

    return Response.json({ copies });
  } catch (error) {
    return jsonError(error);
  }
}
