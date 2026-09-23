import type { AppBlock } from "@/types/models";


function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" || nested === undefined) continue;
      out[key] = stripIds(nested);
    }
    return out;
  }
  return value;
}

export function blockKey(block: AppBlock): string {
  const { media, children, ...rest } = block;
  const identity = media ? { file: media.storagePath || media.url || "" } : undefined;
  return JSON.stringify(
    stripIds({
      ...rest,
      ...(identity ? { media: identity } : {}),
      ...(children?.length ? { children: children.map(blockKey) } : {}),
    })
  );
}

export function sameBlocks(a: AppBlock[], b: AppBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (blockKey(a[index]) !== blockKey(b[index])) return false;
  }
  return true;
}

function lcsMatch(base: string[], other: string[]): number[] {
  const n = base.length;
  const m = other.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] =
        base[i] === other[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const match = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === other[j]) {
      match[i] = j;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return match;
}

export interface BlockMergeResult {
  blocks: AppBlock[];
  conflict: boolean;
}

function insertionsByAnchor(match: number[], keys: string[]): Map<number, number[]> {
  const baseOf = new Map<number, number>();
  match.forEach((otherIndex, baseIndex) => {
    if (otherIndex >= 0) baseOf.set(otherIndex, baseIndex);
  });
  const runs = new Map<number, number[]>();
  let anchor = -1;
  for (let index = 0; index < keys.length; index += 1) {
    const baseIndex = baseOf.get(index);
    if (baseIndex !== undefined) {
      anchor = baseIndex;
      continue;
    }
    const run = runs.get(anchor) ?? [];
    run.push(index);
    runs.set(anchor, run);
  }
  return runs;
}

export function mergeBlocks(base: AppBlock[], local: AppBlock[], remote: AppBlock[]): BlockMergeResult {
  const o = base.map(blockKey);
  const a = local.map(blockKey);
  const b = remote.map(blockKey);
  const matchA = lcsMatch(o, a);
  const matchB = lcsMatch(o, b);
  const insertsA = insertionsByAnchor(matchA, a);
  const insertsB = insertionsByAnchor(matchB, b);
  const out: AppBlock[] = [];
  let conflict = false;

  const emitInsertions = (anchor: number) => {
    const runA = insertsA.get(anchor) ?? [];
    const runB = insertsB.get(anchor) ?? [];
    const keysA = runA.map((index) => a[index]);
    const keysB = runB.map((index) => b[index]);
    for (const index of runA) out.push(local[index]);
    if (!runB.length) return;
    if (keysA.length === keysB.length && keysA.every((key, i) => key === keysB[i])) return;
    const seen = new Set(keysA);
    if (runA.length) conflict = true;
    for (const index of runB) {
      if (seen.has(b[index])) continue;
      out.push(remote[index]);
    }
  };

  emitInsertions(-1);
  for (let index = 0; index < o.length; index += 1) {
    if (matchA[index] >= 0 && matchB[index] >= 0) out.push(local[matchA[index]]);
    emitInsertions(index);
  }

  return { blocks: out, conflict };
}
