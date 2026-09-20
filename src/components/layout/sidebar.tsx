"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { WorkspaceIcon, isIconUrl } from "@/lib/icons/workspace-icon";
import { TrashCanIcon } from "@/lib/icons/trash-icon";
import { FlashcardsIcon } from "@/lib/icons/flashcard-icon";
import {
  ChevronRight,
  Copy,
  FilePlus,
  FileStack,
  FolderInput,
  FolderPlus,
  GripVertical,
  Home,
  Import,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, isMac } from "@/lib/utils";
import { useWorkspace, type PageTreeNode } from "@/lib/data/provider";
import { useUiStore } from "@/lib/store/ui-store";
import { SIDEBAR_MARK_SIZE, SynapsysLettering, SynapsysMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Kbd, Tooltip } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/translations";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { UserMenu } from "./user-menu";
import type { Notebook } from "@/types/models";
import { childrenOf, isNestedNotebook, parentIdOf } from "@/lib/data/notebook-tree";
import { resolveNoteCreationTarget, expandContainerInSession } from "@/lib/data/page-tree";
import { MoveItemDialog, type MoveItemTarget } from "./move-dialog";
import {
  ORDER_STEP,
  decodeId,
  encodeId,
  planSidebarDrop,
  type DragId,
  type DragKind,
} from "./sidebar-dnd";

function SidebarItemIcon({
  icon,
  fallback,
  size,
}: {
  icon?: string | null;
  fallback: string;
  size?: number;
}) {
  if (isIconUrl(icon ?? "")) {
    return <WorkspaceIcon icon={icon} fallback={fallback} size={size ?? 18} />;
  }
  return <WorkspaceIcon icon={icon} fallback={fallback} size={size ?? 14} />;
}


const detectCollisions: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : closestCenter(args);
};

const GRIP_CLASS =
  "shrink-0 cursor-grab rounded p-0.5 text-faint hover:text-ink active:cursor-grabbing";

function sortableIds(nodes: PageTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    encodeId("page", node.page.id),
    ...sortableIds(node.children),
  ]);
}

function closeMenuBar() {
  useUiStore.getState().closeMenu();
}

const CHROME_HIT_CLASS = cn(
  "bg-transparent shadow-none outline-none",
  "hover:bg-transparent hover:shadow-none",
  "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
);

export function SidebarRail() {
  const router = useRouter();
  const pathname = usePathname();
  const { adapter, pages, databases } = useWorkspace();
  const { t } = useTranslation();

  const createPage = async () => {
    const target = resolveNoteCreationTarget(pathname, pages, databases);
    const page = await adapter.createPage({
      notebookId: target.notebookId,
      parentPageId: target.parentPageId,
      title: t("untitled"),
    });
    expandContainerInSession(target);
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  return (
    <aside className="flex h-full w-[68px] shrink-0 flex-col items-center px-2 border-r border-[var(--border)] bg-[var(--surface)]">
      <div
        className="flex shrink-0 items-center justify-center pt-8 pb-6"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <Tooltip label={t("expand_sidebar")} shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <button
            type="button"
            onClick={() => useUiStore.getState().toggleSidebar()}
            className={cn("flex select-none items-center justify-center", CHROME_HIT_CLASS)}
            aria-label={t("expand_sidebar")}
          >
            <SynapsysMark size={SIDEBAR_MARK_SIZE} />
          </button>
        </Tooltip>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Tooltip label={t("search")} shortcut={isMac() ? "⌘K" : "Ctrl K"} side="right">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => useUiStore.getState().setPaletteOpen(true)}
            aria-label={t("search")}
          >
            <Search />
          </Button>
        </Tooltip>
        <Tooltip label={t("home")} side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home" aria-label={t("home")}>
              <Home />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip label={t("new_note")} shortcut={isMac() ? "⌥N" : "Alt N"} side="right">
          <Button variant="ghost" size="icon" onClick={() => void createPage()} aria-label={t("new_note")}>
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip label={t("all_notes")} side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home/notes" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home/notes" aria-label={t("all_notes")}>
              <FileStack />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip label={t("flashcards")} side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home/flashcards" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home/flashcards" aria-label={t("flashcards")}>
              <FlashcardsIcon />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip label={t("trash")} side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home/trash" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home/trash" aria-label={t("trash")}>
              <Trash2 />
            </Link>
          </Button>
        </Tooltip>
      </div>
      <div className="mt-auto flex w-full justify-center border-t border-[var(--border)] pt-3 pb-[calc(1.125rem+env(safe-area-inset-bottom,0px))]">
        <UserMenu collapsed />
      </div>
    </aside>
  );
}

const SESSION_OPEN_NOTEBOOKS_KEY = "synapsys.session.openNotebooks";
const SESSION_EXPANDED_PAGES_KEY = "synapsys.session.expandedPages";

function getSessionState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = sessionStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setSessionState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function Sidebar({ collapsed, width }: { collapsed: boolean; width: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { notebooks, livePages, databases, tags, trashedPages, treeFor, adapter, rootNotebooks, flashcards, dueFlashcards } =
    useWorkspace();

  const [openNotebooks, setOpenNotebooks] = useState<Record<string, boolean>>(() =>
    getSessionState<Record<string, boolean>>(SESSION_OPEN_NOTEBOOKS_KEY, {})
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    getSessionState<Record<string, boolean>>(SESSION_EXPANDED_PAGES_KEY, {})
  );
  const [moveItem, setMoveItem] = useState<MoveItemTarget | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [dragging, setDragging] = useState<DragId | null>(null);
  const [sidebarDropIntent, setSidebarDropIntent] = useState<{
    id: string;
    mode: "before" | "after" | "inside";
    targetKind?: DragKind;
  } | null>(null);
  const sidebarDropIntentRef = useRef<{
    id: string;
    mode: "before" | "after" | "inside";
    targetKind?: DragKind;
  } | null>(null);
  const sidebarPointerXRef = useRef<number>(0);
  const sidebarPointerYRef = useRef<number>(0);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      sidebarPointerXRef.current = e.clientX;
      sidebarPointerYRef.current = e.clientY;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useEffect(() => {
    setSessionState(SESSION_OPEN_NOTEBOOKS_KEY, openNotebooks);
  }, [openNotebooks]);

  useEffect(() => {
    setSessionState(SESSION_EXPANDED_PAGES_KEY, expanded);
  }, [expanded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const favorites = useMemo(() => livePages.filter((page) => page.favorite), [livePages]);
  const orphanPages = useMemo(
    () => treeFor(null).filter((node) => !node.page.notebookId),
    [treeFor]
  );

  const contents = useMemo(() => {
    const map = new Map<string, { tree: PageTreeNode[]; databases: typeof databases }>();
    for (const notebook of notebooks) {
      map.set(notebook.id, {
        tree: treeFor(notebook.id),
        databases: databases.filter((db) => db.notebookId === notebook.id && !db.deletedAt),
      });
    }
    return map;
  }, [databases, notebooks, treeFor]);

  const createPage = async (notebookId: string | null) => {
    const page = await adapter.createPage({ notebookId, title: t("untitled") });
    if (notebookId) setOpenNotebooks((prev) => ({ ...prev, [notebookId]: true }));
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  const createNotebook = async (parentId: string | null = null) => {
    const notebook = await adapter.createNotebook({
      name: parentId ? t("new_notebook") : t("new_page"),
      parentId,
    });
    if (parentId) setOpenNotebooks((prev) => ({ ...prev, [parentId]: true }));
    setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: true }));
    toast.success(parentId ? t("notebook_created") : t("page_created"));
    router.push(`/home/n/${notebook.id}`);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      sidebarDropIntentRef.current = null;
      setSidebarDropIntent(null);
      return;
    }

    const activeDecoded = decodeId(active.id);
    const overDecoded = decodeId(over.id);
    if (!activeDecoded || !overDecoded) {
      sidebarDropIntentRef.current = null;
      setSidebarDropIntent(null);
      return;
    }

    const overRect = over.rect;
    if (!overRect) return;

    const cursorX =
      sidebarPointerXRef.current ||
      (active.rect.current.translated
        ? active.rect.current.translated.left + active.rect.current.translated.width / 2
        : overRect.left + overRect.width / 2);
    const cursorY =
      sidebarPointerYRef.current ||
      (active.rect.current.translated
        ? active.rect.current.translated.top + active.rect.current.translated.height / 2
        : overRect.top + overRect.height / 2);

    const relativeX = overRect.width > 0 ? (cursorX - overRect.left) / overRect.width : 0.5;
    const relativeY = overRect.height > 0 ? (cursorY - overRect.top) / overRect.height : 0.5;

    let mode: "before" | "after" | "inside" = "inside";

    if (activeDecoded.kind === "page") {
      if (overDecoded.kind === "notebook") {
        mode = "inside";
      } else {
        if (relativeY < 0.28) {
          mode = "before";
        } else if (relativeY > 0.72) {
          mode = "after";
        } else if (relativeX > 0.38) {
          mode = "inside";
        } else {
          mode = relativeY < 0.5 ? "before" : "after";
        }
      }
    } else {
      const draggedNotebook = notebooks.find((n) => n.id === activeDecoded.id);
      const isDraggedRoot = draggedNotebook && !draggedNotebook.parentId;

      if (overDecoded.kind === "notebook") {
        const overNotebook = notebooks.find((n) => n.id === overDecoded.id);
        const isOverRoot = overNotebook && !overNotebook.parentId;

        if (isDraggedRoot) {
          if (!isOverRoot) {
            sidebarDropIntentRef.current = null;
            setSidebarDropIntent(null);
            return;
          }
          mode = relativeY < 0.5 ? "before" : "after";
        } else {
          if (relativeX < 0.55) {
            mode = relativeY < 0.5 ? "before" : "after";
          } else {
            if (relativeY < 0.2) {
              mode = "before";
            } else if (relativeY > 0.8) {
              mode = "after";
            } else {
              mode = "inside";
            }
          }
        }
      } else {
        if (isDraggedRoot) {
          sidebarDropIntentRef.current = null;
          setSidebarDropIntent(null);
          return;
        }
        mode = relativeY < 0.5 ? "before" : "after";
      }
    }

    const intent = { id: overDecoded.id, mode, targetKind: overDecoded.kind };
    sidebarDropIntentRef.current = intent;
    setSidebarDropIntent(intent);
  };

  const onDragCancel = () => {
    sidebarDropIntentRef.current = null;
    setDragging(null);
    setSidebarDropIntent(null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const currentIntent = (sidebarDropIntentRef.current ?? sidebarDropIntent)?.mode;
    sidebarDropIntentRef.current = null;
    setDragging(null);
    setSidebarDropIntent(null);

    const plan = planSidebarDrop(
      event.active.id,
      event.over?.id,
      {
        notebooks,
        pages: livePages,
      },
      currentIntent
    );
    if (!plan) return;

    try {
      if (plan.kind === "reorder-notebooks") {
        await adapter.applyNotebookOrders(
          plan.notebookIds.map((id, index) => ({ id, order: index * ORDER_STEP }))
        );
        toast.success(t("notebook_order_updated"));
        return;
      }

      if (plan.kind === "move-notebook") {
        await adapter.moveNotebook(plan.notebookId, { parentId: plan.parentId });
        await adapter.applyNotebookOrders(
          plan.notebookIds.map((id, index) => ({ id, order: index * ORDER_STEP }))
        );
        if (plan.parentId) {
          setOpenNotebooks((prev) => ({ ...prev, [plan.parentId!]: true }));
        }
        toast.success(plan.parentId ? t("notebook_moved_inside") : t("notebook_moved"));
        return;
      }

      if (plan.kind === "move-page") {
        await adapter.movePage(plan.pageId, {
          notebookId: plan.notebookId,
          parentPageId: plan.parentPageId,
        });
        if (plan.notebookId) {
          setOpenNotebooks((prev) => ({ ...prev, [plan.notebookId!]: true }));
        }
        if (plan.parentPageId) {
          setExpanded((prev) => ({ ...prev, [plan.parentPageId!]: true }));
        }
        toast.success(plan.parentPageId ? t("note_moved_as_subnote") : t("note_moved_to_notebook"));
      }

      await adapter.applyPageOrders(
        plan.pageIds.map((id, index) => ({ id, order: index * ORDER_STEP }))
      );

      if (plan.kind === "reorder-pages") {
        toast.success(t("notes_order_updated"));
      }
    } catch {
      toast.error(t("notes_order_failed"));
    }
  };

  if (collapsed) {
    return <SidebarRail />;
  }

  const renderNotebooks = (branch: Notebook[], depth: number) => (
    <SortableContext
      items={branch.map((notebook) => encodeId("notebook", notebook.id))}
      strategy={verticalListSortingStrategy}
    >
      {branch.map((notebook) => {
        const { tree, databases: notebookDatabases } =
          contents.get(notebook.id) ?? { tree: [], databases: [] };
        const nested = childrenOf(notebooks, notebook.id);
        const open = openNotebooks[notebook.id] ?? false;
        const active = pathname === `/home/n/${notebook.id}`;
        const empty = !tree.length && !notebookDatabases.length && !nested.length;

        return (
          <NotebookRow
            key={notebook.id}
            notebook={notebook}
            open={open}
            active={active}
            depth={depth}
            count={tree.length + notebookDatabases.length + nested.length}
            dropIntent={sidebarDropIntent?.id === notebook.id ? sidebarDropIntent.mode : undefined}
            draggingKind={dragging?.kind}
            onToggle={() =>
              setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: !open }))
            }
            onCreatePage={() => createPage(notebook.id)}
            onCreateSubnotebook={() => void createNotebook(notebook.id)}
            onMove={() => {
              setMoveItem({ kind: "notebook", id: notebook.id, title: notebook.name });
              setMoveDialogOpen(true);
            }}
            onDuplicate={async () => {
              try {
                const copy = await adapter.duplicateNotebook(notebook.id);
                setOpenNotebooks((prev) => ({ ...prev, [copy.id]: true }));
                toast.success(
                  isNestedNotebook(notebook) ? t("notebook_duplicated") : t("page_duplicated")
                );
                router.push(`/home/n/${copy.id}`);
              } catch {
                toast.error(t("could_not_duplicate"));
              }
            }}
            onRename={(name) => adapter.updateNotebook(notebook.id, { name })}
            onDelete={async () => {
              const name = notebook.name?.trim() || (isNestedNotebook(notebook) ? t("notebook_count_singular") : t("new_page"));
              if (!window.confirm(t("delete_notebook_confirm", { name }))) return;
              await adapter.deleteNotebook(notebook.id);
              toast.success(isNestedNotebook(notebook) ? t("notebook_deleted") : t("page_deleted"));
              if (active) {
                const parent = parentIdOf(notebook);
                router.push(parent ? `/home/n/${parent}` : "/home");
              }
            }}
          >
            {open ? (
              <>
                {nested.length ? renderNotebooks(nested, depth + 1) : null}
                <SortableContext
                  items={sortableIds(tree)}
                  strategy={verticalListSortingStrategy}
                >
                  {renderTree(tree)}
                  {notebookDatabases.map((database) => (
                    <Link
                      key={database.id}
                      href={`/home/db/${database.id}`}
                      prefetch={true}
                      onMouseEnter={() => router.prefetch(`/home/db/${database.id}`)}
                      draggable={false}
                      className={cn(
                        "flex items-center gap-1.5 rounded-[var(--radius-xs)] py-1 pr-2 text-[13.5px] transition hover:bg-[var(--surface-hover)]",
                        depth > 0 ? "pl-7" : "pl-5",
                        pathname === `/home/db/${database.id}`
                          ? "font-medium text-ink"
                          : "text-muted hover:text-ink"
                      )}
                    >
                      <span className="truncate">{database.name}</span>
                    </Link>
                  ))}
                  {empty ? (
                    <p className="px-6 py-1 text-[11.5px] text-faint">
                      {t("empty_drag_notes")}
                    </p>
                  ) : null}
                </SortableContext>
              </>
            ) : null}
          </NotebookRow>
        );
      })}
    </SortableContext>
  );

  const renderTree = (nodes: PageTreeNode[]) =>
    nodes.map((node) => {
      const isOpen = expanded[node.page.id] ?? false;
      const active = pathname === `/home/p/${node.page.id}`;
      return (
        <div key={node.page.id}>
          <SortablePageRow
            node={node}
            active={active}
            isOpen={isOpen}
            dropIntent={sidebarDropIntent?.id === node.page.id ? sidebarDropIntent.mode : undefined}
            onToggle={() => setExpanded((prev) => ({ ...prev, [node.page.id]: !isOpen }))}
            onMove={() => {
              setMoveItem({
                kind: "page",
                id: node.page.id,
                title: node.page.title || t("untitled"),
              });
              setMoveDialogOpen(true);
            }}
            onCreateChild={async () => {
              const child = await adapter.createPage({
                parentPageId: node.page.id,
                notebookId: node.page.notebookId,
                title: t("untitled"),
              });
              setExpanded((prev) => ({ ...prev, [node.page.id]: true }));
              useUiStore.getState().closeMenu();
              router.push(`/home/p/${child.id}`);
            }}
            onToggleFavorite={() =>
              adapter.updatePage(node.page.id, { favorite: !node.page.favorite })
            }
            onDuplicate={async () => {
              try {
                const copy = await adapter.duplicatePage(node.page.id);
                toast.success(t("note_duplicated"));
                useUiStore.getState().closeMenu();
                router.push(`/home/p/${copy.id}`);
              } catch {
                toast.error(t("could_not_duplicate"));
              }
            }}
            onTrash={async () => {
              await adapter.trashPage(node.page.id);
              toast.success(t("moved_to_trash"), {
                action: { label: t("undo_action"), onClick: () => adapter.restorePage(node.page.id) },
              });
              if (active) router.push("/home");
            }}
          />
          <AnimatePresence initial={false}>
            {isOpen && node.children.length ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {renderTree(node.children)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      );
    });

  const draggedLabel =
    dragging?.kind === "notebook"
      ? notebooks.find((notebook) => notebook.id === dragging.id)?.name
      : livePages.find((page) => page.id === dragging?.id)?.title;

  const draggedIcon =
    dragging?.kind === "notebook"
      ? notebooks.find((notebook) => notebook.id === dragging.id)?.emoji
      : livePages.find((page) => page.id === dragging?.id)?.icon;

  return (
    <aside
      data-sidebar
      className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
      style={{ width }}
    >
      <div
        className="relative flex items-center pr-3 pt-8 pb-6"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <Tooltip label={t("collapse_sidebar")} shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <button
            type="button"
            onClick={() => useUiStore.getState().collapseSidebar()}
            aria-label={t("collapse_sidebar")}
            className={cn("relative flex w-full select-none items-center", CHROME_HIT_CLASS)}
          >
            <span className="flex w-[68px] shrink-0 items-center justify-center">
              <SynapsysMark size={SIDEBAR_MARK_SIZE} />
            </span>
            <span className="pointer-events-none absolute inset-y-0 left-[68px] right-8 flex select-none items-center justify-center">
              <SynapsysLettering />
            </span>
            <PanelLeftClose className="ml-auto size-4 shrink-0 text-ink" strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>

      <div className="space-y-0.5 px-2">
        <button
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Search className="size-3.5" />
          {t("search")}
          <Kbd className="ml-auto">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <NavLink href="/home" active={pathname === "/home"} icon={<Home className="size-3.5" />}>
          {t("home")}
        </NavLink>
        <NavLink
          href="/home/notes"
          active={pathname === "/home/notes"}
          icon={<FileStack className="size-3.5" />}
        >
          {t("all_notes")}
          <span className="ml-auto text-[10.5px] text-faint">{livePages.length}</span>
        </NavLink>
        <NavLink
          href="/home/flashcards"
          active={pathname === "/home/flashcards"}
          icon={<FlashcardsIcon className="size-3.5" />}
        >
          {t("flashcards")}
          {dueFlashcards.length ? (
            <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {dueFlashcards.length}
            </span>
          ) : flashcards.length ? (
            <span className="ml-auto text-[10.5px] text-faint">{flashcards.length}</span>
          ) : null}
        </NavLink>
        <NavLink href="/home/trash" active={pathname === "/home/trash"} icon={<TrashCanIcon className="size-3.5" />}>
          {t("trash")}
          {trashedPages.length ? (
            <span className="ml-auto text-[10.5px] text-faint">{trashedPages.length}</span>
          ) : null}
        </NavLink>
        <button
          onPointerDown={(e) => {
            if (e.button === 0) {
              if (useUiStore.getState().mobileSidebarOpen) {
                useUiStore.setState({ mobileSidebarOpen: false, importOpen: true });
              } else {
                useUiStore.getState().setImportOpen(true);
              }
            }
          }}
          onClick={(e) => {
            e.preventDefault();
            if (useUiStore.getState().mobileSidebarOpen) {
              useUiStore.setState({ mobileSidebarOpen: false, importOpen: true });
            } else {
              useUiStore.getState().setImportOpen(true);
            }
          }}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Import className="size-3.5" />
          {t("import_notion")}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={detectCollisions}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(event: DragStartEvent) => {
          setDragging(decodeId(event.active.id));
          setSidebarDropIntent(null);
        }}
        onDragMove={onDragMove}
        onDragCancel={onDragCancel}
        onDragEnd={(event) => void onDragEnd(event)}
      >
        <div className="mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          {favorites.length ? (
            <Section
              title={t("favorites")}
              action={
                <Tooltip label={t("view_all_favorites")}>
                  <Link
                    href="/home/notes?favorites=1"
                    className="rounded p-0.5 text-faint transition hover:text-ink"
                    aria-label={t("view_all_favorites")}
                  >
                    <FileStack className="size-3.5" />
                  </Link>
                </Tooltip>
              }
            >
              {favorites.map((page) => (
                <Link
                  key={page.id}
                  href={`/home/p/${page.id}`}
                  prefetch={true}
                  onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
                  onClick={closeMenuBar}
                  className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1 text-[13.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                >
                  <SidebarItemIcon icon={page.icon} fallback="⭐" />
                  <span className="truncate">{page.title || t("untitled")}</span>
                </Link>
              ))}
            </Section>
          ) : null}

          <Section
            title={t("pages")}
            action={
              <Tooltip label={t("new_page")} shortcut={isMac() ? "⌥⇧N" : "Alt ⇧ N"}>
                <button
                  onClick={() => void createNotebook(null)}
                  className="rounded p-0.5 text-faint transition hover:text-ink"
                  aria-label={t("new_page")}
                >
                  <FolderPlus className="size-3.5" />
                </button>
              </Tooltip>
            }
          >
            {renderNotebooks(rootNotebooks, 0)}
          </Section>

          {orphanPages.length ? (
            <Section title={t("unfiled")}>
              <SortableContext
                items={sortableIds(orphanPages)}
                strategy={verticalListSortingStrategy}
              >
                {renderTree(orphanPages)}
              </SortableContext>
            </Section>
          ) : null}

          {tags.length ? (
            <Section title={t("tags")}>
              <div className="flex flex-wrap gap-1 px-1.5 pt-1">
                {tags.slice(0, 14).map((tag) => (
                  <Link
                    key={tag.name}
                    href={`/home/tag/${encodeURIComponent(tag.name)}`}
                    prefetch={true}
                    onMouseEnter={() => router.prefetch(`/home/tag/${encodeURIComponent(tag.name)}`)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted transition hover:border-[var(--accent)] hover:text-ink"
                  >
                    {tag.name}
                    <span className="text-faint">{tag.count}</span>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="flex items-center gap-2 rounded-[var(--radius-xs)] border-2 border-[var(--accent)] bg-[var(--surface)] px-2.5 py-1.5 shadow-[var(--shadow-float)] ring-2 ring-[var(--accent)]/20">
              <SidebarItemIcon
                icon={draggedIcon}
                fallback={dragging.kind === "notebook" ? "📓" : "📄"}
                size={16}
              />
              <span className="max-w-[130px] truncate text-[13px] font-semibold text-ink">
                {draggedLabel || t("untitled")}
              </span>
              {sidebarDropIntent?.mode === "inside" ? (
                <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm animate-in fade-in zoom-in-95 duration-100">
                  {sidebarDropIntent?.targetKind === "page" ? (
                    <>
                      <FilePlus className="size-3.5" />
                      {t("create_subnote")}
                    </>
                  ) : (
                    <>
                      <FolderPlus className="size-3.5" />
                      {dragging.kind === "notebook"
                        ? t("move_inside")
                        : t("move_to_notebook")}
                    </>
                  )}
                </span>
              ) : sidebarDropIntent?.mode === "before" ? (
                <span className="ml-auto rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2.5 py-1 text-[11px] font-bold shadow-sm animate-in fade-in duration-100">
                  <span>↕</span> {t("dnd_reorder_above")}
                </span>
              ) : sidebarDropIntent?.mode === "after" ? (
                <span className="ml-auto rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2.5 py-1 text-[11px] font-bold shadow-sm animate-in fade-in duration-100">
                  <span>↕</span> {t("dnd_reorder_below")}
                </span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="border-t border-[var(--border)] px-2.5 pt-3 pb-[calc(1.125rem+env(safe-area-inset-bottom,0px))]">
        <UserMenu />
      </div>

      <MoveItemDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        item={moveItem}
      />
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      prefetch={true}
      onMouseEnter={() => router.prefetch(href)}
      className={cn(
        "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] transition hover:bg-[var(--surface-hover)]",
        active ? "font-medium text-ink" : "text-muted hover:text-ink"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function NotebookRow({
  notebook,
  open,
  active,
  depth,
  count,
  onToggle,
  onCreatePage,
  onCreateSubnotebook,
  onMove,
  onDuplicate,
  onRename,
  onDelete,
  dropIntent,
  draggingKind,
  children,
}: {
  notebook: Notebook;
  open: boolean;
  active: boolean;
  depth: number;
  count: number;
  dropIntent?: "before" | "after" | "inside";
  draggingKind?: DragKind | null;
  onToggle: () => void;
  onCreatePage: () => void;
  onCreateSubnotebook: () => void;
  onMove?: () => void;
  onDuplicate: () => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: encodeId("notebook", notebook.id) });
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(notebook.name);

  return (
    <div
      ref={setNodeRef}
      style={{
        paddingLeft: depth ? `${depth * 12}px` : undefined,
      }}
      className={cn(isDragging && "opacity-40")}
    >
      <div
        className={cn(
          "group relative flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 transition-all",
          dropIntent === "inside"
            ? "bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent)] z-20 shadow-sm"
            : active
              ? "bg-[var(--accent-soft)]"
              : "hover:bg-[var(--surface-hover)]"
        )}
      >
        {dropIntent === "before" && (
          <div className="pointer-events-none absolute inset-x-0 -top-1 z-30 flex items-center">
            <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <span className="absolute left-2 -top-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
              ↕ {t("dnd_reorder_above")}
            </span>
          </div>
        )}
        {dropIntent === "after" && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-1 z-30 flex items-center">
            <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <span className="absolute left-2 -bottom-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
              ↕ {t("dnd_reorder_below")}
            </span>
          </div>
        )}
        {dropIntent === "inside" && (
          <div className="pointer-events-none absolute right-1.5 top-1/2 z-30 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
            <FolderPlus className="size-3.5" />
            <span>{draggingKind === "page" ? t("move_to_notebook") : t("move_inside")}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="flex size-4 shrink-0 items-center justify-center rounded text-faint transition hover:text-ink"
          aria-label={open ? "Recolher caderno" : "Expandir caderno"}
        >
          <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        </button>
        <Link
          href={`/home/n/${notebook.id}`}
          prefetch={true}
          onMouseEnter={() => router.prefetch(`/home/n/${notebook.id}`)}
          draggable={false}
          onClick={closeMenuBar}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[13.5px]",
            active ? "font-medium text-ink" : "text-muted group-hover:text-ink"
          )}
        >
          <SidebarItemIcon
            icon={notebook.emoji}
            fallback={isNestedNotebook(notebook) ? "📁" : "📓"}
          />
          {renaming ? (
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  await onRename(draft.trim() || notebook.name);
                  setRenaming(false);
                } else if (e.key === "Escape") {
                  setDraft(notebook.name);
                  setRenaming(false);
                }
              }}
              onBlur={async () => {
                await onRename(draft.trim() || notebook.name);
                setRenaming(false);
              }}
              className="h-6 w-full rounded bg-[var(--surface-2)] px-1 text-[13.5px] text-ink outline-none ring-1 ring-[var(--accent)]"
            />
          ) : (
            <span className="truncate">{notebook.name}</span>
          )}
        </Link>
        <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{count}</span>
        <div
          className={cn(
            "grid transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            menuOpen ? "grid-cols-[1fr]" : "grid-cols-[0fr] group-hover:grid-cols-[1fr]"
          )}
        >
          <div className="flex min-w-0 items-center overflow-hidden">
        <Tooltip label={t("new_notebook")}>
          <button
            onClick={onCreateSubnotebook}
            className="rounded p-0.5 text-faint hover:text-ink"
            aria-label={t("new_notebook")}
          >
            <FolderPlus className="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip label={t("new_note")}>
          <button
            onClick={onCreatePage}
            className="rounded p-0.5 text-faint hover:text-ink"
            aria-label={t("new_note")}
          >
            <Plus className="size-3.5" />
          </button>
        </Tooltip>
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger asChild>
            <button
              className="rounded p-0.5 text-faint hover:text-ink"
              aria-label={`Ações de ${notebook.name}`}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuItem onSelect={() => router.push(`/home/n/${notebook.id}`)}>
              <FolderPlus /> {isNestedNotebook(notebook) ? t("open_notebook") : t("open_page")}
            </MenuItem>
            <MenuItem onSelect={() => router.push(`/home/notes?notebook=${notebook.id}`)}>
              <FileStack /> {t("all_notes")}
            </MenuItem>
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil className="size-4" /> {t("rename")}
            </MenuItem>
            {isNestedNotebook(notebook) && onMove ? (
              <MenuItem onSelect={onMove}>
                <FolderInput className="size-4" /> {t("move_to")}
              </MenuItem>
            ) : null}
            <MenuItem onSelect={onCreateSubnotebook}>
              <FolderPlus /> {t("new_notebook")}
            </MenuItem>
            <MenuItem onSelect={onCreatePage}>
              <Plus /> {t("new_note")}
            </MenuItem>
            <MenuItem onSelect={() => void onDuplicate()}>
              <Copy /> {isNestedNotebook(notebook) ? t("duplicate_notebook") : t("duplicate_page")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => void onDelete()}>
              <Trash2 /> {isNestedNotebook(notebook) ? t("delete_notebook") : t("delete_page")}
            </MenuItem>
          </MenuContent>
        </Menu>
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className={GRIP_CLASS}
              aria-label={`${t("reorder")}: ${notebook.name}`}
            >
              <GripVertical className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SortablePageRow({
  node,
  active,
  isOpen,
  dropIntent,
  onToggle,
  onMove,
  onCreateChild,
  onToggleFavorite,
  onDuplicate,
  onTrash,
}: {
  node: PageTreeNode;
  active: boolean;
  isOpen: boolean;
  dropIntent?: "before" | "after" | "inside";
  onToggle: () => void;
  onMove?: () => void;
  onCreateChild: () => Promise<void>;
  onToggleFavorite: () => void;
  onDuplicate: () => Promise<void>;
  onTrash: () => Promise<void>;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: encodeId("page", node.page.id),
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        paddingLeft: `${node.depth * 12}px`,
      }}
      className={cn("relative", isDragging && "opacity-40")}
    >
      {dropIntent === "before" && (
        <div className="pointer-events-none absolute inset-x-0 -top-1 z-30 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
          <span className="absolute left-2 -top-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
            ↕ {t("dnd_reorder_above")}
          </span>
        </div>
      )}
      {dropIntent === "after" && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 z-30 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
          <span className="absolute left-2 -bottom-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
            ↕ {t("dnd_reorder_below")}
          </span>
        </div>
      )}
      <div
        className={cn(
          "group flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 transition-colors",
          dropIntent === "inside"
            ? "bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent)] z-20 shadow-sm"
            : active
              ? "bg-[var(--accent-soft)]"
              : "hover:bg-[var(--surface-hover)]"
        )}
      >
      {dropIntent === "inside" && (
        <div className="pointer-events-none absolute right-1.5 top-1/2 z-30 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
          <FilePlus className="size-3.5" />
          <span>{t("create_subnote")}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded text-faint transition hover:text-ink",
          !node.children.length && "invisible"
        )}
        aria-label={isOpen ? "Recolher" : "Expandir"}
      >
        <ChevronRight className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
      </button>
      <Link
        href={`/home/p/${node.page.id}`}
        prefetch={true}
        onMouseEnter={() => router.prefetch(`/home/p/${node.page.id}`)}
        draggable={false}
        onClick={closeMenuBar}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[13.5px]",
          active ? "font-medium text-ink" : "text-muted group-hover:text-ink"
        )}
      >
        <SidebarItemIcon icon={node.page.icon} fallback="📄" />
        <span className="truncate">{node.page.title || t("untitled")}</span>
      </Link>
      <div
        className={cn(
          "grid transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          menuOpen ? "grid-cols-[1fr]" : "grid-cols-[0fr] group-hover:grid-cols-[1fr]"
        )}
      >
        <div className="flex min-w-0 items-center overflow-hidden">
          <Tooltip label={t("new_subpage")}>
            <button
              type="button"
              onClick={() => void onCreateChild()}
              className="rounded p-0.5 text-faint hover:text-ink"
              aria-label={t("new_subpage")}
            >
              <Plus className="size-3.5" />
            </button>
          </Tooltip>
          <Menu open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuTrigger asChild>
              <button
                type="button"
                className="rounded p-0.5 text-faint hover:text-ink"
                aria-label="Ações da página"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={() => void onCreateChild()}>
                <Plus /> {t("new_subpage")}
              </MenuItem>
              {onMove ? (
                <MenuItem onSelect={onMove}>
                  <FolderInput className="size-4" /> {t("move_to")}
                </MenuItem>
              ) : null}
              <MenuItem onSelect={onToggleFavorite}>
                <Star /> {node.page.favorite ? t("unfavorite") : t("favorite")}
              </MenuItem>
              <MenuItem onSelect={() => void onDuplicate()}>
                <Copy /> {t("duplicate_note")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => void onTrash()}>
                <Trash2 /> {t("delete_page")}
              </MenuItem>
            </MenuContent>
          </Menu>
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className={GRIP_CLASS}
            aria-label={`Reordenar ${node.page.title || "página"}`}
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">{title}</p>
        {action}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}
