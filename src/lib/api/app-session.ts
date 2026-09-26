import "server-only";

import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { readSessionCookies } from "@/lib/auth/session-cookie";

/**
 * Sessao para rotas chamadas pelo proprio navegador do usuario (proxy de midia,
 * transcricao). Diferente de `requireUser`, que espera um Bearer no cabecalho:
 * uma tag <img src="/api/..."> nao tem como mandar cabecalho, so cookie.
 */

/**
 * Em desenvolvimento o cookie de sessao nem chega a ser criado, entao exigi-lo
 * quebraria a midia local. A decisao vem do ambiente do processo: ler o host da
 * requisicao deixava qualquer um mandar `X-Forwarded-Host: localhost` e pular a
 * verificacao inteira.
 */
function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

const DEV_USER = "dev";

const REVOCATION_TTL_MS = 5 * 60 * 1000;
const revocation = new Map<string, { validAfterMs: number; checkedAt: number }>();

async function tokensValidAfter(uid: string): Promise<number> {
  const cached = revocation.get(uid);
  if (cached && Date.now() - cached.checkedAt < REVOCATION_TTL_MS) return cached.validAfterMs;
  const user = await adminAuth().getUser(uid);
  const validAfterMs = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  if (revocation.size > 5_000) revocation.clear();
  revocation.set(uid, { validAfterMs, checkedAt: Date.now() });
  return validAfterMs;
}

async function sessionCookieUser(): Promise<string | null> {
  const cookies = await readSessionCookies();
  for (const cookie of cookies) {
    try {
      const decoded = await adminAuth().verifySessionCookie(cookie);
      if (decoded.auth_time * 1000 < (await tokensValidAfter(decoded.uid))) continue;
      return decoded.uid;
    } catch {}
  }
  return null;
}

export async function appSessionUser(): Promise<string | null> {
  if (isDevelopmentRuntime()) return DEV_USER;
  if (!isAdminConfigured()) return null;
  return sessionCookieUser();
}

export async function hasValidAppSession(): Promise<boolean> {
  return (await appSessionUser()) !== null;
}

/**
 * Aceita o ID token do Firebase no cabecalho `Authorization` ou o cookie de
 * sessao e devolve o uid, usado tambem como chave do limite de uso.
 */
export async function appRequestUser(request: Request): Promise<string | null> {
  if (isDevelopmentRuntime()) return DEV_USER;
  if (!isAdminConfigured()) return null;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth().verifyIdToken(header.slice(7), true);
      return decoded.uid;
    } catch {}
  }
  return sessionCookieUser();
}

export async function authorizeAppRequest(request: Request): Promise<boolean> {
  return (await appRequestUser(request)) !== null;
}

export function rateLimitKey(uid: string | null, fallbackIp: string): string {
  return uid && uid !== DEV_USER ? `uid:${uid}` : `ip:${fallbackIp}`;
}
