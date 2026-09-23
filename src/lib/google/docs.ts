import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { decryptToken, encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { ApiError } from "@/lib/api/errors";
import type { ImportTreeNode } from "@/types/models";

const INTEGRATION_ID = "google-docs";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DOCS_API = "https://docs.googleapis.com/v1/documents";
const DOC_FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";

const DRIVE_SHARED_PARAMS = {
  supportsAllDrives: "true",
  includeItemsFromAllDrives: "true",
};

function integrationRef(workspaceId: string) {
  return adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("integrations")
    .doc(INTEGRATION_ID);
}

function secureRef(workspaceId: string) {
  return integrationRef(workspaceId).collection("secure").doc("token");
}

export async function markGoogleSync(workspaceId: string): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    await integrationRef(workspaceId).set(
      { lastSyncAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch {}
}

export async function getGoogleAccessToken(workspaceId: string): Promise<string> {
  if (!isAdminConfigured()) {
    throw new ApiError(503, "Firebase Admin não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON.");
  }

  const snapshot = await secureRef(workspaceId).get();
  if (!snapshot.exists) {
    throw new ApiError(401, "A conta do Google não está conectada.");
  }

  const cipher = snapshot.get("accessTokenCipher") as string | undefined;
  if (!cipher) {
    throw new ApiError(401, "A conta do Google não está conectada.");
  }

  const token = decryptToken(cipher);
  if (!token || token.startsWith("demo_")) {
    throw new ApiError(401, "A sessão do Google expirou. Conecte a conta novamente.");
  }
  return token;
}

async function refreshGoogleAccessToken(workspaceId: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !isAdminConfigured()) return null;

  const snapshot = await secureRef(workspaceId).get();
  const refreshCipher = snapshot.get("refreshTokenCipher") as string | undefined;
  if (!refreshCipher) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptToken(refreshCipher),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !payload.access_token) return null;

  await secureRef(workspaceId).set(
    { accessTokenCipher: encryptToken(payload.access_token), rotatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await integrationRef(workspaceId).set(
    {
      tokenPreview: tokenPreview(payload.access_token),
      tokenExpiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    },
    { merge: true }
  );
  return payload.access_token;
}

async function googleFetch(
  workspaceId: string,
  url: string,
  init?: RequestInit & { accept?: string }
): Promise<Response> {
  let token = await getGoogleAccessToken(workspaceId);

  const run = (bearer: string) =>
    fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${bearer}`,
        ...(init?.accept ? { Accept: init.accept } : {}),
      },
    });

  let response = await run(token);
  if (response.status === 401) {
    const refreshed = await refreshGoogleAccessToken(workspaceId);
    if (!refreshed) {
      throw new ApiError(401, "A sessão do Google expirou. Conecte a conta novamente.");
    }
    token = refreshed;
    response = await run(token);
  }
  return response;
}

async function readGoogleError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  let message = `Google respondeu ${response.status}.`;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {}
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, message);
  }
  throw new ApiError(502, message);
}

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  parents?: string[];
}

async function listDriveDocuments(workspaceId: string, query: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 3; page += 1) {
    const url = new URL(DRIVE_FILES);
    let filter = `mimeType='${DOC_MIME}' and trashed=false`;
    if (query) filter += ` and name contains '${query.replace(/['\\]/g, "\\$&")}'`;
    url.searchParams.set("q", filter);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,parents)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("orderBy", "modifiedTime desc");
    for (const [key, value] of Object.entries(DRIVE_SHARED_PARAMS)) {
      url.searchParams.set(key, value);
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await googleFetch(workspaceId, url.toString());
    if (!response.ok) await readGoogleError(response);

    const payload = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  return files;
}

async function fetchFolder(
  workspaceId: string,
  folderId: string,
  cache: Map<string, DriveFile | null>
): Promise<DriveFile | null> {
  if (cache.has(folderId)) return cache.get(folderId) ?? null;

  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields", "id,name,mimeType,parents");
  for (const [key, value] of Object.entries(DRIVE_SHARED_PARAMS)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await googleFetch(workspaceId, url.toString());
    if (!response.ok) {
      cache.set(folderId, null);
      return null;
    }
    const folder = (await response.json()) as DriveFile;
    if (folder.mimeType !== DOC_FOLDER_MIME) {
      cache.set(folderId, null);
      return null;
    }
    if (!folder.parents || folder.parents.length === 0) {
      cache.set(folderId, null);
      return null;
    }
    cache.set(folderId, folder);
    return folder;
  } catch {
    cache.set(folderId, null);
    return null;
  }
}

export async function buildGoogleDriveTree(
  workspaceId: string,
  query: string
): Promise<ImportTreeNode[]> {
  const documents = await listDriveDocuments(workspaceId, query);
  const folderCache = new Map<string, DriveFile | null>();
  const nodes = new Map<string, ImportTreeNode>();
  const parentOf = new Map<string, string | null>();

  const resolveChain = async (folderId: string | undefined): Promise<string | null> => {
    let currentId = folderId;
    let depth = 0;
    let firstId: string | null = null;

    while (currentId && depth < 10) {
      if (folderCache.size > 150) break;
      const folder = await fetchFolder(workspaceId, currentId, folderCache);
      if (!folder) break;

      if (!nodes.has(folder.id)) {
        nodes.set(folder.id, {
          id: folder.id,
          title: folder.name,
          kind: "container",
          icon: "📁",
          children: [],
        });
      }
      if (firstId === null) firstId = folder.id;

      if (parentOf.has(folder.id)) break;
      const nextId = folder.parents?.[0];
      parentOf.set(folder.id, nextId ?? null);
      currentId = nextId;
      depth += 1;
    }

    return firstId;
  };

  const roots: ImportTreeNode[] = [];
  const orphanDocs: ImportTreeNode[] = [];
  const allDocNodes: ImportTreeNode[] = [];

  for (const file of documents) {
    const node: ImportTreeNode = {
      id: file.id,
      title: file.name,
      kind: "document",
      icon: "📄",
      modifiedTime: file.modifiedTime,
    };

    allDocNodes.push(node);

    const folderId = await resolveChain(file.parents?.[0]);
    if (!folderId) {
      orphanDocs.push(node);
      continue;
    }
    nodes.get(folderId)!.children!.push(node);
  }

  const expandDocumentWithTabs = async (node: ImportTreeNode): Promise<void> => {
    try {
      const { tabs, error } = await listDocumentTabs(workspaceId, node.id);
      if (error || tabs.length <= 1) return;

      const mapTabNodes = (tabList: GoogleDocTab[]): ImportTreeNode[] =>
        tabList.map((tab) => ({
          id: `${node.id}:${tab.id}`,
          title: tab.title,
          kind: "document" as const,
          icon: "📄",
          children: tab.children.length ? mapTabNodes(tab.children) : undefined,
        }));

      node.kind = "container";
      node.icon = "📘";
      node.children = mapTabNodes(tabs);
    } catch {}
  };

  const CONCURRENCY = 5;
  for (let i = 0; i < allDocNodes.length; i += CONCURRENCY) {
    await Promise.all(allDocNodes.slice(i, i + CONCURRENCY).map(expandDocumentWithTabs));
  }

  for (const [folderId, node] of nodes) {
    const parentId = parentOf.get(folderId) ?? null;
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }

  const prune = (list: ImportTreeNode[]): ImportTreeNode[] =>
    list
      .map((node) => {
        if (node.kind !== "container") return node;
        const children = prune(node.children ?? []);
        return { ...node, children };
      })
      .filter((node) => node.kind === "document" || (node.children?.length ?? 0) > 0)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "container" ? -1 : 1;
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      });

  return [...prune(roots), ...orphanDocs];
}

export interface GoogleDocTab {
  id: string;
  title: string;
  children: GoogleDocTab[];
}

interface RawTab {
  tabProperties?: { tabId?: string; title?: string; index?: number };
  childTabs?: RawTab[];
}

function mapTabs(raw: RawTab[] | undefined): GoogleDocTab[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tab) => ({
      id: tab.tabProperties?.tabId ?? "",
      title: tab.tabProperties?.title?.trim() || "Guia",
      children: mapTabs(tab.childTabs),
    }))
    .filter((tab) => Boolean(tab.id));
}

export interface DocumentTabsResult {
  tabs: GoogleDocTab[];
  error: "docs_api_disabled" | "docs_api_unavailable" | null;
}

export async function listDocumentTabs(
  workspaceId: string,
  documentId: string
): Promise<DocumentTabsResult> {
  const url = new URL(`${DOCS_API}/${encodeURIComponent(documentId)}`);
  url.searchParams.set("includeTabsContent", "true");
  url.searchParams.set(
    "fields",
    "tabs(tabProperties,childTabs(tabProperties,childTabs(tabProperties,childTabs(tabProperties))))"
  );

  try {
    const response = await googleFetch(workspaceId, url.toString());
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const disabled =
        /SERVICE_DISABLED|accessNotConfigured|has not been used in project|is disabled/i.test(body);
      return { tabs: [], error: disabled ? "docs_api_disabled" : "docs_api_unavailable" };
    }
    const payload = (await response.json()) as { tabs?: RawTab[] };
    return { tabs: mapTabs(payload.tabs), error: null };
  } catch {
    return { tabs: [], error: "docs_api_unavailable" };
  }
}

export async function exportDocumentTabHtml(
  workspaceId: string,
  documentId: string,
  tabId: string
): Promise<string | null> {
  const url = new URL(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/export`);
  url.searchParams.set("format", "html");
  url.searchParams.set("tab", tabId);

  try {
    const response = await googleFetch(workspaceId, url.toString(), {
      accept: "text/html,application/xhtml+xml",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return html.trim() ? html : null;
  } catch {
    return null;
  }
}

export async function exportDocumentHtml(
  workspaceId: string,
  documentId: string
): Promise<string> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(documentId)}/export`);
  url.searchParams.set("mimeType", "text/html");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await googleFetch(workspaceId, url.toString(), {
    accept: "text/html,application/xhtml+xml",
  });
  if (!response.ok) await readGoogleError(response);
  return response.text();
}
