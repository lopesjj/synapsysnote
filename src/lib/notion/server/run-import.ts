import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Client } from "@notionhq/client";
import type {
  AppBlock,
  ImportJob,
  ImportJobItem,
  NotionTreeNode,
} from "@/types/models";
import {
  databasesRef,
  getNotionClient,
  importJobRef,
  integrationRef,
  notebooksRef,
  pagesRef,
} from "./client";
import { throttled } from "./throttle";
import { buildParentMap, listNotionTree, orderForImport } from "./tree";
import {
  blocksToPlainText,
  omitUndefined,
  countMediaBlocks,
  notionBlocksToAppBlocks,
  type NotionBlock,
} from "./block-converter";
import {
  countChildPageBlocks,
  resolveImportPlacement,
  resolveNotebookParentId,
  shouldImportAsNotebook,
  type ImportRole,
} from "@/lib/notion/classify-import";
import { defaultViews, mapDatabaseSchema, mapPropertyValues } from "./property-mapper";
import { rehostNotionFile } from "./media";

type JobOptions = ImportJob["options"];

function collectIds(tree: NotionTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: NotionTreeNode[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

async function fetchAllChildren(notion: Client, blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await throttled(() =>
      notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor })
    );
    blocks.push(...(response.results as unknown as NotionBlock[]));
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

class ProgressReporter {
  private items: ImportJobItem[];
  private pendingFilesCount = 0;
  private pendingProcessedFiles = 0;
  private pendingBytes = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ref: FirebaseFirestore.DocumentReference,
    private readonly job: {
      options: JobOptions;
      requestedBy: string;
      targetNotebookId: string | null;
      items?: ImportJobItem[];
    }
  ) {
    this.items = [...(job.items ?? [])];
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const updates: Record<string, unknown> = {};
    if (this.pendingFilesCount > 0) {
      updates.totalFiles = FieldValue.increment(this.pendingFilesCount);
      this.pendingFilesCount = 0;
    }
    if (this.pendingProcessedFiles > 0) {
      updates.processedFiles = FieldValue.increment(this.pendingProcessedFiles);
      this.pendingProcessedFiles = 0;
    }
    if (this.pendingBytes > 0) {
      updates.totalBytes = FieldValue.increment(this.pendingBytes);
      this.pendingBytes = 0;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await this.ref.update(updates).catch(() => {});
    }
  }

  private scheduleFlush() {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush();
      }, 500);
    }
  }

  async patch(data: FirebaseFirestore.UpdateData<Record<string, unknown>>) {
    await this.flush();
    if (Array.isArray(data.items)) this.items = data.items as ImportJobItem[];
    await this.ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  }

  async addFiles(count: number) {
    if (!count) return;
    this.pendingFilesCount += count;
    this.scheduleFlush();
  }

  async fileDone(bytes: number) {
    this.pendingProcessedFiles += 1;
    this.pendingBytes += bytes;
    this.scheduleFlush();
  }

  async itemStatus(notionId: string, status: ImportJobItem["status"], appId?: string) {
    await this.flush();
    this.items = this.items.map((item) =>
      item.notionId === notionId ? { ...item, status, ...(appId ? { appId } : {}) } : item
    );
    await this.ref.update({
      items: this.items,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async addError(error: {
    itemId: string;
    itemTitle?: string;
    stage: "fetch" | "convert" | "media" | "write";
    message: string;
  }) {
    await this.flush();
    await this.ref.update({
      errors: FieldValue.arrayUnion({ ...error, at: Date.now() }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async isCanceled(): Promise<boolean> {
    const snapshot = await this.ref.get();
    return snapshot.get("status") === "canceled";
  }

  async finish() {
    await this.flush();
    const snapshot = await this.ref.get();
    const errors = (snapshot.get("errors") ?? []) as unknown[];
    await this.ref.update({
      status: errors.length ? "completed_with_errors" : "completed",
      currentStep: errors.length
        ? `Concluída com ${errors.length} aviso(s)`
        : "Importação concluída",
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async fail(message: string) {
    await this.flush();
    await this.ref.update({
      status: "failed",
      currentStep: `Falhou: ${message}`,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  get options() {
    return this.job.options;
  }

  get requestedBy() {
    return this.job.requestedBy;
  }

  get targetNotebookId() {
    return this.job.targetNotebookId;
  }
}

interface ImportArgs {
  notion: Client;
  workspaceId: string;
  jobId: string;
  node: NotionTreeNode;
  parents: Map<string, string | null>;
  idMap: Map<string, string>;
  roles: Map<string, ImportRole>;
  progress: ProgressReporter;
  cachedTopLevel?: NotionBlock[];
}

async function importNotebook(args: ImportArgs): Promise<string> {
  const { workspaceId, node, parents, idMap, roles } = args;
  const parentId = resolveNotebookParentId({
    notionId: node.id,
    parents,
    roles,
    idMap,
  });

  const existing = await notebooksRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const ref = existing.empty
    ? notebooksRef(workspaceId).doc(`nb_${randomUUID().slice(0, 8)}`)
    : existing.docs[0].ref;

  await ref.set(
    {
      id: ref.id,
      name: node.title,
      emoji: node.icon ?? "📓",
      color: "#0E7490",
      parentId,
      notionPageId: node.id,
      order: Date.now(),
      createdAt: existing.empty ? FieldValue.serverTimestamp() : existing.docs[0].get("createdAt"),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}

async function importPage(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, node, parents, idMap, roles, progress, cachedTopLevel } = args;

  const topLevel = cachedTopLevel ?? (await fetchAllChildren(notion, node.id));
  if (!cachedTopLevel) await progress.addFiles(countMediaBlocks(topLevel));

  let blocks: AppBlock[];
  try {
    blocks = await notionBlocksToAppBlocks(topLevel, {
      fetchChildren: (blockId) => fetchAllChildren(notion, blockId),
      resolvePageLink: (notionPageId) => idMap.get(notionPageId),
      rehostMedia: progress.options.downloadMedia
        ? async ({ url, suggestedName }) => {
            const result = await rehostNotionFile({ workspaceId, jobId, url, suggestedName });
            await progress.fileDone(result.bytes);
            return result;
          }
        : undefined,
    });
  } catch (error) {
    blocks = [
      {
        id: randomUUID(),
        type: "paragraph",
        richText: [
          {
            text: `A página foi importada, mas a conversão de alguns blocos falhou: ${(error as Error).message}`,
          },
        ],
      },
    ];
    await progress.addError({
      itemId: node.id,
      itemTitle: node.title,
      stage: "convert",
      message: (error as Error).message,
    });
  }

  const { notebookId, parentPageId } = resolveImportPlacement({
    notionId: node.id,
    parents,
    roles,
    idMap,
    fallbackNotebookId: progress.targetNotebookId,
    preserveHierarchy: progress.options.preserveHierarchy,
  });

  let path: string[] = [];
  if (parentPageId) {
    const parentDoc = await pagesRef(workspaceId).doc(parentPageId).get();
    path = [...((parentDoc.get("path") as string[]) ?? []), parentPageId];
  }

  const existing = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const ref = existing.empty ? pagesRef(workspaceId).doc(`page_${randomUUID().slice(0, 10)}`) : existing.docs[0].ref;

  await ref.set(
    {
      title: node.title,
      icon: node.icon ?? "📄",
      id: ref.id,
      notebookId,
      parentPageId,
      path,
      blocks: omitUndefined(blocks),
      plainText: blocksToPlainText(blocks),
      extractedOCRText: existing.empty ? "" : (existing.docs[0].get("extractedOCRText") ?? ""),
      transcriptText: existing.empty ? "" : (existing.docs[0].get("transcriptText") ?? ""),
      tags: ["notion"],
      outgoingLinks: [],
      backlinks: [],
      favorite: false,
      archived: false,
      deletedAt: null,
      notionPageId: node.id,
      notionUrl: `https://www.notion.so/${node.id.replace(/-/g, "")}`,
      importJobId: jobId,
      createdBy: progress.requestedBy,
      updatedBy: progress.requestedBy,
      order: Date.now(),
      createdAt: existing.empty ? FieldValue.serverTimestamp() : existing.docs[0].get("createdAt"),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}

interface NotionQueryResponse {
  results: { id: string; properties: Record<string, unknown> }[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionQueryable {
  databases: {
    query: (args: {
      database_id: string;
      page_size: number;
      start_cursor?: string;
    }) => Promise<NotionQueryResponse>;
  };
}

async function importDatabase(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, node, parents, idMap, roles, progress } = args;

  const schema = await throttled(() => notion.databases.retrieve({ database_id: node.id }));
  const properties = mapDatabaseSchema(
    (schema as unknown as { properties: Record<string, never> }).properties
  );

  const { notebookId, parentPageId } = resolveImportPlacement({
    notionId: node.id,
    parents,
    roles,
    idMap,
    fallbackNotebookId: progress.targetNotebookId,
    preserveHierarchy: progress.options.preserveHierarchy,
  });

  const existing = await databasesRef(workspaceId)
    .where("notionDatabaseId", "==", node.id)
    .limit(1)
    .get();
  const ref = existing.empty
    ? databasesRef(workspaceId).doc(`db_${randomUUID().slice(0, 8)}`)
    : existing.docs[0].ref;

  await ref.set(
    {
      name: node.title,
      icon: node.icon ?? "🗂️",
      id: ref.id,
      description: "Importada do Notion.",
      notebookId,
      parentPageId,
      properties,
      views: defaultViews(properties),
      notionDatabaseId: node.id,
      deletedAt: null,
      createdAt: existing.empty ? FieldValue.serverTimestamp() : existing.docs[0].get("createdAt"),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let cursor: string | undefined;
  let order = 0;
  do {
    const response = await throttled<NotionQueryResponse>(() =>
      (notion as unknown as NotionQueryable).databases.query({
        database_id: node.id,
        page_size: 100,
        start_cursor: cursor,
      })
    );

    const batch = ref.firestore.batch();
    for (const row of response.results) {
      const rowId = row.id.replace(/-/g, "").slice(0, 20);
      const values = mapPropertyValues(
        row.properties as unknown as Record<string, never>,
        properties
      );

      if (progress.options.downloadMedia) {
        for (const [propertyId, value] of Object.entries(values)) {
          if (!Array.isArray(value)) continue;
          const files = value as { name: string; url: string }[];
          if (!files.length || typeof files[0]?.url !== "string") continue;

          await progress.addFiles(files.filter((f) => Boolean(f.url)).length);
          const rehosted = await Promise.all(
            files.map(async (file) => {
              if (!file.url) return file;
              try {
                const result = await rehostNotionFile({
                  workspaceId,
                  jobId,
                  url: file.url,
                  suggestedName: file.name,
                });
                await progress.fileDone(result.bytes);
                return { name: file.name, url: result.url };
              } catch (error) {
                await progress.addError({
                  itemId: node.id,
                  itemTitle: file.name,
                  stage: "media",
                  message: (error as Error).message,
                });
                return file;
              }
            })
          );
          values[propertyId] = rehosted;
        }
      }

      batch.set(
        ref.collection("rows").doc(rowId),
        {
          values,
          order: order++,
          pageId: null,
          notionPageId: row.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    await progress.patch({ currentStep: `Importando registros de “${node.title}” (${order})…` });
  } while (cursor);

  idMap.set(node.id, ref.id);
  return ref.id;
}

async function rebuildBacklinks(workspaceId: string, idMap: Map<string, string>) {
  const appIds = new Set(idMap.values());
  if (!appIds.size) return;

  const incoming = new Map<string, Set<string>>();
  const pages = await pagesRef(workspaceId).where("importJobId", "!=", null).get();

  const db = pagesRef(workspaceId).firestore;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of pages.docs) {
    const blocks = (doc.get("blocks") ?? []) as AppBlock[];
    const links = new Set<string>();
    const walk = (list: AppBlock[]) => {
      for (const block of list) {
        for (const span of block.richText ?? []) {
          if (span.mention?.kind === "page") {
            const mapped = idMap.get(span.mention.pageId) ?? span.mention.pageId;
            if (appIds.has(mapped) || mapped.startsWith("page_")) links.add(mapped);
          }
        }
        if (block.children?.length) walk(block.children);
      }
    };
    walk(blocks);

    for (const target of links) {
      if (!incoming.has(target)) incoming.set(target, new Set());
      incoming.get(target)!.add(doc.id);
    }

    if (links.size) {
      batch.update(doc.ref, { outgoingLinks: [...links] });
      batchCount++;
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  for (const [pageId, sources] of incoming) {
    batch.update(pagesRef(workspaceId).doc(pageId), { backlinks: [...sources] });
    batchCount++;
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }
}

export interface CreateImportInput {
  workspaceId: string;
  uid: string;
  selection: { notionIds: string[]; importAll: boolean };
  targetNotebookId: string | null;
  options: JobOptions;
  items: { notionId: string; title: string; type: "page" | "database" }[];
}

export async function enqueueNotionImport(input: CreateImportInput): Promise<string> {
  const activeSnap = await importJobRef(input.workspaceId, "placeholder")
    .parent.where("status", "in", ["pending", "discovering", "running"])
    .limit(1)
    .get();

  if (!activeSnap.empty) {
    const existing = activeSnap.docs[0];
    throw new Error(
      `Já existe uma importação em andamento neste workspace (Job ${existing.id}). Aguarde a conclusão ou cancele-a antes de iniciar outra.`
    );
  }

  const jobId = `job_${randomUUID().slice(0, 8)}`;
  const ref = importJobRef(input.workspaceId, jobId);
  await ref.set({
    id: jobId,
    status: "pending",
    currentStep: "Job enfileirado",
    totalPages: input.selection.notionIds.length,
    processedPages: 0,
    totalFiles: 0,
    processedFiles: 0,
    totalBytes: 0,
    errors: [],
    items: input.items.map((item) => ({ ...item, status: "queued" as const })),
    selection: input.selection,
    targetNotebookId: input.targetNotebookId,
    options: {
      downloadMedia: input.options?.downloadMedia ?? true,
      preserveHierarchy: input.options?.preserveHierarchy ?? true,
      runOcr: input.options?.runOcr ?? true,
      createBacklinks: input.options?.createBacklinks ?? true,
    },
    requestedBy: input.uid,
    startedAt: null,
    finishedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return jobId;
}

/**
 * Claims a pending job and runs the full Notion → Firestore conversion using
 * the Admin SDK. Safe to call twice: a second caller sees a non-pending status
 * and returns immediately.
 */
export async function runNotionImportJob(workspaceId: string, jobId: string): Promise<void> {
  const jobRef = importJobRef(workspaceId, jobId);

  const claimed = await jobRef.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error("Job de importação não encontrado");
    const status = snap.get("status") as string;
    if (status !== "pending") return null;
    tx.update(jobRef, {
      status: "discovering",
      currentStep: "Lendo estrutura do workspace no Notion…",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return snap.data() as {
      selection: { notionIds: string[]; importAll: boolean };
      options: JobOptions;
      requestedBy: string;
      targetNotebookId: string | null;
      items?: ImportJobItem[];
    };
  });

  if (!claimed) return;

  const progress = new ProgressReporter(jobRef, claimed);
  let notion: Client;

  try {
    notion = await getNotionClient(workspaceId);
  } catch (error) {
    await progress.fail((error as Error).message);
    return;
  }

  try {
    const tree = await listNotionTree(notion);
    const selected = new Set(
      claimed.selection.importAll ? collectIds(tree) : claimed.selection.notionIds
    );
    const ordered = orderForImport(tree, selected);
    const parents = buildParentMap(tree);

    await progress.patch({
      status: "running",
      currentStep: `Preparando ${ordered.length} itens…`,
      totalPages: ordered.length,
      items: ordered.map<ImportJobItem>((node) => ({
        notionId: node.id,
        title: node.title,
        type: node.type,
        status: "queued",
      })),
    });

    const idMap = new Map<string, string>();
    const roles = new Map<string, ImportRole>();

    const completionMap = new Map<string, Promise<void>>();
    const resolveMap = new Map<string, () => void>();

    for (const node of ordered) {
      let res!: () => void;
      const p = new Promise<void>((r) => {
        res = r;
      });
      completionMap.set(node.id, p);
      resolveMap.set(node.id, res);
    }

    let completedCount = 0;

    async function processNode(node: NotionTreeNode) {
      if (await progress.isCanceled()) {
        resolveMap.get(node.id)?.();
        return;
      }

      // Se o pai do nó estiver na lista de importação, aguarda a conclusão do pai primeiro
      const parentId = parents.get(node.id);
      if (parentId && completionMap.has(parentId)) {
        await completionMap.get(parentId);
      }

      if (await progress.isCanceled()) {
        resolveMap.get(node.id)?.();
        return;
      }

      await progress.itemStatus(node.id, "processing");

      try {
        const shared = { notion, workspaceId, jobId, node, parents, idMap, roles, progress };
        let appId: string;

        if (node.type === "database") {
          roles.set(node.id, "database");
          appId = await importDatabase(shared);
        } else {
          // Busca os blocos de primeiro nível uma única vez sob demanda
          const topLevel = await fetchAllChildren(notion, node.id);
          await progress.addFiles(countMediaBlocks(topLevel));

          const asNotebook =
            progress.options.preserveHierarchy &&
            shouldImportAsNotebook({
              childCount: Math.max(node.children?.length ?? 0, countChildPageBlocks(topLevel)),
              notionBlocks: topLevel,
            });

          roles.set(node.id, asNotebook ? "notebook" : "page");

          if (asNotebook) {
            appId = await importNotebook(shared);
          } else {
            appId = await importPage({ ...shared, cachedTopLevel: topLevel });
          }
        }

        idMap.set(node.id, appId);
        await progress.itemStatus(node.id, "done", appId);
      } catch (error) {
        await progress.itemStatus(node.id, "error");
        await progress.addError({
          itemId: node.id,
          itemTitle: node.title,
          stage: "convert",
          message: (error as Error).message,
        });
      } finally {
        resolveMap.get(node.id)?.();
        completedCount++;
        await progress.patch({
          processedPages: completedCount,
          currentStep: `(${completedCount}/${ordered.length}) Importando “${node.title}”…`,
        });
      }
    }

    // Pool com concorrência de 3 páginas simultâneas
    let queueIdx = 0;
    const CONCURRENCY = 3;
    const workers = Array.from({ length: Math.min(CONCURRENCY, ordered.length) }, async () => {
      while (queueIdx < ordered.length) {
        if (await progress.isCanceled()) break;
        const current = ordered[queueIdx++];
        await processNode(current);
      }
    });

    await Promise.all(workers);

    if (progress.options.createBacklinks) {
      await progress.patch({ currentStep: "Reconstruindo backlinks…" });
      await rebuildBacklinks(workspaceId, idMap);
    }

    await progress.finish();
    await integrationRef(workspaceId).set(
      { lastSyncAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    await progress.fail((error as Error).message);
  }
}
