import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { assertPlanAllows } from "@/lib/plans/server";
import { planErrorBody, toPlanError } from "@/lib/plans/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { boundTopics, syllabusSystemPrompt } from "@/lib/study/syllabus";

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
const ATTEMPT_TIMEOUT_MS = 60_000;

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
    const topics = Array.isArray(topicsRaw) ? boundTopics(topicsRaw.map((topic) => String(topic ?? ""))) : [];
    if (name || topics.length) out.push({ name, topics });
  }
  return out;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const uid = await appRequestUser(request);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await assertPlanAllows(uid, { write: true });
  } catch (error) {
    const planError = toPlanError(error);
    if (!planError) throw error;
    return NextResponse.json(planErrorBody(planError), { status: 403 });
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const key = rateLimitKey(uid, clientIpOf(request));
  if (!limiter.take(key)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    const body = (await request.json().catch(() => ({}))) as { text?: unknown; language?: unknown };
    const text = String(body.text ?? "").slice(0, MAX_TEXT).trim();
    if (!text) return NextResponse.json({ subjects: [] });
    const language = String(body.language ?? "pt").slice(0, 12);

    let lastError = "";
    for (const model of modelList()) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: syllabusSystemPrompt(language) }] },
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0,
              maxOutputTokens: 32768,
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
