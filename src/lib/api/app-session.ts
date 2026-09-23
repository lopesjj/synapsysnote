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

async function hasSessionCookie(): Promise<boolean> {
  const cookies = await readSessionCookies();
  for (const cookie of cookies) {
    try {
      await adminAuth().verifySessionCookie(cookie);
      return true;
    } catch {}
  }
  return false;
}

export async function hasValidAppSession(): Promise<boolean> {
  if (isDevelopmentRuntime()) return true;
  // Em producao, sem Admin nao ha como validar ninguem: melhor recusar.
  if (!isAdminConfigured()) return false;
  return hasSessionCookie();
}

/**
 * Aceita o ID token do Firebase no cabecalho `Authorization` ou o cookie de
 * sessao. O token vale em qualquer host e nao depende do cookie, que expira
 * antes da sessao do navegador quando "Manter conectado" fica desmarcado.
 */
export async function authorizeAppRequest(request: Request): Promise<boolean> {
  if (isDevelopmentRuntime()) return true;
  if (!isAdminConfigured()) return false;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      await adminAuth().verifyIdToken(header.slice(7));
      return true;
    } catch {}
  }
  return hasSessionCookie();
}
