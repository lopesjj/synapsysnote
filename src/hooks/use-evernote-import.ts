"use client";

import { useCallback, useState } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { parseEnmlNote } from "@/lib/import/enex";
import { markdownToHtml, plainTextToHtml } from "@/lib/import/markdown";
import { runTreeImport, type ImportedNoteTree } from "@/lib/import/run-tree-import";
import type { ImportedNoteResult } from "@/lib/import/run-import";
import type { EvernoteIntegration, ImportTreeNode } from "@/types/models";
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

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<EvernoteImportProgress>({
    processed: 0,
    total: 0,
    currentTitle: "",
  });
  const [results, setResults] = useState<ImportedNoteResult[] | null>(null);

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
      if (!treeState.selectedIds.size) return null;
      setRunning(true);
      setResults(null);
      setProgress({ processed: 0, total: treeState.selectedIds.size, currentTitle: "" });

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
          onNodeStart: (processed, total, node) => {
            setProgress({ processed: processed - 1, total, currentTitle: node.title });
          },
          onNodeFinish: (_result, processed, total) => {
            setProgress({ processed, total, currentTitle: "" });
          },
        });

        setResults(importResults);
        return importResults;
      } finally {
        setRunning(false);
      }
    },
    [adapter, fetchNote, notebooks, treeState.selectedIds, treeState.tree]
  );

  const reset = useCallback(() => {
    treeState.clearSelection();
    setResults(null);
    setProgress({ processed: 0, total: 0, currentTitle: "" });
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
    reset,
    ...treeState,
  };
}
