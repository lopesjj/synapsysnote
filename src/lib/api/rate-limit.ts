/**
 * Limite de uso por chave (IP ou sessao), em memoria.
 *
 * Vale por instancia: com varias instancias o teto real e multiplicado, entao
 * isto segura o pior caso de uma instancia e nao substitui limite de borda.
 *
 * Contar requisicoes sozinho engana — abrir uma nota cheia de imagens ou
 * arrastar a linha do tempo de um video gera dezenas de chamadas legitimas em
 * segundos. O que realmente precisa de teto e a banda e a concorrencia.
 */

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxConcurrent: number;
  maxBytes: number;
  /** Injetavel para teste; por padrao o relogio do sistema. */
  now?: () => number;
  /** Acima disso o mapa e varrido, para nao crescer sem limite. */
  maxKeys?: number;
}

interface Entry {
  windowStart: number;
  count: number;
  inFlight: number;
  bytes: number;
}

export interface RateLimiter {
  take(key: string): boolean;
  release(key: string, bytes?: number): void;
  inspect(key: string): Readonly<Entry> | undefined;
  size(): number;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, maxRequests, maxConcurrent, maxBytes } = options;
  const clock = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 5_000;
  const buckets = new Map<string, Entry>();

  const sweep = (now: number) => {
    for (const [name, entry] of buckets) {
      if (entry.inFlight === 0 && now - entry.windowStart > windowMs) buckets.delete(name);
    }
  };

  return {
    take(key) {
      const now = clock();
      const entry = buckets.get(key) ?? { windowStart: now, count: 0, inFlight: 0, bytes: 0 };

      if (now - entry.windowStart > windowMs) {
        entry.windowStart = now;
        entry.count = 0;
        entry.bytes = 0;
      }

      if (
        entry.count >= maxRequests ||
        entry.inFlight >= maxConcurrent ||
        entry.bytes >= maxBytes
      ) {
        buckets.set(key, entry);
        return false;
      }

      entry.count += 1;
      entry.inFlight += 1;
      buckets.set(key, entry);

      if (buckets.size > maxKeys) sweep(now);
      return true;
    },

    release(key, bytes = 0) {
      const entry = buckets.get(key);
      if (!entry) return;
      entry.inFlight = Math.max(0, entry.inFlight - 1);
      entry.bytes += bytes;
      buckets.set(key, entry);
    },

    inspect(key) {
      return buckets.get(key);
    },

    size() {
      return buckets.size;
    },
  };
}
