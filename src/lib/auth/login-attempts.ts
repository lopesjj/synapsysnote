export const LOGIN_ATTEMPTS_THRESHOLD = 3;
export const LOGIN_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

const ATTEMPTS_KEY = "synapsys.auth.failed_attempts";
const EMAIL_KEY_PATTERN = /^[0-9a-f]{14}$/;

interface AttemptRecord {
  count: number;
  lastAttemptAt: number;
}

interface StoredAttempts {
  global: AttemptRecord;
  byEmail?: Record<string, AttemptRecord>;
}

let memoryStore: StoredAttempts | null = null;

function emptyAttempts(): StoredAttempts {
  return { global: { count: 0, lastAttemptAt: 0 } };
}

function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : "";
}

function hashEmail(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

function emailKey(email?: string | null): string {
  const normalized = normalizeEmail(email);
  return normalized ? hashEmail(normalized) : "";
}

function isExpired(timestamp: number): boolean {
  if (!timestamp) return true;
  return Date.now() - timestamp > LOGIN_ATTEMPTS_WINDOW_MS;
}

function liveRecord(value: unknown): AttemptRecord | null {
  if (!value || typeof value !== "object") return null;
  const { count, lastAttemptAt } = value as Partial<AttemptRecord>;
  if (typeof count !== "number" || typeof lastAttemptAt !== "number") return null;
  if (!(count > 0) || isExpired(lastAttemptAt)) return null;
  return { count, lastAttemptAt };
}

function pruneAttempts(value: unknown): StoredAttempts | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { global?: unknown; byEmail?: unknown };
  const global = liveRecord(source.global);
  const byEmail: Record<string, AttemptRecord> = {};
  if (source.byEmail && typeof source.byEmail === "object") {
    for (const [key, record] of Object.entries(source.byEmail as Record<string, unknown>)) {
      if (!EMAIL_KEY_PATTERN.test(key)) continue;
      const live = liveRecord(record);
      if (live) byEmail[key] = live;
    }
  }
  if (!global && Object.keys(byEmail).length === 0) return null;
  return { global: global ?? { count: 0, lastAttemptAt: 0 }, byEmail };
}

function readStorage(): StoredAttempts {
  if (typeof window === "undefined" || !window.localStorage) {
    memoryStore = pruneAttempts(memoryStore);
    return memoryStore ?? emptyAttempts();
  }
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return emptyAttempts();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {}
    const pruned = pruneAttempts(parsed);
    if (!pruned || JSON.stringify(pruned) !== raw) writeStorage(pruned);
    return pruned ?? emptyAttempts();
  } catch {
    return memoryStore ?? emptyAttempts();
  }
}

function writeStorage(data: StoredAttempts | null): void {
  memoryStore = data;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (data) {
      window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(ATTEMPTS_KEY);
    }
  } catch {}
}

export function getFailedLoginAttempts(email?: string | null): number {
  const data = readStorage();
  const key = emailKey(email);
  const globalCount = data.global.count || 0;
  const emailCount = key ? data.byEmail?.[key]?.count || 0 : 0;
  return Math.max(globalCount, emailCount);
}

export function recordFailedLoginAttempt(email?: string | null): number {
  const data = readStorage();
  const key = emailKey(email);
  const now = Date.now();

  const nextGlobalCount = (data.global.count || 0) + 1;
  const byEmail: Record<string, AttemptRecord> = { ...(data.byEmail ?? {}) };

  let nextEmailCount = nextGlobalCount;
  if (key) {
    nextEmailCount = (byEmail[key]?.count || 0) + 1;
    byEmail[key] = {
      count: nextEmailCount,
      lastAttemptAt: now,
    };
  }

  writeStorage({
    global: { count: nextGlobalCount, lastAttemptAt: now },
    byEmail,
  });

  return Math.max(nextGlobalCount, nextEmailCount);
}

export function clearFailedLoginAttempts(email?: string | null): void {
  const key = emailKey(email);
  if (!key) {
    writeStorage(null);
    return;
  }

  const data = readStorage();
  const byEmail: Record<string, AttemptRecord> = { ...(data.byEmail ?? {}) };
  delete byEmail[key];

  writeStorage(pruneAttempts({ global: { count: 0, lastAttemptAt: 0 }, byEmail }));
}

export function isCaptchaRequiredForLogin(
  email?: string | null,
  threshold = LOGIN_ATTEMPTS_THRESHOLD
): boolean {
  return getFailedLoginAttempts(email) >= threshold;
}
