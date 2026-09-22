export interface CardSignature {
  front: string;
  compact: string;
  back: string;
  backCompact: string;
  frontTokens: Set<string>;
  backTokens: Set<string>;
}

const DUPLICATE_FRONT_SIMILARITY = 0.82;
const DUPLICATE_PAIR_FRONT_OVERLAP = 0.6;
const DUPLICATE_PAIR_BACK_OVERLAP = 0.7;
const MIN_CONTAINED_LENGTH = 14;
const MIN_CONTAINED_BACK_LENGTH = 8;
const MIN_FRONT_TOKENS = 2;
const MIN_BACK_TOKENS = 3;

export function fingerprint(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function contentTokens(value: string): Set<string> {
  const set = new Set<string>();
  for (const word of fingerprint(value).split(" ")) {
    if (word.length >= 4) set.add(word);
  }
  return set;
}

export function cardSignature(front: string, back: string): CardSignature {
  const normalizedFront = fingerprint(front) || front.trim().toLowerCase();
  const normalizedBack = fingerprint(back);
  return {
    front: normalizedFront,
    compact: normalizedFront.replace(/ /g, ""),
    back: normalizedBack,
    backCompact: normalizedBack.replace(/ /g, ""),
    frontTokens: contentTokens(front),
    backTokens: contentTokens(back),
  };
}

function sharedTokens(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared;
}

export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return sharedTokens(a, b) / Math.min(a.size, b.size);
}

export function jaccardRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = sharedTokens(a, b);
  return shared / (a.size + b.size - shared);
}

export function isSameCard(a: CardSignature, b: CardSignature): boolean {
  if (!a.front || !b.front) return false;
  if (a.front === b.front) return true;

  const shorter = a.compact.length <= b.compact.length ? a.compact : b.compact;
  const longer = shorter === a.compact ? b.compact : a.compact;
  if (shorter.length >= MIN_CONTAINED_LENGTH && longer.includes(shorter)) return true;

  if (
    a.frontTokens.size >= MIN_FRONT_TOKENS &&
    b.frontTokens.size >= MIN_FRONT_TOKENS &&
    jaccardRatio(a.frontTokens, b.frontTokens) >= DUPLICATE_FRONT_SIMILARITY
  ) {
    return true;
  }

  if (overlapRatio(a.frontTokens, b.frontTokens) >= DUPLICATE_PAIR_FRONT_OVERLAP && a.back && b.back) {
    const shorterBack =
      a.backCompact.length <= b.backCompact.length ? a.backCompact : b.backCompact;
    const longerBack = shorterBack === a.backCompact ? b.backCompact : a.backCompact;
    if (shorterBack.length >= MIN_CONTAINED_BACK_LENGTH && longerBack.includes(shorterBack)) {
      return true;
    }

    const backOverlap = overlapRatio(a.backTokens, b.backTokens);
    if (
      a.backTokens.size >= MIN_BACK_TOKENS &&
      b.backTokens.size >= MIN_BACK_TOKENS &&
      backOverlap >= DUPLICATE_PAIR_BACK_OVERLAP
    ) {
      return true;
    }
  }

  return false;
}

export function hasDuplicate(signatures: CardSignature[], candidate: CardSignature): boolean {
  return signatures.some((signature) => isSameCard(signature, candidate));
}
