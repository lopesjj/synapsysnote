import { randomUUID } from "node:crypto";
import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { assertPlanAllows } from "@/lib/plans/server";
import { PlanError } from "@/lib/plans/errors";
import { isVideoMedia } from "@/lib/plans/definitions";

export const runtime = "nodejs";
export const maxDuration = 180;

const accessCache = new Map<string, { allowed: boolean; expires: number }>();

function checkCachedAccess(userId: string, workspaceId: string): boolean | null {
  if (workspaceId === `ws_${userId}`) return true;
  const key = `${userId}:${workspaceId}`;
  const entry = accessCache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.allowed;
  }
  return null;
}

function setCachedAccess(userId: string, workspaceId: string, allowed: boolean): void {
  const key = `${userId}:${workspaceId}`;
  accessCache.set(key, { allowed, expires: Date.now() + 60000 });
}

function sanitizeStoragePath(rawPath: string, workspaceId: string): string {
  let cleaned = rawPath.replace(/^\/+/, "");
  if (!cleaned.startsWith(`workspaces/${workspaceId}/`)) {
    if (cleaned.startsWith("workspaces/")) {
      const parts = cleaned.split("/");
      parts[1] = workspaceId;
      cleaned = parts.join("/");
    } else {
      cleaned = `workspaces/${workspaceId}/${cleaned}`;
    }
  }
  return cleaned;
}

export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    if (!isAdminConfigured()) throw new ApiError(500, "Firebase Admin não configurado");

    const user = await requireUser(request);
    const form = await request.formData();
    const workspaceId = (form.get("workspaceId") as string) || `ws_${user.uid}`;

    let allowed = checkCachedAccess(user.uid, workspaceId);
    if (allowed === null) {
      const db = adminDb();
      const wsRef = db.collection("workspaces").doc(workspaceId);
      const wsSnap = await wsRef.get();
      if (wsSnap.exists) {
        const ownerId = wsSnap.get("ownerId") as string;
        const memberIds = (wsSnap.get("memberIds") as string[]) || [];
        allowed = ownerId === user.uid || memberIds.includes(user.uid);
      } else {
        allowed = true;
      }
      setCachedAccess(user.uid, workspaceId, Boolean(allowed));
    }

    if (!allowed) {
      throw new ApiError(403, "Acesso não autorizado ao workspace");
    }

    const rawFiles = form.getAll("file") as File[];
    const fallbackFiles = rawFiles.length > 0 ? rawFiles : (form.getAll("files") as File[]);
    const rawPaths = form.getAll("storagePath") as string[];
    const fallbackPaths = rawPaths.length > 0 ? rawPaths : (form.getAll("storagePaths") as string[]);
    const rawTokens = form.getAll("token") as string[];
    const fallbackTokens = rawTokens.length > 0 ? rawTokens : (form.getAll("tokens") as string[]);

    if (fallbackFiles.length === 0 || fallbackPaths.length === 0) {
      throw new ApiError(400, "Arquivo ou caminho de armazenamento ausente");
    }

    const entitlements = await assertPlanAllows(user.uid, { write: true });
    if (
      entitlements &&
      !entitlements.features.video &&
      fallbackFiles.some((file, index) =>
        isVideoMedia({ name: file?.name || fallbackPaths[index], type: file?.type })
      )
    ) {
      throw PlanError.feature("video");
    }

    const bucket = adminBucket();
    const bucketName = bucket.name;

    const count = Math.min(fallbackFiles.length, fallbackPaths.length);
    const uploadTasks: Promise<{ storagePath: string; url: string }>[] = [];

    for (let i = 0; i < count; i++) {
      const file = fallbackFiles[i];
      const rawPath = fallbackPaths[i];
      const preferredToken = fallbackTokens[i];

      if (!file || !rawPath) continue;

      const storagePath = sanitizeStoragePath(rawPath, workspaceId);
      const token = preferredToken && /^[a-zA-Z0-9_-]{10,}$/.test(preferredToken)
        ? preferredToken
        : randomUUID();

      uploadTasks.push(
        (async () => {
          const buffer = Buffer.from(await file.arrayBuffer());
          const bucketFile = bucket.file(storagePath);

          await bucketFile.save(buffer, {
            contentType: file.type || "application/octet-stream",
            metadata: {
              metadata: {
                firebaseStorageDownloadTokens: token,
                restoredAt: new Date().toISOString(),
                originalName: file.name,
              },
            },
          });

          const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
            storagePath
          )}?alt=media&token=${token}`;

          return { storagePath, url };
        })()
      );
    }

    const results = await Promise.all(uploadTasks);

    return Response.json({
      ok: true,
      count: results.length,
      storagePath: results[0]?.storagePath,
      url: results[0]?.url,
      results,
    });
  } catch (error) {
    return jsonError(error);
  }
}
