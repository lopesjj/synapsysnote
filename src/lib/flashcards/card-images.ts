import type { Flashcard } from "@/types/models";

export type CardSide = "front" | "back";

export interface CardImage {
  url: string | null;
  storagePath: string | null;
}

const EMPTY: CardImage = { url: null, storagePath: null };

function normalize(url: unknown, storagePath: unknown): CardImage {
  const cleanUrl = typeof url === "string" && url.trim() ? url : null;
  if (!cleanUrl) return EMPTY;
  return {
    url: cleanUrl,
    storagePath: typeof storagePath === "string" && storagePath.trim() ? storagePath : null,
  };
}

/**
 * Imagem de uma face. Cards criados antes da separação frente/verso guardavam
 * uma única `imageUrl`; ela continua valendo como imagem da frente, para que
 * nenhum card antigo perca a ilustração.
 */
export function cardImage(card: Partial<Flashcard>, side: CardSide): CardImage {
  if (side === "back") return normalize(card.backImageUrl, card.backImageStoragePath);
  const own = normalize(card.frontImageUrl, card.frontImageStoragePath);
  if (own.url) return own;
  return normalize(card.imageUrl, card.imageStoragePath);
}

export function hasCardImage(card: Partial<Flashcard>): boolean {
  return Boolean(cardImage(card, "front").url || cardImage(card, "back").url);
}

/**
 * Todo caminho de storage que pertence ao card, incluindo o campo legado.
 * É o que precisa ser apagado quando o card sai, para não deixar órfãos.
 */
export function cardStoragePaths(card: Partial<Flashcard>): string[] {
  const candidates = [
    card.frontImageStoragePath,
    card.backImageStoragePath,
    card.imageStoragePath,
  ];
  const paths = new Set<string>();
  for (const path of candidates) {
    if (typeof path === "string" && path.trim()) paths.add(path);
  }
  return [...paths];
}

/** Campos a gravar quando a imagem de uma face muda. */
export function cardImagePatch(side: CardSide, image: CardImage): Partial<Flashcard> {
  if (side === "back") {
    return { backImageUrl: image.url, backImageStoragePath: image.storagePath };
  }
  // Ao reescrever a frente o campo legado é zerado junto, senão ele voltaria a
  // valer como fallback e a imagem removida reapareceria.
  return {
    frontImageUrl: image.url,
    frontImageStoragePath: image.storagePath,
    imageUrl: null,
    imageStoragePath: null,
  };
}
