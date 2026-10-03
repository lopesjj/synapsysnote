import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { SUPPORTED_TARGETS, translateText } from "@/lib/ai/translate-server";
import { isDayKey } from "@/lib/study/dates";
import { canonMotto } from "@/lib/study/mottos";
import { nextRemoteMotto } from "@/lib/study/motto-source";

export const runtime = "nodejs";

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  maxConcurrent: 4,
  maxBytes: 800_000,
});

const LANGUAGES = SUPPORTED_TARGETS;

function cleanSeen(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !/^[a-f0-9]{20}$/.test(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
    if (ids.length >= 20_000) break;
  }
  return ids;
}

function cleanHeld(value: unknown): { id: string; author: string; en: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { id?: unknown; author?: unknown; en?: unknown };
  const id = typeof raw.id === "string" && /^[a-f0-9]{20}$/.test(raw.id) ? raw.id : "";
  const en = typeof raw.en === "string" ? canonMotto(raw.en).slice(0, 240) : "";
  const author = typeof raw.author === "string" ? canonMotto(raw.author).slice(0, 80) : "";
  if (!id || !en) return null;
  return { id, author, en };
}

function unwrap(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const wrapped = trimmed.match(/^[“"«„「](.+)[”"»“」]$/u);
  return (wrapped?.[1] ?? trimmed).trim();
}

async function inLanguage(text: string, language: string): Promise<string> {
  if (language === "en") return text;
  const translated = await translateText(text, language);
  const output = unwrap(translated.text);
  if (!output || translated.failed > 0) return text;
  return output.slice(0, 280);
}

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const uid = await appRequestUser(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = rateLimitKey(uid, clientIpOf(req));
  if (!limiter.take(key)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let bytes = 0;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      day?: unknown;
      language?: unknown;
      seen?: unknown;
      held?: unknown;
    };
    bytes = JSON.stringify(body).length;
    const language = typeof body.language === "string" ? body.language.trim().toLowerCase().split("-")[0] : "pt";
    if (!isDayKey(body.day) || !LANGUAGES.has(language)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const held = cleanHeld(body.held);
    if (held) {
      const text = await inLanguage(held.en, language);
      return NextResponse.json({ id: held.id, author: held.author, en: held.en, text, language });
    }
    const quote = await nextRemoteMotto(cleanSeen(body.seen));
    if (!quote) return NextResponse.json({ error: "empty" }, { status: 503 });
    const text = await inLanguage(quote.text, language);
    return NextResponse.json({ id: quote.id, author: quote.author, en: quote.text, text, language });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  } finally {
    limiter.release(key, bytes);
  }
}
