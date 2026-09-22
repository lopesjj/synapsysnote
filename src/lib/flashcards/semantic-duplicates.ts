import { contentTokens } from "./duplicate-cards";

export interface EmbeddableCard {
  front: string;
  back: string;
}

export interface SemanticFilterInput {
  apiKey: string;
  existing: EmbeddableCard[];
  candidates: EmbeddableCard[];
  threshold?: number;
  timeBudgetMs?: number;
}

export interface SemanticFilterResult {
  keep: boolean[];
  duplicates: number;
  applied: boolean;
  comparedExisting: number;
  error?: string;
}

const DEFAULT_THRESHOLD = 0.92;
const BATCH_SIZE = 50;
const EMBEDDING_DIMENSION = 768;
const MAX_TEXT_CHARS = 1_200;
const MAX_EXISTING_EMBEDDINGS = 400;
const MAX_CANDIDATE_EMBEDDINGS = 400;
const MIN_TIME_BUDGET_MS = 12_000;
const CACHE_LIMIT = 4_000;
const CACHE_TRIM = 1_000;

const cache = new Map<string, number[]>();

function readThreshold(explicit?: number): number {
  if (typeof explicit === "number" && explicit > 0 && explicit <= 1) return explicit;
  const raw = Number(process.env.GEMINI_DUPLICATE_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return DEFAULT_THRESHOLD;
}

function embeddingModels(): string[] {
  return Array.from(
    new Set(
      [
        process.env.GEMINI_EMBEDDING_MODEL,
        process.env.EMBEDDING_MODEL,
        "gemini-embedding-001",
        "text-embedding-004",
      ].filter(Boolean) as string[]
    )
  );
}

export function cardText(card: EmbeddableCard): string {
  const front = card.front.replace(/\s+/g, " ").trim();
  const back = card.back.replace(/\s+/g, " ").trim();
  return `${front}\n${back}`.slice(0, MAX_TEXT_CHARS).trim();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function relatedExisting(
  existing: EmbeddableCard[],
  candidates: EmbeddableCard[],
  limit: number = MAX_EXISTING_EMBEDDINGS
): EmbeddableCard[] {
  if (existing.length <= limit) return existing;

  const candidateTokens = new Set<string>();
  for (const candidate of candidates) {
    for (const token of contentTokens(`${candidate.front} ${candidate.back}`)) {
      candidateTokens.add(token);
    }
  }
  if (candidateTokens.size === 0) return existing.slice(0, limit);

  const scored: { card: EmbeddableCard; score: number }[] = [];
  for (const card of existing) {
    let score = 0;
    for (const token of contentTokens(`${card.front} ${card.back}`)) {
      if (candidateTokens.has(token)) score += 1;
    }
    if (score > 0) scored.push({ card, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.card);
}

function rememberVector(key: string, vector: number[]): void {
  if (cache.size >= CACHE_LIMIT) {
    let removed = 0;
    for (const existingKey of cache.keys()) {
      cache.delete(existingKey);
      removed += 1;
      if (removed >= CACHE_TRIM) break;
    }
  }
  cache.set(key, vector);
}

async function embedBatch(
  apiKey: string,
  model: string,
  texts: string[]
): Promise<number[][] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
  const supportsDimensionality = model.startsWith("gemini-embedding");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: "SEMANTIC_SIMILARITY",
        ...(supportsDimensionality ? { outputDimensionality: EMBEDDING_DIMENSION } : {}),
      })),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(String(body?.error?.message || `Embedding API error ${response.status}`));
  }

  const data = await response.json();
  const embeddings = data?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) return null;

  const vectors: number[][] = [];
  for (const entry of embeddings) {
    const values = entry?.values;
    if (!Array.isArray(values) || values.length === 0) return null;
    vectors.push(values as number[]);
  }
  return vectors;
}

async function embedTexts(
  apiKey: string,
  texts: string[],
  deadline: number
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const models = embeddingModels();
  const queued = new Set<string>();
  const pending: string[] = [];

  for (const text of texts) {
    if (!text) continue;
    if (result.has(text) || queued.has(text)) continue;
    const cached = cache.get(text);
    if (cached) {
      result.set(text, cached);
      continue;
    }
    queued.add(text);
    pending.push(text);
  }

  if (pending.length === 0) return result;

  let modelIndex = 0;
  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    if (Date.now() >= deadline) break;
    const slice = pending.slice(start, start + BATCH_SIZE);

    let vectors: number[][] | null = null;
    let lastError: unknown = null;
    while (modelIndex < models.length && !vectors) {
      try {
        vectors = await embedBatch(apiKey, models[modelIndex], slice);
        if (!vectors) modelIndex += 1;
      } catch (error) {
        lastError = error;
        modelIndex += 1;
      }
    }

    if (!vectors) {
      if (lastError instanceof Error) throw lastError;
      throw new Error("EMBEDDING_UNAVAILABLE");
    }

    slice.forEach((text, index) => {
      result.set(text, vectors![index]);
      rememberVector(text, vectors![index]);
    });
  }

  return result;
}

export async function filterSemanticDuplicates(
  input: SemanticFilterInput
): Promise<SemanticFilterResult> {
  const keep = input.candidates.map(() => true);
  const fallback: SemanticFilterResult = {
    keep,
    duplicates: 0,
    applied: false,
    comparedExisting: 0,
  };

  if (!input.apiKey) return fallback;
  if (input.candidates.length === 0) return fallback;

  const timeBudget = input.timeBudgetMs ?? MIN_TIME_BUDGET_MS;
  if (timeBudget < MIN_TIME_BUDGET_MS) return fallback;

  const candidates = input.candidates.slice(0, MAX_CANDIDATE_EMBEDDINGS);
  const existing = relatedExisting(input.existing, candidates);
  if (existing.length === 0 && candidates.length < 2) return fallback;

  const threshold = readThreshold(input.threshold);
  const deadline = Date.now() + timeBudget;

  const candidateTexts = candidates.map(cardText);
  const existingTexts = existing.map(cardText);

  let vectors: Map<string, number[]>;
  try {
    vectors = await embedTexts(input.apiKey, [...existingTexts, ...candidateTexts], deadline);
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "EMBEDDING_FAILED",
    };
  }

  const existingVectors: number[][] = [];
  for (const text of existingTexts) {
    const vector = vectors.get(text);
    if (vector) existingVectors.push(vector);
  }

  const keptVectors: number[][] = [];
  let duplicates = 0;
  let compared = 0;

  candidates.forEach((_card, index) => {
    const vector = vectors.get(candidateTexts[index]);
    if (!vector) return;
    compared += 1;

    for (const reference of existingVectors) {
      if (cosineSimilarity(vector, reference) >= threshold) {
        keep[index] = false;
        duplicates += 1;
        return;
      }
    }

    for (const reference of keptVectors) {
      if (cosineSimilarity(vector, reference) >= threshold) {
        keep[index] = false;
        duplicates += 1;
        return;
      }
    }

    keptVectors.push(vector);
  });

  return {
    keep,
    duplicates,
    applied: compared > 0,
    comparedExisting: existingVectors.length,
  };
}
