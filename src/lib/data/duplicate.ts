import { nanoid } from "nanoid";
import type { AppBlock, Flashcard, Notebook, Page } from "@/types/models";
import type { CreateFlashcardInput, CreatePageInput } from "./adapter";
import { cardImage } from "@/lib/flashcards/card-images";
import { childrenOf, parentIdOf } from "./notebook-tree";

function mentionIds(blocks: AppBlock[]): string[] {
  const ids = new Set<string>();
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      for (const span of block.richText ?? []) {
        if (span.mention?.kind === "page" && span.mention.pageId) ids.add(span.mention.pageId);
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return [...ids];
}

export interface DuplicateHost {
  createNotebook(input: {
    name: string;
    emoji?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Notebook>;
  updateNotebook(id: string, patch: Partial<Notebook>): Promise<void>;
  createPage(input: CreatePageInput): Promise<Page>;
  updatePage(id: string, patch: Partial<Page>): Promise<void>;
  listPageFlashcards(pageId: string): Promise<Flashcard[]>;
  createFlashcard(input: CreateFlashcardInput): Promise<Flashcard>;
}

/**
 * Copia os flashcards de uma nota para a nota recem-criada.
 *
 * A copia referencia a mesma imagem pela URL, mas nao recebe o `storagePath`:
 * ela nao e dona do arquivo. Sem isso, apagar a copia apagaria a imagem do card
 * original no storage.
 */
async function duplicatePageFlashcards(
  host: DuplicateHost,
  sourcePageId: string,
  target: Page
): Promise<void> {
  const cards = await host.listPageFlashcards(sourcePageId);
  for (const card of cards) {
    await host.createFlashcard({
      pageId: target.id,
      notebookId: target.notebookId,
      pageTitle: target.title,
      front: card.front,
      back: card.back,
      hint: card.hint,
      frontImageUrl: cardImage(card, "front").url,
      frontImageStoragePath: null,
      backImageUrl: cardImage(card, "back").url,
      backImageStoragePath: null,
    });
  }
}

export function copyTitle(name: string, fallback = "Sem título"): string {
  const base = name.trim() || fallback;
  const match = base.match(/^(.*) \(cópia(?: (\d+))?\)$/);
  if (match) {
    const next = match[2] ? Number(match[2]) + 1 : 2;
    return `${match[1]} (cópia ${next})`;
  }
  return `${base} (cópia)`;
}

export function cloneBlocks(blocks: AppBlock[]): AppBlock[] {
  return blocks.map((block) => ({
    ...block,
    id: `blk_${nanoid(8)}`,
    richText: block.richText?.map((span) => ({
      ...span,
      annotations: span.annotations ? { ...span.annotations } : undefined,
      mention: span.mention ? { ...span.mention } : undefined,
    })),
    props: block.props ? structuredClone(block.props) : undefined,
    media: block.media ? { ...block.media } : undefined,
    children: block.children ? cloneBlocks(block.children) : undefined,
  }));
}

function byOrder<T extends { order: number }>(a: T, b: T) {
  return a.order - b.order;
}

function livePages(pages: Page[]) {
  return pages.filter((page) => !page.deletedAt);
}

export async function duplicatePageTree(
  host: DuplicateHost,
  pages: Page[],
  pageId: string,
  options: {
    parentPageId?: string | null;
    notebookId?: string | null;
    rename?: boolean;
  } = {}
): Promise<Page> {
  const source = livePages(pages).find((page) => page.id === pageId);
  if (!source) throw new Error("Nota não encontrada");

  const rename = options.rename !== false;
  const blocks = cloneBlocks(source.blocks);
  const created = await host.createPage({
    title: rename ? copyTitle(source.title) : source.title,
    icon: source.icon,
    coverUrl: source.coverUrl ?? null,
    coverPosition: source.coverPosition ?? null,
    notebookId: options.notebookId !== undefined ? options.notebookId : source.notebookId,
    parentPageId:
      options.parentPageId !== undefined ? options.parentPageId : source.parentPageId,
    blocks,
    tags: [...source.tags],
  });

  const outgoingLinks = mentionIds(blocks);
  if (outgoingLinks.length) {
    await host.updatePage(created.id, { outgoingLinks });
  }

  await duplicatePageFlashcards(host, source.id, created);

  const children = livePages(pages)
    .filter((page) => page.parentPageId === source.id)
    .sort(byOrder);
  for (const child of children) {
    await duplicatePageTree(host, pages, child.id, {
      parentPageId: created.id,
      notebookId: created.notebookId,
      rename: false,
    });
  }

  return created;
}

export async function duplicateNotebookTree(
  host: DuplicateHost,
  notebooks: Notebook[],
  pages: Page[],
  notebookId: string,
  options: {
    parentId?: string | null;
    rename?: boolean;
  } = {}
): Promise<Notebook> {
  const source = notebooks.find((notebook) => notebook.id === notebookId);
  if (!source) throw new Error("Caderno não encontrado");

  const rename = options.rename !== false;
  const created = await host.createNotebook({
    name: rename ? copyTitle(source.name, "Sem nome") : source.name,
    emoji: source.emoji,
    color: source.color,
    parentId: options.parentId !== undefined ? options.parentId : parentIdOf(source),
  });

  const extras: Partial<Notebook> = {};
  if (source.coverUrl) extras.coverUrl = source.coverUrl;
  if (source.coverPosition !== undefined) extras.coverPosition = source.coverPosition;
  if (source.description) extras.description = source.description;
  if (Object.keys(extras).length) await host.updateNotebook(created.id, extras);

  const notes = livePages(pages).filter((page) => page.notebookId === source.id);
  const inNotebook = new Set(notes.map((page) => page.id));
  const roots = notes
    .filter((page) => !page.parentPageId || !inNotebook.has(page.parentPageId))
    .sort(byOrder);

  for (const root of roots) {
    await duplicatePageTree(host, pages, root.id, {
      notebookId: created.id,
      parentPageId: null,
      rename: false,
    });
  }

  for (const child of childrenOf(notebooks, source.id)) {
    await duplicateNotebookTree(host, notebooks, pages, child.id, {
      parentId: created.id,
      rename: false,
    });
  }

  return created;
}
