"use client";

import { useCallback, useRef, useState } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { parseHtmlDocument } from "@/lib/import/html-import";
import { runTreeImport, type ImportedNoteTree } from "@/lib/import/run-tree-import";
import type { ImportedNoteResult } from "@/lib/import/run-import";
import type { GoogleDocsIntegration, ImportTreeNode } from "@/types/models";
import { useImportTree } from "./use-import-tree";

export interface GoogleDocsImportProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

interface DocumentTabPayload {
  id: string;
  title: string;
  html: string;
  children: DocumentTabPayload[];
}

export function useGoogleDocsImport(options?: { active?: boolean }) {
  const { adapter, googleDocsIntegration, notebooks } = useWorkspace();
  const connected = Boolean(googleDocsIntegration?.connected);

  const treeState = useImportTree({
    endpoint: "/api/google-docs/tree",
    workspaceId: adapter.workspaceId,
    enabled: connected && (options?.active ?? true),
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<GoogleDocsImportProgress>({
    processed: 0,
    total: 0,
    currentTitle: "",
  });
  const [results, setResults] = useState<ImportedNoteResult[] | null>(null);

  const connect = useCallback(
    async (input?: {
      accessToken?: string;
      accountEmail?: string;
      accountName?: string;
      avatarUrl?: string;
    }) => {
      if (adapter.connectGoogleDocs) return adapter.connectGoogleDocs(input);
      return firebaseJson<{ redirectUrl?: string; connected?: GoogleDocsIntegration }>(
        "/api/google-docs/authorize",
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: adapter.workspaceId,
            accessToken: input?.accessToken,
            accountEmail: input?.accountEmail,
            accountName: input?.accountName,
            avatarUrl: input?.avatarUrl,
          }),
        }
      );
    },
    [adapter]
  );

  const disconnect = useCallback(async () => {
    if (adapter.disconnectGoogleDocs) {
      await adapter.disconnectGoogleDocs();
      return;
    }
    await firebaseJson("/api/google-docs/disconnect", {
      method: "POST",
      body: JSON.stringify({ workspaceId: adapter.workspaceId }),
    });
  }, [adapter]);

  const tabsErrorRef = useRef<string | null>(null);

  const fetchNote = useCallback(
    async (node: ImportTreeNode): Promise<ImportedNoteTree | null> => {
      const payload = await firebaseJson<{
        html?: string;
        tabs?: DocumentTabPayload[];
        tabsError?: string | null;
      }>("/api/google-docs/document", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: adapter.workspaceId,
          documentId: node.id,
        }),
      });

      if (payload.tabsError) tabsErrorRef.current = payload.tabsError;

      const toNote = (html: string, title: string, sourceId: string) => {
        const note = parseHtmlDocument(html || "<p></p>", {
          sourceFileName: title,
          source: "google-docs",
        });
        note.title = title;
        note.sourceId = sourceId;
        return note;
      };

      const mapTabs = (tabs: DocumentTabPayload[]): ImportedNoteTree[] =>
        tabs.map((tab) => ({
          note: toNote(tab.html, tab.title || node.title, `${node.id}:${tab.id}`),
          children: tab.children?.length ? mapTabs(tab.children) : undefined,
        }));

      if (payload.tabs?.length) {
        return {
          container: { title: node.title, icon: "📘" },
          children: mapTabs(payload.tabs),
        };
      }

      if (!payload.html) return null;
      return { note: toNote(payload.html, node.title, node.id) };
    },
    [adapter.workspaceId]
  );

  const start = useCallback(
    async (options: {
      targetNotebookId: string | null;
      uploadMedia?: boolean;
      preserveStructure?: boolean;
    }) => {
      if (!treeState.selectedIds.size) return null;
      setRunning(true);
      setResults(null);
      tabsErrorRef.current = null;
      setProgress({ processed: 0, total: treeState.selectedIds.size, currentTitle: "" });

      try {
        const importResults = await runTreeImport({
          adapter,
          roots: treeState.tree,
          selectedIds: treeState.selectedIds,
          targetNotebookId: options.targetNotebookId,
          preserveStructure: options.preserveStructure ?? true,
          uploadMedia: options.uploadMedia ?? true,
          keepTags: true,
          fallbackTitle: "Google Doc",
          provider: "google_docs",
          containerEmoji: "📁",
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
    tabsError: tabsErrorRef,
    integration: googleDocsIntegration,
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
