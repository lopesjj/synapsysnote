export interface CardSignature {
  front: string;
  compact: string;
  back: string;
  backCompact: string;
  frontTokens: Set<string>;
  backTokens: Set<string>;
  /** Núcleo da resposta: a primeira oração, antes da justificativa. */
  backCore: Set<string>;
  /** Siglas escritas em caixa alta na resposta. */
  acronyms: Set<string>;
}

const DUPLICATE_FRONT_SIMILARITY = 0.82;
const DUPLICATE_PAIR_FRONT_OVERLAP = 0.6;
const DUPLICATE_PAIR_BACK_OVERLAP = 0.7;
const MIN_CONTAINED_LENGTH = 14;
const MIN_CONTAINED_BACK_LENGTH = 8;
const MIN_FRONT_TOKENS = 2;
const MIN_BACK_TOKENS = 3;
/** Quanto do núcleo da resposta precisa estar na pergunta do outro card. */
const ANSWER_LEAK_OVERLAP = 0.8;
/** Palavra longa em comum: evita casar por "para", "dias", "como" e afins. */
const MEANINGFUL_TOKEN_LENGTH = 5;
/** Onde a primeira oração da resposta termina. */
const ANSWER_CORE_STOPS = [".", ";", "!", "?", String.fromCharCode(10)];

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

/**
 * Siglas da resposta. "DHCP" tem quatro letras e cairia no mesmo balde de
 * "dias", mas carrega o assunto inteiro: vale como palavra cheia.
 */
function acronymsOf(value: string): Set<string> {
  const set = new Set<string>();
  for (const match of value.matchAll(/\b[\p{Lu}]{2,}\b/gu)) {
    const token = fingerprint(match[0]);
    if (token.length >= 2) set.add(token);
  }
  return set;
}

/**
 * A primeira oração da resposta. Modelos escrevem "X. E isso porque…": o que
 * identifica o card é o X, e é ele que denuncia um par invertido.
 */
function answerCore(back: string): Set<string> {
  let cut = back.length;
  for (const stop of ANSWER_CORE_STOPS) {
    const at = back.indexOf(stop);
    if (at >= 0 && at < cut) cut = at;
  }
  const core = contentTokens(back.slice(0, cut));
  return core.size ? core : contentTokens(back);
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
    backCore: answerCore(back),
    acronyms: acronymsOf(back),
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

function hasMeaningfulShare(core: Set<string>, question: Set<string>, acronyms: Set<string>): boolean {
  for (const token of core) {
    if (!question.has(token)) continue;
    if (token.length >= MEANINGFUL_TOKEN_LENGTH || acronyms.has(token)) return true;
  }
  return false;
}

/**
 * Par invertido: a resposta de um card já está escrita na pergunta do outro —
 * comando e efeito, termo e definição, causa e consequência vindos dos dois
 * lados. Quem estudou o primeiro não tem o que recuperar no segundo, então o
 * segundo não é um card, é a mesma informação de trás para frente.
 */
export function isInvertedPair(a: CardSignature, b: CardSignature): boolean {
  // Numa inversão o assunto troca de lado — sai da pergunta e vira resposta —,
  // então não dá para exigir assunto em comum entre as duas perguntas. O que
  // segura o falso positivo é a palavra cheia compartilhada.
  const givesAway = (asker: CardSignature, answerer: CardSignature) =>
    answerer.backCore.size > 0 &&
    overlapRatio(answerer.backCore, asker.frontTokens) >= ANSWER_LEAK_OVERLAP &&
    hasMeaningfulShare(answerer.backCore, asker.frontTokens, answerer.acronyms);
  return givesAway(a, b) || givesAway(b, a);
}

export function isSameCard(a: CardSignature, b: CardSignature): boolean {
  if (!a.front || !b.front) return false;
  if (a.front === b.front) return true;
  if (isInvertedPair(a, b)) return true;

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
