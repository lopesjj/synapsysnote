import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { MAX_TEXT_CHARS, SUPPORTED_TARGETS, translateText } from "@/lib/ai/translate-server";

export const runtime = "nodejs";

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxConcurrent: 4,
  maxBytes: 2 * 1024 * 1024,
});

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

    const translated = await translateText(text, targetLang);
    return NextResponse.json({ translatedText: translated.text });
  } catch {
    return NextResponse.json({ translatedText: "" });
  } finally {
    limiter.release(key, bytes);
  }
}
