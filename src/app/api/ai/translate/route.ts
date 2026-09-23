import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";

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

async function translateSingleChunk(text: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";

  const cacheKey = `${targetLang}:${clean}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  for (const client of ["gtx", "dict-chrome-ex"]) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&dt=t`;
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        // No corpo, e nao na URL: o texto da nota nao vai parar em log de acesso.
        body: new URLSearchParams({ q: clean }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translated = data[0]
            .map((part: unknown) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
            .join("");
          if (translated.trim()) {
            if (translationCache.size > 500) translationCache.clear();
            translationCache.set(cacheKey, translated);
            return translated;
          }
        }
      }
    } catch {}
  }

  return clean;
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

    const translatedChunks: string[] = [];
    for (const chunk of splitTextIntoSafeChunks(text)) {
      translatedChunks.push(await translateSingleChunk(chunk, targetLang));
    }
    return NextResponse.json({ translatedText: translatedChunks.join("\n\n") });
  } catch {
    return NextResponse.json({ translatedText: "" });
  } finally {
    limiter.release(key, bytes);
  }
}
