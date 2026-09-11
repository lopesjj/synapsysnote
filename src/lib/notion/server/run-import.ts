import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Client } from "@notionhq/client";
import type {
  AppBlock,
  ImportJob,
  ImportJobItem,
  ImportJobStatus,
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
import { buildParentMap, listNotionTree, normalizeNotionId, orderForImport } from "./tree";
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
import { rehostNotionFile, rehostNotionIcon } from "./media";

type JobOptions = ImportJob["options"];

function countChildrenInParentMap(parents: Map<string, string | null>, parentId: string): number {
  const norm = normalizeNotionId(parentId);
  let count = 0;
  for (const [childId, pId] of parents.entries()) {
    if (!pId) continue;
    if (normalizeNotionId(pId) === norm && normalizeNotionId(childId) !== norm) {
      count += 1;
    }
  }
  return count;
}

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
  private totalFiles: number;
  private processedFiles: number;

  constructor(
    private readonly ref: FirebaseFirestore.DocumentReference,
    private readonly job: {
      options: JobOptions;
      requestedBy: string;
      targetNotebookId: string | null;
      items?: ImportJobItem[];
      totalFiles?: number;
      processedFiles?: number;
    }
  ) {
    this.items = [...(job.items ?? [])];
    this.totalFiles = job.totalFiles ?? 0;
    this.processedFiles = job.processedFiles ?? 0;
  }

  async patch(data: FirebaseFirestore.UpdateData<Record<string, unknown>>) {
    if (Array.isArray(data.items)) this.items = data.items as ImportJobItem[];
    await this.ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  }

  async addFiles(count: number) {
    if (!count) return;
    this.totalFiles += count;
    await this.ref.update({
      totalFiles: FieldValue.increment(count),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async fileDone(bytes: number) {
    this.processedFiles += 1;
    const extraTotal = this.processedFiles > this.totalFiles ? this.processedFiles - this.totalFiles : 0;
    if (extraTotal > 0) {
      this.totalFiles += extraTotal;
    }

    await this.ref.update({
      processedFiles: FieldValue.increment(1),
      ...(extraTotal > 0 ? { totalFiles: FieldValue.increment(extraTotal) } : {}),
      totalBytes: FieldValue.increment(bytes),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async itemStatus(notionId: string, status: ImportJobItem["status"], appId?: string) {
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

  get currentItems() {
    return this.items;
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
  const { workspaceId, jobId, node, parents, idMap, roles, progress } = args;
  const parentId = resolveNotebookParentId({
    notionId: node.id,
    parents,
    roles,
    idMap,
  });

  let icon = node.icon ?? "📓";
  if (node.icon && /^https?:\/\//i.test(node.icon)) {
    try {
      icon = await rehostNotionIcon(node.icon, "📓");
    } catch {
      icon = "📓";
    }
  }

  const oldPage = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  if (!oldPage.empty) {
    await oldPage.docs[0].ref.delete();
  }

  const oldDb = await databasesRef(workspaceId).where("notionDatabaseId", "==", node.id).limit(1).get();
  if (!oldDb.empty) {
    await oldDb.docs[0].ref.delete();
  }

  const existing = await notebooksRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const ref = existing.empty
    ? notebooksRef(workspaceId).doc(`nb_${randomUUID().slice(0, 8)}`)
    : existing.docs[0].ref;

  await ref.set(
    {
      id: ref.id,
      name: node.title,
      emoji: icon,
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

  let icon = node.icon ?? "📄";
  if (node.icon && /^https?:\/\//i.test(node.icon)) {
    try {
      icon = await rehostNotionIcon(node.icon, "📄");
    } catch {
      icon = "📄";
    }
  }

  const oldNotebook = await notebooksRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  if (!oldNotebook.empty) {
    await oldNotebook.docs[0].ref.delete();
  }

  const oldDb = await databasesRef(workspaceId).where("notionDatabaseId", "==", node.id).limit(1).get();
  if (!oldDb.empty) {
    await oldDb.docs[0].ref.delete();
  }

  const existing = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const ref = existing.empty ? pagesRef(workspaceId).doc(`page_${randomUUID().slice(0, 10)}`) : existing.docs[0].ref;

  await ref.set(
    {
      title: node.title,
      icon,
      id: ref.id,
      notebookId,
      parentPageId,
      path,
      blocks: omitUndefined(blocks),
      plainText: blocksToPlainText(blocks),
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

  let icon = node.icon ?? "🗂️";
  if (node.icon && /^https?:\/\//i.test(node.icon)) {
    try {
      icon = await rehostNotionIcon(node.icon, "🗂️");
    } catch {
      icon = "🗂️";
    }
  }

  const oldPage = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  if (!oldPage.empty) {
    await oldPage.docs[0].ref.delete();
  }

  const oldNotebook = await notebooksRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  if (!oldNotebook.empty) {
    await oldNotebook.docs[0].ref.delete();
  }

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
      icon,
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

export interface ImportStepResult {
  done: boolean;
  status: string;
  processedPages?: number;
  totalPages?: number;
}

interface TreeMetadata {
  parents: Record<string, string | null>;
  orderedNodes: {
    id: string;
    title: string;
    type: "page" | "database";
    icon?: string | null;
    childCount?: number;
  }[];
  roles: Record<string, ImportRole>;
}

export async function runNotionImportStep(
  workspaceId: string,
  jobId: string
): Promise<ImportStepResult> {
  const jobRef = importJobRef(workspaceId, jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    throw new Error("Job de importação não encontrado");
  }

  let jobData = snap.data() as {
    status: ImportJobStatus;
    selection: { notionIds: string[]; importAll: boolean };
    options: JobOptions;
    requestedBy: string;
    targetNotebookId: string | null;
    items?: ImportJobItem[];
    treeMetadata?: TreeMetadata;
    processedPages?: number;
    totalPages?: number;
    totalFiles?: number;
    processedFiles?: number;
  };

  if (["completed", "completed_with_errors", "failed", "canceled"].includes(jobData.status)) {
    return {
      done: true,
      status: jobData.status,
      processedPages: jobData.processedPages,
      totalPages: jobData.totalPages,
    };
  }

  let notion: Client;
  try {
    notion = await getNotionClient(workspaceId);
  } catch (error) {
    const message = (error as Error).message;
    await jobRef.update({
      status: "failed",
      currentStep: `Falha de autenticação: ${message}`,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { done: true, status: "failed" };
  }

  const progress = new ProgressReporter(jobRef, jobData);

  if (jobData.status === "pending") {
    await progress.patch({
      status: "discovering",
      currentStep: "Lendo estrutura do workspace no Notion…",
      startedAt: FieldValue.serverTimestamp(),
    });

    try {
      const tree = await listNotionTree(notion);
      const selected = new Set(
        jobData.selection.importAll ? collectIds(tree) : jobData.selection.notionIds
      );
      const ordered = orderForImport(tree, selected);
      const parents = buildParentMap(tree);

      const items: ImportJobItem[] = ordered.map((node) => ({
        notionId: node.id,
        title: node.title,
        type: node.type,
        status: "queued" as const,
      }));

      const treeMetadata: TreeMetadata = {
        parents: Object.fromEntries(parents.entries()),
        orderedNodes: ordered.map((node) => ({
          id: node.id,
          title: node.title,
          type: node.type,
          icon: node.icon ?? null,
          childCount: Math.max(
            node.children?.length ?? 0,
            node.childCount ?? 0,
            countChildrenInParentMap(parents, node.id)
          ),
        })),
        roles: {},
      };

      await progress.patch({
        status: "running",
        currentStep: `Preparando ${ordered.length} itens…`,
        totalPages: ordered.length,
        processedPages: 0,
        items,
        treeMetadata,
      });

      jobData = {
        ...jobData,
        status: "running",
        totalPages: ordered.length,
        processedPages: 0,
        items,
        treeMetadata,
      };
    } catch (error) {
      await progress.fail((error as Error).message);
      return { done: true, status: "failed" };
    }
  }

  if (await progress.isCanceled()) {
    return { done: true, status: "canceled" };
  }

  const treeMetadata = jobData.treeMetadata ?? {
    parents: {},
    orderedNodes: [],
    roles: {},
  };

  const parents = new Map<string, string | null>(Object.entries(treeMetadata.parents ?? {}));
  const roles = new Map<string, ImportRole>(Object.entries(treeMetadata.roles ?? {}));
  const idMap = new Map<string, string>();

  for (const it of jobData.items ?? []) {
    if (it.status === "done" && it.appId) {
      idMap.set(it.notionId, it.appId);
    }
  }

  const items = progress.currentItems;
  const MAX_STEP_DURATION_MS = 32_000;
  const stepStart = Date.now();
  let processedCount = jobData.processedPages ?? 0;
  let hasRoleUpdates = false;

  for (let i = 0; i < items.length; i++) {
    if (Date.now() - stepStart >= MAX_STEP_DURATION_MS) {
      break;
    }

    const item = items[i];
    if (item.status === "done" || item.status === "error") {
      continue;
    }

    if (await progress.isCanceled()) {
      return { done: true, status: "canceled" };
    }

    await progress.itemStatus(item.notionId, "processing");
    await progress.patch({
      currentStep: `(${processedCount + 1}/${items.length}) Convertendo “${item.title}”…`,
    });

    const node: NotionTreeNode = treeMetadata.orderedNodes.find((n) => n.id === item.notionId) ?? {
      id: item.notionId,
      title: item.title,
      type: item.type,
    };

    try {
      const effectiveChildCount = Math.max(
        node.childCount ?? 0,
        node.children?.length ?? 0,
        countChildrenInParentMap(parents, item.notionId)
      );

      let role: ImportRole =
        roles.get(item.notionId) ?? (item.type === "database" ? "database" : "page");

      let cachedTopLevel: NotionBlock[] | undefined;
      if (item.type === "database") {
        if (jobData.options.preserveHierarchy && effectiveChildCount > 0) {
          role = "notebook";
          roles.set(item.notionId, role);
          treeMetadata.roles[item.notionId] = role;
          hasRoleUpdates = true;
        }
      } else {
        cachedTopLevel = await fetchAllChildren(notion, item.notionId);
        await progress.addFiles(countMediaBlocks(cachedTopLevel));

        const asNotebook =
          jobData.options.preserveHierarchy &&
          shouldImportAsNotebook({
            childCount: Math.max(effectiveChildCount, countChildPageBlocks(cachedTopLevel)),
            notionBlocks: cachedTopLevel,
          });
        role = asNotebook ? "notebook" : "page";
        roles.set(item.notionId, role);
        treeMetadata.roles[item.notionId] = role;
        hasRoleUpdates = true;
      }

      const shared = { notion, workspaceId, jobId, node, parents, idMap, roles, progress };
      const appId =
        role === "notebook"
          ? await importNotebook(shared)
          : node.type === "database"
            ? await importDatabase(shared)
            : await importPage({ ...shared, cachedTopLevel });

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

    processedCount += 1;
    await progress.patch({ processedPages: processedCount });
  }

  if (hasRoleUpdates) {
    await jobRef.update({
      "treeMetadata.roles": treeMetadata.roles,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const remaining = progress.currentItems.filter(
    (it) => it.status === "queued" || it.status === "processing"
  );

  if (remaining.length === 0) {
    if (jobData.options.createBacklinks) {
      await progress.patch({ currentStep: "Reconstruindo backlinks…" });
      await rebuildBacklinks(workspaceId, idMap);
    }

    await progress.finish();
    await integrationRef(workspaceId).set(
      { lastSyncAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return {
      done: true,
      status: "completed",
      processedPages: processedCount,
      totalPages: items.length,
    };
  }

  return {
    done: false,
    status: "running",
    processedPages: processedCount,
    totalPages: items.length,
  };
}

export async function runNotionImportJob(workspaceId: string, jobId: string): Promise<void> {
  let done = false;
  while (!done) {
    const res = await runNotionImportStep(workspaceId, jobId);
    if (res.done) done = true;
  }
}
