"use client";

import { useCallback, useRef, useState } from "react";
import { useWorkspace } from "@/lib/data/provider";
import {
  buildImportPlan,
  runZipImport,
  type ImportPlan,
  type ImportResult,
} from "@/lib/notion/zip/run-import";
import type { ImportProgress } from "@/lib/notion/zip/types";

/**
 * State machine for the client-side `.zip` import.
 *
 * The archive is analysed first and the plan is shown for confirmation before
 * anything is written, because the import creates notebooks and notes in bulk
 * and that is not something to discover after the fact.
 */

const IDLE_PROGRESS: ImportProgress = {
  stage: "idle",
  step: "",
  notebooks: 0,
  pages: 0,
  mediaTotal: 0,
  mediaUploaded: 0,
  warnings: [],
};

export function useZipImport() {
  const { adapter } = useWorkspace();

  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(IDLE_PROGRESS);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMedia, setUploadMedia] = useState(true);
  const [resolveLinks, setResolveLinks] = useState(true);

  const abort = useRef<{ aborted: boolean }>({ aborted: false });

  const reset = useCallback(() => {
    abort.current = { aborted: false };
    setFile(null);
    setPlan(null);
    setProgress(IDLE_PROGRESS);
    setResult(null);
    setError(null);
  }, []);

  const analyse = useCallback(async (candidate: File) => {
    abort.current = { aborted: false };
    setError(null);
    setResult(null);
    setFile(candidate);
    setProgress({ ...IDLE_PROGRESS, stage: "reading", step: "Descompactando o arquivo…" });

    try {
      if (!/\.zip$/i.test(candidate.name)) {
        throw new Error("Selecione o arquivo .zip exportado pelo Notion.");
      }
      setProgress((previous) => ({
        ...previous,
        stage: "analysing",
        step: "Lendo a hierarquia de páginas…",
      }));

      const next = await buildImportPlan(candidate);
      if (!next.pages.length) {
        throw new Error(
          "Nenhuma página encontrada. Exporte do Notion em “Markdown & CSV” e inclua as subpáginas."
        );
      }

      setPlan(next);
      setProgress((previous) => ({
        ...previous,
        stage: "idle",
        step: "",
        notebooks: next.notebooks.length,
        pages: next.pages.length,
        mediaTotal: next.summary.mediaCount,
      }));
    } catch (cause) {
      setPlan(null);
      setProgress((previous) => ({ ...previous, stage: "error", step: "" }));
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.");
    }
  }, []);

  const start = useCallback(async () => {
    if (!plan) return;
    abort.current = { aborted: false };
    setError(null);

    try {
      const outcome = await runZipImport({
        adapter,
        plan,
        uploadMedia,
        resolveLinks,
        signal: abort.current,
        onProgress: (patch) => setProgress((previous) => ({ ...previous, ...patch })),
      });
      setResult(outcome);
      setProgress((previous) => ({
        ...previous,
        stage: "done",
        step: "Importação concluída.",
        warnings: outcome.warnings,
      }));
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      setProgress((previous) => ({
        ...previous,
        stage: aborted ? "idle" : "error",
        step: "",
      }));
      if (!aborted) {
        setError(cause instanceof Error ? cause.message : "A importação falhou.");
      }
    }
  }, [adapter, plan, resolveLinks, uploadMedia]);

  const cancel = useCallback(() => {
    abort.current.aborted = true;
  }, []);

  const running = progress.stage === "uploading" || progress.stage === "writing";

  return {
    file,
    plan,
    progress,
    result,
    error,
    running,
    uploadMedia,
    resolveLinks,
    setUploadMedia,
    setResolveLinks,
    analyse,
    start,
    cancel,
    reset,
  };
}
