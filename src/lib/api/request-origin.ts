/**
 * Origem da requisicao, sem depender de nada de servidor — por isso fica fora
 * de `app-session.ts`, que e `server-only` e nao carrega em teste.
 */

/**
 * Aceita apenas o que veio da propria origem.
 *
 * `same-site` inclui subdominio irmao, que pode ser de terceiros ou estar
 * comprometido. So `same-origin` e `none` (navegacao direta) passam; a ausencia
 * do cabecalho vem de cliente antigo e nao e tratada como hostil.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (!site) return true;
  return site === "same-origin" || site === "none";
}

export function isCrossSiteRequest(request: Request): boolean {
  return !isSameOriginRequest(request);
}
