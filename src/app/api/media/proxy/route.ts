import { NextResponse, type NextRequest } from "next/server";
import { appSessionUser, rateLimitKey } from "@/lib/api/app-session";
import { isSameOriginRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import {
  MAX_PROXY_BYTES,
  parseProxyTarget,
  rejectionStatus,
  sanitizeContentType,
} from "@/lib/media/proxy-guard";
import { safeFetch } from "@/lib/media/safe-fetch";

export const runtime = "nodejs";

/** Nenhuma resposta do proxy pode virar documento ativo na origem do app. */
const HARDENED_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  // Mídia de workspace é privada: cache compartilhado não pode guardar.
  "Cache-Control": "private, max-age=3600",
  Vary: "Cookie, Range",
};

const UPSTREAM_TIMEOUT_MS = 30_000;
/**
 * Teto por instância; não substitui limite de borda, mas segura o pior caso.
 *
 * Contagem crua de requisições engana: abrir uma nota com vinte imagens ou
 * arrastar a linha do tempo de um vídeo (cada busca é um `Range`) gera dezenas
 * de chamadas legítimas em segundos. O que precisa de teto é a banda.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 240;
const RATE_MAX_CONCURRENT = 8;
const RATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function deny(message: string, status: number) {
  return new NextResponse(message, { status, headers: HARDENED_HEADERS });
}

/**
 * Host bloqueado e falha do destino saem com a mesma cara: distinguir os dois
 * transformaria o proxy num mapa de quais nomes internos existem.
 */
function upstreamFailure() {
  return deny("Upstream fetch failed", 502);
}

const limiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxRequests: RATE_MAX_REQUESTS,
  maxConcurrent: RATE_MAX_CONCURRENT,
  maxBytes: RATE_MAX_BYTES,
});

/** Corta o repasse assim que o destino passar do teto, sem bufferizar tudo. */
function limitedStream(
  body: ReadableStream<Uint8Array>,
  onDone: (bytes: number) => void
): ReadableStream<Uint8Array> {
  let transferred = 0;
  let finished = false;
  const reader = body.getReader();
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone(transferred);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
          return;
        }
        transferred += value.byteLength;
        if (transferred > MAX_PROXY_BYTES) {
          await reader.cancel().catch(() => undefined);
          finish();
          controller.error(new Error("PROXY_TOO_LARGE"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export async function GET(request: NextRequest) {
  // Requisição embutida em outro site viria com a sessão de quem visita.
  if (!isSameOriginRequest(request)) {
    return deny("Cross-site request not allowed", 403);
  }

  const target = parseProxyTarget(request.nextUrl.searchParams.get("url"));
  if (!target.ok) {
    return deny(`Blocked: ${target.reason}`, rejectionStatus(target.reason));
  }

  const uid = await appSessionUser();
  if (!uid) {
    return deny("Login obrigatório", 401);
  }

  const key = rateLimitKey(uid, clientIpOf(request));
  if (!limiter.take(key)) {
    return deny("Too many requests", 429);
  }

  let released = false;
  const release = (bytes = 0) => {
    if (released) return;
    released = true;
    limiter.release(key, bytes);
  };

  try {
    const upstream = await safeFetch(target.url.toString(), {
      range: request.headers.get("range"),
      signal: request.signal,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      userAgent: "SynapsysNote-MediaProxy/1.0",
    });
    if (!upstream) {
      release();
      return upstreamFailure();
    }

    if (upstream.status >= 400) {
      upstream.abort();
      release();
      return upstreamFailure();
    }

    const declaredLength = Number(upstream.contentLength || 0);
    if (declaredLength > MAX_PROXY_BYTES) {
      upstream.abort();
      release();
      return deny("Blocked: TOO_LARGE", 413);
    }

    const safeType = sanitizeContentType(upstream.contentType);
    const headers = new Headers(HARDENED_HEADERS);
    headers.set("Content-Type", safeType.contentType);
    headers.set("Content-Disposition", safeType.disposition);
    headers.set("Accept-Ranges", upstream.acceptRanges || "bytes");
    if (upstream.contentRange) headers.set("Content-Range", upstream.contentRange);
    if (upstream.contentLength) headers.set("Content-Length", upstream.contentLength);

    if (!upstream.body) {
      release();
      return new NextResponse(null, { status: upstream.status, headers });
    }

    return new NextResponse(limitedStream(upstream.body, release), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    release();
    console.error("[media-proxy] falha ao buscar mídia", error);
    return upstreamFailure();
  }
}
