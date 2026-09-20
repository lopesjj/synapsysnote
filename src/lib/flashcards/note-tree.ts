import type { Flashcard, Notebook, Page } from "@/types/models";
import { childrenOf } from "@/lib/data/notebook-tree";
import { compareNatural } from "@/lib/utils";
import { isCardDueForReview } from "./srs";

/** Uma nota na árvore, com os próprios cards e os das subnotas abaixo dela. */
export interface CardNode {
  page: Page;
  depth: number;
  cards: Flashcard[];
  due: number;
  subtreeCards: Flashcard[];
  subtreeDue: number;
  children: CardNode[];
}

/**
 * Um caderno na árvore. Cadernos aninham em cadernos — é o que a barra lateral
 * chama de página no topo: página > cadernos > notas > subnotas.
 */
export interface DeckNode {
  /** `null` no grupo das notas que não estão em nenhum caderno. */
  notebook: Notebook | null;
  depth: number;
  /** Notas diretamente neste caderno, com as subnotas aninhadas. */
  nodes: CardNode[];
  /** Cadernos filhos. */
  children: DeckNode[];
  /** Todos os cards da subárvore: notas deste caderno e dos cadernos filhos. */
  cards: Flashcard[];
  due: number;
  noteCount: number;
}

export interface BuildDeckTreeInput {
  pages: Page[];
  notebooks: Notebook[];
  cardsByPage: Map<string, Flashcard[]>;
  filterMode: "all" | "due";
  /** Termo de busca já normalizado (minúsculas, sem espaços nas pontas). */
  term: string;
  /** Rótulo usado quando a nota não está em nenhum caderno. */
  unfiledLabel: string;
  reference?: number;
}

export function flattenNodes(nodes: CardNode[]): CardNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

export function flattenDecks(decks: DeckNode[]): DeckNode[] {
  return decks.flatMap((deck) => [deck, ...flattenDecks(deck.children)]);
}

/** Ids das notas com cards em toda a subárvore do caderno, para seleção. */
export function deckPageIds(deck: DeckNode): string[] {
  return [
    ...flattenNodes(deck.nodes)
      .filter((node) => node.cards.length > 0)
      .map((node) => node.page.id),
    ...deck.children.flatMap(deckPageIds),
  ];
}

export function deckKey(deck: DeckNode): string {
  return deck.notebook?.id ?? "unfiled";
}

/**
 * Monta a hierarquia completa da barra lateral — cadernos dentro de cadernos,
 * notas dentro do caderno e subnotas dentro da nota —, mantendo só o que tem
 * flashcards.
 *
 * Um nível sem cards próprios permanece quando algo abaixo dele sobreviveu aos
 * filtros; do contrário o descendente perderia o pai e apareceria solto.
 */
export function buildDeckTree({
  pages,
  notebooks,
  cardsByPage,
  filterMode,
  term,
  unfiledLabel,
  reference = Date.now(),
}: BuildDeckTreeInput): DeckNode[] {
  const livePages = pages.filter((page) => !page.deletedAt);

  const matchesTerm = (page: Page, cards: Flashcard[], notebookName: string): boolean => {
    if (!term) return true;
    return (
      page.title.toLowerCase().includes(term) ||
      notebookName.toLowerCase().includes(term) ||
      cards.some(
        (card) =>
          card.front.toLowerCase().includes(term) || card.back.toLowerCase().includes(term)
      )
    );
  };

  const buildNotes = (scope: Page[], notebookName: string): CardNode[] => {
    // O parentesco só vale dentro do próprio caderno, como na barra lateral:
    // uma nota cuja mãe está em outro caderno entra como raiz aqui.
    const inScope = new Set(scope.map((page) => page.id));
    const byParent = new Map<string | null, Page[]>();
    for (const page of scope) {
      const parent =
        page.parentPageId && inScope.has(page.parentPageId) ? page.parentPageId : null;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(page);
    }

    const build = (parentId: string | null, depth: number): CardNode[] => {
      const nodes: CardNode[] = [];

      for (const page of byParent.get(parentId) ?? []) {
        const children = build(page.id, depth + 1);
        const cards = cardsByPage.get(page.id) ?? [];
        const due = cards.filter((card) => isCardDueForReview(card, reference)).length;

        const selfKept =
          cards.length > 0 &&
          (filterMode !== "due" || due > 0) &&
          matchesTerm(page, cards, notebookName);
        if (!selfKept && children.length === 0) continue;

        // A subárvore soma apenas o que passou pelos filtros. Do contrário,
        // "Estudar" numa nota-contêiner puxaria cards que a lista não mostra.
        const ownCards = selfKept ? cards : [];
        const ownDue = selfKept ? due : 0;

        nodes.push({
          page,
          depth,
          cards: ownCards,
          due: ownDue,
          subtreeCards: [...ownCards, ...children.flatMap((child) => child.subtreeCards)],
          subtreeDue: ownDue + children.reduce((sum, child) => sum + child.subtreeDue, 0),
          children,
        });
      }

      return nodes.sort(
        (a, b) =>
          b.subtreeDue - a.subtreeDue ||
          b.subtreeCards.length - a.subtreeCards.length ||
          compareNatural(a.page.title, b.page.title)
      );
    };

    return build(null, 0);
  };

  const assemble = (
    notebook: Notebook | null,
    nodes: CardNode[],
    children: DeckNode[],
    depth: number
  ): DeckNode => {
    const flat = flattenNodes(nodes);
    const ownCards = flat.flatMap((node) => node.cards);
    return {
      notebook,
      depth,
      nodes,
      children,
      cards: [...ownCards, ...children.flatMap((child) => child.cards)],
      due:
        flat.reduce((sum, node) => sum + node.due, 0) +
        children.reduce((sum, child) => sum + child.due, 0),
      noteCount:
        flat.filter((node) => node.cards.length > 0).length +
        children.reduce((sum, child) => sum + child.noteCount, 0),
    };
  };

  const buildDecks = (parentId: string | null, depth: number): DeckNode[] => {
    const decks: DeckNode[] = [];

    for (const notebook of childrenOf(notebooks, parentId)) {
      const children = buildDecks(notebook.id, depth + 1);
      const nodes = buildNotes(
        livePages.filter((page) => page.notebookId === notebook.id),
        notebook.name
      );
      const deck = assemble(notebook, nodes, children, depth);
      // Um caderno sem nada abaixo dele não aparece na lista de estudo.
      if (deck.cards.length === 0) continue;
      decks.push(deck);
    }

    return decks;
  };

  const decks = buildDecks(null, 0);

  const unfiledNodes = buildNotes(
    livePages.filter((page) => !page.notebookId),
    unfiledLabel
  );
  if (unfiledNodes.length > 0) {
    const unfiled = assemble(null, unfiledNodes, [], 0);
    if (unfiled.cards.length > 0) decks.push(unfiled);
  }

  return decks;
}
