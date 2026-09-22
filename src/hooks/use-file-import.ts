"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { importGoogleDocFromUrl } from "@/lib/import/google-docs";
import { isSupportedImportFile, parseImportFile, type ImportProvider } from "@/lib/import/parse-file";
import { runFileImport, countAssetReferences } from "@/lib/import/run-import";
import { buildTreeFromNotes, collectDocumentIds, runTreeImport } from "@/lib/import/run-tree-import";
import { ImportError, type ImportedNote } from "@/lib/import/types";
import {
  backgroundImportPercent,
  fileImportKey,
  isBackgroundImportCanceled,
  useBackgroundImportStore,
  type BackgroundImportRun,
} from "@/lib/import/background-import-store";

export interface FileImportIssue {
  id: string;
  fileName: string;
  code: string;
}

export interface FileImportProgress {
  processedNotes: number;
  totalNotes: number;
  processedFiles: number;
  totalFiles: number;
  currentTitle: string;
}

export interface FileImportOptions {
  targetNotebookId: string | null;
  uploadMedia: boolean;
  keepTags: boolean;
  preserveStructure: boolean;
}

function issueCodeOf(error: unknown): string {
  if (error instanceof ImportError) return error.code;
  return "generic";
}

export function useFileImport(provider: ImportProvider, fallbackTitle: string) {
  const { adapter, notebooks } = useWorkspace();
  const runKey = fileImportKey(provider);
  const run = useBackgroundImportStore((state) => state.runs[runKey]);

  const [notes, setNotes] = useState<ImportedNote[]>([]);
  const [issues, setIssues] = useState<FileImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const counterRef = useRef(0);

  const running = run?.status === "running";
  const results = run?.results ?? null;
  const canceled = Boolean(run?.canceled);

  const progress = useMemo<FileImportProgress>(
    () => ({
      processedNotes: run?.processedNotes ?? 0,
      totalNotes: run?.totalNotes ?? 0,
      processedFiles: run?.processedFiles ?? 0,
      totalFiles: run?.totalFiles ?? 0,
      currentTitle: run?.currentTitle ?? "",
    }),
    [run]
  );

  const percent = backgroundImportPercent(run);

  const addIssue = useCallback((fileName: string, code: string) => {
    counterRef.current += 1;
    setIssues((prev) => [...prev, { id: `issue_${counterRef.current}`, fileName, code }]);
  }, []);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length) return;
      setParsing(true);
      try {
        for (const file of incoming) {
          if (!isSupportedImportFile(file, provider)) {
            addIssue(file.name, "unsupported_file");
            continue;
          }
          try {
            const parsed = await parseImportFile(file, provider);
            if (!parsed.length) {
              addIssue(file.name, "empty_file");
              continue;
            }
            setNotes((prev) => [...prev, ...parsed]);
          } catch (error) {
            addIssue(file.name, issueCodeOf(error));
          }
        }
      } finally {
        setParsing(false);
      }
    },
    [addIssue, provider]
  );

  const addGoogleDoc = useCallback(
    async (url: string) => {
      setParsing(true);
      try {
        const note = await importGoogleDocFromUrl(url);
        setNotes((prev) => [...prev, note]);
        return true;
      } catch (error) {
        addIssue(url, error instanceof ImportError ? error.code : "google_doc_unavailable");
        return false;
      } finally {
        setParsing(false);
      }
    },
    [addIssue]
  );

  const removeNote = useCallback((sourceId: string) => {
    setNotes((prev) => prev.filter((note) => note.sourceId !== sourceId));
  }, []);

  const dismissIssue = useCallback((id: string) => {
    setIssues((prev) => prev.filter((issue) => issue.id !== id));
  }, []);

  const clear = useCallback(() => {
    setNotes([]);
    setIssues([]);
  }, []);

  const reset = useCallback(() => {
    setNotes([]);
    setIssues([]);
    useBackgroundImportStore.getState().clear(runKey);
  }, [runKey]);

  const totalFiles = useMemo(
    () => notes.reduce((sum, note) => sum + countAssetReferences(note.blocks), 0),
    [notes]
  );

  const start = useCallback(
    async (options: FileImportOptions) => {
      const store = useBackgroundImportStore.getState();
      if (!notes.length || store.runs[runKey]?.status === "running") return null;

      const jobProvider =
        provider === "word" ? "docx" : provider === "evernote" ? "enex" : "google_docs";

      store.begin(runKey, {
        provider: jobProvider,
        wizard: "file",
        fileProvider: provider,
        totalNotes: notes.length,
        totalFiles: options.uploadMedia ? totalFiles : 0,
        currentTitle: notes[0]?.title ?? "",
      });

      const patch = (value: Partial<BackgroundImportRun>) =>
        useBackgroundImportStore.getState().patch(runKey, value);
      const isCanceled = () => isBackgroundImportCanceled(runKey);

      try {
        const structured =
          options.preserveStructure && notes.some((note) => note.containerPath?.length);

        const finished = structured
          ? await (async () => {
              const { roots, notesById } = buildTreeFromNotes(notes);
              let uploadedFiles = 0;
              return runTreeImport({
                adapter,
                roots,
                selectedIds: new Set(collectDocumentIds(roots)),
                targetNotebookId: options.targetNotebookId,
                preserveStructure: true,
                uploadMedia: options.uploadMedia,
                keepTags: options.keepTags,
                fallbackTitle,
                provider: jobProvider,
                containerEmoji: "📓",
                existingNotebooks: notebooks,
                isCanceled,
                fetchNote: async (node) => {
                  const note = notesById.get(node.id);
                  return note ? { note } : null;
                },
                onFileUploaded: () => {
                  uploadedFiles += 1;
                  patch({ processedFiles: uploadedFiles });
                },
                onNodeStart: (processed, _total, node) => {
                  patch({ processedNotes: processed - 1, currentTitle: node.title });
                },
                onNodeFinish: (_result, processed) => {
                  patch({ processedNotes: processed });
                },
              });
            })()
          : await runFileImport({
              adapter,
              notes,
              targetNotebookId: options.targetNotebookId,
              uploadMedia: options.uploadMedia,
              keepTags: options.keepTags,
              fallbackTitle,
              provider: jobProvider,
              isCanceled,
              onNoteStart: (index, note) => {
                patch({ processedNotes: index, currentTitle: note.title });
              },
              onNoteFinish: (_result, index) => {
                patch({ processedNotes: index + 1 });
              },
              onFileUploaded: (uploaded, total) => {
                patch({ processedFiles: uploaded, totalFiles: total });
              },
            });

        useBackgroundImportStore.getState().finish(runKey, finished);
        return finished;
      } catch (error) {
        useBackgroundImportStore.getState().finish(runKey, []);
        throw error;
      }
    },
    [adapter, fallbackTitle, notebooks, notes, provider, runKey, totalFiles]
  );

  const cancel = useCallback(() => {
    useBackgroundImportStore.getState().cancel(runKey);
  }, [runKey]);

  return {
    notebooks,
    notes,
    issues,
    parsing,
    running,
    results,
    canceled,
    progress,
    percent,
    totalFiles,
    addFiles,
    addGoogleDoc,
    removeNote,
    dismissIssue,
    clear,
    reset,
    start,
    cancel,
  };
}
