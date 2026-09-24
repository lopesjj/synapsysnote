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
  RichTextSpan,
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
import { adminDb } from "@/lib/firebase/admin";
import {
  blockMediaPaths,
  extractStoragePath,
  parseStoredBlocks,
  quarantinePaths,
} from "@/lib/trash/purge-core";
import { NOTION_REIMPORT_LABEL } from "@/lib/data/version-labels";

const LEASE_MS = 120_000;
const MAX_PAGE_BYTES = 900_000;
const WRITE_BATCH = 400;

type Snapshot = FirebaseFirestore.DocumentSnapshot;
type BatchOp = (batch: FirebaseFirestore.WriteBatch) => void;

async function commitOps(db: FirebaseFirestore.Firestore, ops: BatchOp[]) {
  for (let start = 0; start < ops.length; start += WRITE_BATCH) {
    const batch = db.batch();
    for (const op of ops.slice(start, start + WRITE_BATCH)) op(batch);
    await batch.commit();
  }
}

function storedBlocks(doc: Snapshot): AppBlock[] {
  return parseStoredBlocks(doc.data()) as unknown as AppBlock[];
}

async function docsWhereIn(
  collection: FirebaseFirestore.CollectionReference,
  field: string,
  values: string[]
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let start = 0; start < values.length; start += 30) {
    const snap = await collection.where(field, "in", values.slice(start, start + 30)).get();
    docs.push(...snap.docs);
  }
  return docs;
}

async function adoptChildPages(workspaceId: string, oldPageId: string, notebookId: string, uid: string) {
  const pages = pagesRef(workspaceId);
  const [descendants, children] = await Promise.all([
    pages.where("path", "array-contains", oldPageId).get(),
    pages.where("parentPageId", "==", oldPageId).get(),
  ]);
  const docs = new Map<string, Snapshot>();
  for (const doc of [...descendants.docs, ...children.docs]) docs.set(doc.id, doc);
  const ops: BatchOp[] = [];
  for (const doc of docs.values()) {
    const path = (doc.get("path") as string[] | undefined) ?? [];
    const index = path.indexOf(oldPageId);
    const direct = doc.get("parentPageId") === oldPageId;
    ops.push((batch) =>
      batch.update(doc.ref, {
        notebookId,
        path: index >= 0 ? path.slice(index + 1) : [],
        ...(direct ? { parentPageId: null } : {}),
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
  }
  await commitOps(pages.firestore, ops);
}

async function retirePage(snap: Snapshot, uid: string) {
  await snap.ref.update({
    ...(snap.get("deletedAt") ? {} : { deletedAt: FieldValue.serverTimestamp(), trashedWith: null }),
    notionPageId: FieldValue.delete(),
    retiredNotionId: snap.get("notionPageId") ?? null,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function retireDatabase(snap: Snapshot) {
  await snap.ref.update({
    ...(snap.get("deletedAt") ? {} : { deletedAt: FieldValue.serverTimestamp(), trashedWith: null }),
    notionDatabaseId: FieldValue.delete(),
    retiredNotionId: snap.get("notionDatabaseId") ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function retireNotebook(workspaceId: string, snap: Snapshot, uid: string, keep: string) {
  const ops: BatchOp[] = [];
  if (!snap.get("deletedAt")) {
    const all = await notebooksRef(workspaceId).select("parentId", "deletedAt").get();
    const childrenOf = new Map<string, string[]>();
    for (const doc of all.docs) {
      const parentId = doc.get("parentId");
      if (doc.get("deletedAt") || typeof parentId !== "string" || !parentId) continue;
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), doc.id]);
    }
    const ids = [snap.id];
    const seen = new Set(ids);
    for (let index = 0; index < ids.length; index += 1) {
      for (const child of childrenOf.get(ids[index]) ?? []) {
        if (seen.has(child) || child === keep) continue;
        seen.add(child);
        ids.push(child);
      }
    }
    const [pageDocs, databaseDocs] = await Promise.all([
      docsWhereIn(pagesRef(workspaceId), "notebookId", ids),
      docsWhereIn(databasesRef(workspaceId), "notebookId", ids),
    ]);
    for (const doc of pageDocs) {
      if (doc.get("deletedAt") || doc.id === keep) continue;
      ops.push((batch) =>
        batch.update(doc.ref, {
          deletedAt: FieldValue.serverTimestamp(),
          trashedWith: snap.id,
          updatedBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const doc of databaseDocs) {
      if (doc.get("deletedAt") || doc.id === keep) continue;
      ops.push((batch) =>
        batch.update(doc.ref, {
          deletedAt: FieldValue.serverTimestamp(),
          trashedWith: snap.id,
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const id of ids.slice(1)) {
      ops.push((batch) =>
        batch.update(notebooksRef(workspaceId).doc(id), {
          deletedAt: FieldValue.serverTimestamp(),
          trashedWith: snap.id,
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
  }
  ops.push((batch) =>
    batch.update(snap.ref, {
      ...(snap.get("deletedAt") ? {} : { deletedAt: FieldValue.serverTimestamp(), trashedWith: null }),
      notionPageId: FieldValue.delete(),
      retiredNotionId: snap.get("notionPageId") ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    })
  );
  await commitOps(notebooksRef(workspaceId).firestore, ops);
}

async function restoreTrashedWith(workspaceId: string, notebookId: string, uid: string) {
  const [pages, databases, notebooks] = await Promise.all([
    pagesRef(workspaceId).where("trashedWith", "==", notebookId).get(),
    databasesRef(workspaceId).where("trashedWith", "==", notebookId).get(),
    notebooksRef(workspaceId).where("trashedWith", "==", notebookId).get(),
  ]);
  const restored = { deletedAt: null, trashedWith: null, updatedAt: FieldValue.serverTimestamp() };
  await commitOps(notebooksRef(workspaceId).firestore, [
    ...pages.docs.map((doc) => (batch: FirebaseFirestore.WriteBatch) => batch.update(doc.ref, { ...restored, updatedBy: uid })),
    ...databases.docs.map((doc) => (batch: FirebaseFirestore.WriteBatch) => batch.update(doc.ref, restored)),
    ...notebooks.docs.map((doc) => (batch: FirebaseFirestore.WriteBatch) => batch.update(doc.ref, restored)),
  ]);
}

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
    await this.ref.update({ ...data, leaseUntil: Date.now() + LEASE_MS, updatedAt: FieldValue.serverTimestamp() });
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
      leaseUntil: Date.now() + LEASE_MS,
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
  const { workspaceId, node, parents, idMap, roles, progress } = args;
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

  const existing = await notebooksRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const previous = existing.empty ? null : existing.docs[0];
  const ref = previous ? previous.ref : notebooksRef(workspaceId).doc(`nb_${randomUUID().slice(0, 8)}`);

  await ref.set(
    {
      id: ref.id,
      name: node.title,
      emoji: icon,
      parentId,
      notionPageId: node.id,
      deletedAt: null,
      trashedWith: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(previous
        ? {}
        : { color: "#0E7490", order: Date.now(), createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  if (previous?.get("deletedAt")) await restoreTrashedWith(workspaceId, ref.id, progress.requestedBy);

  const [oldPages, oldDatabases] = await Promise.all([
    pagesRef(workspaceId).where("notionPageId", "==", node.id).get(),
    databasesRef(workspaceId).where("notionDatabaseId", "==", node.id).get(),
  ]);
  for (const oldPage of oldPages.docs) {
    await adoptChildPages(workspaceId, oldPage.id, ref.id, progress.requestedBy);
    await retirePage(oldPage, progress.requestedBy);
  }
  for (const oldDatabase of oldDatabases.docs) await retireDatabase(oldDatabase);

  return ref.id;
}

async function importPage(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, node, parents, idMap, roles, progress, cachedTopLevel } = args;

  const topLevel = cachedTopLevel ?? (await fetchAllChildren(notion, node.id));
  if (!cachedTopLevel) await progress.addFiles(countMediaBlocks(topLevel));

  let blocks: AppBlock[];
  let converted = true;
  const rehosted: string[] = [];
  try {
    blocks = await notionBlocksToAppBlocks(topLevel, {
      fetchChildren: (blockId) => fetchAllChildren(notion, blockId),
      resolvePageLink: (notionPageId) => idMap.get(notionPageId),
      rehostMedia: progress.options.downloadMedia
        ? async ({ url, suggestedName }) => {
            const result = await rehostNotionFile({ workspaceId, jobId, url, suggestedName });
            if (result.storagePath) rehosted.push(result.storagePath);
            await progress.fileDone(result.bytes);
            return result;
          }
        : undefined,
    });
  } catch (error) {
    converted = false;
    if (rehosted.length) {
      await quarantinePaths(adminDb(), workspaceId, rehosted, { pageId: null, userId: progress.requestedBy });
    }
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

  const cleanBlocks = omitUndefined(blocks);
  const blocksJson = JSON.stringify(cleanBlocks);
  const plainText = blocksToPlainText(cleanBlocks);
  const newMedia = blockMediaPaths(cleanBlocks);
  if (Buffer.byteLength(blocksJson) + Buffer.byteLength(plainText) > MAX_PAGE_BYTES) {
    await quarantinePaths(adminDb(), workspaceId, newMedia, { pageId: null, userId: progress.requestedBy });
    throw new Error("A página passa do limite de 1 MB por nota. Divida-a em páginas menores no Notion e importe de novo.");
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

  const existing = await pagesRef(workspaceId).where("notionPageId", "==", node.id).limit(1).get();
  const previous = existing.empty ? null : existing.docs[0];
  const ref = previous ? previous.ref : pagesRef(workspaceId).doc(`page_${randomUUID().slice(0, 10)}`);
  const replaceContent = converted || !previous;

  let oldMedia: string[] = [];
  if (previous && replaceContent) {
    const oldBlocks = storedBlocks(previous);
    oldMedia = blockMediaPaths(oldBlocks);
    const previousText = String(previous.get("plainText") ?? "");
    if (previousText.trim() && previousText !== plainText) {
      await ref.collection("versions").add({
        pageId: ref.id,
        title: previous.get("title") ?? "",
        blocksJson: JSON.stringify(oldBlocks),
        authorId: progress.requestedBy,
        label: NOTION_REIMPORT_LABEL,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await ref.set(
    {
      title: node.title,
      icon,
      id: ref.id,
      notebookId,
      parentPageId,
      path,
      ...(replaceContent
        ? {
            blocksJson,
            plainText,
            outgoingLinks: [],
            ...(previous?.get("blocks") !== undefined ? { blocks: FieldValue.delete() } : {}),
          }
        : {}),
      deletedAt: null,
      trashedWith: null,
      notionPageId: node.id,
      notionUrl: `https://www.notion.so/${node.id.replace(/-/g, "")}`,
      importJobId: jobId,
      updatedBy: progress.requestedBy,
      updatedAt: FieldValue.serverTimestamp(),
      ...(previous
        ? {}
        : {
            transcriptText: "",
            tags: ["notion"],
            backlinks: [],
            favorite: false,
            archived: false,
            createdBy: progress.requestedBy,
            order: Date.now(),
            createdAt: FieldValue.serverTimestamp(),
          }),
    },
    { merge: true }
  );

  const [oldNotebooks, oldDatabases] = await Promise.all([
    notebooksRef(workspaceId).where("notionPageId", "==", node.id).get(),
    databasesRef(workspaceId).where("notionDatabaseId", "==", node.id).get(),
  ]);
  for (const oldNotebook of oldNotebooks.docs) {
    await retireNotebook(workspaceId, oldNotebook, progress.requestedBy, ref.id);
  }
  for (const oldDatabase of oldDatabases.docs) await retireDatabase(oldDatabase);

  const kept = new Set(newMedia);
  const removed = oldMedia.filter((path) => !kept.has(path));
  if (removed.length) {
    await quarantinePaths(adminDb(), workspaceId, removed, { pageId: ref.id, userId: progress.requestedBy });
  }

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

function rowFilePaths(values: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  for (const value of Object.values(values ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { storagePath?: unknown; url?: unknown };
      for (const candidate of [entry.storagePath, entry.url]) {
        const path = extractStoragePath(candidate);
        if (path) out.push(path);
      }
    }
  }
  return out;
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

  const existing = await databasesRef(workspaceId)
    .where("notionDatabaseId", "==", node.id)
    .limit(1)
    .get();
  const previous = existing.empty ? null : existing.docs[0];
  const ref = previous ? previous.ref : databasesRef(workspaceId).doc(`db_${randomUUID().slice(0, 8)}`);

  await ref.set(
    {
      name: node.title,
      icon,
      id: ref.id,
      notebookId,
      parentPageId,
      properties,
      views: defaultViews(properties),
      notionDatabaseId: node.id,
      deletedAt: null,
      trashedWith: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(previous
        ? {}
        : { description: "Importada do Notion.", createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  const [oldPages, oldNotebooks] = await Promise.all([
    pagesRef(workspaceId).where("notionPageId", "==", node.id).get(),
    notebooksRef(workspaceId).where("notionPageId", "==", node.id).get(),
  ]);
  for (const oldPage of oldPages.docs) await retirePage(oldPage, progress.requestedBy);
  for (const oldNotebook of oldNotebooks.docs) {
    await retireNotebook(workspaceId, oldNotebook, progress.requestedBy, ref.id);
  }

  const previousRows = new Map<string, string[]>();
  if (previous) {
    const rows = await ref.collection("rows").select("values").get();
    for (const row of rows.docs) previousRows.set(row.id, rowFilePaths(row.get("values")));
  }
  const replacedFiles: string[] = [];

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

      const earlier = previousRows.get(rowId);
      if (earlier?.length) {
        const current = new Set(rowFilePaths(values));
        replacedFiles.push(...earlier.filter((path) => !current.has(path)));
      }

      batch.set(
        ref.collection("rows").doc(rowId),
        {
          values,
          order: order++,
          pageId: null,
          notionPageId: row.id,
          updatedAt: FieldValue.serverTimestamp(),
          ...(earlier ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    }

    await batch.commit();
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    await progress.patch({ currentStep: `Importando registros de “${node.title}” (${order})…` });
  } while (cursor);

  if (replacedFiles.length) {
    await quarantinePaths(adminDb(), workspaceId, replacedFiles, { pageId: null, userId: progress.requestedBy });
  }

  idMap.set(node.id, ref.id);
  return ref.id;
}

function remapSpans(
  spans: RichTextSpan[] | undefined,
  resolve: (id: string) => string | undefined,
  links: Set<string> | null
): boolean {
  let changed = false;
  for (const span of spans ?? []) {
    const mention = span.mention;
    if (mention?.kind !== "page" || !mention.pageId) continue;
    const mapped = resolve(mention.pageId);
    if (mapped && mapped !== mention.pageId) {
      mention.pageId = mapped;
      changed = true;
    }
    links?.add(mention.pageId);
  }
  return changed;
}

function remapBlocks(
  blocks: AppBlock[],
  resolve: (id: string) => string | undefined,
  links: Set<string>
): boolean {
  let changed = false;
  for (const block of blocks) {
    if (remapSpans(block.richText, resolve, links)) changed = true;
    if (remapSpans(block.media?.caption, resolve, null)) changed = true;
    for (const row of block.props?.tableRows ?? []) {
      for (const cell of row.cells ?? []) {
        if (remapSpans(cell.spans, resolve, null)) changed = true;
      }
    }
    if (block.children?.length && remapBlocks(block.children, resolve, links)) changed = true;
  }
  return changed;
}

async function notionTargets(workspaceId: string, idMap: Map<string, string>) {
  const [pages, notebooks, databases] = await Promise.all([
    pagesRef(workspaceId).where("notionPageId", "!=", null).select("notionPageId", "deletedAt").get(),
    notebooksRef(workspaceId).where("notionPageId", "!=", null).select("notionPageId", "deletedAt").get(),
    databasesRef(workspaceId).where("notionDatabaseId", "!=", null).select("notionDatabaseId", "deletedAt").get(),
  ]);
  const live = new Map<string, string>();
  const trashed = new Map<string, string>();
  const add = (notionId: unknown, appId: string, deleted: unknown) => {
    if (typeof notionId !== "string" || !notionId) return;
    const key = normalizeNotionId(notionId);
    const target = deleted ? trashed : live;
    if (!target.has(key)) target.set(key, appId);
  };
  for (const doc of pages.docs) add(doc.get("notionPageId"), doc.id, doc.get("deletedAt"));
  for (const doc of notebooks.docs) add(doc.get("notionPageId"), doc.id, doc.get("deletedAt"));
  for (const doc of databases.docs) add(doc.get("notionDatabaseId"), doc.id, doc.get("deletedAt"));
  const targets = new Map<string, string>([...trashed, ...live]);
  for (const [notionId, appId] of idMap) targets.set(normalizeNotionId(notionId), appId);

  const retired = await Promise.all(
    [pagesRef(workspaceId), notebooksRef(workspaceId), databasesRef(workspaceId)].map((collection) =>
      collection.where("retiredNotionId", "!=", null).select("retiredNotionId").get()
    )
  );
  const replaced = new Map<string, string>();
  for (const snap of retired) {
    for (const doc of snap.docs) {
      const successor = targets.get(normalizeNotionId(String(doc.get("retiredNotionId") ?? "")));
      if (successor && successor !== doc.id) replaced.set(doc.id, successor);
    }
  }
  return { targets, replaced };
}

export async function relinkImportedPages(
  workspaceId: string,
  idMap: Map<string, string>,
  outgoing: boolean,
  apply = true
): Promise<number> {
  const { targets, replaced } = await notionTargets(workspaceId, idMap);
  if (!targets.size) return 0;
  let changed = 0;
  const resolve = (id: string) => {
    const successor = replaced.get(id);
    if (successor) return successor;
    const key = normalizeNotionId(id);
    return /^[0-9a-f]{32}$/.test(key) ? targets.get(key) : undefined;
  };

  const query = pagesRef(workspaceId)
    .where("importJobId", "!=", null)
    .select("blocksJson", "blocks", "outgoingLinks");
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (last ? query.startAfter(last) : query).limit(200).get();
    if (page.empty) break;
    last = page.docs[page.docs.length - 1];
    const updates: Array<() => Promise<unknown>> = [];
    for (const doc of page.docs) {
      const blocks = storedBlocks(doc);
      const links = new Set<string>();
      const rewritten = remapBlocks(blocks, resolve, links);
      const current = (doc.get("outgoingLinks") as string[] | undefined) ?? [];
      const nextLinks = [...links];
      const linksChanged =
        outgoing && (current.length !== nextLinks.length || nextLinks.some((id) => !current.includes(id)));
      if (!rewritten && !linksChanged) continue;
      changed += 1;
      if (!apply) continue;
      updates.push(() =>
        doc.ref
          .update(
            {
              ...(rewritten ? { blocksJson: JSON.stringify(blocks) } : {}),
              ...(doc.get("blocks") !== undefined ? { blocks: FieldValue.delete() } : {}),
              ...(linksChanged ? { outgoingLinks: nextLinks } : {}),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { lastUpdateTime: doc.updateTime }
          )
          .catch(() => undefined)
      );
    }
    for (let start = 0; start < updates.length; start += 20) {
      await Promise.all(updates.slice(start, start + 20).map((run) => run()));
    }
    if (page.size < 200) break;
  }
  return changed;
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
    provider: "notion",
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
  busy?: boolean;
}

function treeRef(jobRef: FirebaseFirestore.DocumentReference) {
  return jobRef.collection("meta").doc("tree");
}

async function claimLease(jobRef: FirebaseFirestore.DocumentReference, owner: string): Promise<boolean> {
  return jobRef.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return false;
    const until = Number(snap.get("leaseUntil") ?? 0);
    if (until > Date.now() && snap.get("leaseOwner") !== owner) return false;
    tx.update(jobRef, { leaseUntil: Date.now() + LEASE_MS, leaseOwner: owner });
    return true;
  });
}

async function releaseLease(jobRef: FirebaseFirestore.DocumentReference, owner: string) {
  await jobRef.firestore
    .runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      if (snap.exists && snap.get("leaseOwner") === owner) {
        tx.update(jobRef, { leaseUntil: 0, leaseOwner: null });
      }
    })
    .catch(() => undefined);
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
  const owner = randomUUID();
  if (!(await claimLease(jobRef, owner))) {
    const current = await jobRef.get();
    if (!current.exists) throw new Error("Job de importação não encontrado");
    const status = String(current.get("status") ?? "running");
    const finished = ["completed", "completed_with_errors", "failed", "canceled"].includes(status);
    return { done: finished, status, busy: !finished };
  }
  try {
    return await runLeasedImportStep(workspaceId, jobId, jobRef);
  } finally {
    await releaseLease(jobRef, owner);
  }
}

async function runLeasedImportStep(
  workspaceId: string,
  jobId: string,
  jobRef: FirebaseFirestore.DocumentReference
): Promise<ImportStepResult> {
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
  let discoveredTree: TreeMetadata | null = null;

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

      await treeRef(jobRef).set(treeMetadata);
      await progress.patch({
        status: "running",
        currentStep: `Preparando ${ordered.length} itens…`,
        totalPages: ordered.length,
        processedPages: 0,
        items,
      });

      jobData = {
        ...jobData,
        status: "running",
        totalPages: ordered.length,
        processedPages: 0,
        items,
      };
      discoveredTree = treeMetadata;
    } catch (error) {
      await progress.fail((error as Error).message);
      return { done: true, status: "failed" };
    }
  }

  if (await progress.isCanceled()) {
    return { done: true, status: "canceled" };
  }

  const legacyTree = Boolean(jobData.treeMetadata);
  const storedTree =
    discoveredTree ?? jobData.treeMetadata ?? ((await treeRef(jobRef).get()).data() as TreeMetadata | undefined);
  const treeMetadata: TreeMetadata = {
    parents: storedTree?.parents ?? {},
    orderedNodes: storedTree?.orderedNodes ?? [],
    roles: storedTree?.roles ?? {},
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

    await jobRef.update({ leaseUntil: Date.now() + LEASE_MS });
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
    if (legacyTree) {
      await jobRef.update({
        "treeMetadata.roles": treeMetadata.roles,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await treeRef(jobRef).set({ roles: treeMetadata.roles }, { merge: true });
    }
  }

  const remaining = progress.currentItems.filter(
    (it) => it.status === "queued" || it.status === "processing"
  );

  if (remaining.length === 0) {
    await progress.patch({ currentStep: "Reconstruindo links entre as páginas…" });
    await relinkImportedPages(workspaceId, idMap, jobData.options.createBacklinks !== false);

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
