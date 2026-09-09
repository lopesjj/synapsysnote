export const REMEMBER_DAYS = 7;

const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const KEY = "synapsys.auth.remember-until";

function readUntil(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const until = Number(raw);
    return Number.isFinite(until) ? until : null;
  } catch {
    return null;
  }
}

export function markRemembered(remember: boolean) {
  try {
    if (remember) window.localStorage.setItem(KEY, String(Date.now() + REMEMBER_MS));
    else window.localStorage.removeItem(KEY);
  } catch {}
}

export function clearRemembered() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

export function isRememberActive(): boolean {
  const until = readUntil();
  return until !== null && until > Date.now();
}

export function isRememberExpired(): boolean {
  const until = readUntil();
  return until !== null && until <= Date.now();
}

export function adoptLegacySession() {
  if (readUntil() !== null) return;
  markRemembered(true);
}
