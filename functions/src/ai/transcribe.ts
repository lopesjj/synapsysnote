import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger";
import { bucket, pagesRef } from "../lib/firebase";
import type { AppBlock } from "../types";

/**
 * ETAPA 4 — Voice notes with Gemini.
 *
 * Gemini accepts audio inline, so one call returns the transcript, a short
 * summary and action items. Both the Storage trigger and the callable share the
 * same implementation: the callable keeps latency low while the user is
 * watching, the trigger guarantees nothing is missed.
 */

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SECRETS = ["GEMINI_API_KEY"];

const PROMPT = `Você recebe uma nota de voz em português.
Responda estritamente em JSON com o formato:
{"transcript": "transcrição literal completa", "summary": "resumo em no máximo 2 frases", "actionItems": ["item"]}
Não invente conteúdo: se o áudio estiver inaudível, devolva transcript vazio.`;

interface GeminiAudioResult {
  transcript: string;
  summary: string;
  actionItems: string[];
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  return new GoogleGenAI({ apiKey });
}

async function transcribeStoragePath(storagePath: string): Promise<GeminiAudioResult> {
  const file = bucket().file(storagePath);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();

  const mimeType = (metadata.contentType ?? "audio/webm").split(";")[0].trim() || "audio/webm";

  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const raw = response.text ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<GeminiAudioResult>;
    return {
      transcript: parsed.transcript ?? "",
      summary: parsed.summary ?? "",
      actionItems: parsed.actionItems ?? [],
    };
  } catch {
    // Model returned prose instead of JSON — keep it rather than losing the work.
    return { transcript: raw, summary: "", actionItems: [] };
  }
}

async function applyTranscript(
  workspaceId: string,
  pageId: string,
  storagePath: string,
  result: GeminiAudioResult
) {
  const pageRef = pagesRef(workspaceId).doc(pageId);
  const page = await pageRef.get();
  if (!page.exists) return;

  const blocks = (page.get("blocks") ?? []) as AppBlock[];
  const summary = result.actionItems.length
    ? `${result.summary} Ações: ${result.actionItems.join("; ")}`
    : result.summary;

  const stamp = (list: AppBlock[]): AppBlock[] =>
    list.map((block) => ({
      ...block,
      ...(block.media?.storagePath === storagePath
        ? {
            media: {
              ...block.media,
              transcript: result.transcript,
              transcriptSummary: summary,
              pending: false,
            },
          }
        : {}),
      ...(block.children ? { children: stamp(block.children) } : {}),
    }));

  const previous = (page.get("transcriptText") as string) ?? "";
  await pageRef.update({
    blocks: stamp(blocks),
    transcriptText: `${previous}\n${result.transcript}`.trim().slice(0, 900_000),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const transcribeAudio = onCall(
  { region: REGION, secrets: SECRETS, memory: "1GiB", timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
    const { workspaceId, pageId, storagePath } = request.data as {
      workspaceId: string;
      pageId: string;
      storagePath: string;
    };
    if (!workspaceId || !pageId || !storagePath) {
      throw new HttpsError("invalid-argument", "workspaceId, pageId e storagePath são obrigatórios");
    }

    const result = await transcribeStoragePath(storagePath);
    await applyTranscript(workspaceId, pageId, storagePath, result);
    return result;
  }
);

/** Safety net for audio uploaded outside the app (sync clients, retries). */
export const transcribeOnUpload = onObjectFinalized(
  { region: REGION, secrets: SECRETS, memory: "1GiB", timeoutSeconds: 540 },
  async (event) => {
    const { name: storagePath, contentType } = event.data;
    if (!storagePath || !contentType?.startsWith("audio/")) return;

    const match = storagePath.match(/^workspaces\/([^/]+)\/audio\/([^/]+)\//);
    if (!match) return;
    const [, workspaceId, pageId] = match;

    try {
      const page = await pagesRef(workspaceId).doc(pageId).get();
      if (!page.exists) return;
      const blocks = JSON.stringify(page.get("blocks") ?? []);
      // The callable already handled it.
      if (blocks.includes(`"transcript"`) && blocks.includes(storagePath)) return;

      const result = await transcribeStoragePath(storagePath);
      await applyTranscript(workspaceId, pageId, storagePath, result);
    } catch (error) {
      logger.error("transcription failed", { storagePath, error });
    }
  }
);
