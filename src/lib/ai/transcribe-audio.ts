import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminBucket } from "@/lib/firebase/admin";
import { pagesRef } from "@/lib/notion/server/client";
import { ApiError } from "@/lib/api/errors";
import { stampTranscript, type TranscriptResult } from "@/lib/data/media-enrichment";
import type { AppBlock } from "@/types/models";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const PROMPT = `Você recebe uma nota de voz em português.
Responda estritamente em JSON com o formato:
{"transcript": "transcrição literal completa", "summary": "resumo em no máximo 2 frases", "actionItems": ["item"]}
Não invente conteúdo: se o áudio estiver inaudível, devolva transcript vazio.`;

/** Gemini rejects `audio/webm;codecs=opus` — only the type/subtype is valid. */
export function audioMimeType(contentType: string | undefined): string {
  const raw = (contentType || "audio/webm").split(";")[0].trim().toLowerCase();
  return raw.startsWith("audio/") ? raw : "audio/webm";
}

export async function transcribeStoragePath(storagePath: string): Promise<TranscriptResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      503,
      "GEMINI_API_KEY não configurada. Defina no .env.local ou nas Cloud Functions."
    );
  }

  const file = adminBucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new ApiError(404, "Arquivo de áudio não encontrado no Storage");

  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const mimeType = audioMimeType(metadata.contentType);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  if (!response.ok) {
    throw new ApiError(502, payload.error?.message || `Gemini recusou o áudio (${response.status})`);
  }

  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<TranscriptResult>;
    return {
      transcript: parsed.transcript ?? "",
      summary: parsed.summary ?? "",
      actionItems: parsed.actionItems ?? [],
    };
  } catch {
    return { transcript: raw, summary: "", actionItems: [] };
  }
}

export async function applyTranscriptToPage(
  workspaceId: string,
  pageId: string,
  storagePath: string,
  result: TranscriptResult
) {
  const pageRef = pagesRef(workspaceId).doc(pageId);
  const page = await pageRef.get();
  if (!page.exists) throw new ApiError(404, "Página não encontrada");

  const blocks = stampTranscript((page.get("blocks") ?? []) as AppBlock[], storagePath, result);
  const previous = (page.get("transcriptText") as string) ?? "";

  await pageRef.update({
    blocks,
    transcriptText: `${previous}\n${result.transcript}`.trim().slice(0, 900_000),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
