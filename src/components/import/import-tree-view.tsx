"use client";

import { AlertTriangle, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Skeleton } from "@/components/ui/primitives";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { cn, formatRelative } from "@/lib/utils";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";
import type { TreeSelectionState } from "@/hooks/use-import-tree";
import type { ImportTreeNode } from "@/types/models";

export function ImportTreeView({
  tree,
  loading,
  error,
  search,
  onSearchChange,
  onReload,
  onRetry,
  selectedCount,
  totalCount,
  stateOf,
  toggleNode,
  toggleAll,
  isExpanded,
  toggleExpanded,
  expandAll,
  collapseAll,
  accentClassName,
}: {
  tree: ImportTreeNode[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onReload: () => void;
  onRetry: () => void;
  selectedCount: number;
  totalCount: number;
  stateOf: (node: ImportTreeNode) => TreeSelectionState;
  toggleNode: (node: ImportTreeNode) => void;
  toggleAll: (checked: boolean) => void;
  isExpanded: (node: ImportTreeNode, depth: number) => boolean;
  toggleExpanded: (node: ImportTreeNode, depth: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
  accentClassName?: string;
}) {
  const { t, language } = useTranslation();

  const renderNodes = (nodes: ImportTreeNode[], depth = 0) =>
    nodes.map((node) => {
      const hasChildren = Boolean(node.children?.length);
      const open = isExpanded(node, depth);
      const state = stateOf(node);
      const isContainer = node.kind === "container";

      return (
        <div key={node.id}>
          <div
            className="group flex items-center gap-2 rounded-[var(--radius-xs)] py-1.5 pr-2 transition-colors hover:bg-[var(--surface-hover)]"
            style={{ paddingLeft: `${8 + depth * 20}px` }}
          >
            <button
              type="button"
              onClick={() => toggleExpanded(node, depth)}
              className={cn(
                "flex size-4 items-center justify-center rounded text-faint transition hover:text-ink",
                !hasChildren && "invisible"
              )}
              aria-label={open ? t("wizard_collapse_all") : t("wizard_expand_all")}
            >
              <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
            </button>

            <Checkbox
              checked={state === "checked" ? true : state === "partial" ? "indeterminate" : false}
              onCheckedChange={() => toggleNode(node)}
              aria-label={node.title}
            />

            <span className={cn("w-4 shrink-0 text-center text-[13px]", accentClassName)}>
              <WorkspaceIcon
                icon={node.icon}
                fallback={isContainer ? "📓" : "📄"}
                size={14}
              />
            </span>

            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{node.title}</span>

            {node.modifiedTime ? (
              <span className="shrink-0 text-[11px] text-faint">
                {formatRelative(new Date(node.modifiedTime).getTime(), language)}
              </span>
            ) : null}

            {isContainer && hasChildren ? (
              <span className="shrink-0 text-[11px] text-faint">
                {node.children!.length}{" "}
                {node.children!.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}
              </span>
            ) : null}
          </div>

          {open && hasChildren ? <div>{renderNodes(node.children!, depth + 1)}</div> : null}
        </div>
      );
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 pt-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("search_placeholder")}
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReload}
          disabled={loading}
          title={t("reload")}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between border-b border-[var(--border)] px-5 pb-2.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ink">
          <Checkbox
            checked={selectedCount === totalCount && totalCount > 0}
            onCheckedChange={(value) => toggleAll(value === true)}
          />
          {t("wizard_import_all")}
          <span className="text-faint">
            ({totalCount} {totalCount === 1 ? t("wizard_unit_item") : t("wizard_unit_items")})
          </span>
        </label>
        <div className="flex items-center gap-3 text-[11.5px]">
          <div className="flex items-center gap-1.5 text-muted">
            <button type="button" onClick={expandAll} className="transition hover:text-ink hover:underline">
              {t("wizard_expand_all")}
            </button>
            <span className="text-faint">·</span>
            <button type="button" onClick={collapseAll} className="transition hover:text-ink hover:underline">
              {t("wizard_collapse_all")}
            </button>
          </div>
          <span className="font-medium text-ink">
            {t("wizard_selected_count", { count: selectedCount })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="space-y-2 px-5 py-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3"
                style={{ paddingLeft: `${(index % 3) * 20}px` }}
              >
                <Skeleton className="size-4 rounded" />
                <Skeleton className={cn("h-4", index % 2 ? "w-40" : "w-64")} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
            <AlertTriangle className="size-6 text-[var(--warning)]" />
            <p className="text-[13px] text-ink">{localizeErrorMessage(error, t)}</p>
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> {t("wizard_try_again")}
            </Button>
          </div>
        ) : tree.length === 0 ? (
          <div className="py-14 text-center text-[12.5px] text-muted">{t("no_documents_found")}</div>
        ) : (
          renderNodes(tree)
        )}
      </div>
    </div>
  );
}
