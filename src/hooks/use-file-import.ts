"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/data/provider";
import { importGoogleDocFromUrl } from "@/lib/import/google-docs";
import { isSupportedImportFile, parseImportFile, type ImportProvider } from "@/lib/import/parse-file";
import { runFileImport, countAssetReferences, type ImportedNoteResult } from "@/lib/import/run-import";
import { buildTreeFromNotes, collectDocumentIds, runTreeImport } from "@/lib/import/run-tree-import";
import { ImportError, type ImportedNote } from "@/lib/import/types";

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

const EMPTY_PROGRESS: FileImportProgress = {
  processedNotes: 0,
  totalNotes: 0,
  processedFiles: 0,
  totalFiles: 0,
  currentTitle: "",
};

function issueCodeOf(error: unknown): string {
  if (error instanceof ImportError) return error.code;
  return "generic";
}

export function useFileImport(provider: ImportProvider, fallbackTitle: string) {
  const { adapter, notebooks } = useWorkspace();

  const [notes, setNotes] = useState<ImportedNote[]>([]);
  const [issues, setIssues] = useState<FileImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ImportedNoteResult[] | null>(null);
  const [progress, setProgress] = useState<FileImportProgress>(EMPTY_PROGRESS);
  const canceledRef = useRef(false);
  const counterRef = useRef(0);

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
    setResults(null);
    setProgress(EMPTY_PROGRESS);
    canceledRef.current = false;
  }, []);

  const totalFiles = useMemo(
    () => notes.reduce((sum, note) => sum + countAssetReferences(note.blocks), 0),
    [notes]
  );

  const start = useCallback(
    async (options: FileImportOptions) => {
      if (!notes.length || running) return null;
      canceledRef.current = false;
      setRunning(true);
      setResults(null);
      setProgress({
        processedNotes: 0,
        totalNotes: notes.length,
        processedFiles: 0,
        totalFiles: options.uploadMedia ? totalFiles : 0,
        currentTitle: notes[0]?.title ?? "",
      });

      const jobProvider =
        provider === "word" ? "docx" : provider === "evernote" ? "enex" : "google_docs";

      try {
        const structured = options.preserveStructure && notes.some((note) => note.containerPath?.length);

        const finished = structured
          ? await (async () => {
              const { roots, notesById } = buildTreeFromNotes(notes);
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
                isCanceled: () => canceledRef.current,
                fetchNote: async (node) => {
                  const note = notesById.get(node.id);
                  return note ? { note } : null;
                },
                onNodeStart: (processed, _total, node) => {
                  setProgress((prev) => ({
                    ...prev,
                    processedNotes: processed - 1,
                    currentTitle: node.title,
                  }));
                },
                onNodeFinish: (_result, processed) => {
                  setProgress((prev) => ({ ...prev, processedNotes: processed }));
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
              isCanceled: () => canceledRef.current,
              onNoteStart: (index, note) => {
                setProgress((prev) => ({ ...prev, processedNotes: index, currentTitle: note.title }));
              },
              onNoteFinish: (_result, index) => {
                setProgress((prev) => ({ ...prev, processedNotes: index + 1 }));
              },
              onFileUploaded: (uploaded, total) => {
                setProgress((prev) => ({ ...prev, processedFiles: uploaded, totalFiles: total }));
              },
            });

        setResults(finished);
        return finished;
      } finally {
        setRunning(false);
      }
    },
    [adapter, fallbackTitle, notebooks, notes, provider, running, totalFiles]
  );

  const cancel = useCallback(() => {
    canceledRef.current = true;
  }, []);

  const percent = useMemo(() => {
    const units = progress.totalNotes + progress.totalFiles;
    if (!units) return 0;
    const done = progress.processedNotes + progress.processedFiles;
    if (results) return 100;
    return Math.min(99, Math.max(1, Math.round((done / units) * 100)));
  }, [progress, results]);

  return {
    notebooks,
    notes,
    issues,
    parsing,
    running,
    results,
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
    canceled: canceledRef,
  };
}
