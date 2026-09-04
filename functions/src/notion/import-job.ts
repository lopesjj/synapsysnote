import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import type { Client } from "@notionhq/client";
import {
  assertWorkspaceEditor,
  databasesRef,
  importJobRef,
  integrationRef,
  notebooksRef,
  pagesRef,
  workspaceRef,
} from "../lib/firebase";
import { getNotionClient, throttled } from "./client";
import { buildParentMap, listNotionTree, orderForImport } from "./tree";
import {
  blocksToPlainText,
  countMediaBlocks,
  notionBlocksToAppBlocks,
  omitUndefined,
  type NotionBlock,
} from "./block-converter";
import { defaultViews, mapDatabaseSchema, mapPropertyValues } from "./property-mapper";
import { rehostNotionFile } from "./media-pipeline";
import type { AppBlock, ImportJobDoc, ImportJobItem, NotionTreeNode } from "../types";
import {
  countChildPageBlocks,
  resolveImportPlacement,
  resolveNotebookParentId,
  shouldImportAsNotebook,
  type ImportRole,
} from "./classify-import";

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const SECRETS = ["TOKEN_ENCRYPTION_KEY"];

/* ------------------------------------------------------------------ callables */

/** ETAPA 3.2 — Feeds the wizard's tree. */
export const listNotionTreeFn = onCall(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const workspaceId = request.data?.workspaceId as string;
    if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
    if (!workspaceId) throw new HttpsError("invalid-argument", "workspaceId é obrigatório");
    await assertMember(workspaceId, request.auth.uid);

    const notion = await getNotionClient(workspaceId);
    return { tree: await listNotionTree(notion) };
  }
);

/**
 * ETAPA 3.4 — Enqueues the job. Returns immediately; the heavy lifting happens
 * in the Firestore-triggered worker below, which is not bound by the HTTP
 * request timeout.
 */
export const startNotionImport = onCall(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
    const {
      workspaceId,
      selection,
      targetNotebookId = null,
      options,
      items = [],
    } = request.data as {
      workspaceId: string;
      selection: { notionIds: string[]; importAll: boolean };
      targetNotebookId: string | null;
      options: ImportJobDoc["options"];
      items: { notionId: string; title: string; type: "page" | "database" }[];
    };

    if (!workspaceId || !selection?.notionIds?.length) {
      throw new HttpsError("invalid-argument", "Seleção vazia");
    }
    await assertMember(workspaceId, request.auth.uid);

    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const job: ImportJobDoc = {
      status: "pending",
      currentStep: "Job enfileirado",
      totalPages: selection.notionIds.length,
      processedPages: 0,
      totalFiles: 0,
      processedFiles: 0,
      totalBytes: 0,
      errors: [],
      items: items.map((item) => ({ ...item, status: "queued" as const })),
      selection,
      targetNotebookId,
      options: {
        downloadMedia: options?.downloadMedia ?? true,
        preserveHierarchy: options?.preserveHierarchy ?? true,
        runOcr: options?.runOcr ?? true,
        createBacklinks: options?.createBacklinks ?? true,
      },
      requestedBy: request.auth.uid,
    };

    await importJobRef(workspaceId, jobId).set({
      ...job,
      startedAt: null,
      finishedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { jobId };
  }
);

export const disconnectNotion = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const workspaceId = request.data?.workspaceId as string;
  await assertMember(workspaceId, request.auth.uid);

  const ref = integrationRef(workspaceId, "notion");
  await ref.set(
    { connected: false, revokedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await ref.collection("secure").doc("token").delete();
  return { ok: true };
});

async function assertMember(workspaceId: string, uid: string) {
  try {
    await assertWorkspaceEditor(workspaceId, uid);
  } catch (error) {
    throw new HttpsError("permission-denied", (error as Error).message);
  }
}

/* -------------------------------------------------------------------- worker */

/**
 * ETAPA 3.4 — Background worker.
 *
 * Runs up to 60 minutes with 1 GiB of memory and updates the job document after
 * every page and every file, which is what the wizard's real-time listener
 * renders. Failures are recorded per item: one broken page never aborts the
 * whole migration.
 */
export const processNotionImportJob = onDocumentCreated(
  {
    document: "workspaces/{workspaceId}/import_jobs/{jobId}",
    region: REGION,
    secrets: SECRETS,
    timeoutSeconds: 3600,
    memory: "1GiB",
    retry: false,
  },
  async (event) => {
    const { workspaceId, jobId } = event.params as { workspaceId: string; jobId: string };
    const jobRef = importJobRef(workspaceId, jobId);
    const snapshot = event.data;
    if (!snapshot) return;

    const job = snapshot.data() as ImportJobDoc;
    if (job.status !== "pending") return;

    const progress = new ProgressReporter(jobRef, job);
    let notion: Client;

    try {
      notion = await getNotionClient(workspaceId);
    } catch (error) {
      await progress.fail((error as Error).message);
      return;
    }

    try {
      await progress.patch({
        status: "discovering",
        currentStep: "Lendo estrutura do workspace no Notion…",
        startedAt: FieldValue.serverTimestamp(),
      });

      const tree = await listNotionTree(notion);
      const selected = new Set(
        job.selection.importAll ? collectIds(tree) : job.selection.notionIds
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

      // Notion id → app document id, so children resolve their parent and
      // internal links can be rewritten as mentions.
      const idMap = new Map<string, string>();
      const roles = new Map<string, ImportRole>();
      const topLevels = new Map<string, NotionBlock[]>();

      for (const node of ordered) {
        if (node.type === "database") {
          roles.set(node.id, "database");
          continue;
        }
        const topLevel = await fetchAllChildren(notion, node.id);
        topLevels.set(node.id, topLevel);
        await progress.addFiles(countMediaBlocks(topLevel));
        const asNotebook =
          job.options.preserveHierarchy &&
          shouldImportAsNotebook({
            childCount: Math.max(node.children?.length ?? 0, countChildPageBlocks(topLevel)),
            notionBlocks: topLevel,
          });
        roles.set(node.id, asNotebook ? "notebook" : "page");
      }

      for (const [index, node] of ordered.entries()) {
        if (await progress.isCanceled()) {
          logger.info("import canceled by user", { workspaceId, jobId });
          return;
        }

        await progress.itemStatus(node.id, "processing");
        await progress.patch({
          currentStep: `(${index + 1}/${ordered.length}) Convertendo “${node.title}”…`,
        });

        try {
          const shared = { notion, workspaceId, jobId, job, node, parents, idMap, roles, progress };
          const appId =
            roles.get(node.id) === "notebook"
              ? await importNotebook(shared)
              : node.type === "database"
                ? await importDatabase(shared)
                : await importPage({ ...shared, cachedTopLevel: topLevels.get(node.id) });

          idMap.set(node.id, appId);
          await progress.itemStatus(node.id, "done", appId);
        } catch (error) {
          logger.error("import item failed", { node: node.id, error });
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

      if (job.options.createBacklinks) {
        await progress.patch({ currentStep: "Reconstruindo backlinks…" });
        await rebuildBacklinks(workspaceId, idMap);
      }

      await progress.finish();
      await integrationRef(workspaceId, "notion").set(
        { lastSyncAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      logger.error("import job failed", { workspaceId, jobId, error });
      await progress.fail((error as Error).message);
    }
  }
);

/* ------------------------------------------------------------------- helpers */

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

interface ImportArgs {
  notion: Client;
  workspaceId: string;
  jobId: string;
  job: ImportJobDoc;
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
  const ref = existing.empty ? notebooksRef(workspaceId).doc() : existing.docs[0].ref;

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
  const { notion, workspaceId, jobId, job, node, parents, idMap, roles, progress, cachedTopLevel } =
    args;

  const topLevel = cachedTopLevel ?? (await fetchAllChildren(notion, node.id));
  if (!cachedTopLevel) await progress.addFiles(countMediaBlocks(topLevel));

  const blocks: AppBlock[] = await notionBlocksToAppBlocks(topLevel, {
    fetchChildren: (blockId) => fetchAllChildren(notion, blockId),
    resolvePageLink: (notionPageId) => idMap.get(notionPageId),
    rehostMedia: job.options.downloadMedia
      ? async ({ url, suggestedName }) => {
          const result = await rehostNotionFile({ workspaceId, jobId, url, suggestedName });
          await progress.fileDone(result.bytes);
          return result;
        }
      : undefined,
  });

  const { notebookId, parentPageId } = resolveImportPlacement({
    notionId: node.id,
    parents,
    roles,
    idMap,
    fallbackNotebookId: job.targetNotebookId,
    preserveHierarchy: job.options.preserveHierarchy,
  });

  let path: string[] = [];
  if (parentPageId) {
    const parentDoc = await pagesRef(workspaceId).doc(parentPageId).get();
    path = [...((parentDoc.get("path") as string[]) ?? []), parentPageId];
  }

  // Re-importing the same Notion page updates it in place instead of duplicating.
  const existing = await pagesRef(workspaceId)
    .where("notionPageId", "==", node.id)
    .limit(1)
    .get();
  const ref = existing.empty ? pagesRef(workspaceId).doc() : existing.docs[0].ref;

  await ref.set(
    {
      title: node.title,
      icon: node.icon ?? "📄",
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
      createdBy: job.requestedBy,
      updatedBy: job.requestedBy,
      order: Date.now(),
      createdAt: existing.empty ? FieldValue.serverTimestamp() : existing.docs[0].get("createdAt"),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}

async function importDatabase(args: ImportArgs): Promise<string> {
  const { notion, workspaceId, jobId, job, node, parents, idMap, roles, progress } = args;

  const schema = await throttled(() => notion.databases.retrieve({ database_id: node.id }));
  const properties = mapDatabaseSchema(
    (schema as unknown as { properties: Record<string, never> }).properties
  );

  const { notebookId, parentPageId } = resolveImportPlacement({
    notionId: node.id,
    parents,
    roles,
    idMap,
    fallbackNotebookId: job.targetNotebookId,
    preserveHierarchy: job.options.preserveHierarchy,
  });

  const existing = await databasesRef(workspaceId)
    .where("notionDatabaseId", "==", node.id)
    .limit(1)
    .get();
  const ref = existing.empty ? databasesRef(workspaceId).doc() : existing.docs[0].ref;

  await ref.set(
    {
      name: node.title,
      icon: node.icon ?? "🗂️",
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

  // Rows are written in batches of 400 to stay under the 500-write limit.
  let cursor: string | undefined;
  let order = 0;
  do {
    const response = await throttled<NotionQueryResponse>(() =>
      // The SDK's typed surface changes between Notion API versions; the query
      // shape we depend on (results/has_more/next_cursor) has been stable.
      (notion as unknown as NotionQueryable).databases.query({
        database_id: node.id,
        page_size: 100,
        start_cursor: cursor,
      })
    );

    const rows = response.results;
    const batch = ref.firestore.batch();

    for (const row of rows) {
      const rowId = row.id.replace(/-/g, "").slice(0, 20);
      const values = mapPropertyValues(
        row.properties as unknown as Record<string, never>,
        properties
      );

      // File properties also carry expiring URLs.
      if (job.options.downloadMedia) {
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

/** Materializes the reverse index used by the backlinks panel. */
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

  const batch = pagesRef(workspaceId).firestore.batch();
  for (const [pageId, sources] of incoming) {
    batch.update(pagesRef(workspaceId).doc(pageId), { backlinks: [...sources] });
  }
  await batch.commit();
}

/* --------------------------------------------------------- progress reporter */

type JobRef = FirebaseFirestore.DocumentReference;

/**
 * Every mutation lands on the job document so the wizard listener has live
 * numbers. Counters use `FieldValue.increment` to stay correct even if two
 * media downloads finish concurrently.
 */
class ProgressReporter {
  private files = 0;

  constructor(
    private readonly ref: JobRef,
    private readonly job: ImportJobDoc
  ) {}

  async patch(data: FirebaseFirestore.UpdateData<Record<string, unknown>>) {
    await this.ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  }

  async addFiles(count: number) {
    if (!count) return;
    this.files += count;
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
}
