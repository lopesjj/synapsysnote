/**
 * IP de quem chamou, extraido do `X-Forwarded-For`.
 *
 * Atras do Application Load Balancer externo do Google o header chega como
 * `<valor-enviado-pelo-cliente>,<client-ip>,<lb-ip>`, e o balanceador NAO valida
 * nada que venha antes dos dois ultimos elementos. Pegar o primeiro — o reflexo
 * de sempre — entrega a chave ao atacante: basta mandar um
 * `X-Forwarded-For: 1.2.3.4` diferente a cada requisicao para ganhar um balde de
 * limite novo toda vez, e qualquer teto vira decoracao.
 *
 * Por isso o confiavel e o PENULTIMO elemento.
 */

export const UNKNOWN_CLIENT_IP = "sem-ip";

function normalize(value: string): string {
  const trimmed = value.trim();
  // IPv6 entre colchetes, com ou sem porta: [::1]:443
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1].toLowerCase();
  // IPv4 com porta (o IPv6 cru tem varios ":" e nao entra aqui)
  const withPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (withPort) return withPort[1];
  return trimmed.toLowerCase();
}

/**
 * Quantos elementos no fim do header foram escritos por infraestrutura nossa.
 *
 * No ALB externo do Google e 1 (o IP do proprio balanceador), entao o cliente e
 * o penultimo. Fica em variavel de ambiente porque a unica forma honesta de
 * confirmar o formato e olhar o log de producao — e ai o ajuste nao exige
 * recompilar.
 */
const INFRA_PROXIES = new Set(["35.219.200.8", "127.0.0.1", "::1", "unknown"]);

function isInfraProxy(ip: string): boolean {
  if (INFRA_PROXIES.has(ip)) return true;
  if (ip.startsWith("169.254.")) return true;
  return false;
}

function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(raw) && raw >= 0 ? raw : 1;
}

export function clientIpFromHeader(
  headerValue: string | null | undefined,
  hops = 1
): string {
  if (!headerValue) return UNKNOWN_CLIENT_IP;

  const parts = headerValue
    .split(",")
    .map(normalize)
    .filter(Boolean);

  if (!parts.length) return UNKNOWN_CLIENT_IP;

  let index = parts.length - 1 - hops;
  if (index < 0) index = 0;

  while (index > 0 && isInfraProxy(parts[index])) {
    index -= 1;
  }

  if (isInfraProxy(parts[index])) {
    const candidate = parts.find((p) => !isInfraProxy(p));
    if (candidate) return candidate;
  }

  return parts[index];
}

let shapeLogged = false;

export function clientIpOf(request: Request): string {
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && !isInfraProxy(normalize(xRealIp))) {
    return normalize(xRealIp);
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && !isInfraProxy(normalize(cfIp))) {
    return normalize(cfIp);
  }

  const fastlyIp = request.headers.get("fastly-client-ip");
  if (fastlyIp && !isInfraProxy(normalize(fastlyIp))) {
    return normalize(fastlyIp);
  }

  const header = request.headers.get("x-forwarded-for");

  if (!shapeLogged && header) {
    shapeLogged = true;
    const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
    console.info(
      `[client-ip] x-forwarded-for com ${parts.length} elemento(s); ` +
        `dois ultimos: ${parts.slice(-2).join(" | ")}`
    );
  }

  return clientIpFromHeader(header, trustedHops());
}
