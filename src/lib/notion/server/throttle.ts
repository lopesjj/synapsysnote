import "server-only";

export async function throttled<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    const result = await fn();
    await sleep(340);
    return result;
  } catch (error) {
    const status = (error as { status?: number }).status ?? 0;
    const retryable = status === 429 || status === 409 || status >= 500;
    if (!retryable || attempt >= 5) throw error;
    const backoff = Math.min(16_000, 2 ** attempt * 500) + Math.random() * 250;
    await sleep(backoff);
    return throttled(fn, attempt + 1);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
