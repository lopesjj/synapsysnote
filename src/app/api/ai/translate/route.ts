import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const translationCache = new Map<string, string>();

function splitTextIntoSafeChunks(text: string, maxChunkLength = 3000): string[] {
  if (text.length <= maxChunkLength) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChunkLength) {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

async function translateSingleChunk(text: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";

  const cacheKey = `${targetLang}:${clean}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const clients = ["gtx", "dict-chrome-ex"];

  for (const client of clients) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&dt=t&q=${encodeURIComponent(clean)}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translated = data[0].map((part: unknown[]) => part?.[0] ?? "").join("");
          if (translated && translated.trim()) {
            if (translationCache.size > 2000) {
              translationCache.clear();
            }
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
  try {
    const body = (await req.json()) as { text?: string; targetLang?: string };
    const text = body.text?.trim();
    const targetLang = (body.targetLang || "pt").trim().toLowerCase().split("-")[0];

    if (!text) {
      return NextResponse.json({ translatedText: "" });
    }

    const chunks = splitTextIntoSafeChunks(text, 3000);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const translated = await translateSingleChunk(chunk, targetLang);
      translatedChunks.push(translated);
    }

    const translatedText = translatedChunks.join("\n\n");
    return NextResponse.json({ translatedText });
  } catch {
    return NextResponse.json({ translatedText: "" });
  }
}
