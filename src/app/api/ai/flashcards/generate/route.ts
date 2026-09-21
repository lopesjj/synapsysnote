import { NextRequest, NextResponse } from "next/server";

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
const MAX_TOTAL_CARDS = 400;
const MAX_INLINE_IMAGES = 16;
const MAX_INLINE_PDFS = 8;
const TIME_BUDGET_MS = 230_000;

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
  properties: {
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

function labelled(entries: TranscriptInput[], fallbackLabel: string): string {
  return entries
    .map((entry, index) => {
      const name = entry.name?.trim() || `${fallbackLabel} ${index + 1}`;
      return `<<${name}>>\n${(entry.text || "").trim()}`;
    })
    .join("\n\n");
}

function splitIntoSegments(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= SEGMENT_CHAR_BUDGET) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const segments: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > SEGMENT_CHAR_BUDGET) {
      push();
      for (let i = 0; i < paragraph.length; i += SEGMENT_CHAR_BUDGET) {
        segments.push(paragraph.slice(i, i + SEGMENT_CHAR_BUDGET));
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > SEGMENT_CHAR_BUDGET) {
      push();
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  push();

  return segments.slice(0, MAX_SEGMENTS);
}

function buildSystemPrompt(langName: string, focus: string): string {
  return `You are a specialist in the cognitive science of learning, active recall and flashcard engineering, working in the tradition of Anki, SuperMemo and Piotr Wozniak.

OUTPUT LANGUAGE — ABSOLUTE RULE
Every "front", "back" and "hint" you write MUST be in ${langName}. This holds even when the source material is in a different language: translate the meaning into ${langName}. Never mix languages, never leave source-language fragments in the output, never comment on the translation. Keep proper nouns, legal article numbers, chemical symbols, code identifiers and standardized formulas in their original form.

THE SOURCE MATERIAL
What follows is the content of a single study note. It may combine several kinds of material, each marked with a header:
- the note's own written text
- structured tables
- text extracted from attached PDF documents
- verbatim transcripts of audio recordings and of videos
- OCR text read from images in the note
- the image and PDF files themselves, delivered to you as binary attachments after this text

Every one of these is first-class study material and must be mined with the same rigour. The binary attachments are not decoration: read the diagrams, flowcharts, graphs, formulas, slides, screenshots, scanned pages, handwriting and tables inside them and convert their content into flashcards exactly as you would with written text. Never skip an attachment. Never produce a card whose answer is merely that an image, a video or a document exists.

HOW TO WRITE EACH CARD

1. ATOMICITY (minimum information principle). One card tests exactly one fact, relation or decision. If an idea has four components, write four cards, not one card listing four items. The only exception is a short enumeration memorised as a unit with a fixed order or a mnemonic.

2. FRONT. A precise, unambiguous active-recall question. Test causes, mechanisms, functions, exact definitions, contrasts between confusable terms, conditions of application, exceptions, numeric values, and applied problem solving. Forbidden: yes/no questions, true/false questions, questions containing their own answer, and vague prompts such as "what is important about X".

3. BACK. Answer first, in the opening clause, then at most one short sentence of mechanism or justification. No filler ("as we saw in the note", "it is important to remember"). Keep it under roughly 45 words unless a formula, a legal wording or a fixed list requires more.

4. HINT — read this rule twice; it is the one most often done badly.
A hint is a retrieval cue: it helps someone who is stuck pull the answer out of their own memory. It is not a summary, not a definition and not a softer version of the answer.

A hint is INVALID and MUST be omitted when it does any of the following:
- restates, rephrases or defines the question (for "what is the entry point of a program?", the hint "the place where execution begins" is a restatement and is forbidden);
- is a synonym, a translation or a near-paraphrase of the answer;
- narrows the category so tightly that only one item can fit;
- is generic filler: "think about the basics", "remember the definition", "this is an important concept", "relates to the topic studied";
- merely repeats words already present in the question.

A hint is VALID only when it is one of these:
- structural cue: shape, signature, number of elements, initials, acronym ("three keywords; the middle one is the return type");
- mnemonic or wordplay that encodes the answer without stating it;
- adjacent anchor: a contrasting or neighbouring idea the learner already knows ("the mirror image of the destructor");
- origin or context cue: who proposed it, when, in what field, under what name it is also known;
- consequence cue: what visibly breaks or changes if you get it wrong ("omit it and the compiler says there is no entry point").

SELF-TEST, applied to every hint before you keep it: cover the question and read the hint alone. If it reads like a definition or a paraphrase of the question, delete it. If it alone makes the answer guessable, delete it. Keep it only when it sits between those two failures. Maximum 12 words. Never end a hint with the answer.

OMITTING IS CORRECT. When no valid hint exists, leave the "hint" field out of that card entirely. A missing hint is far better than a hollow one, and you are expected to omit it on a substantial share of the cards. Never invent a hint just to fill the field.

5. SELF-CONTAINED. Each card is read months later, alone, with no access to the note. Never write "according to the text", "in the image above", "in the table", "as the professor said", "in this PDF". If a card depends on a visual, describe the relevant part of the visual inside the question.

6. COVERAGE BY TYPE. From tables, turn each meaningful row or relation into its own card. From formulas, test both the formula and the meaning of each term. From processes, test order, trigger and outcome of each step. From classifications, test the criterion that separates the categories. From transcripts, extract the substance the speaker teaches and discard hesitations, greetings and off-topic remarks. From numbers, dates, limits and thresholds, make dedicated cards.

7. NO DUPLICATES. Never write two cards answerable by the same sentence, and never restate one question in different words.

8. FIDELITY. Use only information present in the material. Never invent, never extrapolate beyond what is stated, never fill gaps with general knowledge. If the material is contradictory, follow the most specific statement.

WORKED EXAMPLES — these illustrate STRUCTURE ONLY and are written in English for clarity. Your own output must be entirely in ${langName}, and must never reuse this example content.

Source sentence: "In C#, execution of an application always begins at the static void Main() method, its single entry point."
REJECTED: front "What is the single entry point for running a C# application?" / back "The static void Main() method." / hint "The place where program execution always begins."
  -> the hint is a restatement of the question and carries no new retrieval value.
ACCEPTED: front "Which method signature does the runtime invoke first when a C# application starts?" / back "static void Main(). It is the single entry point of the application." / hint "Three keywords; the last is English for 'principal'."

Source sentence: "Mean arterial pressure equals cardiac output multiplied by systemic vascular resistance."
REJECTED: hint "A formula related to the heart."
  -> generic filler.
ACCEPTED: hint "Same shape as Ohm's law, with flow replacing current."

Source sentence: "The statute of limitations for simple theft is eight years."
ACCEPTED with no hint at all: a bare number has no honest retrieval cue, so the "hint" field is omitted.${
    focus
      ? `

9. USER FOCUS — HIGHEST PRIORITY. The user asked to concentrate on: "${focus}". Prioritise this aspect above all others when selecting and ordering the cards, while still respecting every rule above.`
      : ""
  }`;
}

function buildModeInstruction(
  requestedCount: number | null,
  segmentIndex: number,
  segmentTotal: number,
  isAttachmentPass: boolean
): string {
  if (isAttachmentPass) {
    return `TASK — ATTACHMENTS PASS
The written text of this note was already covered in previous passes. In this pass, work exclusively from the binary attachments delivered with this message (images and PDF files).
- Read every attachment completely, page by page and region by region.
- Produce as many cards as the attachments genuinely justify, ordered from the most fundamental concept to the most peripheral detail.
- Cover diagrams, labelled parts, axes and trends of graphs, formulas, table cells, slide bullet points, scanned or handwritten text.
- Do not produce cards about material that is only in the written text.
- If an attachment carries no teachable content, silently skip it.`;
  }

  if (requestedCount === null) {
    const scope =
      segmentTotal > 1
        ? `This is segment ${segmentIndex} of ${segmentTotal} of the note. Cover THIS SEGMENT exhaustively; other segments are handled separately, so do not try to summarise the whole note here.`
        : `Cover the whole note exhaustively, from beginning to end.`;
    return `TASK — EXHAUSTIVE COVERAGE
${scope}
- Produce as many cards as are needed to exhaust the teachable content: every concept, rule, definition, formula, numeric value, table relation, process step, exception and edge case becomes its own card.
- Do not compress several facts into one card and do not skip a topic because it seems secondary.
- Order the cards from the most fundamental and structuring concept to the most peripheral detail.`;
  }

  const scope =
    segmentTotal > 1
      ? `This is segment ${segmentIndex} of ${segmentTotal}. Produce about ${requestedCount} cards for THIS SEGMENT.`
      : `CRITICAL: You MUST produce EXACTLY ${requestedCount} flashcards. Do not produce fewer than ${requestedCount} cards.`;

  return `TASK — PRIORITY SELECTION
${scope}
- Map the whole material first, then select only the highest-yield points: what a student must master to understand the subject.
- Order them strictly from most vital to least: card 1 is the single most indispensable idea, card 2 the second, and so on.
- Discard secondary detail rather than diluting the selection.
- Ensure the final JSON array contains exactly ${requestedCount} items.`;
}

async function callGemini(
  apiKey: string,
  models: string[],
  parts: unknown[],
  maxOutputTokens: number
): Promise<{ text: string; error: string }> {
  let lastError = "";
  let useSchema = true;

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
        continue;
      }

      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .map((part: { text?: string }) => part?.text || "")
        .join("");

      if (text) return { text, error: "" };
      lastError = String(candidate?.finishReason || lastError || "EMPTY_RESPONSE");
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Connection error";
    }
  }

  return { text: "", error: lastError };
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
      } catch {}
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
      } catch {}
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

function fingerprint(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function POST(req: NextRequest) {
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

    const consolidated = sections.join("\n\n").trim();

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
          "gemini-2.5-flash",
        ].filter(Boolean) as string[]
      )
    );

    const systemPrompt = buildSystemPrompt(langName, focus);
    const segments = isMax ? splitIntoSegments(consolidated) : [consolidated];
    const effectiveSegments = segments.length > 0 ? segments : [""];
    const runAttachmentPass = isMax && inlineParts.length > 0 && effectiveSegments.length > 1;

    const startedAt = Date.now();
    const collected: FlashcardItem[] = [];
    const seen = new Set<string>();
    let lastError = "";
    let timedOut = false;

    const pushCards = (cards: FlashcardItem[]) => {
      for (const card of cards) {
        if (collected.length >= MAX_TOTAL_CARDS) return;
        const key = fingerprint(card.front) || card.front.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        collected.push(card);
      }
    };

    for (let index = 0; index < effectiveSegments.length; index++) {
      if (collected.length >= MAX_TOTAL_CARDS) break;
      if (index > 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }

      const perSegmentCount =
        requestedCount === null
          ? null
          : Math.max(1, Math.ceil(requestedCount / effectiveSegments.length));

      const modeInstruction = buildModeInstruction(
        perSegmentCount,
        index + 1,
        effectiveSegments.length,
        false
      );

      const promptText = `${systemPrompt}

${modeInstruction}

RESPONSE FORMAT
Return only a JSON object shaped as {"flashcards":[{"front":"...","back":"...","hint":"..."}]}. No prose, no markdown fences, nothing outside the JSON.

--- MATERIAL ---
${effectiveSegments[index]}`;

      const parts: unknown[] = [{ text: promptText }];
      if (!runAttachmentPass && index === 0) {
        parts.push(...inlineParts);
      }

      const maxOutputTokens =
        requestedCount === null
          ? 32_768
          : Math.min(32_768, Math.max(12_288, requestedCount * 400));
      const { text, error } = await callGemini(apiKey, models, parts, maxOutputTokens);
      if (error) lastError = error;
      if (text) pushCards(parseFlashcards(text));
    }

    if (
      runAttachmentPass &&
      !timedOut &&
      collected.length < MAX_TOTAL_CARDS &&
      Date.now() - startedAt <= TIME_BUDGET_MS
    ) {
      const promptText = `${systemPrompt}

${buildModeInstruction(null, 1, 1, true)}

RESPONSE FORMAT
Return only a JSON object shaped as {"flashcards":[{"front":"...","back":"...","hint":"..."}]}. No prose, no markdown fences, nothing outside the JSON.

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

    if (
      requestedCount !== null &&
      collected.length < requestedCount &&
      !timedOut &&
      Date.now() - startedAt <= TIME_BUDGET_MS
    ) {
      const remainingNeeded = requestedCount - collected.length;
      const backfillPrompt = `${systemPrompt}

TASK — ADDITIONAL CARDS
You previously produced ${collected.length} flashcards, but the user requested ${requestedCount}.
Generate ${remainingNeeded} MORE unique, high-yield flashcards from the material that do NOT duplicate any of the following questions:
${collected.map((c, i) => `${i + 1}. ${c.front}`).join("\n")}

RESPONSE FORMAT
Return only a JSON object shaped as {"flashcards":[{"front":"...","back":"...","hint":"..."}]}. No prose, no markdown fences, nothing outside the JSON.

--- MATERIAL ---
${effectiveSegments[0] || consolidated}`;

      const { text } = await callGemini(apiKey, models, [{ text: backfillPrompt }], 8192);
      if (text) pushCards(parseFlashcards(text));
    }

    if (collected.length === 0) {
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
        generated: collected.length,
        partial: timedOut,
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
