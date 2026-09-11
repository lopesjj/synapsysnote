import "server-only";

import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { adminBucket, isAdminConfigured } from "@/lib/firebase/admin";
import type { BlockMedia } from "@/types/models";

const MAX_BYTES = Number(process.env.IMPORT_MAX_FILE_BYTES ?? 250 * 1024 * 1024);

export interface RehostResult extends BlockMedia {
  bytes: number;
}

function sanitize(name: string): string {
  return (
    name
      .replace(/[^\w.\-() ]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "arquivo"
  );
}

export async function rehostNotionFile(input: {
  workspaceId: string;
  jobId: string;
  url: string;
  suggestedName: string;
}): Promise<RehostResult> {
  const response = await fetch(input.url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar ${input.suggestedName} (${response.status})`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength && declaredLength > MAX_BYTES) {
    throw new Error(
      `arquivo ${input.suggestedName} excede o limite de ${Math.round(MAX_BYTES / 1024 / 1024)} MB`
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const safeName = sanitize(input.suggestedName);

  if (!isAdminConfigured()) {
    return {
      url: input.url,
      name: safeName,
      mimeType: contentType,
      sizeBytes: declaredLength || undefined,
      bytes: declaredLength || 0,
      pending: contentType.startsWith("image/") || contentType === "application/pdf",
    };
  }

  try {
    const storagePath = `workspaces/${input.workspaceId}/notion/${input.jobId}/${randomUUID()}-${safeName}`;
    const file = adminBucket().file(storagePath);
    const downloadToken = randomUUID();

    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            callback(new Error(`arquivo ${safeName} excede o limite permitido`));
            return;
          }
          callback(null, chunk);
        } catch (error) {
          callback(error as Error);
        }
      },
    });

    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      file.createWriteStream({
        resumable: declaredLength > 5 * 1024 * 1024,
        contentType,
        metadata: {
          contentType,
          cacheControl: "public, max-age=31536000, immutable",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            source: "notion-import",
            importJobId: input.jobId,
            originalName: input.suggestedName,
          },
        },
      })
    );

    const bucketName = adminBucket().name;
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${downloadToken}`;

    return {
      url,
      storagePath,
      name: safeName,
      mimeType: contentType,
      sizeBytes: bytes,
      bytes,
      pending: contentType.startsWith("image/") || contentType === "application/pdf",
    };
  } catch {
    return {
      url: input.url,
      name: safeName,
      mimeType: contentType,
      sizeBytes: declaredLength || undefined,
      bytes: declaredLength || 0,
      pending: false,
    };
  }
}

export async function rehostNotionIcon(url: string, fallback: string = "📄"): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return url || fallback;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return fallback;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default || sharpModule;
    const optimized = await sharp(buffer)
      .resize(128, 128, { fit: "inside", withoutEnlargement: false })
      .webp({ quality: 85, alphaQuality: 85 })
      .toBuffer();
    return `data:image/webp;base64,${optimized.toString("base64")}`;
  } catch {
    return fallback;
  }
}

