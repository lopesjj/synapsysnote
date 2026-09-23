import "server-only";

import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { Readable } from "node:stream";
import { MAX_REDIRECTS, isBlockedIp, parseProxyTarget } from "./proxy-guard";

/**
 * Busca de URL externa a partir do servidor, sem abrir caminho para a rede
 * interna: so http/https, nome resolvido uma unica vez e conexao no endereco
 * aprovado (o nome continua indo no Host e no SNI, para o certificado bater).
 * Cada redirecionamento recomeca a validacao.
 */

const DNS_TIMEOUT_MS = 4_000;

export interface PinnedResponse {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
  location: string | null;
  body: ReadableStream<Uint8Array> | null;
  abort: () => void;
}

export async function resolvePinnedAddress(hostname: string): Promise<string | null> {
  if (isBlockedIp(hostname)) return null;

  const literal = hostname.replace(/^\[|\]$/g, "");
  if (/^[0-9.]+$/.test(literal) || literal.includes(":")) return literal;

  try {
    const records = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS_TIMEOUT")), DNS_TIMEOUT_MS)),
    ]);
    if (!records.length) return null;
    // Basta um endereco interno para o nome inteiro ser recusado.
    if (records.some((record) => isBlockedIp(record.address))) return null;
    return records[0].address;
  } catch {
    return null;
  }
}

function pinnedRequest(
  url: URL,
  address: string,
  range: string | null,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  userAgent: string
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
        ...(secure ? { servername: url.hostname } : {}),
        headers: {
          Host: url.host,
          Accept: "*/*",
          "User-Agent": userAgent,
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

    request.setTimeout(timeoutMs, () => request.destroy(new Error("UPSTREAM_TIMEOUT")));
    signal?.addEventListener("abort", () => request.destroy(new Error("CLIENT_ABORTED")), { once: true });
    request.on("error", reject);
    request.end();
  });
}

export interface SafeFetchOptions {
  range?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  userAgent?: string;
}

/** Devolve a resposta final, ou `null` se algum salto cair em endereco proibido. */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<PinnedResponse | null> {
  const target = parseProxyTarget(rawUrl);
  if (!target.ok) return null;

  const timeoutMs = options.timeoutMs ?? 30_000;
  const userAgent = options.userAgent ?? "SynapsysNote/1.0";
  let current = target.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const address = await resolvePinnedAddress(current.hostname);
    if (!address) return null;

    const response = await pinnedRequest(current, address, options.range ?? null, options.signal, timeoutMs, userAgent);

    if (response.status >= 300 && response.status < 400 && response.location) {
      response.abort();
      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        return null;
      }
      const revalidated = parseProxyTarget(next.toString());
      if (!revalidated.ok) return null;
      current = revalidated.url;
      continue;
    }

    return response;
  }

  return null;
}

/** Le a resposta inteira em memoria, desistindo ao passar de `maxBytes`. */
export async function safeFetchBuffer(
  rawUrl: string,
  maxBytes: number,
  options: SafeFetchOptions = {}
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const response = await safeFetch(rawUrl, options);
  if (!response) return null;
  if (response.status >= 400 || !response.body) {
    response.abort();
    return null;
  }
  if (Number(response.contentLength || 0) > maxBytes) {
    response.abort();
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return { buffer: Buffer.concat(chunks), contentType: response.contentType };
}
