import { hasValidAppSession } from "@/lib/api/app-session";
import { isSameOriginRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  maxConcurrent: 3,
  maxBytes: 200 * 1024 * 1024,
});

function extractGoogleDocRef(input: string): { kind: "doc" | "published"; id: string } | null {
  const value = input.trim();
  if (!value) return null;

  const published = /\/document\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]{20,})/.exec(value);
  if (published) return { kind: "published", id: published[1] };

  const standard = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(value);
  if (standard) return { kind: "doc", id: standard[1] };

  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return { kind: "doc", id: value };

  try {
    const url = new URL(value);
    const id = url.searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]{20,}$/.test(id)) return { kind: "doc", id };
  } catch {
    return null;
  }
  return null;
}

function exportUrlFor(ref: { kind: "doc" | "published"; id: string }): string {
  return ref.kind === "published"
    ? `https://docs.google.com/document/d/e/${ref.id}/pub`
    : `https://docs.google.com/document/d/${ref.id}/export?format=html`;
}

function fail(code: string, status: number) {
  return Response.json({ error: code, code }, { status });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return fail("forbidden", 403);
  if (!(await hasValidAppSession())) return fail("unauthorized", 401);

  const key = clientIpOf(request);
  if (!limiter.take(key)) return fail("rate_limited", 429);
  let transferred = 0;

  try {
    let body: { url?: string };
    try {
      body = (await request.json()) as { url?: string };
    } catch {
      return fail("invalid_google_doc_url", 400);
    }

    const ref = extractGoogleDocRef(body.url ?? "");
    if (!ref) return fail("invalid_google_doc_url", 400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(exportUrlFor(ref), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "SynapsysNote-Import/1.0",
        },
      });
    } catch {
      return fail("google_doc_unavailable", 502);
    } finally {
      clearTimeout(timeout);
    }

    let finalHost = "";
    try {
      finalHost = new URL(response.url).hostname;
    } catch {
      finalHost = "";
    }
    const allowedHost =
      !finalHost ||
      finalHost === "docs.google.com" ||
      finalHost.endsWith(".googleusercontent.com") ||
      finalHost.endsWith(".googleapis.com");
    if (!allowedHost) return fail("google_doc_not_public", 403);
    if (response.status === 401 || response.status === 403) return fail("google_doc_not_public", 403);
    if (response.status === 404) return fail("google_doc_unavailable", 404);
    if (!response.ok) return fail("google_doc_unavailable", 502);

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return fail("google_doc_not_public", 403);
    }

    const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > MAX_BYTES) return fail("file_too_large", 413);

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return fail("file_too_large", 413);
    transferred = buffer.byteLength;

    const html = new TextDecoder("utf-8").decode(buffer);
    if (/<form[^>]+accounts\.google\.com/i.test(html) || /id="gaia_loginform"/i.test(html)) {
      return fail("google_doc_not_public", 403);
    }

    return Response.json({ html });
  } catch {
    return fail("google_doc_unavailable", 500);
  } finally {
    limiter.release(key, transferred);
  }
}
