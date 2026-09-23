import { nanoid } from "nanoid";
import type { AppBlock, Flashcard, Notebook, Page } from "@/types/models";
import type { CopiedMedia, CreateFlashcardInput, CreatePageInput, MediaCopyTarget } from "./adapter";
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
  copyMedia(target: MediaCopyTarget, sources: string[]): Promise<Record<string, CopiedMedia>>;
}

export function newPageId(): string {
  return `page_${nanoid(10)}`;
}

/** Referencias de arquivo (caminho e URL) de todos os blocos de midia. */
function mediaReferences(blocks: AppBlock[]): string[] {
  const refs: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.media?.storagePath) refs.push(block.media.storagePath);
      if (block.media?.url) refs.push(block.media.url);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return refs;
}

function copyFor(copies: Record<string, CopiedMedia>, ...refs: (string | null | undefined)[]) {
  for (const ref of refs) {
    if (ref && copies[ref]) return copies[ref];
  }
  return null;
}

function remapMedia(blocks: AppBlock[], copies: Record<string, CopiedMedia>): AppBlock[] {
  if (!Object.keys(copies).length) return blocks;
  return blocks.map((block) => {
    const children = block.children ? remapMedia(block.children, copies) : block.children;
    const copy = block.media ? copyFor(copies, block.media.storagePath, block.media.url) : null;
    return {
      ...block,
      ...(children ? { children } : {}),
      ...(copy && block.media ? { media: { ...block.media, url: copy.url, storagePath: copy.storagePath } } : {}),
    };
  });
}

/**
 * Copia os flashcards de uma nota para a nota recem-criada, com copia propria
 * das imagens: excluir a original (ou a copia) nao quebra a outra.
 */
async function duplicatePageFlashcards(
  host: DuplicateHost,
  sourcePageId: string,
  target: Page
): Promise<void> {
  const cards = await host.listPageFlashcards(sourcePageId);
  if (!cards.length) return;

  const imageRefs: string[] = [];
  for (const card of cards) {
    for (const side of ["front", "back"] as const) {
      const image = cardImage(card, side);
      if (image.storagePath) imageRefs.push(image.storagePath);
      if (image.url) imageRefs.push(image.url);
    }
  }
  const copies = imageRefs.length ? await host.copyMedia({ pageId: target.id }, imageRefs) : {};

  for (const card of cards) {
    const front = cardImage(card, "front");
    const back = cardImage(card, "back");
    const frontCopy = copyFor(copies, front.storagePath, front.url);
    const backCopy = copyFor(copies, back.storagePath, back.url);
    await host.createFlashcard({
      pageId: target.id,
      notebookId: target.notebookId,
      pageTitle: target.title,
      front: card.front,
      back: card.back,
      hint: card.hint,
      // Sem copia (arquivo externo ou falha), a imagem e referenciada pela URL
      // e sem storagePath: a copia nao e dona do arquivo e nao o apaga.
      frontImageUrl: frontCopy?.url ?? front.url,
      frontImageStoragePath: frontCopy?.storagePath ?? null,
      backImageUrl: backCopy?.url ?? back.url,
      backImageStoragePath: backCopy?.storagePath ?? null,
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
    media: block.media ? structuredClone(block.media) : undefined,
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
  const targetId = newPageId();
  const originalBlocks = cloneBlocks(source.blocks);
  // Copia os arquivos antes de criar a nota, direto na pasta dela: criar e
  // depois trocar as URLs faria a nota nova "remover" as midias da original.
  const copies = await host.copyMedia({ pageId: targetId }, [
    ...mediaReferences(originalBlocks),
    ...(source.coverUrl ? [source.coverUrl] : []),
    ...(source.icon ? [source.icon] : []),
  ]);
  const blocks = remapMedia(originalBlocks, copies);

  const created = await host.createPage({
    id: targetId,
    title: rename ? copyTitle(source.title) : source.title,
    icon: copyFor(copies, source.icon)?.url ?? source.icon,
    coverUrl: copyFor(copies, source.coverUrl)?.url ?? source.coverUrl ?? null,
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
  const copies = await host.copyMedia(
    "icons",
    [source.coverUrl, source.emoji].filter((value): value is string => Boolean(value))
  );
  const created = await host.createNotebook({
    name: rename ? copyTitle(source.name, "Sem nome") : source.name,
    emoji: copyFor(copies, source.emoji)?.url ?? source.emoji,
    color: source.color,
    parentId: options.parentId !== undefined ? options.parentId : parentIdOf(source),
  });

  const extras: Partial<Notebook> = {};
  if (source.coverUrl) extras.coverUrl = copyFor(copies, source.coverUrl)?.url ?? source.coverUrl;
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
