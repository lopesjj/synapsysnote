import { NextResponse, type NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { Readable } from "node:stream";
import { hasValidAppSession } from "@/lib/api/app-session";
import { isSameOriginRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import {
  MAX_PROXY_BYTES,
  MAX_REDIRECTS,
  isBlockedIp,
  parseProxyTarget,
  rejectionStatus,
  sanitizeContentType,
} from "@/lib/media/proxy-guard";

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

const DNS_TIMEOUT_MS = 4_000;
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

// ---------------------------------------------------------------- limite de uso

const limiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxRequests: RATE_MAX_REQUESTS,
  maxConcurrent: RATE_MAX_CONCURRENT,
  maxBytes: RATE_MAX_BYTES,
});

function rateKey(request: NextRequest): string {
  return clientIpOf(request);
}

// ---------------------------------------------------------------- resolução

/**
 * Resolve o nome uma única vez e devolve o endereço aprovado.
 *
 * O endereço é o que vai ser usado na conexão: entregar o hostname ao fetch
 * deixaria o sistema resolver de novo, e um DNS com TTL 0 poderia responder um
 * IP público na validação e 169.254.169.254 na hora de abrir o socket.
 */
async function resolvePinnedAddress(hostname: string): Promise<string | null> {
  if (isBlockedIp(hostname)) return null;

  const literal = hostname.replace(/^\[|\]$/g, "");
  if (/^[0-9.]+$/.test(literal) || literal.includes(":")) return literal;

  try {
    const records = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DNS_TIMEOUT")), DNS_TIMEOUT_MS)
      ),
    ]);
    if (!records.length) return null;
    // Basta um endereço interno para o nome inteiro ser recusado.
    if (records.some((record) => isBlockedIp(record.address))) return null;
    return records[0].address;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- requisição

interface PinnedResponse {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
  location: string | null;
  body: ReadableStream<Uint8Array> | null;
  abort: () => void;
}

function pinnedRequest(
  url: URL,
  address: string,
  range: string | null,
  signal: AbortSignal
): Promise<PinnedResponse> {
  const secure = url.protocol === "https:";
  const client = secure ? https : http;

  return new Promise<PinnedResponse>((resolve, reject) => {
    const request = client.request(
      {
        host: address,
        port: url.port ? Number(url.port) : secure ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // Conecta no endereço aprovado, mas mantém o nome para virtual host e
        // para a validação do certificado.
        ...(secure ? { servername: url.hostname } : {}),
        headers: {
          Host: url.host,
          Accept: "*/*",
          "User-Agent": "SynapsysNote-MediaProxy/1.0",
          ...(range ? { Range: range } : {}),
        },
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 502,
          contentType: (response.headers["content-type"] as string) ?? null,
          contentLength: (response.headers["content-length"] as string) ?? null,
          contentRange: (response.headers["content-range"] as string) ?? null,
          acceptRanges: (response.headers["accept-ranges"] as string) ?? null,
          location: (response.headers.location as string) ?? null,
          body: Readable.toWeb(response) as ReadableStream<Uint8Array>,
          abort: () => response.destroy(),
        });
      }
    );

    request.setTimeout(UPSTREAM_TIMEOUT_MS, () => request.destroy(new Error("UPSTREAM_TIMEOUT")));
    signal.addEventListener("abort", () => request.destroy(new Error("CLIENT_ABORTED")), {
      once: true,
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchValidated(
  target: URL,
  range: string | null,
  signal: AbortSignal
): Promise<PinnedResponse | null> {
  let current = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const address = await resolvePinnedAddress(current.hostname);
    if (!address) return null;

    const response = await pinnedRequest(current, address, range, signal);

    if (response.status >= 300 && response.status < 400 && response.location) {
      response.abort();
      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        return null;
      }
      // Cada salto recomeça a validação: esquema, nome e endereço.
      const revalidated = parseProxyTarget(next.toString());
      if (!revalidated.ok) return null;
      current = revalidated.url;
      continue;
    }

    return response;
  }

  return null;
}

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

  if (!(await hasValidAppSession())) {
    return deny("Login obrigatório", 401);
  }

  const key = rateKey(request);
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
    const upstream = await fetchValidated(target.url, request.headers.get("range"), request.signal);
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
