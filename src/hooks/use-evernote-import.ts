"use client";

import { useCallback, useMemo } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { parseEnmlNote } from "@/lib/import/enex";
import { markdownToHtml, plainTextToHtml } from "@/lib/import/markdown";
import { runTreeImport, type ImportedNoteTree } from "@/lib/import/run-tree-import";
import type { EvernoteIntegration, ImportTreeNode } from "@/types/models";
import {
  EVERNOTE_IMPORT_KEY,
  isBackgroundImportCanceled,
  useBackgroundImportStore,
} from "@/lib/import/background-import-store";
import { useImportTree } from "./use-import-tree";

export interface EvernoteImportProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

interface NoteContentPayload {
  title?: string;
  content?: string;
  contentType?: "enml" | "html" | "markdown" | "text";
  tags?: string[];
}

export function useEvernoteImport(options?: { active?: boolean }) {
  const { adapter, evernoteIntegration, notebooks } = useWorkspace();
  const connected = Boolean(evernoteIntegration?.connected);

  const treeState = useImportTree({
    endpoint: "/api/evernote/tree",
    workspaceId: adapter.workspaceId,
    enabled: connected && (options?.active ?? true),
  });

  const run = useBackgroundImportStore((state) => state.runs[EVERNOTE_IMPORT_KEY]);
  const running = run?.status === "running";
  const results = run?.results ?? null;
  const progress = useMemo<EvernoteImportProgress>(
    () => ({
      processed: run?.processedNotes ?? 0,
      total: run?.totalNotes ?? 0,
      currentTitle: run?.currentTitle ?? "",
    }),
    [run]
  );

  const connect = useCallback(async () => {
    if (adapter.connectEvernote) return adapter.connectEvernote();
    return firebaseJson<{ redirectUrl?: string; connected?: EvernoteIntegration }>(
      "/api/evernote/authorize",
      {
        method: "POST",
        body: JSON.stringify({ workspaceId: adapter.workspaceId }),
      }
    );
  }, [adapter]);

  const disconnect = useCallback(async () => {
    if (adapter.disconnectEvernote) {
      await adapter.disconnectEvernote();
      return;
    }
    await firebaseJson("/api/evernote/disconnect", {
      method: "POST",
      body: JSON.stringify({ workspaceId: adapter.workspaceId }),
    });
  }, [adapter]);

  const fetchNote = useCallback(
    async (node: ImportTreeNode): Promise<ImportedNoteTree | null> => {
      const payload = await firebaseJson<NoteContentPayload>("/api/evernote/note-content", {
        method: "POST",
        body: JSON.stringify({ workspaceId: adapter.workspaceId, noteId: node.id }),
      });

      const raw = payload.content ?? "";
      if (!raw.trim()) return null;

      const html =
        payload.contentType === "markdown"
          ? markdownToHtml(raw)
          : payload.contentType === "text"
            ? plainTextToHtml(raw)
            : raw;

      const note = parseEnmlNote({
        enml: html,
        title: payload.title || node.title,
        tags: payload.tags,
        sourceFileName: node.title,
      });
      note.sourceId = node.id;
      return { note };
    },
    [adapter.workspaceId]
  );

  const start = useCallback(
    async (options: {
      targetNotebookId: string | null;
      keepTags?: boolean;
      preserveStructure?: boolean;
    }) => {
      const store = useBackgroundImportStore.getState();
      if (!treeState.selectedIds.size) return null;
      if (store.runs[EVERNOTE_IMPORT_KEY]?.status === "running") return null;

      store.begin(EVERNOTE_IMPORT_KEY, {
        provider: "evernote",
        wizard: "evernote",
        totalNotes: treeState.selectedIds.size,
      });

      const patch = (value: Parameters<typeof store.patch>[1]) =>
        useBackgroundImportStore.getState().patch(EVERNOTE_IMPORT_KEY, value);

      try {
        const importResults = await runTreeImport({
          adapter,
          roots: treeState.tree,
          selectedIds: treeState.selectedIds,
          targetNotebookId: options.targetNotebookId,
          preserveStructure: options.preserveStructure ?? true,
          uploadMedia: true,
          keepTags: options.keepTags ?? true,
          fallbackTitle: "Evernote",
          provider: "evernote",
          containerEmoji: "📓",
          existingNotebooks: notebooks,
          fetchNote,
          isCanceled: () => isBackgroundImportCanceled(EVERNOTE_IMPORT_KEY),
          onNodeStart: (processed, total, node) => {
            patch({ processedNotes: processed - 1, totalNotes: total, currentTitle: node.title });
          },
          onNodeFinish: (_result, processed, total) => {
            patch({ processedNotes: processed, totalNotes: total, currentTitle: "" });
          },
        });

        useBackgroundImportStore.getState().finish(EVERNOTE_IMPORT_KEY, importResults);
        return importResults;
      } catch (error) {
        useBackgroundImportStore.getState().finish(EVERNOTE_IMPORT_KEY, []);
        throw error;
      }
    },
    [adapter, fetchNote, notebooks, treeState.selectedIds, treeState.tree]
  );

  const cancel = useCallback(() => {
    useBackgroundImportStore.getState().cancel(EVERNOTE_IMPORT_KEY);
  }, []);

  const reset = useCallback(() => {
    treeState.clearSelection();
    useBackgroundImportStore.getState().clear(EVERNOTE_IMPORT_KEY);
  }, [treeState]);

  return {
    adapter,
    connected,
    integration: evernoteIntegration,
    notebooks,
    connect,
    disconnect,
    start,
    running,
    progress,
    results,
    cancel,
    reset,
    ...treeState,
  };
}
