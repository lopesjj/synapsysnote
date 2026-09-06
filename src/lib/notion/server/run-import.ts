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
  mapConcurrent,
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

/**
 * Looks up every doc whose `field` matches one of `notionIds` in a single
 * batch of parallel `in` queries (chunked to Firestore's 30-value limit),
 * instead of the old one-`where().limit(1).get()`-per-item pattern.
 *
 * Firestore reads are not paced by Notion's rate limit, but they were still
 * sitting on the per-item critical path (one extra round-trip before every
 * single write) and — for a workspace with import history — that's N
 * sequential reads that this collapses into `ceil(N/30)` parallel ones.
 */
async function fetchExistingByNotionId(
  collection: FirebaseFirestore.CollectionReference,
  field: string,
  notionIds: string[]
): Promise<Map<string, FirebaseFirestore.QueryDocumentSnapshot>> {
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const unique = [...new Set(notionIds)];
  if (!unique.length) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));

  const snapshots = await Promise.all(
    chunks.map((chunk) => collection.where(field, "in", chunk).get())
  );
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const value = doc.get(field) as string;
      map.set(value, doc);
    }
  }
  return map;
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
  private pendingFilesCount = 0;
  private pendingProcessedFiles = 0;
  private pendingBytes = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  // `isCanceled()` used to be a `.get()` on every single node (twice, plus
  // once per worker loop iteration) — a Firestore round-trip sitting directly
  // in the per-item critical path. A single realtime listener keeps a local
  // flag in sync instead, so cancellation checks become free/instant.
  private canceledFlag = false;
  private unsubscribeCancel: () => void;

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
    this.unsubscribeCancel = ref.onSnapshot(
      (snap) => {
        if (snap.get("status") === "canceled") this.canceledFlag = true;
      },
      () => {
        // If the listener itself fails, fall back to "not canceled" — a
        // failed cancel-check must never silently abort a healthy import.
      }
    );
  }

  /** Stops the realtime listener. Always call once the job finishes. */
  dispose() {
    this.unsubscribeCancel();
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
    return this.canceledFlag;
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
  /** Pre-fetched "does this Notion id already exist?" lookups — see fetchExistingByNotionId. */
  existing: {
    notebooks: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
    pages: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
    databases: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
  };
  /**
   * Caches each imported page's own `path` field (its ancestor chain) keyed
   * by app page id, so siblings that share a parent don't each re-fetch that
   * parent's `path` from Firestore — only the first child processed does.
   */
  pathCache: Map<string, string[]>;
}

async function importNotebook(args: ImportArgs): Promise<string> {
  const { workspaceId, node, parents, idMap, roles, existing } = args;
  const parentId = resolveNotebookParentId({
    notionId: node.id,
    parents,
    roles,
    idMap,
  });

  const existingDoc = existing.notebooks.get(node.id);
  const ref = existingDoc ? existingDoc.ref : notebooksRef(workspaceId).doc(`nb_${randomUUID().slice(0, 8)}`);

  await ref.set(
    {
      id: ref.id,
      name: node.title,
      emoji: node.icon ?? "📓",
      color: "#0E7490",
      parentId,
      notionPageId: node.id,
      order: Date.now(),
      createdAt: existingDoc ? existingDoc.get("createdAt") : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}

async function importPage(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, node, parents, idMap, roles, progress, cachedTopLevel, existing, pathCache } = args;

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
    let parentPath = pathCache.get(parentPageId);
    if (!parentPath) {
      // Cache miss: the parent wasn't imported in this job (it already
      // existed), so this is the only Firestore round-trip we pay for it —
      // every sibling under the same parent reuses this cached value.
      const parentDoc = await pagesRef(workspaceId).doc(parentPageId).get();
      parentPath = (parentDoc.get("path") as string[]) ?? [];
      pathCache.set(parentPageId, parentPath);
    }
    path = [...parentPath, parentPageId];
  }

  const existingDoc = existing.pages.get(node.id);
  const ref = existingDoc ? existingDoc.ref : pagesRef(workspaceId).doc(`page_${randomUUID().slice(0, 10)}`);

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
      extractedOCRText: existingDoc ? (existingDoc.get("extractedOCRText") ?? "") : "",
      transcriptText: existingDoc ? (existingDoc.get("transcriptText") ?? "") : "",
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
      createdAt: existingDoc ? existingDoc.get("createdAt") : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Let children processed later in this same job reuse this page's path
  // without hitting Firestore for it.
  pathCache.set(ref.id, path);

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
  const { notion, workspaceId, jobId, node, parents, idMap, roles, progress, existing } = args;

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

  const existingDoc = existing.databases.get(node.id);
  const ref = existingDoc ? existingDoc.ref : databasesRef(workspaceId).doc(`db_${randomUUID().slice(0, 8)}`);

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
      createdAt: existingDoc ? existingDoc.get("createdAt") : FieldValue.serverTimestamp(),
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

    const rows = response.results.map((row) => ({
      rowId: row.id.replace(/-/g, "").slice(0, 20),
      notionPageId: row.id,
      order: order++,
      values: mapPropertyValues(row.properties as unknown as Record<string, never>, properties),
    }));

    if (progress.options.downloadMedia) {
      // Collect every file across every row in this page of results and
      // rehost them together (bounded concurrency) instead of one row at a
      // time — these downloads hit Storage/the Notion CDN directly and
      // aren't subject to the Notion API pacing, so they were serializing
      // for no reason.
      const jobs: { row: (typeof rows)[number]; propertyId: string; fileIndex: number }[] = [];
      for (const row of rows) {
        for (const [propertyId, value] of Object.entries(row.values)) {
          if (!Array.isArray(value)) continue;
          const files = value as { name: string; url: string }[];
          if (!files.length || typeof files[0]?.url !== "string") continue;
          files.forEach((file, fileIndex) => {
            if (file.url) jobs.push({ row, propertyId, fileIndex });
          });
        }
      }

      if (jobs.length) {
        await progress.addFiles(jobs.length);
        await mapConcurrent(jobs, 6, async ({ row, propertyId, fileIndex }) => {
          const files = row.values[propertyId] as { name: string; url: string }[];
          const file = files[fileIndex];
          try {
            const result = await rehostNotionFile({
              workspaceId,
              jobId,
              url: file.url,
              suggestedName: file.name,
            });
            await progress.fileDone(result.bytes);
            files[fileIndex] = { name: file.name, url: result.url };
          } catch (error) {
            await progress.addError({
              itemId: node.id,
              itemTitle: file.name,
              stage: "media",
              message: (error as Error).message,
            });
          }
        });
      }
    }

    const batch = ref.firestore.batch();
    for (const row of rows) {
      batch.set(
        ref.collection("rows").doc(row.rowId),
        {
          values: row.values,
          order: row.order,
          pageId: null,
          notionPageId: row.notionPageId,
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

/**
 * Rebuilds `outgoingLinks`/`backlinks` from page mentions.
 *
 * The old version re-read and re-walked *every page ever imported into the
 * workspace* (`importJobId != null`) on every single import — because a page
 * imported in job 1 that mentions a page not yet imported stores a raw
 * Notion id, and only a later job (job 2, importing the target) can resolve
 * it. That correctness requirement is real, but scanning the whole history
 * every time makes each import progressively slower — and progressively more
 * expensive in Firestore reads — as a workspace accumulates pages.
 *
 * Instead: every page is now tagged `hasUnresolvedMentions` when it still has
 * a dangling reference. Once a workspace has done one full pass (tracked by
 * `notionBacklinksIndexed` on the integration doc), later imports only
 * re-scan (a) the pages this job just touched and (b) whichever pages are
 * still flagged as unresolved — almost always a tiny fraction of history.
 *
 * Trade-off: `backlinks` is only ever grown (`arrayUnion`), never rewritten
 * from a full scan, in the fast path. If a source page's link is edited or
 * removed without that page itself going through an import job again, its
 * stale backlink entry can persist. Re-importing that source page (which
 * always recomputes its own `outgoingLinks` from scratch) clears it.
 */
async function rebuildBacklinks(workspaceId: string, jobId: string, idMap: Map<string, string>) {
  const appIds = new Set(idMap.values());
  if (!appIds.size) return;

  const db = pagesRef(workspaceId).firestore;
  const integrationSnap = await integrationRef(workspaceId).get();
  const alreadyIndexed = integrationSnap.get("notionBacklinksIndexed") === true;

  const docs = alreadyIndexed
    ? await (async () => {
        const [byJob, byUnresolved] = await Promise.all([
          pagesRef(workspaceId).where("importJobId", "==", jobId).get(),
          pagesRef(workspaceId).where("hasUnresolvedMentions", "==", true).get(),
        ]);
        const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        for (const doc of byJob.docs) dedup.set(doc.id, doc);
        for (const doc of byUnresolved.docs) dedup.set(doc.id, doc);
        return [...dedup.values()];
      })()
    : (await pagesRef(workspaceId).where("importJobId", "!=", null).get()).docs;

  const incoming = new Map<string, Set<string>>();
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of docs) {
    const blocks = (doc.get("blocks") ?? []) as AppBlock[];
    const links = new Set<string>();
    let hasUnresolvedMentions = false;
    const walk = (list: AppBlock[]) => {
      for (const block of list) {
        for (const span of block.richText ?? []) {
          if (span.mention?.kind === "page") {
            const mapped = idMap.get(span.mention.pageId) ?? span.mention.pageId;
            if (appIds.has(mapped) || mapped.startsWith("page_")) {
              links.add(mapped);
            } else {
              hasUnresolvedMentions = true;
            }
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

    const currentOutgoing = (doc.get("outgoingLinks") ?? []) as string[];
    const nextOutgoing = [...links];
    const outgoingChanged =
      currentOutgoing.length !== nextOutgoing.length ||
      nextOutgoing.some((id) => !currentOutgoing.includes(id));
    const flagChanged = Boolean(doc.get("hasUnresolvedMentions")) !== hasUnresolvedMentions;

    if (outgoingChanged || flagChanged) {
      batch.update(doc.ref, { outgoingLinks: nextOutgoing, hasUnresolvedMentions });
      batchCount++;
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  for (const [pageId, sources] of incoming) {
    batch.update(pagesRef(workspaceId).doc(pageId), {
      backlinks: FieldValue.arrayUnion(...sources),
    });
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

  if (!alreadyIndexed) {
    await integrationRef(workspaceId).set({ notionBacklinksIndexed: true }, { merge: true });
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
    progress.dispose();
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
    const pathCache = new Map<string, string[]>();

    // Batch-fetch every "does this Notion id already exist?" lookup up front
    // instead of one query per item once processing starts (see
    // fetchExistingByNotionId). A "page"-typed node might still end up
    // imported as a notebook (that's only decided once its content is
    // fetched), so it's looked up in both collections; the miss side is a
    // cheap no-op.
    const pageOrNotebookIds = ordered.filter((n) => n.type !== "database").map((n) => n.id);
    const databaseIds = ordered.filter((n) => n.type === "database").map((n) => n.id);
    const [existingNotebooks, existingPages, existingDatabases] = await Promise.all([
      fetchExistingByNotionId(notebooksRef(workspaceId), "notionPageId", pageOrNotebookIds),
      fetchExistingByNotionId(pagesRef(workspaceId), "notionPageId", pageOrNotebookIds),
      fetchExistingByNotionId(databasesRef(workspaceId), "notionDatabaseId", databaseIds),
    ]);
    const existing = { notebooks: existingNotebooks, pages: existingPages, databases: existingDatabases };

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
        const shared = { notion, workspaceId, jobId, node, parents, idMap, roles, progress, existing, pathCache };
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

    // Pool com concorrência de páginas simultâneas. O gargalo real das
    // chamadas ao Notion continua sendo o throttle (~3 req/s, ver
    // throttle.ts) — mas escrita no Firestore e download/rehost de mídia não
    // passam por ele, então mais workers aqui ajudam a sobrepor esse trabalho
    // enquanto outras páginas aguardam sua vez no throttle.
    let queueIdx = 0;
    const CONCURRENCY = 5;
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
      await rebuildBacklinks(workspaceId, jobId, idMap);
    }

    await progress.finish();
    await integrationRef(workspaceId).set(
      { lastSyncAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    await progress.fail((error as Error).message);
  } finally {
    progress.dispose();
  }
}
