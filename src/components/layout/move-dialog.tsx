"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  FolderInput,
  Search,
  Check,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { childrenOf, isNestedNotebook, isNotebookDescendant } from "@/lib/data/notebook-tree";
import type { Notebook, Page } from "@/types/models";
import { cn } from "@/lib/utils";

export interface MoveItemTarget {
  kind: "notebook" | "page";
  id: string;
  title: string;
}

export interface MoveItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MoveItemTarget | null;
}

function isPageDescendant(pages: Page[], candidate: Page, ancestorId: string): boolean {
  if (candidate.path.includes(ancestorId)) return true;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let current = candidate.parentPageId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentPageId ?? null;
  }
  return false;
}

export function MoveItemDialog({ open, onOpenChange, item }: MoveItemDialogProps) {
  const { t } = useTranslation();
  const { notebooks, livePages, adapter } = useWorkspace();
  const [search, setSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<{
    kind: "notebook" | "page";
    id: string;
    notebookId: string | null;
    parentPageId: string | null;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const currentItem = useMemo(() => {
    if (!item) return null;
    if (item.kind === "notebook") {
      return notebooks.find((nb) => nb.id === item.id) ?? null;
    }
    return livePages.find((p) => p.id === item.id) ?? null;
  }, [item, livePages, notebooks]);

  const isValidDestination = (targetKind: "notebook" | "page", targetId: string): { valid: boolean; reason?: string } => {
    if (!item || !currentItem) return { valid: false };

    if (item.kind === "notebook") {
      if (targetKind === "page") {
        return { valid: false, reason: t("cannot_move_here") };
      }
      if (targetId === item.id) {
        return { valid: false, reason: t("cannot_move_here") };
      }
      if (isNotebookDescendant(notebooks, targetId, item.id)) {
        return { valid: false, reason: t("cannot_move_here") };
      }
      const notebookItem = currentItem as Notebook;
      if (notebookItem.parentId === targetId) {
        return { valid: false, reason: t("current_location") };
      }
      return { valid: true };
    }

    const pageItem = currentItem as Page;
    if (targetKind === "notebook") {
      if (pageItem.notebookId === targetId && pageItem.parentPageId === null) {
        return { valid: false, reason: t("current_location") };
      }
      return { valid: true };
    }

    if (targetId === item.id) {
      return { valid: false, reason: t("cannot_move_here") };
    }
    const targetPage = livePages.find((p) => p.id === targetId);
    if (!targetPage) return { valid: false };
    if (isPageDescendant(livePages, targetPage, item.id)) {
      return { valid: false, reason: t("cannot_move_here") };
    }
    if (pageItem.notebookId === targetPage.notebookId && pageItem.parentPageId === targetPage.id) {
      return { valid: false, reason: t("current_location") };
    }

    return { valid: true };
  };

  const handleConfirmMove = async () => {
    if (!item || !selectedTarget || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (item.kind === "notebook") {
        await adapter.moveNotebook(item.id, { parentId: selectedTarget.id });
        toast.success(t("notebook_moved"));
      } else {
        await adapter.movePage(item.id, {
          notebookId: selectedTarget.notebookId,
          parentPageId: selectedTarget.parentPageId,
        });
        toast.success(
          selectedTarget.parentPageId
            ? t("note_moved_as_subnote")
            : t("note_moved_to_notebook")
        );
      }
      onOpenChange(false);
      setSelectedTarget(null);
    } catch {
      toast.error(t("cannot_move_here"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanSearch = search.trim().toLowerCase();

  const renderPageNodes = (
    notebookId: string,
    parentPageId: string | null,
    depth: number
  ): React.ReactNode => {
    const childPages = livePages
      .filter((p) => p.notebookId === notebookId && p.parentPageId === parentPageId && !p.deletedAt)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    if (!childPages.length) return null;

    return childPages.map((page) => {
      const subPages = livePages.filter((p) => p.parentPageId === page.id && !p.deletedAt);
      const isExpanded = expanded[page.id] ?? (cleanSearch.length > 0);
      const validation = isValidDestination("page", page.id);
      const isSelected =
        selectedTarget?.kind === "page" && selectedTarget.id === page.id;
      const isCurrent = currentItem?.id === page.id;

      if (
        cleanSearch &&
        !page.title.toLowerCase().includes(cleanSearch) &&
        !subPages.some((sp) => sp.title.toLowerCase().includes(cleanSearch))
      ) {
        return null;
      }

      return (
        <div key={page.id} className="flex flex-col">
          <div
            onClick={() => {
              if (!validation.valid) return;
              setSelectedTarget({
                kind: "page",
                id: page.id,
                notebookId: page.notebookId ?? null,
                parentPageId: page.id,
              });
            }}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            className={cn(
              "group flex items-center gap-2 py-1.5 pr-3 text-[13px] rounded-[var(--radius-sm)] transition-colors cursor-pointer select-none",
              isSelected
                ? "bg-[var(--accent-soft)] text-ink font-medium ring-1 ring-inset ring-[var(--accent)]"
                : validation.valid
                  ? "hover:bg-[var(--surface-hover)] text-ink"
                  : "opacity-45 cursor-not-allowed text-muted"
            )}
          >
            <button
              type="button"
              onClick={(e) => toggleExpand(page.id, e)}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded text-faint hover:text-ink transition",
                !subPages.length && "invisible"
              )}
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform duration-150",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
            <WorkspaceIcon icon={page.icon} fallback="📄" size={16} />
            <span className="truncate flex-1">
              {page.title || t("untitled")}
            </span>
            {isCurrent ? (
              <span className="text-[11px] font-normal text-faint bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                {t("current_location")}
              </span>
            ) : !validation.valid && validation.reason ? (
              <span className="text-[11px] font-normal text-faint flex items-center gap-1">
                <Ban className="size-3" />
                {validation.reason}
              </span>
            ) : isSelected ? (
              <Check className="size-4 text-[var(--accent)] shrink-0" />
            ) : null}
          </div>
          {isExpanded && subPages.length > 0 ? (
            <div className="flex flex-col">
              {renderPageNodes(notebookId, page.id, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const renderNotebookNodes = (parentId: string | null, depth: number): React.ReactNode => {
    const list = childrenOf(notebooks, parentId);
    if (!list.length) return null;

    return list.map((notebook) => {
      const childNotebooks = childrenOf(notebooks, notebook.id);
      const rootPages = livePages.filter(
        (p) => p.notebookId === notebook.id && !p.parentPageId && !p.deletedAt
      );
      const hasChildren = childNotebooks.length > 0 || rootPages.length > 0;
      const isExpanded = expanded[notebook.id] ?? (cleanSearch.length > 0);
      const validation = isValidDestination("notebook", notebook.id);
      const isSelected =
        selectedTarget?.kind === "notebook" && selectedTarget.id === notebook.id;
      const isCurrent = currentItem?.id === notebook.id;

      return (
        <div key={notebook.id} className="flex flex-col">
          <div
            onClick={() => {
              if (!validation.valid) return;
              setSelectedTarget({
                kind: "notebook",
                id: notebook.id,
                notebookId: notebook.id,
                parentPageId: null,
              });
            }}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            className={cn(
              "group flex items-center gap-2 py-1.5 pr-3 text-[13px] rounded-[var(--radius-sm)] transition-colors cursor-pointer select-none",
              isSelected
                ? "bg-[var(--accent-soft)] text-ink font-medium ring-1 ring-inset ring-[var(--accent)]"
                : validation.valid
                  ? "hover:bg-[var(--surface-hover)] text-ink"
                  : "opacity-45 cursor-not-allowed text-muted"
            )}
          >
            <button
              type="button"
              onClick={(e) => toggleExpand(notebook.id, e)}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded text-faint hover:text-ink transition",
                !hasChildren && "invisible"
              )}
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform duration-150",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
            <WorkspaceIcon
              icon={notebook.emoji}
              fallback={isNestedNotebook(notebook) ? "📁" : "📓"}
              size={16}
            />
            <span className="truncate flex-1 font-medium">
              {notebook.name}
            </span>
            {isCurrent ? (
              <span className="text-[11px] font-normal text-faint bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                {t("current_location")}
              </span>
            ) : !validation.valid && validation.reason ? (
              <span className="text-[11px] font-normal text-faint flex items-center gap-1">
                <Ban className="size-3" />
                {validation.reason}
              </span>
            ) : isSelected ? (
              <Check className="size-4 text-[var(--accent)] shrink-0" />
            ) : null}
          </div>
          {isExpanded ? (
            <div className="flex flex-col">
              {renderNotebookNodes(notebook.id, depth + 1)}
              {renderPageNodes(notebook.id, null, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) {
          onOpenChange(next);
          if (!next) {
            setSelectedTarget(null);
            setSearch("");
            setExpanded({});
          }
        }
      }}
      className="max-w-md"
    >
      <DialogHeader
        title={t("move_item")}
        description={`${t("move_item_description")} (${item?.title || t("untitled")})`}
        icon={<FolderInput className="size-4 text-[var(--accent)]" />}
      />

      <div className="flex flex-col gap-3 p-4">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_destination")}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-3 text-[13px] text-ink placeholder:text-muted focus:border-[var(--accent)] focus:outline-none transition"
          />
        </div>

        <div className="max-h-72 min-h-[160px] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1">
          {renderNotebookNodes(null, 0)}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          size="sm"
          disabled={isSubmitting}
          onClick={() => {
            onOpenChange(false);
            setSelectedTarget(null);
          }}
        >
          {t("avatar_crop_cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!selectedTarget || isSubmitting}
          onClick={() => void handleConfirmMove()}
          className="gap-1.5"
        >
          <FolderInput className="size-3.5" />
          {t("move_to")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
