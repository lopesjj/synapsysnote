"use client";

import { toast } from "sonner";
import { extractZipEntry, type SlicedZipEntry } from "./sliced-zip";
import { optionalAuthHeader } from "@/lib/firebase/auth-headers";
import { translate } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import {
  useBackgroundImportStore,
  type BackgroundImportRun,
} from "./background-import-store";
import {
  isRestorableBackup,
  readWorkspaceBackup,
  summarizeWorkspaceBackup,
  type RestoreSummary,
  type WorkspaceBackup,
} from "./workspace-backup";

export type { RestoreSummary } from "./workspace-backup";

export const WORKSPACE_RESTORE_KEY = "workspace:restore";

function message(key: "synapsys_import_success" | "synapsys_import_failed" | "synapsys_import_invalid_file"): string {
  return translate(useUiStore.getState().language || "pt", key);
}

export interface PersistedRestoreJob {
  workspaceId: string;
  fileName: string;
  fileBlob: Blob;
  mode: "merge" | "clean";
  uploadedPaths: string[];
  restoredPageBatch: number;
  totalFiles: number;
  totalNotes: number;
  summary?: RestoreSummary;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "synapsys_workspace_restore_v1";
const STORE_NAME = "restore_jobs";

function openRestoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB não disponível"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "workspaceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePersistedRestoreJob(job: PersistedRestoreJob): Promise<void> {
  try {
    const db = await openRestoreDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(job);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function getPersistedRestoreJob(
  workspaceId: string
): Promise<PersistedRestoreJob | null> {
  try {
    const db = await openRestoreDb();
    return await new Promise<PersistedRestoreJob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(workspaceId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deletePersistedRestoreJob(workspaceId: string): Promise<void> {
  try {
    const db = await openRestoreDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(workspaceId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function getAnyPersistedRestoreJob(): Promise<PersistedRestoreJob | null> {
  try {
    const db = await openRestoreDb();
    return await new Promise<PersistedRestoreJob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll(undefined, 1);
      req.onsuccess = () => resolve(req.result?.[0] || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function getFreshAuthHeader(): Promise<Record<string, string>> {
  try {
    const authHeaders = await optionalAuthHeader();
    if (authHeaders.Authorization) return authHeaders;
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

function findZipEntry(
  zipMap: Map<string, SlicedZipEntry>,
  item: { archivePath: string; storagePath: string; name: string }
): SlicedZipEntry | undefined {
  const normArchive = item.archivePath.replace(/\\/g, "/");
  const candidates = [
    item.archivePath,
    normArchive,
    normArchive.replace(/^files\//, ""),
    normArchive.replace(/^arquivos\//, ""),
    item.storagePath,
    decodeURIComponent(normArchive),
    "files/" + normArchive.replace(/^files\//, ""),
    item.storagePath.replace(/^workspaces\/[^/]+\//, "files/"),
    item.storagePath.replace(/^workspaces\/[^/]+\//, ""),
    item.name,
  ];

  for (const c of candidates) {
    const found = zipMap.get(c);
    if (found) return found;
  }

  const base = item.name.toLowerCase();
  for (const [k, v] of zipMap.entries()) {
    if (k.toLowerCase().endsWith("/" + base) || k.toLowerCase() === base) {
      return v;
    }
  }

  return undefined;
}

function extractTokensMap(rawJson: string): Map<string, string> {
  const tokenMap = new Map<string, string>();
  const regex = /firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?&]+)\?alt=media(?:&|&amp;)token=([a-zA-Z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawJson)) !== null) {
    try {
      const path = decodeURIComponent(m[1]);
      const token = m[2];
      if (path && token) {
        tokenMap.set(path, token);
      }
    } catch {}
  }
  return tokenMap;
}

type RestorableData = Omit<WorkspaceBackup, "files">;

function remapWorkspaceData(parsedData: WorkspaceBackup, targetWorkspaceId: string): RestorableData {
  let serialized = JSON.stringify({
    workspace: parsedData.workspace,
    notebooks: parsedData.notebooks,
    pages: parsedData.pages,
    databases: parsedData.databases,
    flashcards: parsedData.flashcards,
    study: parsedData.study,
  });

  const manifestFiles = parsedData.files || [];
  let sourceWsId: string | null = null;
  for (const item of manifestFiles) {
    if (item.storagePath && item.storagePath.startsWith("workspaces/")) {
      const parts = item.storagePath.split("/");
      if (parts[1] && parts[1] !== targetWorkspaceId) {
        sourceWsId = parts[1];
        break;
      }
    }
  }

  if (!sourceWsId && parsedData.workspace?.id && parsedData.workspace.id !== targetWorkspaceId) {
    sourceWsId = String(parsedData.workspace.id);
  }

  if (sourceWsId && sourceWsId !== targetWorkspaceId) {
    const rawOld = `workspaces/${sourceWsId}/`;
    const rawNew = `workspaces/${targetWorkspaceId}/`;
    const encOld = `workspaces%2F${sourceWsId}%2F`;
    const encNew = `workspaces%2F${targetWorkspaceId}%2F`;
    serialized = serialized.replaceAll(rawOld, rawNew).replaceAll(encOld, encNew);
  }

  const result = JSON.parse(serialized) as RestorableData;
  if (result.workspace) {
    result.workspace.id = targetWorkspaceId;
  }
  return result;
}

const activeAbortControllers = new Map<string, AbortController>();

function getGlobalActiveFlag(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as Record<string, unknown>).__synapsys_restore_active);
}

function setGlobalActiveFlag(val: boolean): void {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__synapsys_restore_active = val;
  }
}

export function cancelRestoreJob(workspaceId: string) {
  setGlobalActiveFlag(false);
  const ctrl = activeAbortControllers.get(workspaceId);
  if (ctrl) {
    ctrl.abort();
    activeAbortControllers.delete(workspaceId);
  }
  for (const c of activeAbortControllers.values()) {
    c.abort();
  }
  activeAbortControllers.clear();
  useBackgroundImportStore.getState().cancel(WORKSPACE_RESTORE_KEY);
  void deletePersistedRestoreJob(workspaceId);
}

export function isRestoreRunning(workspaceId?: string): boolean {
  if (getGlobalActiveFlag()) return true;
  if (workspaceId && activeAbortControllers.has(workspaceId)) return true;
  if (activeAbortControllers.size > 0) return true;
  return useBackgroundImportStore.getState().runs[WORKSPACE_RESTORE_KEY]?.status === "running";
}

async function uploadBatchFilesWithRetry(
  items: Array<{
    blob: Blob;
    storagePath: string;
    fileName: string;
    token?: string;
  }>,
  workspaceId: string,
  authHeader: { current: Record<string, string> },
  signal?: AbortSignal
): Promise<boolean> {
  let attempts = 0;
  while (attempts < 6) {
    if (signal?.aborted) return false;
    attempts++;
    try {
      if (!authHeader.current.Authorization) {
        authHeader.current = await getFreshAuthHeader();
      }

      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      for (const it of items) {
        formData.append("file", it.blob, it.fileName);
        formData.append("storagePath", it.storagePath);
        if (it.token) formData.append("token", it.token);
      }

      let res = await fetch("/api/workspace/restore-file", {
        method: "POST",
        headers: authHeader.current,
        body: formData,
        signal,
      });

      if (res.status === 401) {
        authHeader.current = await getFreshAuthHeader();
        res = await fetch("/api/workspace/restore-file", {
          method: "POST",
          headers: authHeader.current,
          body: formData,
          signal,
        });
      }

      if (res.ok) {
        return true;
      }
    } catch {
      if (signal?.aborted) return false;
      const delay = Math.min(600 * Math.pow(1.6, attempts - 1), 6000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}

export async function executeWorkspaceRestore(
  workspaceId: string,
  file: File | Blob,
  fileName: string,
  mode: "merge" | "clean",
  onProgress?: (progress: {
    stage: "reading" | "media" | "firestore" | "done" | "error";
    processedFiles: number;
    totalFiles: number;
    processedNotes: number;
    totalNotes: number;
    percent: number;
    message?: string;
  }) => void
): Promise<void> {
  if (getGlobalActiveFlag() || activeAbortControllers.has(workspaceId)) {
    return;
  }

  setGlobalActiveFlag(true);
  const abortCtrl = new AbortController();
  activeAbortControllers.set(workspaceId, abortCtrl);

  const store = useBackgroundImportStore.getState();
  const existingJob = await getPersistedRestoreJob(workspaceId);

  const uploadedPathsSet = new Set<string>(existingJob?.uploadedPaths || []);
  const restoredBatchIndex = existingJob?.restoredPageBatch || 0;
  let maxReportedFiles = uploadedPathsSet.size;

  try {
    onProgress?.({
      stage: "reading",
      processedFiles: maxReportedFiles,
      totalFiles: existingJob?.totalFiles || 0,
      processedNotes: 0,
      totalNotes: existingJob?.totalNotes || 0,
      percent: 5,
    });

    const { data: parsedData, entries: zipMap } = await readWorkspaceBackup(file);
    if (!isRestorableBackup(parsedData)) throw new Error(message("synapsys_import_invalid_file"));
    const manifestFiles = parsedData.files;

    const totalFiles = manifestFiles.length;
    const totalNotes = parsedData.pages.length;

    const summary: RestoreSummary = summarizeWorkspaceBackup(parsedData);

    const currentJob: PersistedRestoreJob = {
      workspaceId,
      fileName,
      fileBlob: file,
      mode,
      uploadedPaths: Array.from(uploadedPathsSet),
      restoredPageBatch: restoredBatchIndex,
      totalFiles,
      totalNotes,
      summary,
      createdAt: existingJob?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await savePersistedRestoreJob(currentJob);

    store.begin(WORKSPACE_RESTORE_KEY, {
      provider: "synapsys",
      wizard: "workspace",
      totalNotes,
      totalFiles,
      currentTitle: fileName,
    });

    const patchStore = (patch: Partial<BackgroundImportRun>) => {
      useBackgroundImportStore.getState().patch(WORKSPACE_RESTORE_KEY, patch);
    };

    patchStore({
      processedFiles: maxReportedFiles,
      processedNotes: 0,
    });

    const authHeaderRef = { current: await getFreshAuthHeader() };
    const tokenMap = extractTokensMap(JSON.stringify(parsedData));

    if (manifestFiles.length > 0) {
      onProgress?.({
        stage: "media",
        processedFiles: maxReportedFiles,
        totalFiles,
        processedNotes: 0,
        totalNotes,
        percent: Math.min(75, Math.round((maxReportedFiles / (totalFiles || 1)) * 75)),
      });

      const pendingItems = manifestFiles.filter(
        (item) => !uploadedPathsSet.has(item.storagePath)
      );

      const CONCURRENCY = 4;
      const BATCH_FILE_COUNT = 8;
      let pendingIndex = 0;
      let lastSavedCount = maxReportedFiles;

      const worker = async () => {
        while (pendingIndex < pendingItems.length) {
          if (abortCtrl.signal.aborted) break;

          const batchStartIndex = pendingIndex;
          pendingIndex += BATCH_FILE_COUNT;
          const sliceItems = pendingItems.slice(batchStartIndex, batchStartIndex + BATCH_FILE_COUNT);
          if (sliceItems.length === 0) break;

          const batchToUpload: Array<{
            blob: Blob;
            storagePath: string;
            fileName: string;
            token?: string;
          }> = [];

          for (const item of sliceItems) {
            if (abortCtrl.signal.aborted) break;
            const entry = findZipEntry(zipMap, item);
            if (entry) {
              try {
                const entryBytes = await extractZipEntry(file, entry);
                const fileBlob = new Blob([entryBytes.buffer as ArrayBuffer], {
                  type: item.mimeType || "application/octet-stream",
                });
                const token = tokenMap.get(item.storagePath) || tokenMap.get(item.archivePath);
                batchToUpload.push({
                  blob: fileBlob,
                  storagePath: item.storagePath,
                  fileName: item.name,
                  token,
                });
              } catch {
                uploadedPathsSet.add(item.storagePath);
              }
            } else {
              uploadedPathsSet.add(item.storagePath);
            }
          }

          if (batchToUpload.length > 0) {
            const ok = await uploadBatchFilesWithRetry(
              batchToUpload,
              workspaceId,
              authHeaderRef,
              abortCtrl.signal
            );
            if (ok) {
              for (const b of batchToUpload) {
                uploadedPathsSet.add(b.storagePath);
              }
            }
          }

          maxReportedFiles = Math.max(maxReportedFiles, uploadedPathsSet.size);
          patchStore({ processedFiles: maxReportedFiles });

          onProgress?.({
            stage: "media",
            processedFiles: maxReportedFiles,
            totalFiles,
            processedNotes: 0,
            totalNotes,
            percent: Math.min(75, Math.round((maxReportedFiles / (totalFiles || 1)) * 75)),
          });

          if (maxReportedFiles - lastSavedCount >= 32 || pendingIndex >= pendingItems.length) {
            lastSavedCount = maxReportedFiles;
            currentJob.uploadedPaths = Array.from(uploadedPathsSet);
            currentJob.updatedAt = Date.now();
            void savePersistedRestoreJob(currentJob);
          }

          await new Promise((r) => setTimeout(r, 0));
        }
      };

      const pool = Array.from(
        { length: Math.min(CONCURRENCY, Math.ceil(pendingItems.length / BATCH_FILE_COUNT) || 1) },
        () => worker()
      );
      await Promise.all(pool);

      if (abortCtrl.signal.aborted) return;

      currentJob.uploadedPaths = Array.from(uploadedPathsSet);
      currentJob.updatedAt = Date.now();
      await savePersistedRestoreJob(currentJob);
    }

    onProgress?.({
      stage: "firestore",
      processedFiles: totalFiles,
      totalFiles,
      processedNotes: 0,
      totalNotes,
      percent: 78,
    });

    await new Promise((r) => setTimeout(r, 50));

    const finalRestoredData = remapWorkspaceData(parsedData, workspaceId);

    const allPages = finalRestoredData.pages || [];
    const PAGE_CHUNK_SIZE = 25;
    const totalBatches = Math.max(1, Math.ceil(allPages.length / PAGE_CHUNK_SIZE));

    for (let batchIdx = restoredBatchIndex; batchIdx < totalBatches; batchIdx++) {
      if (abortCtrl.signal.aborted) return;

      const start = batchIdx * PAGE_CHUNK_SIZE;
      const end = start + PAGE_CHUNK_SIZE;
      const pageSlice = allPages.slice(start, end);

      const isFirst = batchIdx === 0;

      const payload = {
        workspaceId,
        clean: isFirst && mode === "clean",
        data: {
          ...(isFirst
            ? {
                workspace: finalRestoredData.workspace,
                notebooks: finalRestoredData.notebooks,
                databases: finalRestoredData.databases,
                flashcards: finalRestoredData.flashcards,
                study: finalRestoredData.study,
              }
            : {}),
          pages: pageSlice,
        },
      };

      let attempts = 0;
      let success = false;
      while (attempts < 5 && !success) {
        if (abortCtrl.signal.aborted) return;
        attempts++;
        try {
          if (!authHeaderRef.current.Authorization) {
            authHeaderRef.current = await getFreshAuthHeader();
          }

          let restoreRes = await fetch("/api/workspace/restore", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaderRef.current,
            },
            body: JSON.stringify(payload),
            signal: abortCtrl.signal,
          });

          if (restoreRes.status === 401) {
            authHeaderRef.current = await getFreshAuthHeader();
            restoreRes = await fetch("/api/workspace/restore", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...authHeaderRef.current,
              },
              body: JSON.stringify(payload),
              signal: abortCtrl.signal,
            });
          }

          if (restoreRes.ok) {
            success = true;
          } else {
            const errJson = await restoreRes.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `Erro ${restoreRes.status}`);
          }
        } catch {
          if (abortCtrl.signal.aborted) return;
          const delay = Math.min(800 * Math.pow(1.6, attempts - 1), 6000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!success) {
        throw new Error(message("synapsys_import_failed"));
      }

      const processedNotesCount = Math.min(totalNotes, (batchIdx + 1) * PAGE_CHUNK_SIZE);
      patchStore({ processedNotes: processedNotesCount });

      currentJob.restoredPageBatch = batchIdx + 1;
      currentJob.updatedAt = Date.now();
      await savePersistedRestoreJob(currentJob);

      const percent = Math.min(99, 78 + Math.round(((batchIdx + 1) / totalBatches) * 21));
      onProgress?.({
        stage: "firestore",
        processedFiles: totalFiles,
        totalFiles,
        processedNotes: processedNotesCount,
        totalNotes,
        percent,
      });

      await new Promise((r) => setTimeout(r, 10));
    }

    await deletePersistedRestoreJob(workspaceId);
    activeAbortControllers.delete(workspaceId);
    setGlobalActiveFlag(false);

    store.finish(WORKSPACE_RESTORE_KEY, []);
    toast.success(message("synapsys_import_success"));

    onProgress?.({
      stage: "done",
      processedFiles: totalFiles,
      totalFiles,
      processedNotes: totalNotes,
      totalNotes,
      percent: 100,
    });

    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.location.reload();
      }, 700);
    }
  } catch (err) {
    activeAbortControllers.delete(workspaceId);
    setGlobalActiveFlag(false);
    const failure = err instanceof Error && err.message ? err.message : message("synapsys_import_failed");
    useBackgroundImportStore.getState().patch(WORKSPACE_RESTORE_KEY, { status: "done" });
    onProgress?.({
      stage: "error",
      processedFiles: maxReportedFiles,
      totalFiles: existingJob?.totalFiles || 0,
      processedNotes: 0,
      totalNotes: existingJob?.totalNotes || 0,
      percent: 0,
      message: failure,
    });
    toast.error(failure);
    throw err;
  }
}

let resumeCheckScheduled = false;

export function scheduleRestoreResumptionCheck(workspaceId: string) {
  if (typeof window === "undefined" || resumeCheckScheduled) return;
  resumeCheckScheduled = true;

  setTimeout(async () => {
    try {
      if (isRestoreRunning(workspaceId)) return;
      const persisted = await getPersistedRestoreJob(workspaceId);
      if (persisted && !isRestoreRunning(workspaceId)) {
        void executeWorkspaceRestore(
          persisted.workspaceId,
          persisted.fileBlob,
          persisted.fileName,
          persisted.mode
        );
      }
    } catch {}
  }, 1200);
}
