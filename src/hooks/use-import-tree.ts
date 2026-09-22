"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { collectDocumentIds, flattenTree } from "@/lib/import/run-tree-import";
import type { ImportTreeNode } from "@/types/models";

export type TreeSelectionState = "checked" | "partial" | "unchecked";

export function filterImportTree(nodes: ImportTreeNode[], term: string): ImportTreeNode[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return nodes;

  const walk = (list: ImportTreeNode[]): ImportTreeNode[] => {
    const out: ImportTreeNode[] = [];
    for (const node of list) {
      const children = node.children?.length ? walk(node.children) : [];
      const matches = node.title.toLowerCase().includes(needle);
      if (matches) {
        out.push(node);
        continue;
      }
      if (children.length) out.push({ ...node, children });
    }
    return out;
  };

  return walk(nodes);
}

export function useImportTree(options: {
  endpoint: string;
  workspaceId: string;
  enabled: boolean;
}) {
  const { endpoint, workspaceId, enabled } = options;
  const [tree, setTree] = useState<ImportTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [settled, setSettled] = useState(false);
  const startedRef = useRef(false);

  const documentIds = useMemo(() => collectDocumentIds(tree), [tree]);

  const load = useCallback(
    async (query = "") => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("workspaceId", workspaceId);
        if (query) url.searchParams.set("q", query);
        const data = await firebaseJson<{ tree?: ImportTreeNode[] }>(url.toString());
        setTree(data.tree ?? []);
      } catch (err) {
        setTree([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setSettled(true);
      }
    },
    [endpoint, workspaceId]
  );

  useEffect(() => {
    if (!enabled) {
      startedRef.current = false;
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;
    Promise.resolve().then(() => load());
  }, [enabled, load]);

  const toggleNode = useCallback((node: ImportTreeNode) => {
    const ids = flattenTree([node])
      .filter((item) => item.kind === "document")
      .map((item) => item.id);
    if (!ids.length) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(documentIds) : new Set());
    },
    [documentIds]
  );

  const stateOf = useCallback(
    (node: ImportTreeNode): TreeSelectionState => {
      const ids = flattenTree([node])
        .filter((item) => item.kind === "document")
        .map((item) => item.id);
      if (!ids.length) return "unchecked";
      const selected = ids.filter((id) => selectedIds.has(id)).length;
      if (selected === 0) return "unchecked";
      return selected === ids.length ? "checked" : "partial";
    },
    [selectedIds]
  );

  const isExpanded = useCallback(
    (node: ImportTreeNode, depth: number) => expanded[node.id] ?? depth < 1,
    [expanded]
  );

  const toggleExpanded = useCallback((node: ImportTreeNode, depth: number) => {
    setExpanded((prev) => ({ ...prev, [node.id]: !(prev[node.id] ?? depth < 1) }));
  }, []);

  const expandAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const node of flattenTree(tree)) {
      if (node.kind === "container") next[node.id] = true;
    }
    setExpanded(next);
  }, [tree]);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const node of flattenTree(tree)) {
      if (node.kind === "container") next[node.id] = false;
    }
    setExpanded(next);
  }, [tree]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    tree,
    loading: loading || (enabled && !settled),
    error,
    load,
    documentIds,
    selectedIds,
    toggleNode,
    toggleAll,
    clearSelection,
    stateOf,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
  };
}
