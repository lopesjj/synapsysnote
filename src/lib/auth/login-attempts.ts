export const LOGIN_ATTEMPTS_THRESHOLD = 3;
export const LOGIN_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

const ATTEMPTS_KEY = "synapsys.auth.failed_attempts";

interface AttemptRecord {
  count: number;
  lastAttemptAt: number;
}

interface StoredAttempts {
  global: AttemptRecord;
  byEmail?: Record<string, AttemptRecord>;
}

let memoryStore: StoredAttempts | null = null;

function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : "";
}

function isExpired(timestamp: number): boolean {
  if (!timestamp) return true;
  return Date.now() - timestamp > LOGIN_ATTEMPTS_WINDOW_MS;
}

function readStorage(): StoredAttempts {
  if (typeof window === "undefined" || !window.localStorage) {
    return memoryStore ?? { global: { count: 0, lastAttemptAt: 0 } };
  }
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return { global: { count: 0, lastAttemptAt: 0 } };
    const parsed = JSON.parse(raw) as StoredAttempts;
    return parsed;
  } catch {
    return memoryStore ?? { global: { count: 0, lastAttemptAt: 0 } };
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
  const normEmail = normalizeEmail(email);

  let globalCount = 0;
  if (data.global && !isExpired(data.global.lastAttemptAt)) {
    globalCount = data.global.count || 0;
  }

  let emailCount = 0;
  if (normEmail && data.byEmail?.[normEmail]) {
    const record = data.byEmail[normEmail];
    if (!isExpired(record.lastAttemptAt)) {
      emailCount = record.count || 0;
    }
  }

  return Math.max(globalCount, emailCount);
}

export function recordFailedLoginAttempt(email?: string | null): number {
  const data = readStorage();
  const normEmail = normalizeEmail(email);
  const now = Date.now();

  const currentGlobal = !data.global || isExpired(data.global.lastAttemptAt)
    ? { count: 0, lastAttemptAt: now }
    : data.global;

  const nextGlobalCount = (currentGlobal.count || 0) + 1;
  const newGlobal: AttemptRecord = {
    count: nextGlobalCount,
    lastAttemptAt: now,
  };

  const byEmail: Record<string, AttemptRecord> = {};
  if (data.byEmail) {
    for (const [key, record] of Object.entries(data.byEmail)) {
      if (!isExpired(record.lastAttemptAt)) {
        byEmail[key] = record;
      }
    }
  }

  let nextEmailCount = nextGlobalCount;
  if (normEmail) {
    const currentEmail = !byEmail[normEmail] || isExpired(byEmail[normEmail].lastAttemptAt)
      ? { count: 0, lastAttemptAt: now }
      : byEmail[normEmail];
    nextEmailCount = (currentEmail.count || 0) + 1;
    byEmail[normEmail] = {
      count: nextEmailCount,
      lastAttemptAt: now,
    };
  }

  writeStorage({
    global: newGlobal,
    byEmail,
  });

  return Math.max(nextGlobalCount, nextEmailCount);
}

export function clearFailedLoginAttempts(email?: string | null): void {
  const normEmail = normalizeEmail(email);
  if (!normEmail) {
    writeStorage(null);
    return;
  }

  const data = readStorage();
  if (data.byEmail && data.byEmail[normEmail]) {
    delete data.byEmail[normEmail];
  }

  writeStorage({
    global: { count: 0, lastAttemptAt: 0 },
    byEmail: data.byEmail || {},
  });
}

export function isCaptchaRequiredForLogin(
  email?: string | null,
  threshold = LOGIN_ATTEMPTS_THRESHOLD
): boolean {
  return getFailedLoginAttempts(email) >= threshold;
}
