import { ImageAnnotatorClient } from "@google-cloud/vision";
import { FieldValue } from "firebase-admin/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { attachmentsRef, bucket, pagesRef } from "../lib/firebase";
import type { AppBlock } from "../types";

/**
 * ETAPA 4 — OCR with Cloud Vision.
 *
 * Fires whenever an image or PDF lands in Storage (user upload or Notion
 * rehost), extracts the text and writes it back to the owning page's
 * `extractedOCRText`, which the search index reads. Because the field is
 * server-owned in the rules, a compromised client cannot forge OCR content.
 */

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const vision = new ImageAnnotatorClient();

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|tiff)$/;

export const runOcrOnUpload = onObjectFinalized(
  { region: REGION, memory: "1GiB", timeoutSeconds: 300, cpu: 1 },
  async (event) => {
    const { name: storagePath, contentType, bucket: bucketName } = event.data;
    if (!storagePath || !contentType) return;

    const isImage = IMAGE_TYPES.test(contentType);
    const isPdf = contentType === "application/pdf";
    if (!isImage && !isPdf) return;

    const match = storagePath.match(/^workspaces\/([^/]+)\/(uploads|notion)\/([^/]+)\//);
    if (!match) return;
    const [, workspaceId] = match;

    try {
      const text = isImage
        ? await ocrImage(`gs://${bucketName}/${storagePath}`)
        : await ocrPdf(`gs://${bucketName}/${storagePath}`, bucketName);

      if (!text.trim()) return;

      await applyOcrText(workspaceId, storagePath, text);
      logger.info("ocr complete", { storagePath, characters: text.length });
    } catch (error) {
      logger.error("ocr failed", { storagePath, error });
    }
  }
);

/** Manual re-run, exposed for the "reprocessar OCR" action in the UI. */
export const reprocessOcr = onCall({ region: REGION, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, storagePath } = request.data as {
    workspaceId: string;
    storagePath: string;
  };
  const text = await ocrImage(`gs://${bucket().name}/${storagePath}`);
  await applyOcrText(workspaceId, storagePath, text);
  return { characters: text.length };
});

async function ocrImage(gcsUri: string): Promise<string> {
  const [result] = await vision.documentTextDetection(gcsUri);
  return result.fullTextAnnotation?.text ?? "";
}

/**
 * Vision processes PDFs asynchronously: results are written back to Storage as
 * JSON, then read and concatenated here.
 */
async function ocrPdf(gcsUri: string, bucketName: string): Promise<string> {
  const outputPrefix = `${gcsUri.replace(/\.pdf$/i, "")}-ocr/`;
  const [operation] = await vision.asyncBatchAnnotateFiles({
    requests: [
      {
        inputConfig: { gcsSource: { uri: gcsUri }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: outputPrefix }, batchSize: 20 },
      },
    ],
  });
  await operation.promise();

  const prefix = outputPrefix.replace(`gs://${bucketName}/`, "");
  const [files] = await bucket().getFiles({ prefix });
  const chunks: string[] = [];

  for (const file of files) {
    const [contents] = await file.download();
    const parsed = JSON.parse(contents.toString()) as {
      responses: { fullTextAnnotation?: { text: string } }[];
    };
    for (const response of parsed.responses) {
      if (response.fullTextAnnotation?.text) chunks.push(response.fullTextAnnotation.text);
    }
    await file.delete().catch(() => undefined);
  }

  return chunks.join("\n\n");
}

/**
 * Writes the extracted text both to the attachment record and to the block that
 * references it, so the reader can expand "texto OCR" inline.
 */
async function applyOcrText(workspaceId: string, storagePath: string, text: string) {
  const attachments = await attachmentsRef(workspaceId)
    .where("storagePath", "==", storagePath)
    .limit(1)
    .get();

  let pageId = attachments.empty ? null : (attachments.docs[0].get("pageId") as string | null);
  if (!attachments.empty) {
    await attachments.docs[0].ref.update({ ocrText: text, ocrAt: FieldValue.serverTimestamp() });
  }

  // Notion-imported media has no attachment record; locate the page by block.
  if (!pageId) {
    const candidates = await pagesRef(workspaceId).orderBy("updatedAt", "desc").limit(200).get();
    const hit = candidates.docs.find((doc) =>
      JSON.stringify(doc.get("blocks") ?? []).includes(storagePath)
    );
    pageId = hit?.id ?? null;
  }
  if (!pageId) return;

  const pageRef = pagesRef(workspaceId).doc(pageId);
  const page = await pageRef.get();
  const blocks = (page.get("blocks") ?? []) as AppBlock[];

  const stamp = (list: AppBlock[]): AppBlock[] =>
    list.map((block) => ({
      ...block,
      ...(block.media?.storagePath === storagePath
        ? { media: { ...block.media, ocrText: text, pending: false } }
        : {}),
      ...(block.children ? { children: stamp(block.children) } : {}),
    }));

  const previous = (page.get("extractedOCRText") as string) ?? "";
  await pageRef.update({
    blocks: stamp(blocks),
    extractedOCRText: `${previous}\n${text}`.trim().slice(0, 900_000),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
