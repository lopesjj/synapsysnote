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
  pagesRef,
} from "./client";
import { throttled } from "./throttle";
import { buildParentMap, listNotionTree, orderForImport } from "./tree";
import {
  blocksToPlainText,
  countMediaBlocks,
  notionBlocksToAppBlocks,
  type NotionBlock,
} from "./block-converter";
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
  constructor(
    private readonly ref: FirebaseFirestore.DocumentReference,
    private readonly job: { options: JobOptions; requestedBy: string; targetNotebookId: string | null }
  ) {}

  async patch(data: FirebaseFirestore.UpdateData<Record<string, unknown>>) {
    await this.ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  }

  async addFiles(count: number) {
    if (!count) return;
    await this.ref.update({
      totalFiles: FieldValue.increment(count),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async fileDone(bytes: number) {
    await this.ref.update({
      processedFiles: FieldValue.increment(1),
      totalBytes: FieldValue.increment(bytes),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async itemStatus(notionId: string, status: ImportJobItem["status"], appId?: string) {
    const snapshot = await this.ref.get();
    const items = (snapshot.get("items") ?? []) as ImportJobItem[];
    await this.ref.update({
      items: items.map((item) =>
        item.notionId === notionId ? { ...item, status, ...(appId ? { appId } : {}) } : item
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async addError(error: {
    itemId: string;
    itemTitle?: string;
    stage: "fetch" | "convert" | "media" | "write";
    message: string;
  }) {
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
  progress: ProgressReporter;
}

async function importPage(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, node, parents, idMap, progress } = args;

  const topLevel = await fetchAllChildren(notion, node.id);
  await progress.addFiles(countMediaBlocks(topLevel));

  const blocks: AppBlock[] = await notionBlocksToAppBlocks(topLevel, {
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

  const parentNotionId = progress.options.preserveHierarchy ? (parents.get(node.id) ?? null) : null;
  const parentAppId = parentNotionId ? (idMap.get(parentNotionId) ?? null) : null;

  let path: string[] = [];
  if (parentAppId) {
    const parentDoc = await pagesRef(workspaceId).doc(parentAppId).get();
    path = [...((parentDoc.get("path") as string[]) ?? []), parentAppId];
  }

  const existing = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const ref = existing.empty ? pagesRef(workspaceId).doc(`page_${randomUUID().slice(0, 10)}`) : existing.docs[0].ref;

  await ref.set(
    {
      title: node.title,
      icon: node.icon ?? "📄",
      id: ref.id,
      notebookId: progress.targetNotebookId,
      parentPageId: parentAppId,
      path,
      blocks,
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
  const { notion, workspaceId, jobId, node, parents, idMap, progress } = args;

  const schema = await throttled(() => notion.databases.retrieve({ database_id: node.id }));
  const properties = mapDatabaseSchema(
    (schema as unknown as { properties: Record<string, never> }).properties
  );

  const parentNotionId = progress.options.preserveHierarchy ? (parents.get(node.id) ?? null) : null;
  const parentAppId = parentNotionId ? (idMap.get(parentNotionId) ?? null) : null;

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
      notebookId: progress.targetNotebookId,
      parentPageId: parentAppId,
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
          const rehosted: { name: string; url: string }[] = [];
          for (const file of files) {
            if (!file.url) continue;
            try {
              await progress.addFiles(1);
              const result = await rehostNotionFile({
                workspaceId,
                jobId,
                url: file.url,
                suggestedName: file.name,
              });
              await progress.fileDone(result.bytes);
              rehosted.push({ name: file.name, url: result.url });
            } catch (error) {
              await progress.addError({
                itemId: node.id,
                itemTitle: file.name,
                stage: "media",
                message: (error as Error).message,
              });
            }
          }
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

    if (links.size) await doc.ref.update({ outgoingLinks: [...links] });
  }

  const writer = pagesRef(workspaceId).firestore.batch();
  for (const [pageId, sources] of incoming) {
    writer.update(pagesRef(workspaceId).doc(pageId), { backlinks: [...sources] });
  }
  await writer.commit();
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

    for (const [index, node] of ordered.entries()) {
      if (await progress.isCanceled()) return;

      await progress.itemStatus(node.id, "processing");
      await progress.patch({
        currentStep: `(${index + 1}/${ordered.length}) Convertendo “${node.title}”…`,
      });

      try {
        const appId =
          node.type === "database"
            ? await importDatabase({ notion, workspaceId, jobId, node, parents, idMap, progress })
            : await importPage({ notion, workspaceId, jobId, node, parents, idMap, progress });
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
      }

      await progress.patch({ processedPages: index + 1 });
    }

    if (claimed.options.createBacklinks) {
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
