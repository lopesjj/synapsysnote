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

export async function hasValidAppSession(): Promise<boolean> {
  // Sem Admin configurado nao ha como validar ninguem; as demais defesas da
  // rota seguem valendo.
  if (!isAdminConfigured()) return true;
  if (isDevelopmentRuntime()) return true;

  const cookies = await readSessionCookies();
  for (const cookie of cookies) {
    try {
      await adminAuth().verifySessionCookie(cookie);
      return true;
    } catch {}
  }
  return false;
}
