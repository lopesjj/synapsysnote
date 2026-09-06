import "server-only";

/**
 * Notion allows ~3 requests/second per integration. Every call in the pipeline
 * goes through this helper, which paces requests and retries on 429/5xx.
 */
let nextAvailableSlot = 0;
const MIN_INTERVAL_MS = 340;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAvailableSlot - now);
  nextAvailableSlot = Math.max(now, nextAvailableSlot) + MIN_INTERVAL_MS;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

/**
 * Notion allows ~3 requests/second per integration. Every call in the pipeline
 * goes through this helper, which paces request dispatch and retries on 429/5xx.
 */
export async function throttled<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  await waitForSlot();
  try {
    return await fn();
  } catch (error) {
    const status = (error as { status?: number }).status ?? 0;
    const retryable = status === 429 || status === 409 || status >= 500;
    if (!retryable || attempt >= 5) throw error;
    const backoff = Math.min(16_000, 2 ** attempt * 500) + Math.random() * 250;
    nextAvailableSlot = Math.max(nextAvailableSlot, Date.now() + backoff);
    await sleep(backoff);
    return throttled(fn, attempt + 1);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

