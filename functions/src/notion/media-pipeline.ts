import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as logger from "firebase-functions/logger";
import { bucket } from "../lib/firebase";
import type { BlockMedia } from "../types";

/**
 * ETAPA 3.3 (crítico) — Media rehosting.
 *
 * Notion serves uploaded files through S3 presigned URLs that expire about an
 * hour after the API response. Persisting those URLs would leave every imported
 * page with dead images by the next day, so each asset is streamed straight from
 * Notion into Cloud Storage and the block is rewritten to point at the permanent
 * download URL.
 *
 * Streaming (rather than buffering) keeps memory flat regardless of file size,
 * which matters when a single Notion page carries a 200 MB screen recording.
 */

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
    throw new Error(`download failed (${response.status}) for ${input.suggestedName}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength && declaredLength > MAX_BYTES) {
    throw new Error(
      `arquivo ${input.suggestedName} excede o limite de ${Math.round(MAX_BYTES / 1024 / 1024)} MB`
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const safeName = sanitize(input.suggestedName);
  const storagePath = `workspaces/${input.workspaceId}/notion/${input.jobId}/${randomUUID()}-${safeName}`;
  const file = bucket().file(storagePath);
  const downloadToken = randomUUID();

  let bytes = 0;
  const counter = new TransformStreamCounter((chunk) => {
    bytes += chunk;
    if (bytes > MAX_BYTES) throw new Error(`arquivo ${safeName} excede o limite permitido`);
  });

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    counter.stream,
    file.createWriteStream({
      resumable: bytes > 5 * 1024 * 1024,
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

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(
    storagePath
  )}?alt=media&token=${downloadToken}`;

  logger.debug("rehosted notion asset", { storagePath, bytes, contentType });

  return {
    url,
    storagePath,
    name: safeName,
    mimeType: contentType,
    sizeBytes: bytes,
    bytes,
    // OCR / transcription enrich this later through their own triggers.
    pending: contentType.startsWith("image/") || contentType === "application/pdf",
  };
}

/**
 * Minimal pass-through stream that reports chunk sizes, used to enforce the
 * size cap without loading the file into memory.
 */
class TransformStreamCounter {
  readonly stream: NodeJS.ReadWriteStream;

  constructor(onChunk: (bytes: number) => void) {
    const { Transform } = require("node:stream") as typeof import("node:stream");
    this.stream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          onChunk(chunk.length);
          callback(null, chunk);
        } catch (error) {
          callback(error as Error);
        }
      },
    });
  }
}
