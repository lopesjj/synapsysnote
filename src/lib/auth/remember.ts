/** How long a "keep me signed in" session lasts. */
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
  } catch {
    // Private browsing: session persistence still covers this visit.
  }
}

export function clearRemembered() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isRememberActive(): boolean {
  const until = readUntil();
  return until !== null && until > Date.now();
}

export function isRememberExpired(): boolean {
  const until = readUntil();
  return until !== null && until <= Date.now();
}

/** Legacy infinite sessions get a fresh 7-day window instead of being dropped. */
export function adoptLegacySession() {
  if (readUntil() !== null) return;
  markRemembered(true);
}
