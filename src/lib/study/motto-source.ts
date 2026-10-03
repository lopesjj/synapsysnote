import "server-only";

import { createHash } from "node:crypto";
import { canonMotto, pickUnseen, quoteFitsTheme, type RemoteMotto } from "./mottos";

const SOURCE = "https://zenquotes.io/api/quotes";
const POOL_TTL_MS = 6 * 60 * 60 * 1000;
const REFRESH_GAP_MS = 20_000;

let pool: RemoteMotto[] = [];
let pooledAt = 0;
let fetchedAt = 0;

function mottoId(author: string, text: string): string {
  return createHash("sha256").update(`${author.toLowerCase()}|${text.toLowerCase()}`).digest("hex").slice(0, 20);
}

function authorOf(value: string): string {
  const name = canonMotto(value).slice(0, 80);
  if (!name || /^unknown$/i.test(name)) return "";
  return name;
}

function fromPayload(payload: unknown): RemoteMotto[] {
  if (!Array.isArray(payload)) return [];
  const quotes: RemoteMotto[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as { q?: unknown; a?: unknown };
    const text = typeof raw.q === "string" ? canonMotto(raw.q) : "";
    if (!quoteFitsTheme(text)) continue;
    const author = typeof raw.a === "string" ? authorOf(raw.a) : "";
    quotes.push({ id: mottoId(author, text), text, author });
  }
  return quotes;
}

async function refreshPool(force: boolean): Promise<RemoteMotto[]> {
  const now = Date.now();
  if (!force && pool.length && now - pooledAt < POOL_TTL_MS) return pool;
  if (pool.length && now - fetchedAt < (force ? 2_000 : REFRESH_GAP_MS)) return pool;
  fetchedAt = now;
  const response = await fetch(SOURCE, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return pool;
  const incoming = fromPayload(await response.json());
  const merged = new Map(pool.map((quote) => [quote.id, quote]));
  for (const quote of incoming) merged.set(quote.id, quote);
  pool = [...merged.values()].slice(-500);
  pooledAt = Date.now();
  return pool;
}

export async function nextRemoteMotto(seen: string[]): Promise<RemoteMotto | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const batch = await refreshPool(attempt > 0);
    const choice = pickUnseen(batch, seen);
    if (choice) return choice;
  }
  return null;
}
