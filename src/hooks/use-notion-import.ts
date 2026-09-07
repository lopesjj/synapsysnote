"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImportJob, NotionTreeNode } from "@/types/models";
import { useWorkspace } from "@/lib/data/provider";
import { findNode, flattenTree } from "@/lib/notion/mock-workspace";

export interface ImportSelection {
  /** Ids explicitly checked by the user (children are resolved on submit). */
  ids: Set<string>;
  importAll: boolean;
}

/**
 * ETAPA 2 — `useNotionImport`
 *
 * Owns everything the Import Wizard needs: loading the Notion tree, checkbox
 * state with parent/child propagation, job creation and the live progress
 * document produced by the background worker.
 */
export function useNotionImport() {
  const { adapter, integration, importJobs, activeImportJob, notebooks, livePages, databases } =
    useWorkspace();

  const [tree, setTree] = useState<NotionTreeNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importAll, setImportAll] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [treeRequest, setTreeRequest] = useState(0);

  const existingNotionIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of livePages) if (p.notionPageId) set.add(p.notionPageId);
    for (const nb of notebooks) if (nb.notionPageId) set.add(nb.notionPageId);
    for (const db of databases) if (db.notionDatabaseId) set.add(db.notionDatabaseId);
    return set;
  }, [livePages, notebooks, databases]);

  const loadTree = useCallback(async () => {
    setTreeError(null);
    setTree([]);
    setTreeRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!integration?.connected && treeRequest === 0) return;
    let cancelled = false;
    adapter
      .fetchNotionTree()
      .then((nodes) => {
        if (cancelled) return;
        setTree(nodes);
        setTreeError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setTreeError(
          error instanceof Error ? error.message : "Não foi possível ler o workspace do Notion."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, integration?.connected, treeRequest]);

  const loadingTree = Boolean(
    (integration?.connected || treeRequest > 0) && tree.length === 0 && !treeError
  );

  const flat = useMemo(() => flattenTree(tree), [tree]);

  const descendantsOf = useCallback(
    (id: string): string[] => {
      const node = findNode(tree, id);
      if (!node?.children) return [];
      return flattenTree(node.children).map((n) => n.id);
    },
    [tree]
  );

  const toggle = useCallback(
    (id: string, checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const ids = [id, ...descendantsOf(id)];
        for (const item of ids) {
          if (checked) next.add(item);
          else next.delete(item);
        }
        return next;
      });
      setImportAll(false);
    },
    [descendantsOf]
  );

  const toggleAll = useCallback(
    (checked: boolean) => {
      setImportAll(checked);
      setSelected(checked ? new Set(flat.map((n) => n.id)) : new Set());
    },
    [flat]
  );

  /** Tri-state checkbox support for parents with partially selected children. */
  const stateOf = useCallback(
    (id: string): "checked" | "unchecked" | "indeterminate" => {
      if (selected.has(id)) return "checked";
      const kids = descendantsOf(id);
      return kids.some((kid) => selected.has(kid)) ? "indeterminate" : "unchecked";
    },
    [descendantsOf, selected]
  );

  const selectedNodes = useMemo(
    () => flat.filter((node) => selected.has(node.id)),
    [flat, selected]
  );

  const summary = useMemo(() => {
    const pages = selectedNodes.filter((n) => n.type === "page").length;
    const databases = selectedNodes.filter((n) => n.type === "database").length;
    const rows = selectedNodes
      .filter((n) => n.type === "database")
      .reduce((sum, n) => sum + (n.childCount ?? 0), 0);
    const existingCount = selectedNodes.filter((n) => existingNotionIds.has(n.id)).length;
    const newCount = selectedNodes.length - existingCount;
    return { pages, databases, rows, total: selectedNodes.length, existingCount, newCount };
  }, [existingNotionIds, selectedNodes]);

  const job: ImportJob | null = useMemo(
    () => (jobId ? importJobs.find((j) => j.id === jobId) : null) ?? activeImportJob ?? null,
    [activeImportJob, importJobs, jobId]
  );

  const start = useCallback(
    async (options: {
      targetNotebookId: string | null;
      downloadMedia: boolean;
      preserveHierarchy: boolean;
      runOcr: boolean;
      createBacklinks: boolean;
    }) => {
      if (activeImportJob) {
        throw new Error(
          "Já existe uma importação em andamento. Aguarde a conclusão ou cancele-a antes de iniciar outra."
        );
      }
      setSubmitting(true);
      try {
        // Import parents before children so `parentPageId` always resolves.
        const ordered = flat.filter((node) => selected.has(node.id));
        const id = await adapter.createImportJob({
          selection: { notionIds: ordered.map((n) => n.id), importAll },
          targetNotebookId: options.targetNotebookId,
          options: {
            downloadMedia: options.downloadMedia,
            preserveHierarchy: options.preserveHierarchy,
            runOcr: options.runOcr,
            createBacklinks: options.createBacklinks,
          },
          items: ordered.map((node) => ({
            notionId: node.id,
            title: node.title,
            type: node.type,
          })),
        });
        setJobId(id);
        return id;
      } finally {
        setSubmitting(false);
      }
    },
    [activeImportJob, adapter, flat, importAll, selected]
  );

  const cancel = useCallback(async () => {
    const targetId = jobId ?? activeImportJob?.id;
    if (targetId) await adapter.cancelImportJob(targetId);
  }, [activeImportJob, adapter, jobId]);

  const maxProgressRef = useRef(0);

  const reset = useCallback(() => {
    setJobId(null);
    setSelected(new Set());
    setImportAll(false);
    maxProgressRef.current = 0;
  }, []);

  useEffect(() => {
    maxProgressRef.current = 0;
  }, [jobId]);

  useEffect(() => {
    const targetId = jobId ?? activeImportJob?.id;
    if (
      targetId &&
      activeImportJob &&
      ["pending", "discovering", "running"].includes(activeImportJob.status)
    ) {
      void adapter.resumeImportJob?.(targetId);
    }
  }, [activeImportJob, adapter, jobId]);

  const progress = useMemo(() => {
    if (!job) return 0;
    if (job.status === "completed" || job.status === "completed_with_errors") {
      maxProgressRef.current = 100;
      return 100;
    }
    if (job.status === "failed" || job.status === "canceled") {
      return maxProgressRef.current;
    }

    const effectiveTotalPages = Math.max(job.totalPages, job.processedPages, 1);
    const effectiveTotalFiles = Math.max(job.totalFiles, job.processedFiles);
    const totalUnits = effectiveTotalPages + effectiveTotalFiles;
    const doneUnits = job.processedPages + job.processedFiles;

    if (!totalUnits) return 0;

    const rawPct = Math.floor((doneUnits / totalUnits) * 100);
    // Enquanto estiver em andamento (pending, discovering, running), nunca atinge 100% (máximo 99%)
    const runningPct = Math.min(99, Math.max(1, rawPct));
    // Monotônico: nunca retrocede, sempre progressivo
    maxProgressRef.current = Math.max(maxProgressRef.current, runningPct);
    return maxProgressRef.current;
  }, [job]);

  return {
    integration,
    notebooks,
    tree,
    loadingTree,
    treeError,
    loadTree,
    selected,
    selectedNodes,
    summary,
    toggle,
    toggleAll,
    stateOf,
    importAll,
    start,
    submitting,
    cancel,
    reset,
    job,
    activeImportJob,
    existingNotionIds,
    progress,
    connect: () => adapter.connectNotion(),
    disconnect: () => adapter.disconnectNotion(),
  };
}
