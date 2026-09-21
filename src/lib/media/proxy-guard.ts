import net from "node:net";

/**
 * Regras de seguranca do proxy de midia.
 *
 * O proxy existe porque nem toda midia de uma nota esta no Storage do projeto
 * (icone colado por URL, capa externa, imagem importada que nao foi
 * rehospedada), entao nao da para usar uma allowlist de hosts. A defesa e outra:
 * so esquemas de web, nenhum endereco interno, tipo de conteudo controlado e
 * teto de tamanho.
 */

/** Um pouco acima do maior anexo aceito (video de 150 MB). */
export const MAX_PROXY_BYTES = 160 * 1024 * 1024;

/** Quantos redirecionamentos seguimos — cada salto e revalidado. */
export const MAX_REDIRECTS = 3;

export type ProxyRejection =
  | "MISSING_URL"
  | "INVALID_URL"
  | "BLOCKED_SCHEME"
  | "BLOCKED_HOST"
  | "TOO_LARGE";

export interface ProxyTarget {
  ok: true;
  url: URL;
}

export interface ProxyRejected {
  ok: false;
  reason: ProxyRejection;
}

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** Expande um IPv6 (com `::` e forma mista) para os 16 bytes. */
export function parseIpv6(address: string): Uint8Array | null {
  const clean = address.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!clean.includes(":")) return null;

  let head = clean;
  let tailV4: number[] | null = null;
  const dotted = clean.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const parts = ipv4ToParts(dotted[1]);
    if (!parts) return null;
    tailV4 = parts;
    head = clean.slice(0, clean.length - dotted[1].length);
    head = head.replace(/:$/, head.endsWith("::") ? ":" : "");
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const piece of part.split(":")) {
      if (!piece) continue;
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };

  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!left || !right) return null;

  const tailGroups = tailV4
    ? [(tailV4[0] << 8) | tailV4[1], (tailV4[2] << 8) | tailV4[3]]
    : [];
  const total = left.length + right.length + tailGroups.length;
  if (total > 8) return null;
  if (halves.length === 1 && total !== 8) return null;

  const groups =
    halves.length === 2
      ? [...left, ...new Array(8 - total).fill(0), ...right, ...tailGroups]
      : [...left, ...right, ...tailGroups];
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = (group >> 8) & 0xff;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function bytesToV4(bytes: Uint8Array, offset: number): string {
  return Array.from(bytes.slice(offset, offset + 4)).join(".");
}

function isBlockedIpv4(address: string): boolean {
  const parts = ipv4ToParts(address);
  if (!parts) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // privado
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // privado
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 168) return true; // privado
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 e 192.0.2.0/24
  if (a === 192 && b === 88) return true; // 192.88.99.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51) return true; // documentacao
  if (a === 203 && b === 0) return true; // documentacao
  if (a >= 224) return true; // multicast e reservado
  return false;
}

/**
 * Enderecos que nunca devem ser alcancados a partir do servidor.
 *
 * Em IPv6 a politica e fechada: so passa unicast global (2000::/3), e os
 * prefixos que carregam um IPv4 embutido sao decodificados antes — senao
 * `[64:ff9b::a9fe:a9fe]` (NAT64) ou `[2002:a9fe:a9fe::]` (6to4) seriam rotas
 * silenciosas ate 169.254.169.254.
 */
export function isBlockedIp(ip: string): boolean {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

  if (net.isIPv4(address)) return isBlockedIpv4(address);
  if (!net.isIPv6(address)) return false;

  const bytes = parseIpv6(address);
  if (!bytes) return true;

  const is = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);

  // ::ffff:a.b.c.d e ::/96 (inclui :: e ::1)
  if (bytes.slice(0, 10).every((byte) => byte === 0)) {
    if (bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedIpv4(bytesToV4(bytes, 12));
    return true;
  }
  // NAT64 64:ff9b::/96 e 64:ff9b:1::/48
  if (is(0x00, 0x64, 0xff, 0x9b)) return isBlockedIpv4(bytesToV4(bytes, 12));
  // 6to4 2002::/16 carrega o IPv4 nos bytes 2..5
  if (is(0x20, 0x02)) return isBlockedIpv4(bytesToV4(bytes, 2));
  // Teredo 2001::/32 tambem embute IPv4; nao ha uso legitimo aqui.
  if (is(0x20, 0x01, 0x00, 0x00)) return true;
  // Documentacao
  if (is(0x20, 0x01, 0x0d, 0xb8)) return true;

  // Fora de 2000::/3 fica tudo de fora: loopback, ULA (fc00::/7), link-local
  // (fe80::/10), site-local (fec0::/10) e multicast (ff00::/8).
  return (bytes[0] & 0xe0) !== 0x20;
}

/**
 * Aceita apenas http/https e recusa de cara os hosts que ja sao endereco
 * interno escrito na propria URL. Nomes ainda passam pela checagem de DNS.
 */
export function parseProxyTarget(raw: string | null | undefined): ProxyTarget | ProxyRejected {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, reason: "MISSING_URL" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }

  // `data:`, `file:`, `blob:`, `gopher:`... nada disso tem uso legitimo aqui, e
  // `data:text/html` seria XSS servido pela nossa propria origem.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "BLOCKED_SCHEME" };
  }

  // "metadata.google.internal." e o mesmo host, mas escapava das comparacoes.
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!hostname) return { ok: false, reason: "INVALID_URL" };
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "BLOCKED_HOST" };
  }
  if (hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    return { ok: false, reason: "BLOCKED_HOST" };
  }
  if (isBlockedIp(hostname)) {
    return { ok: false, reason: "BLOCKED_HOST" };
  }

  return { ok: true, url };
}

const SAFE_TYPE_PREFIXES = ["image/", "audio/", "video/"];
const SAFE_TYPE_EXACT = new Set([
  "application/pdf",
  "application/ogg",
  "application/octet-stream",
  "binary/octet-stream",
]);

export interface SafeContentType {
  contentType: string;
  /** `inline` so para o que o navegador sabe exibir sem virar documento ativo. */
  disposition: "inline" | "attachment";
}

/**
 * Devolver o `content-type` do destino sem filtro transformava o proxy em
 * hospedagem de HTML na origem do app — ou seja, XSS com acesso ao cookie de
 * sessao. Aqui, o que nao for midia conhecida desce como download opaco.
 */
export function sanitizeContentType(raw: string | null | undefined): SafeContentType {
  const value = (raw || "").split(";")[0].trim().toLowerCase();

  if (value === "image/svg+xml") {
    // SVG dentro de <img> nunca executa script, e o CSP da resposta impede que
    // ele faca alguma coisa se alguem abrir a URL direto.
    return { contentType: "image/svg+xml", disposition: "inline" };
  }

  if (value === "application/pdf") {
    // PDF renderizado inline no dominio do app e vetor de phishing convincente.
    return { contentType: "application/pdf", disposition: "attachment" };
  }

  if (SAFE_TYPE_EXACT.has(value)) {
    return { contentType: value || "application/octet-stream", disposition: "inline" };
  }

  if (SAFE_TYPE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { contentType: value, disposition: "inline" };
  }

  return { contentType: "application/octet-stream", disposition: "attachment" };
}

export function rejectionStatus(reason: ProxyRejection): number {
  if (reason === "MISSING_URL" || reason === "INVALID_URL") return 400;
  if (reason === "TOO_LARGE") return 413;
  return 403;
}
