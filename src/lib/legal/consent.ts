/**
 * Consentimento de cookies. Lido pelo proxy (servidor) e pelo banner (cliente),
 * por isso não depende de nada do navegador.
 *
 * Essenciais não entram aqui: sessão, idioma escolhido e estado do OAuth
 * funcionam sempre. A única categoria opcional hoje é a funcional, que cobre o
 * cache do país detectado pelo IP (`synapsys_geo`). Análise e publicidade não
 * existem no produto, então não há o que consentir.
 */

export const CONSENT_COOKIE = "synapsys_consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

/** Sobe quando as categorias mudarem, para o banner perguntar de novo. */
const CONSENT_VERSION = 1;

export interface CookieConsent {
  functional: boolean;
}

export function serializeConsent(consent: CookieConsent): string {
  return `v${CONSENT_VERSION}.f${consent.functional ? 1 : 0}`;
}

export function parseConsent(value: string | null | undefined): CookieConsent | null {
  const match = value?.match(/^v(\d+)\.f([01])$/);
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  return { functional: match[2] === "1" };
}

export function allowsFunctionalCookies(value: string | null | undefined): boolean {
  return parseConsent(value)?.functional === true;
}
