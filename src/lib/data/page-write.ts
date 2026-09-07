import type { AppBlock, Page } from "@/types/models";

const IGNORED_KEYS = new Set(["updatedAt", "updatedBy", "id"]);

export function stripBlockIds(blocks: AppBlock[]): unknown[] {
  return blocks.map(({ id: _id, children, ...rest }) => ({
    ...rest,
    children: children ? stripBlockIds(children) : children,
  }));
}

export function canonicalizePagePatch(patch: Partial<Page> | Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || IGNORED_KEYS.has(key)) continue;
    out[key] = key === "blocks" && Array.isArray(value) ? stripBlockIds(value as AppBlock[]) : value;
  }
  return out;
}

export function pagePatchIsNoop(
  baseline: Partial<Page> | Record<string, unknown>,
  patch: Partial<Page> | Record<string, unknown>
): boolean {
  const next = canonicalizePagePatch(patch);
  const keys = Object.keys(next);
  if (!keys.length) return true;
  const prev = canonicalizePagePatch(baseline);
  return keys.every((key) => JSON.stringify(prev[key]) === JSON.stringify(next[key]));
}
