import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT = 60_000;
const MAX_BODY_BYTES = 256 * 1024;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subjects: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          topics: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["name", "topics"],
      },
    },
  },
  required: ["subjects"],
};

const limiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 20,
  maxConcurrent: 2,
  maxBytes: 5 * 1024 * 1024,
});

const PREFERRED_TTL_MS = 30 * 60_000;
const ATTEMPT_TIMEOUT_MS = 45_000;

let preferred: { model: string; until: number } | null = null;

function modelList(): string[] {
  const sticky = preferred && preferred.until > Date.now() ? [preferred.model] : [];
  return Array.from(
    new Set(
      [...sticky, process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"].filter(
        Boolean
      ) as string[]
    )
  );
}

function sanitize(raw: unknown): { name: string; topics: string[] }[] {
  if (!raw || typeof raw !== "object") return [];
  const subjects = (raw as { subjects?: unknown }).subjects;
  if (!Array.isArray(subjects)) return [];
  const out: { name: string; topics: string[] }[] = [];
  for (const entry of subjects.slice(0, 80)) {
    if (!entry || typeof entry !== "object") continue;
    const name = String((entry as { name?: unknown }).name ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    const topicsRaw = (entry as { topics?: unknown }).topics;
    const topics = Array.isArray(topicsRaw)
      ? topicsRaw
          .map((topic) => String(topic ?? "").replace(/\s+/g, " ").trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 600)
      : [];
    if (name || topics.length) out.push({ name, topics });
  }
  return out;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const uid = await appRequestUser(request);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const key = rateLimitKey(uid, clientIpOf(request));
  if (!limiter.take(key)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = String(body.text ?? "").slice(0, MAX_TEXT).trim();
    if (!text) return NextResponse.json({ subjects: [] });
    const prompt = [
      "You organize the syllabus of an exam, certification or course into subjects and topics.",
      "Read the text below and return every subject (discipline) with its topics in the original order.",
      "Rules:",
      "- Keep the wording of the source; only fix obvious line-break or spacing artifacts.",
      "- Remove item numbers from the start of topics and subject names.",
      "- A topic is one teachable item; split long sentences that list several items separated by semicolons.",
      "- Sub-items stay as separate topics right after their parent.",
      "- Ignore headings that only group subjects (e.g. general knowledge, specific knowledge) when they have no topics of their own.",
      "- Do not invent subjects or topics that are not in the text.",
      "- Keep the language of the source text. Write subject names in title case.",
      "Return only JSON shaped as {\"subjects\":[{\"name\":\"...\",\"topics\":[\"...\"]}]}.",
      "",
      "TEXT:",
      text,
    ].join("\n");

    let lastError = "";
    for (const model of modelList()) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0.1,
              maxOutputTokens: 16_384,
            },
          }),
        });
        if (!response.ok) {
          lastError = `status_${response.status}`;
          if (preferred?.model === model) preferred = null;
          continue;
        }
        const data = await response.json();
        const raw = (data?.candidates?.[0]?.content?.parts ?? [])
          .map((part: { text?: string }) => part?.text ?? "")
          .join("")
          .trim()
          .replace(/^```(?:json)?/i, "")
          .replace(/```$/, "")
          .trim();
        const subjects = sanitize(JSON.parse(raw));
        if (subjects.length) {
          preferred = { model, until: Date.now() + PREFERRED_TTL_MS };
          return NextResponse.json({ subjects });
        }
        lastError = "empty";
      } catch (error) {
        lastError = error instanceof Error ? error.message : "error";
      }
    }
    return NextResponse.json({ error: lastError || "failed", subjects: [] }, { status: 502 });
  } finally {
    limiter.release(key, declared);
  }
}
