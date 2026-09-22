"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocale, useRouter } from "@/lib/i18n/navigation";
import { localizePath } from "@/lib/i18n/locale";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronRight, Copy, FilePlus, FolderPlus, GripVertical, ImageOff, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useUiStore } from "@/lib/store/ui-store";
import { useWorkspace, type PageTreeNode } from "@/lib/data/provider";
import { childrenOf, isNotebookDescendant, notebookSubtreeIds, parentIdOf } from "@/lib/data/notebook-tree";

import { Button } from "@/components/ui/button";
import { EmptyState, Tooltip } from "@/components/ui/primitives";
import { ListSortControl } from "@/components/ui/list-sort-control";
import { sortNotebooks, sortPageTree } from "@/lib/data/list-sort";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { WorkspaceCrumbs } from "./workspace-crumbs";
import { cn, compareNatural, formatRelative } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import type { Notebook, Page } from "@/types/models";
import { NOTEBOOK_ICONS } from "@/lib/icons/catalog";
import {
  WorkspaceIcon,
  isIconUrl,
  workspaceHeroSize,
  workspaceIconOnCoverClass,
} from "@/lib/icons/workspace-icon";
import { IconPickerMenu } from "@/components/ui/icon-picker";
import { CoverPicker } from "./cover-picker";

export type DropMode = "before" | "after" | "inside";
type DragKind = "notebook" | "note";

function encodeId(kind: DragKind, id: string): string {
  return `${kind}:${id}`;
}

function decodeId(value: string | number): { kind: DragKind; id: string } | null {
  const raw = String(value);
  const separator = raw.indexOf(":");
  if (separator < 0) return null;
  const kind = raw.slice(0, separator);
  if (kind !== "notebook" && kind !== "note") return null;
  return { kind: kind as DragKind, id: raw.slice(separator + 1) };
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

const detectCollisions: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : closestCenter(args);
};

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function NotebookView({ notebookId }: { notebookId: string }) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { adapter, notebooks, livePages, databases, treeFor, ready } = useWorkspace();
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);

  const [titleDraft, setTitleDraft] = useState<{ id: string; value: string } | null>(null);
  const title = titleDraft?.id === notebookId ? titleDraft.value : (notebook?.name ?? "");

  const childNotebooks = useMemo(
    () => childrenOf(notebooks, notebookId),
    [notebookId, notebooks]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const notebooksSort = useUiStore((state) => state.notebooksSort);
  const notebooksSortDirection = useUiStore((state) => state.notebooksSortDirection);
  const notesSort = useUiStore((state) => state.notebookNotesSort);
  const notesSortDirection = useUiStore((state) => state.notebookNotesSortDirection);
  const subnotesSort = useUiStore((state) => state.subnotesSort);
  const subnotesSortDirection = useUiStore((state) => state.subnotesSortDirection);

  const notebooksReorderable = notebooksSort === "manual";
  const notesReorderable = notesSort === "manual";
  const subnotesReorderable = subnotesSort === "manual";

  const toggleNoteExpanded = (noteId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [noteId]: !prev[noteId] }));
  };

  const noteTree = useMemo(() => {
    return treeFor(notebookId);
  }, [notebookId, treeFor]);

  const filterTree = (nodes: PageTreeNode[], query: string): PageTreeNode[] => {
    if (!query) return nodes;
    const result: PageTreeNode[] = [];
    for (const node of nodes) {
      const match =
        node.page.title.toLowerCase().includes(query) ||
        node.page.plainText.toLowerCase().includes(query);
      const filteredChildren = filterTree(node.children, query);
      if (match || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }
    return result;
  };

  const filteredNoteTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = filterTree(noteTree, q);
    return sortPageTree(
      filtered,
      notesSort,
      notesSortDirection,
      subnotesSort,
      subnotesSortDirection
    );
  }, [noteTree, searchQuery, notesSort, notesSortDirection, subnotesSort, subnotesSortDirection]);

  const visibleNoteIds = useMemo(() => {
    const ids: string[] = [];
    const q = searchQuery.trim().toLowerCase();
    const walk = (nodes: PageTreeNode[]) => {
      for (const node of nodes) {
        ids.push(encodeId("note", node.page.id));
        if ((q || expandedNotes[node.page.id]) && node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(filteredNoteTree);
    return ids;
  }, [filteredNoteTree, expandedNotes, searchQuery]);

  const renderNoteNodes = (nodes: PageTreeNode[]): React.ReactNode => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = Boolean(q || expandedNotes[node.page.id]);
      return (
        <div key={node.page.id} className="flex flex-col">
          <NoteRow
            page={node.page}
            depth={node.depth}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            onToggle={() => toggleNoteExpanded(node.page.id)}
            isDropTarget={dropTarget?.id === node.page.id}
            dropMode={dropTarget?.id === node.page.id ? dropTarget.mode : undefined}
          />
          {hasChildren && isExpanded ? (
            <div className="flex flex-col">
              {renderNoteNodes(node.children)}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const notes = useMemo(() => {
    return livePages
      .filter((p) => p.notebookId === notebookId && !p.deletedAt)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || compareNatural(a.title, b.title));
  }, [notebookId, livePages]);

  const filteredChildNotebooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? childNotebooks.filter(
          (nb) =>
            nb.name.toLowerCase().includes(q) ||
            (nb.description ?? "").toLowerCase().includes(q)
        )
      : childNotebooks;
    return sortNotebooks(filtered, notebooksSort, notebooksSortDirection);
  }, [childNotebooks, searchQuery, notebooksSort, notebooksSortDirection]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.plainText.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const notebookDatabases = useMemo(
    () => databases.filter((database) => database.notebookId === notebookId && !database.deletedAt),
    [databases, notebookId]
  );

  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    kind: DragKind;
    mode: DropMode;
  } | null>(null);
  const dropTargetRef = useRef<{
    id: string;
    kind: DragKind;
    mode: DropMode;
  } | null>(null);
  const pointerXRef = useRef<number>(0);
  const pointerYRef = useRef<number>(0);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      pointerXRef.current = e.clientX;
      pointerYRef.current = e.clientY;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeNotebook = useMemo(
    () => (activeNotebookId ? childNotebooks.find((n) => n.id === activeNotebookId) : null),
    [activeNotebookId, childNotebooks]
  );

  const activeNote = useMemo(
    () => (activeNoteId ? livePages.find((p) => p.id === activeNoteId) ?? null : null),
    [activeNoteId, livePages]
  );

  const onDragStart = (event: DragStartEvent) => {
    dropTargetRef.current = null;
    setDropTarget(null);
    const decoded = decodeId(event.active.id);
    if (decoded?.kind === "notebook") {
      setActiveNotebookId(decoded.id);
      setActiveNoteId(null);
    } else if (decoded?.kind === "note") {
      setActiveNoteId(decoded.id);
      setActiveNotebookId(null);
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }

    const activeDecoded = decodeId(active.id);
    const overDecoded = decodeId(over.id);
    if (!activeDecoded || !overDecoded) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }

    const overRect = over.rect;
    if (!overRect) return;

    const cursorX =
      pointerXRef.current ||
      (active.rect.current.translated
        ? active.rect.current.translated.left + active.rect.current.translated.width / 2
        : overRect.left + overRect.width / 2);
    const cursorY =
      pointerYRef.current ||
      (active.rect.current.translated
        ? active.rect.current.translated.top + active.rect.current.translated.height / 2
        : overRect.top + overRect.height / 2);
    const relativeX = overRect.width > 0 ? (cursorX - overRect.left) / overRect.width : 0.5;
    const relativeY = overRect.height > 0 ? (cursorY - overRect.top) / overRect.height : 0.5;

    if (activeDecoded.kind === "notebook") {
      if (overDecoded.kind === "notebook") {
        let mode: DropMode = "inside";
        if (notebooksReorderable) {
          const isIndented = relativeX > 0.05 || (cursorX - overRect.left) > 30;
          const topBound = isIndented ? 0.15 : 0.25;
          const bottomBound = isIndented ? 0.85 : 0.75;

          if (relativeY < topBound) {
            mode = "before";
          } else if (relativeY > bottomBound) {
            mode = "after";
          } else {
            mode = "inside";
          }
        }
        dropTargetRef.current = { id: overDecoded.id, kind: "notebook", mode };
        setDropTarget({ id: overDecoded.id, kind: "notebook", mode });
      } else {
        dropTargetRef.current = null;
        setDropTarget(null);
      }
      return;
    }

    if (activeDecoded.kind === "note") {
      if (overDecoded.kind === "notebook") {
        dropTargetRef.current = { id: overDecoded.id, kind: "notebook", mode: "inside" };
        setDropTarget({ id: overDecoded.id, kind: "notebook", mode: "inside" });
      } else if (overDecoded.kind === "note") {
        if (overDecoded.id === activeDecoded.id) {
          dropTargetRef.current = null;
          setDropTarget(null);
          return;
        }
        const overPage = livePages.find((p) => p.id === overDecoded.id);
        const isDescendant = overPage ? isPageDescendant(livePages, overPage, activeDecoded.id) : false;
        const canReorder = overPage?.parentPageId ? subnotesReorderable : notesReorderable;

        if (isDescendant && !canReorder) {
          dropTargetRef.current = null;
          setDropTarget(null);
          return;
        }

        let mode: DropMode = "inside";
        if (isDescendant) {
          mode = relativeY < 0.5 ? "before" : "after";
        } else if (canReorder) {
          const isIndented = relativeX > 0.05 || (cursorX - overRect.left) > 30;
          const topBound = isIndented ? 0.15 : 0.25;
          const bottomBound = isIndented ? 0.85 : 0.75;

          if (relativeY < topBound) {
            mode = "before";
          } else if (relativeY > bottomBound) {
            mode = "after";
          } else {
            mode = "inside";
          }
        }
        dropTargetRef.current = { id: overDecoded.id, kind: "note", mode };
        setDropTarget({ id: overDecoded.id, kind: "note", mode });
      } else {
        dropTargetRef.current = null;
        setDropTarget(null);
      }
    }
  };

  const onDragCancel = () => {
    dropTargetRef.current = null;
    setActiveNotebookId(null);
    setActiveNoteId(null);
    setDropTarget(null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const targetState = dropTargetRef.current ?? dropTarget;
    dropTargetRef.current = null;
    setActiveNotebookId(null);
    setActiveNoteId(null);
    setDropTarget(null);

    if (!over || active.id === over.id || !targetState) return;

    const activeDecoded = decodeId(active.id);
    const overDecoded = decodeId(over.id);
    if (!activeDecoded || !overDecoded) return;

    if (activeDecoded.kind === "note" && overDecoded.kind === "notebook") {
      const note = livePages.find((p) => p.id === activeDecoded.id);
      const target = childNotebooks.find((n) => n.id === overDecoded.id);
      if (!note || !target) return;
      try {
        await adapter.movePage(note.id, { notebookId: target.id, parentPageId: null });
        toast.success(t("note_moved_to_notebook"));
      } catch {
        toast.error(t("cannot_move_note"));
      }
      return;
    }

    if (activeDecoded.kind === "note" && overDecoded.kind === "note") {
      if (targetState.mode === "inside") {
        const note = livePages.find((p) => p.id === activeDecoded.id);
        const target = livePages.find((p) => p.id === overDecoded.id);
        if (!note || !target || note.id === target.id) return;
        if (isPageDescendant(livePages, target, note.id)) {
          toast.error(t("cannot_move_note"));
          return;
        }
        try {
          const siblings = livePages.filter(
            (p) =>
              p.id !== note.id &&
              !p.deletedAt &&
              p.notebookId === notebookId &&
              p.parentPageId === target.id
          );
          const allInDestination = [
            ...siblings,
            { ...note, notebookId, parentPageId: target.id },
          ].sort((a, b) =>
            compareNatural(a.title || t("untitled"), b.title || t("untitled"))
          );
          const targetIndex = allInDestination.findIndex((p) => p.id === note.id);

          await adapter.movePage(note.id, {
            notebookId,
            parentPageId: target.id,
            order: targetIndex >= 0 ? targetIndex : 0,
          });

          const orderUpdates = allInDestination.map((page, index) => ({
            id: page.id,
            order: index,
          }));
          await adapter.applyPageOrders(orderUpdates);
          setExpandedNotes((prev) => ({ ...prev, [target.id]: true }));
          toast.success(t("note_moved_as_subnote"));
        } catch {
          toast.error(t("cannot_move_note"));
        }
        return;
      }

      const activePage = livePages.find((p) => p.id === activeDecoded.id);
      const overPage = livePages.find((p) => p.id === overDecoded.id);
      if (!activePage || !overPage) return;

      const parentPageId = overPage.parentPageId ?? null;
      const siblings = livePages
        .filter(
          (p) =>
            p.notebookId === notebookId &&
            p.parentPageId === parentPageId &&
            !p.deletedAt
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || compareNatural(a.title, b.title));

      const fromIndex = siblings.findIndex((p) => p.id === activePage.id);
      let toIndex = siblings.findIndex((p) => p.id === overPage.id);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      if (targetState.mode === "after" && fromIndex > toIndex) {
        toIndex += 1;
      } else if (targetState.mode === "before" && fromIndex < toIndex) {
        toIndex -= 1;
      }
      toIndex = Math.max(0, Math.min(siblings.length - 1, toIndex));

      const reordered = moveItem(siblings, fromIndex, toIndex);
      try {
        await adapter.applyPageOrders(
          reordered.map((p, index) => ({ id: p.id, order: index * 100 }))
        );
        toast.success(t("notes_order_updated"));
      } catch {
        toast.error(t("notes_order_failed"));
      }
      return;
    }

    if (activeDecoded.kind === "notebook" && overDecoded.kind === "notebook") {
      const dragged = childNotebooks.find((n) => n.id === activeDecoded.id);
      const target = childNotebooks.find((n) => n.id === overDecoded.id);
      if (!dragged || !target) return;

      if (targetState.mode === "inside") {
        if (isNotebookDescendant(notebooks, target.id, dragged.id)) {
          toast.error(t("cannot_move_into_sub"));
          return;
        }
        try {
          await adapter.moveNotebook(dragged.id, { parentId: target.id });
          toast.success(t("notebook_moved_inside"));
        } catch {
          toast.error(t("cannot_move_notebook"));
        }
        return;
      }

      try {
        const fromIndex = childNotebooks.findIndex((n) => n.id === dragged.id);
        let toIndex = childNotebooks.findIndex((n) => n.id === target.id);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

        if (targetState.mode === "after" && fromIndex > toIndex) {
          toIndex += 1;
        } else if (targetState.mode === "before" && fromIndex < toIndex) {
          toIndex -= 1;
        }
        toIndex = Math.max(0, Math.min(childNotebooks.length - 1, toIndex));

        const reordered = moveItem(childNotebooks, fromIndex, toIndex);
        await adapter.applyNotebookOrders(
          reordered.map((n, index) => ({ id: n.id, order: index * 100 }))
        );
        toast.success(t("notebook_order_updated"));
      } catch {
        toast.error(t("notebook_order_failed"));
      }
      return;
    }
  };

  if (!ready && !notebook) {
    return (
      <div className="mx-auto max-w-[46rem] px-6 py-14">
        <div className="h-9 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="mt-8 h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-2)]" />
      </div>
    );
  }

  if (!notebook) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-ink">{t("page_not_found")}</p>
        <p className="max-w-xs text-[12.5px] text-muted">{t("page_not_found_hint")}</p>
        <Button variant="secondary" onClick={() => router.push("/home")}>
          {t("back_to_home")}
        </Button>
      </div>
    );
  }

  const createSubnotebook = async () => {
    const created = await adapter.createNotebook({
      name: t("new_notebook"),
      parentId: notebookId,
    });
    toast.success(t("notebook_created"));
    router.push(`/home/n/${created.id}`);
  };

  const createNote = async () => {
    const page = await adapter.createPage({ notebookId, title: t("untitled") });
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  const empty = !childNotebooks.length && !notes.length && !notebookDatabases.length;
  const hasCover = Boolean(notebook.coverUrl);

  return (
    <div className="relative">
      {hasCover ? (
        <CoverPicker
          coverUrl={notebook.coverUrl}
          coverPosition={notebook.coverPosition}
          onChange={(coverUrl) => void adapter.updateNotebook(notebookId, { coverUrl })}
          onPositionChange={(pos) => void adapter.updateNotebook(notebookId, { coverPosition: pos })}
          onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
        />
      ) : null}

      <div
        className={cn(
          "z-30 flex items-center gap-2 px-4 py-1.5 md:px-8",
          hasCover
            ? "absolute inset-x-0 top-0 border-transparent bg-gradient-to-b from-black/45 via-black/20 to-transparent text-white"
            : "sticky top-0 border-b border-[var(--border)] bg-[var(--canvas)]/85 backdrop-blur-xl"
        )}
      >
        <WorkspaceCrumbs notebook={notebook} inverted={hasCover} />

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("more_actions")}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => void createSubnotebook()}>
              <FolderPlus /> {t("new_notebook")}
            </MenuItem>
            <MenuItem onSelect={() => void createNote()}>
              <FilePlus /> {t("new_note")}
            </MenuItem>
            {hasCover ? (
              <MenuItem
                onSelect={async () => {
                  await adapter.updateNotebook(notebookId, { coverUrl: null });
                  toast.success(t("remove_cover"));
                }}
              >
                <ImageOff /> {t("remove_cover")}
              </MenuItem>
            ) : null}
            <MenuItem
              onSelect={async () => {
                try {
                  const copy = await adapter.duplicateNotebook(notebookId);
                  toast.success(
                    parentIdOf(notebook) ? t("notebook_duplicated") : t("page_duplicated")
                  );
                  router.push(`/home/n/${copy.id}`);
                } catch {
                  toast.error(t("could_not_duplicate"));
                }
              }}
            >
              <Copy /> {parentIdOf(notebook) ? t("duplicate_notebook") : t("duplicate_page")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                const name = notebook.name?.trim() || (parentIdOf(notebook) ? t("notebook_count_singular") : t("new_page"));
                if (!window.confirm(t("delete_notebook_confirm", { name }))) return;
                const parent = parentIdOf(notebook);
                await adapter.deleteNotebook(notebookId);
                toast.success(parent ? t("notebook_deleted") : t("page_deleted"));
                router.push(parent ? `/home/n/${parent}` : "/home");
              }}
            >
              <Trash2 /> {parentIdOf(notebook) ? t("delete_notebook") : t("delete_page")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {!hasCover ? (
        <CoverPicker
          coverUrl={notebook.coverUrl}
          coverPosition={notebook.coverPosition}
          onChange={(coverUrl) => void adapter.updateNotebook(notebookId, { coverUrl })}
          onPositionChange={(pos) => void adapter.updateNotebook(notebookId, { coverPosition: pos })}
          onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
        />
      ) : null}

      <div className="relative z-10 mx-auto w-full max-w-full sm:max-w-[var(--reading-width,64rem)] px-4 pb-24 pb-safe sm:px-5 md:px-8">
        <div
          className={cn(
            "flex flex-col items-start sm:flex-row sm:items-center",
            isIconUrl(notebook.emoji ?? "") ? "gap-2 sm:gap-5" : "gap-2 sm:gap-3",
            hasCover ? "pt-0" : "pt-4 sm:pt-6"
          )}
        >
          <IconPickerMenu
            icons={NOTEBOOK_ICONS}
            current={notebook.emoji}
            fallback="📓"
            onSelect={(icon) => void adapter.updateNotebook(notebookId, { emoji: icon })}
            onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
            className={
              hasCover
                ? cn(
                    "relative z-20",
                    isIconUrl(notebook.emoji ?? "") ? "-mt-12 sm:-mt-14" : "-mt-6 sm:mt-0"
                  )
                : undefined
            }
            trigger={
              <button
                type="button"
                className={cn(
                  "shrink-0 self-start sm:self-center leading-none transition",
                  isIconUrl(notebook.emoji ?? "") ? "rounded-[22px] sm:rounded-[28px]" : "rounded-[10px]",
                  !hasCover && "hover:bg-[var(--surface-hover)]"
                )}
                aria-label={t("change_icon")}
              >
                <WorkspaceIcon
                  icon={notebook.emoji}
                  fallback="📓"
                  variant="hero"
                  className={hasCover && isIconUrl(notebook.emoji ?? "") ? workspaceIconOnCoverClass : undefined}
                />
              </button>
            }
          />

          <div
            className={cn(
              "mt-2 w-full min-w-0 sm:mt-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center",
              hasCover && isIconUrl(notebook.emoji ?? "") && "sm:-mt-10",
              isIconUrl(notebook.emoji ?? "") ? "sm:min-h-[160px]" : "sm:min-h-[44px]"
            )}
          >
            <textarea
              id="notebook-title-input"
              value={title}
              rows={1}
              cols={1}
              placeholder={parentIdOf(notebook) ? t("notebook_name_placeholder") : t("page_name_placeholder")}
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onChange={(event) => {
                const value = event.target.value;
                setTitleDraft({ id: notebookId, value });
                if (value.trim()) void adapter.updateNotebook(notebookId, { name: value });
              }}
              className="w-full min-w-0 resize-none overflow-hidden border-none bg-transparent py-0 text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink outline-none placeholder:text-faint [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-faint sm:mt-2 sm:justify-start sm:gap-2 sm:text-[11px]">
          <div className="flex items-center gap-2">
            <span>
              {childNotebooks.length} {childNotebooks.length === 1 ? t("notebook_count_singular") : t("notebook_count_plural")}
            </span>
            <span>·</span>
            <span>
              {notes.length} {notes.length === 1 ? t("note_singular") : t("notes_plural")}
            </span>
          </div>
          <span className="sm:ml-auto">{t("updated_time", { time: formatRelative(notebook.updatedAt, language) })}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void createSubnotebook()}>
              <FolderPlus /> {t("new_notebook")}
            </Button>
            <Button variant="secondary" onClick={() => void createNote()}>
              <FilePlus /> {t("new_note")}
            </Button>
          </div>

          {!empty ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("search_in_notebook")}
                className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] pl-8 pr-7 text-[12.5px] text-ink placeholder:text-faint transition focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
                  aria-label={t("clear_search")}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {empty ? (
          <div className="mt-8">
            <EmptyState
              title={parentIdOf(notebook) ? t("this_notebook_is_empty") : t("this_page_is_empty")}
              description={t("empty_notebook_desc")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => void createSubnotebook()}>
                    <FolderPlus /> {t("new_notebook")}
                  </Button>
                  <Button variant="primary" onClick={() => void createNote()}>
                    <FilePlus /> {t("new_note")}
                  </Button>
                </div>
              }
            />
          </div>
        ) : searchQuery && !filteredChildNotebooks.length && !filteredNotes.length ? (
          <div className="mt-8 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-8 text-center">
            <p className="text-[13px] text-muted">
              {t("no_items_match_in_notebook", { query: searchQuery })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => setSearchQuery("")}
            >
              {t("clear_search")}
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={detectCollisions}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragOver={onDragMove}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
          >
            <div className="mt-8 space-y-8">
              {filteredChildNotebooks.length ? (
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                      {t("notebooks")}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {searchQuery ? null : notebooksReorderable ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 font-medium text-muted shadow-2xs">
                            <span>↕</span> {t("dnd_borders_reorder")}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 font-semibold text-[var(--accent)] shadow-2xs">
                            <FolderPlus className="size-3.5" /> {t("dnd_center_move")}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10.5px] text-faint">
                          {t("sort_manual_only_hint")}
                        </span>
                      )}
                      {filteredChildNotebooks.length > 1 ? (
                        <ListSortControl
                          scope="notebooks"
                          sort={notebooksSort}
                          direction={notebooksSortDirection}
                        />
                      ) : null}
                    </div>
                  </div>
                  <SortableContext
                    items={filteredChildNotebooks.map((c) => encodeId("notebook", c.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                      {filteredChildNotebooks.map((child) => (
                        <NotebookRow
                          key={child.id}
                          notebook={child}
                          isDropTarget={dropTarget?.id === child.id}
                          dropMode={dropTarget?.id === child.id ? dropTarget.mode : undefined}
                          isNoteDragging={Boolean(activeNoteId)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </section>
              ) : null}

              {filteredNoteTree.length || (!searchQuery && notebookDatabases.length) ? (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                      {t("notes_plural")}
                    </h2>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {searchQuery || (notes.length < 2 && !childNotebooks.length) ? null : (
                        <span className="text-[10.5px] text-faint">
                          {notesReorderable
                            ? childNotebooks.length > 0
                              ? t("dnd_drag_reorder_or_move")
                              : t("dnd_drag_reorder")
                            : t("sort_manual_only_hint")}
                        </span>
                      )}
                      {visibleNoteIds.length > 1 ? (
                        <ListSortControl
                          scope="notebookNotes"
                          sort={notesSort}
                          direction={notesSortDirection}
                        />
                      ) : null}
                    </div>
                  </div>
                  <SortableContext
                    items={visibleNoteIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                      {renderNoteNodes(filteredNoteTree)}
                      {!searchQuery &&
                        notebookDatabases.map((database) => (
                          <Link
                            key={database.id}
                            href={`/home/db/${database.id}`}
                            className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-hover)]"
                          >
                            <WorkspaceIcon icon={database.icon} fallback="🗃️" size={16} />
                            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                              {database.name}
                            </span>
                            <span className="text-[11px] text-faint">{t("database_badge")}</span>
                          </Link>
                        ))}
                    </div>
                  </SortableContext>
                </section>
              ) : null}
            </div>

            <DragOverlay>
              {activeNote ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-float)] ring-4 ring-[var(--accent)]/15">
                  <GripVertical className="size-4 text-[var(--accent)]" />
                  <WorkspaceIcon icon={activeNote.icon} fallback="📄" variant="list" />
                  <span className="truncate text-[13.5px] font-semibold text-ink">
                    {activeNote.title || t("untitled")}
                  </span>
                  {dropTarget?.kind === "notebook" ? (
                    <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11.5px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
                      <FolderPlus className="size-3.5" />
                      {t("move_inside")}
                    </span>
                  ) : dropTarget?.kind === "note" && dropTarget?.mode === "inside" ? (
                    <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11.5px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
                      <FilePlus className="size-3.5" />
                      {t("create_subnote")}
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] font-medium text-faint">
                      {!notesReorderable
                        ? t("dnd_center_move")
                        : childNotebooks.length > 0
                          ? t("dnd_drag_reorder_or_move")
                          : t("reorder")}
                    </span>
                  )}
                </div>
              ) : null}

              {activeNotebook ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-float)] ring-4 ring-[var(--accent)]/20">
                  <GripVertical className="size-4 text-[var(--accent)]" />
                  <WorkspaceIcon icon={activeNotebook.emoji} fallback="📓" variant="list" />
                  <span className="truncate text-[13.5px] font-bold text-ink">
                    {activeNotebook.name}
                  </span>
                  {dropTarget?.mode === "inside" ? (
                    <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11.5px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
                      <FolderPlus className="size-3.5" />
                      {t("dnd_drop_to_insert")}
                    </span>
                  ) : dropTarget?.mode === "before" ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-1 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
                      <span>↕</span> {t("dnd_reorder_above")}
                    </span>
                  ) : dropTarget?.mode === "after" ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-1 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
                      <span>↕</span> {t("dnd_reorder_below")}
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] font-medium text-faint">
                      {notebooksReorderable ? t("dnd_drag_to_position") : t("dnd_center_move")}
                    </span>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function NotebookRow({
  notebook,
  isDropTarget,
  dropMode,
  isNoteDragging,
}: {
  notebook: Notebook;
  isDropTarget?: boolean;
  dropMode?: DropMode;
  isNoteDragging?: boolean;
}) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { adapter, livePages, notebooks } = useWorkspace();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: encodeId("notebook", notebook.id) });

  const subtreeIds = notebookSubtreeIds(notebooks, notebook.id);
  const nested = childrenOf(notebooks, notebook.id).length;
  const noteCount = livePages.filter(
    (page) => page.notebookId && subtreeIds.includes(page.notebookId)
  ).length;

  const duplicate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const copy = await adapter.duplicateNotebook(notebook.id);
      toast.success(t("notebook_duplicated"));
      router.push(`/home/n/${copy.id}`);
    } catch {
      toast.error(t("could_not_duplicate"));
    }
  };

  const remove = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const name = notebook.name?.trim() || t("notebook_count_singular");
    if (!window.confirm(t("delete_notebook_confirm", { name }))) return;
    await adapter.deleteNotebook(notebook.id);
    toast.success(t("notebook_deleted"));
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-3 transition-all",
        isDragging && "opacity-25",
        isDropTarget && (dropMode === "inside" || isNoteDragging) && "bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent)] z-20 scale-[1.01] shadow-md rounded-[var(--radius-md)]",
        !isDropTarget && "hover:bg-[var(--surface-hover)]"
      )}
    >
      {isDropTarget && !isNoteDragging && dropMode === "before" && (
        <div className="pointer-events-none absolute inset-x-0 -top-1.5 z-30 flex items-center">
          <div className="h-1 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <span className="absolute left-6 -top-3.5 flex items-center gap-1.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-0.5 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
            <span>↕</span> {t("dnd_reorder_above")} “{notebook.name}”
          </span>
        </div>
      )}

      {isDropTarget && !isNoteDragging && dropMode === "after" && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-1.5 z-30 flex items-center">
          <div className="h-1 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <span className="absolute left-6 -bottom-3.5 flex items-center gap-1.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-0.5 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
            <span>↕</span> {t("dnd_reorder_below")} “{notebook.name}”
          </span>
        </div>
      )}

      {isDropTarget && isNoteDragging && (
        <div className="pointer-events-none absolute inset-y-1.5 right-3 z-30 flex items-center">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-xl ring-2 ring-white/30 animate-in fade-in zoom-in-95 duration-100">
            <FolderPlus className="size-4" />
            <span>{t("dnd_move_note_here")}</span>
          </span>
        </div>
      )}

      {isDropTarget && !isNoteDragging && dropMode === "inside" && (
        <div className="pointer-events-none absolute inset-y-1.5 right-3 z-30 flex items-center">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-xl ring-2 ring-white/30 animate-in fade-in zoom-in-95 duration-100">
            <FolderPlus className="size-4" />
            <span>{t("dnd_drop_to_insert")}</span>
          </span>
        </div>
      )}

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${t("dnd_drag_reorder_or_move")}: ${notebook.name}`}
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-faint opacity-40 transition hover:bg-[var(--surface-hover)] hover:text-ink hover:opacity-100 active:cursor-grabbing group-hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4" />
      </button>

      <Link
        href={`/home/n/${notebook.id}`}
        prefetch={true}
        onMouseEnter={() => router.prefetch(`/home/n/${notebook.id}`)}
        className="flex min-w-0 flex-1 self-stretch items-center gap-3 -my-3 py-3"
      >
        <WorkspaceIcon icon={notebook.emoji} fallback="📓" variant="list" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{notebook.name}</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">
            {nested ? `${nested} ${nested === 1 ? t("notebook_count_singular") : t("notebook_count_plural")} · ` : null}
            {noteCount} {noteCount === 1 ? t("note_singular") : t("notes_plural")}
          </span>
        </span>
        <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
          {formatRelative(notebook.updatedAt, language)}
        </span>
      </Link>
      <Tooltip label={t("duplicate_notebook")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("duplicate_notebook")}
          className="shrink-0 text-faint opacity-70 hover:text-ink group-hover:opacity-100"
          onClick={(event) => void duplicate(event)}
        >
          <Copy />
        </Button>
      </Tooltip>
      <Tooltip label={t("delete_notebook")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete_notebook")}
          className="shrink-0 text-faint opacity-70 hover:text-[var(--danger)] group-hover:opacity-100"
          onClick={(event) => void remove(event)}
        >
          <Trash2 />
        </Button>
      </Tooltip>
    </div>
  );
}

function NoteRow({
  page,
  depth = 0,
  hasChildren,
  isExpanded,
  onToggle,
  isDropTarget,
  dropMode,
}: {
  page: Page;
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  isDropTarget?: boolean;
  dropMode?: DropMode;
}) {
  const router = useRouter();
  const locale = useLocale();
  const { t, language } = useTranslation();
  const { adapter, livePages } = useWorkspace();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: encodeId("note", page.id) });

  const subCount = livePages.filter((p) => p.parentPageId === page.id && !p.deletedAt).length;

  const duplicate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const copy = await adapter.duplicatePage(page.id);
      toast.success(t("note_duplicated"));
      useUiStore.getState().closeMenu();
      router.push(`/home/p/${copy.id}`);
    } catch {
      toast.error(t("could_not_duplicate"));
    }
  };

  const remove = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`${t("delete_page")} “${page.title || t("untitled")}”?`)) return;
    await adapter.trashPage(page.id);
    toast.success(t("moved_to_trash"));
  };

  return (
    <div
      ref={setNodeRef}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button") || target.closest("[role='tooltip']")) return;
        if (target.closest("a")) return;
        if (event.metaKey || event.ctrlKey) {
          window.open(localizePath(`/home/p/${page.id}`, locale), "_blank");
        } else {
          useUiStore.getState().closeMenu();
          router.push(`/home/p/${page.id}`);
        }
      }}
      style={{ paddingLeft: `${depth * 22 + 12}px` }}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 pr-3 py-2.5 transition",
        isDropTarget && dropMode === "inside"
          ? "bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent)]"
          : "hover:bg-[var(--surface-hover)]",
        isDragging && "opacity-30"
      )}
    >
      {isDropTarget && dropMode === "before" && (
        <div className="pointer-events-none absolute inset-x-0 -top-0.5 z-30 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
        </div>
      )}

      {isDropTarget && dropMode === "after" && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-0.5 z-30 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
        </div>
      )}

      {isDropTarget && dropMode === "inside" && (
        <div className="pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
          <FilePlus className="size-3.5" />
          <span>{t("create_subnote")}</span>
        </div>
      )}

      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:text-ink transition -mr-1"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-150", isExpanded && "rotate-90")}
          />
        </button>
      ) : depth > 0 ? (
        <span className="w-4 shrink-0" />
      ) : null}

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${t("dnd_drag_reorder")}: ${page.title || t("untitled")}`}
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-faint opacity-40 transition hover:bg-[var(--surface-hover)] hover:text-ink hover:opacity-100 active:cursor-grabbing group-hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4" />
      </button>

      <Link
        href={`/home/p/${page.id}`}
        prefetch={true}
        onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
        onClick={() => useUiStore.getState().closeMenu()}
        className="flex min-w-0 flex-1 self-stretch items-center gap-3 -my-2.5 py-2.5"
      >
        <WorkspaceIcon icon={page.icon} fallback="📄" variant="list" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink flex items-center gap-2">
          <span className="truncate">{page.title || t("untitled")}</span>
          {subCount > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-normal text-muted">
              {subCount} {subCount === 1 ? t("subnote") : t("subnotes_title")}
            </span>
          ) : null}
        </span>
        <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
          {formatRelative(page.updatedAt, language)}
        </span>
      </Link>
      <Tooltip label={t("duplicate_note")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("duplicate_note")}
          className="shrink-0 text-faint opacity-70 hover:text-ink group-hover:opacity-100"
          onClick={(event) => void duplicate(event)}
        >
          <Copy />
        </Button>
      </Tooltip>
      <Tooltip label={t("delete_page")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete_page")}
          className="shrink-0 text-faint opacity-70 hover:text-[var(--danger)] group-hover:opacity-100"
          onClick={(event) => void remove(event)}
        >
          <Trash2 />
        </Button>
      </Tooltip>
    </div>
  );
}
