import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { pagesRef } from "../lib/firebase";

/**
 * ETAPA 4 — Semantic layer.
 *
 * Each page keeps a 768-dimension embedding of title + body + OCR text +
 * transcript, stored as a Firestore vector value. `semanticSearch` runs
 * `findNearest` against it; the Command Palette merges those hits with the
 * client-side lexical pass to form the hybrid ranking.
 */

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const SECRETS = ["GEMINI_API_KEY"];
const MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";
const DIMENSION = 768;

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  return new GoogleGenAI({ apiKey });
}

async function embed(text: string): Promise<number[]> {
  const response = await client().models.embedContent({
    model: MODEL,
    contents: text.slice(0, 8_000),
    config: { outputDimensionality: DIMENSION },
  });
  return response.embeddings?.[0]?.values ?? [];
}

function documentText(data: FirebaseFirestore.DocumentData): string {
  return [data.title, data.plainText, data.extractedOCRText, data.transcriptText]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8_000);
}

/**
 * Re-embeds a page when its searchable text changes. Skipped when only the
 * embedding itself was written, which would otherwise loop forever.
 */
export const embedPageOnWrite = onDocumentWritten(
  {
    document: "workspaces/{workspaceId}/pages/{pageId}",
    region: REGION,
    secrets: SECRETS,
    memory: "512MiB",
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const before = event.data?.before;
    const nextText = documentText(after.data()!);
    const prevText = before?.exists ? documentText(before.data()!) : "";
    if (!nextText.trim() || nextText === prevText) return;
    if (after.get("deletedAt")) return;

    try {
      const vector = await embed(nextText);
      if (!vector.length) return;
      await after.ref.update({
        embedding: FieldValue.vector(vector),
        embeddingUpdatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error("embedding failed", { pageId: event.params.pageId, error });
    }
  }
);

export const semanticSearch = onCall(
  { region: REGION, secrets: SECRETS, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
    const { workspaceId, query, limit = 8 } = request.data as {
      workspaceId: string;
      query: string;
      limit?: number;
    };
    if (!query?.trim()) return { hits: [] };

    const vector = await embed(query);
    const snapshot = await pagesRef(workspaceId)
      .where("deletedAt", "==", null)
      .findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(vector),
        limit,
        distanceMeasure: "COSINE",
        distanceResultField: "vectorDistance",
      })
      .get();

    return {
      hits: snapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.get("title"),
        snippet: String(doc.get("plainText") ?? "").slice(0, 180),
        // Cosine distance → similarity, so the client can blend the two scores.
        score: 1 - Number(doc.get("vectorDistance") ?? 1),
      })),
    };
  }
);
