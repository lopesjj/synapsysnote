import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { GoogleAuth } from "google-auth-library";
import { resolveServiceAccountCredentials } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Uma nota longa cabe folgada; acima disso o texto sai sem traducao. */
const MAX_TEXT_CHARS = 60_000;
const TRANSLATE_TIMEOUT_MS = 15_000;
const SUPPORTED_TARGETS = new Set(["pt", "en", "es", "fr", "it", "de", "ru", "ja", "zh", "ar"]);

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxConcurrent: 4,
  maxBytes: 2 * 1024 * 1024,
});

const translationCache = new Map<string, string>();

function splitTextIntoSafeChunks(text: string, maxChunkLength = 3000): string[] {
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n\n+/)) {
    // Paragrafo maior que o teto e cortado em pedacos, senao ia inteiro.
    for (let start = 0; start < para.length; start += maxChunkLength) {
      const piece = para.slice(start, start + maxChunkLength);
      if ((current ? current.length + 2 : 0) + piece.length > maxChunkLength) push();
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  push();
  return chunks.length > 0 ? chunks : [text];
}

const CLOUD_TRANSLATE_COOLDOWN_MS = 10 * 60 * 1000;
const CLOUD_REQUEST_CHARS = 25_000;
let cloudTranslateDisabledUntil = 0;
let translateAuth: GoogleAuth | null = null;

function googleAuth(): GoogleAuth {
  if (translateAuth) return translateAuth;
  const creds = resolveServiceAccountCredentials();
  translateAuth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-translation"],
    ...(creds?.client_email && creds.private_key
      ? {
          credentials: {
            client_email: creds.client_email,
            private_key: creds.private_key.replace(/\\n/g, "\n"),
          },
          projectId: creds.project_id,
        }
      : {}),
  });
  return translateAuth;
}

function projectId(): string {
  return (
    resolveServiceAccountCredentials()?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "synapsysnote"
  );
}

async function cloudTranslate(chunks: string[], targetLang: string): Promise<string[] | null> {
  if (Date.now() < cloudTranslateDisabledUntil) return null;
  try {
    const client = await googleAuth().getClient();
    const response = await client.request<{ translations?: { translatedText?: string }[] }>({
      url: `https://translation.googleapis.com/v3/projects/${projectId()}/locations/global:translateText`,
      method: "POST",
      timeout: TRANSLATE_TIMEOUT_MS,
      data: { contents: chunks, targetLanguageCode: targetLang, mimeType: "text/plain" },
    });
    const translated = response.data.translations?.map((item) => item.translatedText ?? "") ?? [];
    return translated.length === chunks.length ? translated : null;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 403 || status === 401 || status === 404) {
      cloudTranslateDisabledUntil = Date.now() + CLOUD_TRANSLATE_COOLDOWN_MS;
      console.warn("[translate] Cloud Translation indisponível; usando a Gemini API");
    }
    return null;
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  de: "German",
  ru: "Russian",
  ja: "Japanese",
  zh: "Simplified Chinese",
  ar: "Arabic",
};

async function geminiTranslate(text: string, targetLang: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-2.5-flash"].filter(Boolean))];
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS * 2),
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `Translate the user's text into ${LANGUAGE_NAMES[targetLang] ?? targetLang}. Keep line breaks and meaning. Reply with the translation only.`,
                },
              ],
            },
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      if (!response.ok) continue;
      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (output) return output;
    } catch {}
  }
  return null;
}

async function translateChunks(chunks: string[], targetLang: string): Promise<string[]> {
  const results = new Array<string>(chunks.length);
  const missing: number[] = [];
  chunks.forEach((chunk, index) => {
    const cached = translationCache.get(`${targetLang}:${chunk}`);
    if (cached !== undefined) results[index] = cached;
    else missing.push(index);
  });
  if (!missing.length) return results;

  const pending = missing.map((index) => chunks[index]);
  const viaCloud: (string | undefined)[] = [];
  let group: string[] = [];
  let groupChars = 0;
  const flush = async () => {
    if (!group.length) return;
    const translated = await cloudTranslate(group, targetLang);
    viaCloud.push(...(translated ?? group.map(() => undefined)));
    group = [];
    groupChars = 0;
  };
  for (const chunk of pending) {
    if (groupChars + chunk.length > CLOUD_REQUEST_CHARS) await flush();
    group.push(chunk);
    groupChars += chunk.length;
  }
  await flush();
  for (let position = 0; position < missing.length; position += 1) {
    const index = missing[position];
    const translated = viaCloud?.[position] ?? (await geminiTranslate(chunks[index], targetLang)) ?? chunks[index];
    results[index] = translated;
    if (translated !== chunks[index]) {
      if (translationCache.size > 500) translationCache.clear();
      translationCache.set(`${targetLang}:${chunks[index]}`, translated);
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ translatedText: "", error: "forbidden" }, { status: 403 });
  }
  const uid = await appRequestUser(req);
  if (!uid) {
    return NextResponse.json({ translatedText: "", error: "unauthorized" }, { status: 401 });
  }

  const key = rateLimitKey(uid, clientIpOf(req));
  if (!limiter.take(key)) {
    return NextResponse.json({ translatedText: "", error: "rate_limited" }, { status: 429 });
  }

  let bytes = 0;
  try {
    const body = (await req.json().catch(() => ({}))) as { text?: unknown; targetLang?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const requested = typeof body.targetLang === "string" ? body.targetLang : "pt";
    const targetLang = requested.trim().toLowerCase().split("-")[0];

    if (!text) return NextResponse.json({ translatedText: "" });
    if (!SUPPORTED_TARGETS.has(targetLang)) {
      return NextResponse.json({ translatedText: text });
    }
    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ translatedText: text, error: "too_long" }, { status: 413 });
    }
    bytes = text.length;

    const chunks = splitTextIntoSafeChunks(text).map((chunk) => chunk.trim()).filter(Boolean);
    const translatedChunks = await translateChunks(chunks, targetLang);
    return NextResponse.json({ translatedText: translatedChunks.join("\n\n") });
  } catch {
    return NextResponse.json({ translatedText: "" });
  } finally {
    limiter.release(key, bytes);
  }
}
