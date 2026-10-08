import { NextRequest, NextResponse } from "next/server";
import {
  cardSignature,
  fingerprint,
  hasDuplicate,
  type CardSignature,
} from "@/lib/flashcards/duplicate-cards";
import { filterSemanticDuplicates } from "@/lib/flashcards/semantic-duplicates";
import {
  buildExistingCardsBlock,
  buildModeInstruction,
  buildSweepInstruction,
  buildSystemPrompt,
  buildTopUpInstruction,
  type ExistingCard,
} from "@/lib/flashcards/generation-prompts";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { assertPlanAllows } from "@/lib/plans/server";
import { planErrorBody, toPlanError } from "@/lib/plans/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";

export const runtime = "nodejs";
export const maxDuration = 300;

const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Brazilian Portuguese (Português do Brasil)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  it: "Italian (Italiano)",
  de: "German (Deutsch)",
  ru: "Russian (Русский)",
  ja: "Japanese (日本語)",
  zh: "Simplified Chinese (简体中文)",
  ar: "Arabic (العربية)",
};

const SEGMENT_CHAR_BUDGET = 14_000;
const MAX_SEGMENTS = 12;
/**
 * No modo "máximo" o material é fatiado bem mais fino. Um trecho curto cabe
 * inteiro na atenção do modelo, e é isso que faz a varredura descer ao detalhe
 * em vez de devolver um resumo da nota.
 */
const MAX_MODE_SEGMENT_CHARS = 3_000;
const MAX_MODE_SEGMENTS = 56;
/** Segmentos pedidos ao mesmo tempo: mais varredura dentro do mesmo tempo. */
const MAX_MODE_CONCURRENCY = 5;
/** Rodadas que voltam ao material atrás do que a varredura deixou para trás. */
const MAX_MODE_SWEEP_ROUNDS = 3;
/** Tempo mínimo que precisa sobrar para valer a pena abrir uma rodada dessas. */
const SWEEP_MIN_BUDGET_MS = 35_000;
/** Rodadas de reforço para fechar a contagem pedida. */
const MAX_TOP_UP_ROUNDS = 3;
const TOP_UP_MIN_BUDGET_MS = 25_000;
const MAX_TOTAL_CARDS = 400;
const MAX_INLINE_IMAGES = 16;
const MAX_INLINE_PDFS = 8;
const TIME_BUDGET_MS = 230_000;
const MAX_EXISTING_CARDS = 2_000;
const SEMANTIC_PASS_MIN_BUDGET_MS = 15_000;
const SEMANTIC_PASS_MAX_BUDGET_MS = 45_000;

interface FlashcardItem {
  front: string;
  back: string;
  hint?: string;
}

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}

interface TranscriptInput {
  name?: string;
  text?: string;
}


const RESPONSE_SCHEMA = {
  type: "OBJECT",
  propertyOrdering: ["units", "flashcards"],
  properties: {
    units: {
      type: "ARRAY",
      description:
        "Inventory of the teachable units found in the material, in the order they appear. Fill it only when the task asks for it, and always before the flashcards.",
      items: { type: "STRING" },
    },
    flashcards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          front: { type: "STRING", description: "Active-recall question, self-contained." },
          back: { type: "STRING", description: "Direct answer, conclusion first." },
          hint: {
            type: "STRING",
            description:
              "Optional retrieval cue. Omit this field entirely unless it is a genuine memory trigger that neither restates the question nor reveals the answer.",
          },
        },
        required: ["front", "back"],
      },
    },
  },
  required: ["flashcards"],
} as const;

function asTranscripts(value: unknown): TranscriptInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { text: item };
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return {
          name: typeof record.name === "string" ? record.name : undefined,
          text: typeof record.text === "string" ? record.text : undefined,
        };
      }
      return { text: "" };
    })
    .filter((item) => Boolean(item.text && item.text.trim()));
}

function asExistingCards(value: unknown): ExistingCard[] {
  if (!Array.isArray(value)) return [];
  const cards: ExistingCard[] = [];
  for (const item of value) {
    if (cards.length >= MAX_EXISTING_CARDS) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const front = typeof record.front === "string" ? record.front.trim() : "";
    if (!front) continue;
    const back = typeof record.back === "string" ? record.back.trim() : "";
    cards.push({ front, back });
  }
  return cards;
}


function labelled(entries: TranscriptInput[], fallbackLabel: string): string {
  return entries
    .map((entry, index) => {
      const name = entry.name?.trim() || `${fallbackLabel} ${index + 1}`;
      return `<<${name}>>\n${(entry.text || "").trim()}`;
    })
    .join("\n\n");
}

function splitIntoSegments(text: string, budget = SEGMENT_CHAR_BUDGET, limit = MAX_SEGMENTS): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= budget) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const segments: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > budget) {
      push();
      for (let i = 0; i < paragraph.length; i += budget) {
        segments.push(paragraph.slice(i, i + budget));
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > budget) {
      push();
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  push();

  return segments.slice(0, limit);
}





/** Espera antes de cada rodada pela lista de modelos (a primeira é imediata). */
const GENERATE_ROUND_DELAYS_MS = [0, 4_000, 12_000];

async function callGemini(
  apiKey: string,
  models: string[],
  parts: unknown[],
  maxOutputTokens: number
): Promise<{ text: string; error: string }> {
  let lastError = "";
  let useSchema = true;
  let roundWasTransient = true;

  // Com o Gemini em "high demand" todos os modelos devolvem 503 na hora, e uma
  // única passada pela lista desistia em 5 s. Congestionamento passa em
  // segundos: vale varrer de novo depois de uma espera — mas só quando TODAS as
  // falhas da rodada foram passageiras (503/500/429/rede).
  for (let round = 0; round < GENERATE_ROUND_DELAYS_MS.length; round++) {
    if (round > 0) {
      if (!roundWasTransient) break;
      await new Promise((resolve) => setTimeout(resolve, GENERATE_ROUND_DELAYS_MS[round]));
    }
    roundWasTransient = true;
    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = models[attempt];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const generationConfig: Record<string, unknown> = {
        responseMimeType: "application/json",
        temperature: 0.25,
        topP: 0.95,
        maxOutputTokens,
      };
      if (useSchema) generationConfig.responseSchema = RESPONSE_SCHEMA;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = String(body?.error?.message || `Gemini API error ${res.status}`);
          lastError = message;

          if (useSchema && /responseSchema|response_schema|schema/i.test(message)) {
            useSchema = false;
            attempt -= 1;
            continue;
          }
          if (/maxOutputTokens|max_output_tokens/i.test(message) && maxOutputTokens > 8192) {
            maxOutputTokens = 8192;
            attempt -= 1;
            continue;
          }
          if (![429, 500, 502, 503, 504].includes(res.status)) roundWasTransient = false;
          continue;
        }

        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const text = (candidate?.content?.parts || [])
          .map((part: { text?: string }) => part?.text || "")
          .join("");

        if (text) return { text, error: "" };
        lastError = String(candidate?.finishReason || lastError || "EMPTY_RESPONSE");
        roundWasTransient = false;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Connection error";
      }
    }
  }

  return { text: "", error: lastError };
}

/** Inventário devolvido junto com os cards; serve de roteiro para a varredura. */
function parseUnits(raw: string): string[] {
  const clean = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: { units?: unknown } | null = null;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/"units"\s*:\s*\[[^\]]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(`{${match[0]}}`) as { units?: unknown };
    } catch {
      return [];
    }
  }
  if (!parsed || !Array.isArray(parsed.units)) return [];
  const list: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.units) {
    if (typeof entry !== "string") continue;
    const unit = entry.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!unit) continue;
    const key = unit.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(unit);
  }
  return list;
}

function parseFlashcards(raw: string): FlashcardItem[] {
  const clean = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: { flashcards?: unknown } | null = null;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch { }
    }
  }

  const list: FlashcardItem[] = [];

  if (parsed && Array.isArray(parsed.flashcards)) {
    for (const entry of parsed.flashcards) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.front !== "string" || typeof record.back !== "string") continue;
      const front = record.front.trim();
      const back = record.back.trim();
      if (!front || !back) continue;
      const hint = typeof record.hint === "string" ? record.hint.trim() : "";
      list.push({
        front,
        back,
        hint: hint && !isWeakHint(hint, front, back) ? hint : undefined,
      });
    }
  }

  if (list.length === 0) {
    const pattern =
      /\{\s*"front"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"back"\s*:\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"hint"\s*:\s*"((?:[^"\\]|\\.)*)")?/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean)) !== null) {
      try {
        const front = JSON.parse(`"${match[1]}"`).trim();
        const back = JSON.parse(`"${match[2]}"`).trim();
        const hint = match[3] ? JSON.parse(`"${match[3]}"`).trim() : "";
        if (front && back) {
          list.push({
            front,
            back,
            hint: hint && !isWeakHint(hint, front, back) ? hint : undefined,
          });
        }
      } catch { }
    }
  }

  return list;
}

function tokens(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter((word) => word.length >= 2));
}

function isWeakHint(hint: string, front: string, back: string): boolean {
  const h = fingerprint(hint) || hint.trim().toLowerCase();
  const f = fingerprint(front) || front.trim().toLowerCase();
  const b = fingerprint(back) || back.trim().toLowerCase();

  if (!h || h.length < 2) return true;
  if (hint.length > 110) return true;
  if (f.includes(h) || h.includes(f)) return true;
  if (b.includes(h) || h.includes(b)) return true;

  const hintTokens = tokens(h);
  if (hintTokens.size === 0) return true;

  const frontTokens = tokens(f);
  let shared = 0;
  for (const word of hintTokens) {
    if (frontTokens.has(word)) shared += 1;
  }
  if (shared / hintTokens.size >= 0.7) return true;

  const backTokens = tokens(b);
  if (backTokens.size > 0) {
    let leaked = 0;
    for (const word of backTokens) {
      if (hintTokens.has(word)) leaked += 1;
    }
    if (leaked / backTokens.size >= 0.6) return true;
  }

  return false;
}

/**
 * Cada pedido pode virar varias chamadas pagas ao Gemini (um segmento por
 * chamada, mais reenvios e a passada de repetidos). O teto cabe algumas notas
 * por minuto de quem estuda e segura quem tentar usar a rota como proxy.
 */
const generateLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 30,
  maxConcurrent: 2,
  maxBytes: 200 * 1024 * 1024,
});

/** Abaixo do teto de corpo do Cloud Run (32 MiB), com folga para o JSON. */
const MAX_BODY_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "forbidden", flashcards: [] }, { status: 403 });
  }
  const uid = await appRequestUser(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized", flashcards: [] }, { status: 401 });
  }
  try {
    await assertPlanAllows(uid, { write: true, feature: "aiFlashcards" });
  } catch (error) {
    const planError = toPlanError(error);
    if (!planError) throw error;
    return NextResponse.json({ ...planErrorBody(planError), flashcards: [] }, { status: 403 });
  }
  const declaredBytes = Number(req.headers.get("content-length") || 0);
  if (declaredBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large", flashcards: [] }, { status: 413 });
  }

  const key = rateLimitKey(uid, clientIpOf(req));
  if (!generateLimiter.take(key)) {
    return NextResponse.json({ error: "rate_limited", flashcards: [] }, { status: 429 });
  }
  try {
    return await generateFlashcards(req);
  } finally {
    generateLimiter.release(key, declaredBytes);
  }
}

async function generateFlashcards(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured", flashcards: [] },
        { status: 500 }
      );
    }

    const body = await req.json();

    const title = String(body.title || "").trim();
    const textContent = String(body.textContent || "").trim();
    const ocrText = String(body.ocrText || "").trim();
    const tablesContent: string[] = Array.isArray(body.tablesContent)
      ? body.tablesContent.filter((t: unknown) => typeof t === "string" && t.trim())
      : [];
    const audioTranscripts = asTranscripts(body.audioTranscripts);
    const videoTranscripts = asTranscripts(body.videoTranscripts);
    const pdfTexts: { name: string; text: string }[] = Array.isArray(body.pdfTexts)
      ? body.pdfTexts.filter(
        (p: { text?: unknown }) => p && typeof p.text === "string" && p.text.trim()
      )
      : [];
    const pdfDocuments: {
      name?: string;
      base64?: string;
      text?: string;
      mimeType?: string;
      pageCount?: number;
      truncated?: boolean;
    }[] = Array.isArray(body.pdfDocuments) ? body.pdfDocuments : [];
    const images: { name?: string; base64?: string; mimeType?: string; caption?: string }[] =
      Array.isArray(body.images) ? body.images : [];

    const targetLang = String(body.targetLanguage || "pt").trim().toLowerCase().split("-")[0];
    const langName = LANGUAGE_NAMES[targetLang] || LANGUAGE_NAMES.pt;
    const focus = String(body.focus || "").trim().slice(0, 400);
    const existingCards = asExistingCards(body.existingCards);

    const isMax = String(body.count).toLowerCase() === "max";
    const requestedCount = isMax
      ? null
      : Math.min(100, Math.max(3, Number(body.count) || 10));

    const sections: string[] = [];

    if (title) sections.push(`### NOTE TITLE\n${title}`);
    if (textContent) sections.push(`### NOTE TEXT\n${textContent}`);

    if (tablesContent.length > 0) {
      sections.push(
        `### TABLES AND STRUCTURED DATA\n${tablesContent
          .map((table, index) => `<<Table ${index + 1}>>\n${table.trim()}`)
          .join("\n\n")}`
      );
    }

    const allPdfTexts = [...pdfTexts];
    for (const doc of pdfDocuments) {
      if (doc.text && doc.text.trim() && !allPdfTexts.some((p) => p.name === doc.name)) {
        allPdfTexts.push({ name: doc.name || "PDF", text: doc.text });
      }
    }
    if (allPdfTexts.length > 0) {
      sections.push(
        `### TEXT EXTRACTED FROM ATTACHED PDF DOCUMENTS\n${allPdfTexts
          .map((p) => `<<${p.name}>>\n${p.text.trim()}`)
          .join("\n\n")}`
      );
    }

    if (audioTranscripts.length > 0) {
      sections.push(
        `### AUDIO TRANSCRIPTS (verbatim speech recorded in this note)\n${labelled(
          audioTranscripts,
          "Audio"
        )}`
      );
    }

    if (videoTranscripts.length > 0) {
      sections.push(
        `### VIDEO TRANSCRIPTS (verbatim speech from videos in this note)\n${labelled(
          videoTranscripts,
          "Video"
        )}`
      );
    }

    if (ocrText) {
      sections.push(`### TEXT READ FROM IMAGES (OCR)\n${ocrText}`);
    }

    const captions = images
      .filter((img) => img.caption && img.caption.trim())
      .map((img) => `<<${img.name || "Image"}>>: ${img.caption?.trim()}`);
    if (captions.length > 0) {
      sections.push(`### IMAGE CAPTIONS\n${captions.join("\n")}`);
    }

    const inlineParts: InlinePart[] = [];
    let inlinePdfCount = 0;
    for (const doc of pdfDocuments) {
      if (inlinePdfCount >= MAX_INLINE_PDFS) break;
      if (doc.base64 && doc.base64.length > 50) {
        inlineParts.push({
          inlineData: {
            mimeType: (doc.mimeType || "application/pdf").split(";")[0],
            data: doc.base64,
          },
        });
        inlinePdfCount += 1;
      }
    }

    let inlineImageCount = 0;
    for (const img of images) {
      if (inlineImageCount >= MAX_INLINE_IMAGES) break;
      if (img.base64 && img.base64.length > 50) {
        inlineParts.push({
          inlineData: {
            mimeType: (img.mimeType || "image/jpeg").split(";")[0],
            data: img.base64,
          },
        });
        inlineImageCount += 1;
      }
    }

    // O modo "max" ja fatia em no maximo MAX_SEGMENTS pedacos; sem o teto, o
    // modo com contagem mandaria a nota inteira, de qualquer tamanho, numa chamada.
    const consolidated = sections.join("\n\n").trim().slice(0, SEGMENT_CHAR_BUDGET * MAX_SEGMENTS);

    // O título sozinho não é material de estudo. Sem este corte, uma nota cujo
    // único conteúdo é um vídeo que falhou na transcrição chegava aqui só com o
    // nome, e o modelo devolvia as próprias instruções transformadas em cards.
    const hasStudyMaterial = sections.some((section) => !section.startsWith("### NOTE TITLE"));

    if (!hasStudyMaterial && inlineParts.length === 0) {
      return NextResponse.json(
        {
          error: "No content found in this note to generate flashcards from",
          reason: "NO_CONTENT",
          flashcards: [],
        },
        { status: 400 }
      );
    }

    const models = Array.from(
      new Set(
        [
          process.env.GEMINI_MODEL,
          "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-3.5-flash-lite",
        ].filter(Boolean) as string[]
      )
    );

    const systemPrompt = buildSystemPrompt(langName, focus, buildExistingCardsBlock(existingCards, isMax), isMax);
    const existingSignatures = existingCards.map((card) => cardSignature(card.front, card.back));
    const segments = isMax
      ? splitIntoSegments(consolidated, MAX_MODE_SEGMENT_CHARS, MAX_MODE_SEGMENTS)
      : [consolidated];
    const effectiveSegments = segments.length > 0 ? segments : [""];
    // No modo "máximo" os anexos sempre ganham uma passada só deles: disputar a
    // atenção com o texto era o que transformava um diagrama inteiro num card.
    const runAttachmentPass = isMax && inlineParts.length > 0;

    const startedAt = Date.now();
    const collected: FlashcardItem[] = [];
    const acceptedSignatures: CardSignature[] = [];
    let lastError = "";
    let timedOut = false;
    let skippedExistingLexical = 0;

    /** Perguntas aceitas e inventário de cada segmento: o roteiro da varredura. */
    const frontsBySegment: string[][] = effectiveSegments.map(() => []);
    const unitsBySegment: string[][] = effectiveSegments.map(() => []);

    const rememberUnits = (index: number, units: readonly string[]) => {
      const bucket = unitsBySegment[index];
      if (!bucket) return;
      const seen = new Set(bucket.map((unit) => unit.toLowerCase()));
      for (const unit of units) {
        const key = unit.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        bucket.push(unit);
      }
    };

    const pushCards = (cards: FlashcardItem[], into?: string[]) => {
      for (const card of cards) {
        if (collected.length >= MAX_TOTAL_CARDS) return;
        const signature = cardSignature(card.front, card.back);
        if (!signature.front) continue;
        if (hasDuplicate(existingSignatures, signature)) {
          skippedExistingLexical += 1;
          continue;
        }
        if (hasDuplicate(acceptedSignatures, signature)) continue;
        acceptedSignatures.push(signature);
        collected.push(card);
        into?.push(card.front);
      }
    };

    const RESPONSE_FORMAT = `RESPONSE FORMAT
Return only a JSON object shaped as {"flashcards":[{"front":"...","back":"...","hint":"..."}]}. No prose, no markdown fences, nothing outside the JSON.`;

    const askSegment = (index: number, instruction: string, withAttachments: boolean) => {
      const promptText = `${systemPrompt}

${instruction}

${RESPONSE_FORMAT}

--- MATERIAL ---
${effectiveSegments[index]}`;
      const parts: unknown[] = [{ text: promptText }];
      if (withAttachments) parts.push(...inlineParts);
      const maxOutputTokens =
        requestedCount === null
          ? 32_768
          : Math.min(32_768, Math.max(12_288, requestedCount * 400));
      return callGemini(apiKey, models, parts, maxOutputTokens);
    };

    /**
     * Uma rodada pede vários segmentos ao mesmo tempo. Com o trecho curto do
     * modo "máximo" seriam dezenas de chamadas em fila, e o tempo acabava antes
     * do fim da nota — exatamente o que fazia o fim dela ficar sem card.
     */
    const concurrency = isMax ? MAX_MODE_CONCURRENCY : 1;

    const runPass = async (
      indexes: readonly number[],
      instructionFor: (index: number) => string,
      // A varredura é um extra: ficar sem tempo nela não torna a geração parcial.
      markTimeout = true
    ): Promise<number> => {
      let produced = 0;
      for (let start = 0; start < indexes.length; start += concurrency) {
        if (collected.length >= MAX_TOTAL_CARDS) break;
        if (start > 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
          if (markTimeout) timedOut = true;
          break;
        }
        const round = indexes.slice(start, start + concurrency);
        const results = await Promise.all(
          round.map((index) =>
            askSegment(index, instructionFor(index), !runAttachmentPass && index === 0)
          )
        );
        results.forEach(({ text, error }, offset) => {
          if (error) lastError = error;
          if (!text) return;
          const index = round[offset];
          const before = collected.length;
          rememberUnits(index, parseUnits(text));
          pushCards(parseFlashcards(text), frontsBySegment[index]);
          produced += collected.length - before;
        });
      }
      return produced;
    };

    const textSegments = effectiveSegments
      .map((segment, index) => (segment.trim() ? index : -1))
      .filter((index) => index >= 0);
    // Nota só de anexos: no modo "máximo" a passada deles faz o trabalho, então
    // não há texto a varrer. Nos outros modos essa chamada é o único caminho
    // das imagens e dos PDFs até o modelo, e precisa acontecer mesmo vazia.
    const allSegments = textSegments.length || runAttachmentPass ? textSegments : [0];
    const perSegmentCount =
      requestedCount === null
        ? null
        : Math.max(1, Math.ceil(requestedCount / effectiveSegments.length));

    await runPass(allSegments, (index) =>
      buildModeInstruction(perSegmentCount, index + 1, effectiveSegments.length, false)
    );

    // Os anexos vêm antes da varredura: se o tempo acabar, o que se perde é o
    // repasse do texto, nunca a única leitura das imagens e dos PDFs.
    if (
      runAttachmentPass &&
      !timedOut &&
      collected.length < MAX_TOTAL_CARDS &&
      Date.now() - startedAt <= TIME_BUDGET_MS
    ) {
      const promptText = `${systemPrompt}

${buildModeInstruction(null, 1, 1, true)}

${RESPONSE_FORMAT}

--- NOTE TITLE FOR CONTEXT ---
${title || "(untitled)"}`;

      const { text, error } = await callGemini(
        apiKey,
        models,
        [{ text: promptText }, ...inlineParts],
        32_768
      );
      if (error) lastError = error;
      if (text) pushCards(parseFlashcards(text));
    }

    /**
     * Varredura: a primeira passada quase sempre cobre bem o começo de cada
     * trecho e afrouxa no fim. Aqui o modelo volta ao mesmo material sabendo o
     * que já perguntou, e só então o "máximo" chega ao detalhe da nota inteira.
     */
    if (isMax) {
      for (let round = 0; round < MAX_MODE_SWEEP_ROUNDS; round += 1) {
        if (timedOut || collected.length >= MAX_TOTAL_CARDS) break;
        if (Date.now() - startedAt > TIME_BUDGET_MS - SWEEP_MIN_BUDGET_MS) break;
        const pending = allSegments.filter(
          (index) => frontsBySegment[index].length > 0 || unitsBySegment[index].length > 0
        );
        if (!pending.length) break;
        const produced = await runPass(
          pending,
          (index) =>
            buildSweepInstruction(
              unitsBySegment[index],
              frontsBySegment[index],
              index + 1,
              effectiveSegments.length
            ),
          false
        );
        if (produced === 0) break;
      }
    }

    let skippedSemanticExisting = 0;
    let skippedSemanticInternal = 0;
    let semanticApplied = false;
    let semanticError = "";

    const runSemanticPass = async () => {
      if (collected.length === 0 || timedOut) return;
      const remaining = TIME_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < SEMANTIC_PASS_MIN_BUDGET_MS) return;

      const semantic = await filterSemanticDuplicates({
        apiKey,
        existing: existingCards,
        candidates: collected.map((card) => ({ front: card.front, back: card.back })),
        timeBudgetMs: Math.min(remaining, SEMANTIC_PASS_MAX_BUDGET_MS),
      });

      if (semantic.applied) semanticApplied = true;
      if (semantic.error) semanticError = semantic.error;
      if (!semantic.applied || semantic.duplicates === 0) return;

      const survivors: FlashcardItem[] = [];
      collected.forEach((card, index) => {
        if (semantic.keep[index]) survivors.push(card);
      });
      skippedSemanticExisting += semantic.duplicatesExisting ?? 0;
      skippedSemanticInternal += semantic.duplicatesInternal ?? 0;
      collected.length = 0;
      collected.push(...survivors);
    };

    await runSemanticPass();

    /**
     * Devolver menos do que foi pedido é o primeiro impulso do modelo, não uma
     * medida do que a nota tem: a mesma nota que entrega 15 cards aqui entrega
     * 80 no modo "máximo". Então insiste-se enquanto houver conta a fechar e
     * cada rodada ainda trouxer card novo; só aí é que faltou conteúdo mesmo.
     */
    let toppedUp = false;
    if (requestedCount !== null && !timedOut) {
      for (let round = 0; round < MAX_TOP_UP_ROUNDS; round += 1) {
        if (collected.length >= requestedCount) break;
        if (Date.now() - startedAt > TIME_BUDGET_MS - TOP_UP_MIN_BUDGET_MS) break;
        toppedUp = true;
        const before = collected.length;
        const instruction = buildTopUpInstruction(
          requestedCount - collected.length,
          unitsBySegment.flat(),
          collected.map((card) => card.front)
        );
        const promptText = `${systemPrompt}

${instruction}

${RESPONSE_FORMAT}

--- MATERIAL ---
${effectiveSegments[0] || consolidated}`;
        const { text, error } = await callGemini(apiKey, models, [{ text: promptText }], 12_288);
        if (error) lastError = error;
        if (text) {
          rememberUnits(0, parseUnits(text));
          pushCards(parseFlashcards(text), frontsBySegment[0]);
        }
        if (collected.length === before) break;
        await runSemanticPass();
      }
    }

    const totalSkippedExisting =
      existingCards.length > 0 ? skippedExistingLexical + skippedSemanticExisting : 0;

    if (collected.length === 0) {
      const isExhausted = existingCards.length > 0 && (totalSkippedExisting > 0 || requestedCount !== null);
      if (isExhausted || totalSkippedExisting > 0) {
        return NextResponse.json({
          flashcards: [],
          reason: "CONTENT_EXHAUSTED",
          meta: {
            segments: effectiveSegments.length,
            attachmentPass: runAttachmentPass,
            inlineImages: inlineImageCount,
            inlinePdfs: inlinePdfCount,
            generated: 0,
            requested: requestedCount,
            partial: timedOut,
            existingConsidered: existingCards.length,
            skippedExisting: totalSkippedExisting,
            skippedLexical: skippedExistingLexical,
            skippedSemantic: skippedSemanticExisting,
            skippedInternal: skippedSemanticInternal,
            contentExhausted: true,
            semanticApplied,
            ...(semanticError ? { semanticError } : {}),
          },
        });
      }
      return NextResponse.json(
        {
          error: lastError || "Could not generate flashcards right now. Please try again.",
          flashcards: [],
        },
        { status: 503 }
      );
    }

    const flashcards =
      requestedCount === null ? collected : collected.slice(0, requestedCount);

    return NextResponse.json({
      flashcards,
      meta: {
        segments: effectiveSegments.length,
        attachmentPass: runAttachmentPass,
        inlineImages: inlineImageCount,
        inlinePdfs: inlinePdfCount,
        generated: flashcards.length,
        requested: requestedCount,
        // Só é "faltou conteúdo" depois de insistir e o modelo não trazer mais
        // nada; antes disso era só a primeira resposta dele vindo curta.
        insufficientContent: requestedCount !== null && flashcards.length < requestedCount && toppedUp,
        partial: timedOut,
        existingConsidered: existingCards.length,
        skippedExisting: totalSkippedExisting,
        skippedLexical: skippedExistingLexical,
        skippedSemantic: skippedSemanticExisting,
        skippedInternal: skippedSemanticInternal,
        semanticApplied,
        ...(semanticError ? { semanticError } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error generating flashcards",
        flashcards: [],
      },
      { status: 500 }
    );
  }
}
