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
import {
  ChevronRight,
  Copy,
  FilePlus,
  FileStack,
  FolderPlus,
  GripVertical,
  Home,
  Import,
  MoreHorizontal,
  PanelLeftClose,
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
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { UserMenu } from "./user-menu";
import type { Notebook } from "@/types/models";
import { childrenOf, parentIdOf } from "@/lib/data/notebook-tree";
import {
  NOTEBOOK_COPY,
  duplicateNotebookLabel,
  collapseNotebookLabel,
  deleteNotebookConfirm,
  deleteNotebookLabel,
  isNestedNotebook,
  openNotebookLabel,
} from "@/lib/data/notebook-copy";
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
  const { adapter } = useWorkspace();

  const createPage = async () => {
    const page = await adapter.createPage({ notebookId: null, title: "Sem título" });
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--surface)]">
      <div
        className="flex shrink-0 items-center justify-center pt-8 pb-6"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <Tooltip label="Expandir barra lateral" shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <button
            type="button"
            onClick={() => useUiStore.getState().toggleSidebar()}
            className={cn("flex select-none items-center justify-center", CHROME_HIT_CLASS)}
            aria-label="Expandir barra lateral"
          >
            <SynapsysMark size={SIDEBAR_MARK_SIZE} />
          </button>
        </Tooltip>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Tooltip label="Buscar" shortcut={isMac() ? "⌘K" : "Ctrl K"} side="right">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => useUiStore.getState().setPaletteOpen(true)}
            aria-label="Buscar"
          >
            <Search />
          </Button>
        </Tooltip>
        <Tooltip label="Início" side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home" aria-label="Início">
              <Home />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip label="Nova nota" shortcut={isMac() ? "⌘N" : "Ctrl N"} side="right">
          <Button variant="ghost" size="icon" onClick={() => void createPage()} aria-label="Nova nota">
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip label="Todas as notas" side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home/notes" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home/notes" aria-label="Todas as notas">
              <FileStack />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip label="Lixeira" side="right">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={cn(pathname === "/home/trash" && "bg-[var(--surface-active)] text-ink")}
          >
            <Link href="/home/trash" aria-label="Lixeira">
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
  const router = useRouter();
  const pathname = usePathname();
  const { notebooks, livePages, databases, tags, trashedPages, treeFor, adapter, rootNotebooks } =
    useWorkspace();

  const [openNotebooks, setOpenNotebooks] = useState<Record<string, boolean>>(() =>
    getSessionState<Record<string, boolean>>(SESSION_OPEN_NOTEBOOKS_KEY, {})
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    getSessionState<Record<string, boolean>>(SESSION_EXPANDED_PAGES_KEY, {})
  );
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
    const page = await adapter.createPage({ notebookId, title: "Sem título" });
    if (notebookId) setOpenNotebooks((prev) => ({ ...prev, [notebookId]: true }));
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  const createNotebook = async (parentId: string | null = null) => {
    const notebook = await adapter.createNotebook({
      name: parentId ? NOTEBOOK_COPY.newChildName : NOTEBOOK_COPY.newRootName,
      parentId,
    });
    if (parentId) setOpenNotebooks((prev) => ({ ...prev, [parentId]: true }));
    setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: true }));
    toast.success(parentId ? NOTEBOOK_COPY.createdChild : NOTEBOOK_COPY.createdRoot);
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
        mode = relativeY < 0.5 ? "before" : "after";
      }
    } else {
      if (overDecoded.kind === "notebook") {
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
      } else {
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
      currentIntent === "inside" ? "inside" : currentIntent ? "reorder" : undefined
    );
    if (!plan) return;

    try {
      if (plan.kind === "reorder-notebooks") {
        await adapter.applyNotebookOrders(
          plan.notebookIds.map((id, index) => ({ id, order: index * ORDER_STEP }))
        );
        toast.success("Ordem dos cadernos atualizada");
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
        toast.success(plan.parentId ? "Caderno inserido dentro do caderno" : "Caderno movido");
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
        toast.success(
          plan.parentPageId
            ? "Nota inserida como subpágina"
            : "Nota movida para o caderno"
        );
      }

      await adapter.applyPageOrders(
        plan.pageIds.map((id, index) => ({ id, order: index * ORDER_STEP }))
      );

      if (plan.kind === "reorder-pages") {
        toast.success("Ordem das notas atualizada");
      }
    } catch {
      toast.error("Não foi possível reordenar. Tente novamente.");
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
            onDuplicate={async () => {
              try {
                const copy = await adapter.duplicateNotebook(notebook.id);
                setOpenNotebooks((prev) => ({ ...prev, [copy.id]: true }));
                toast.success(
                  isNestedNotebook(notebook) ? NOTEBOOK_COPY.duplicatedChild : NOTEBOOK_COPY.duplicatedRoot
                );
                router.push(`/home/n/${copy.id}`);
              } catch {
                toast.error("Não foi possível duplicar.");
              }
            }}
            onRename={(name) => adapter.updateNotebook(notebook.id, { name })}
            onDelete={async () => {
              if (!window.confirm(deleteNotebookConfirm(notebook))) return;
              await adapter.deleteNotebook(notebook.id);
              toast.success(isNestedNotebook(notebook) ? NOTEBOOK_COPY.removedChild : NOTEBOOK_COPY.removedRoot);
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
                      Vazio - arraste notas para cá
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
            onCreateChild={async () => {
              const child = await adapter.createPage({
                parentPageId: node.page.id,
                notebookId: node.page.notebookId,
                title: "Sem título",
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
                toast.success("Nota duplicada");
                useUiStore.getState().closeMenu();
                router.push(`/home/p/${copy.id}`);
              } catch {
                toast.error("Não foi possível duplicar a nota.");
              }
            }}
            onTrash={async () => {
              await adapter.trashPage(node.page.id);
              toast.success("Movida para a lixeira", {
                action: { label: "Desfazer", onClick: () => adapter.restorePage(node.page.id) },
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
        className="relative flex items-center px-4 pt-8 pb-6"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <Tooltip label="Recolher barra lateral" shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <button
            type="button"
            onClick={() => useUiStore.getState().collapseSidebar()}
            aria-label="Recolher barra lateral"
            className={cn("relative flex w-full select-none items-center pl-1 pr-0.5", CHROME_HIT_CLASS)}
          >
            <SynapsysMark size={SIDEBAR_MARK_SIZE} />
            <span className="pointer-events-none absolute inset-y-0 left-14 right-7 flex select-none items-center justify-center">
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
          Buscar
          <Kbd className="ml-auto">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <NavLink href="/home" active={pathname === "/home"} icon={<Home className="size-3.5" />}>
          Início
        </NavLink>
        <NavLink
          href="/home/notes"
          active={pathname === "/home/notes"}
          icon={<FileStack className="size-3.5" />}
        >
          Todas as notas
          <span className="ml-auto text-[10.5px] text-faint">{livePages.length}</span>
        </NavLink>
        <NavLink href="/home/trash" active={pathname === "/home/trash"} icon={<Trash2 className="size-3.5" />}>
          Lixeira
          {trashedPages.length ? (
            <span className="ml-auto text-[10.5px] text-faint">{trashedPages.length}</span>
          ) : null}
        </NavLink>
        <button
          onClick={() => {
            useUiStore.getState().setMobileSidebarOpen(false);
            useUiStore.getState().setImportOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Import className="size-3.5" />
          Importar do Notion
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
              title="Favoritos"
              action={
                <Tooltip label="Ver todos os favoritos">
                  <Link
                    href="/home/notes?favorites=1"
                    className="rounded p-0.5 text-faint transition hover:text-ink"
                    aria-label="Ver todos os favoritos"
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
                  <span className="truncate">{page.title || "Sem título"}</span>
                </Link>
              ))}
            </Section>
          ) : null}

          <Section
            title={NOTEBOOK_COPY.sectionRoots}
            action={
              <Tooltip label={NOTEBOOK_COPY.newRootName} shortcut={isMac() ? "⌘⇧N" : "Ctrl ⇧ N"}>
                <button
                  onClick={() => void createNotebook(null)}
                  className="rounded p-0.5 text-faint transition hover:text-ink"
                  aria-label={NOTEBOOK_COPY.newRootName}
                >
                  <FolderPlus className="size-3.5" />
                </button>
              </Tooltip>
            }
          >
            {renderNotebooks(rootNotebooks, 0)}
          </Section>

          {orphanPages.length ? (
            <Section title={NOTEBOOK_COPY.unfiled}>
              <SortableContext
                items={sortableIds(orphanPages)}
                strategy={verticalListSortingStrategy}
              >
                {renderTree(orphanPages)}
              </SortableContext>
            </Section>
          ) : null}

          {tags.length ? (
            <Section title="Tags">
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
                {draggedLabel || "Sem título"}
              </span>
              {sidebarDropIntent?.mode === "inside" && (dragging.kind === "notebook" || sidebarDropIntent?.targetKind === "notebook") ? (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm animate-in fade-in zoom-in-95 duration-100">
                  <FolderPlus className="size-3" />
                  {dragging.kind === "notebook"
                    ? "Inserir dentro"
                    : "Mover para o caderno"}
                </span>
              ) : sidebarDropIntent?.mode === "before" ? (
                <span className="ml-auto rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[10px] font-bold shadow-sm animate-in fade-in duration-100">
                  ↕ Acima
                </span>
              ) : sidebarDropIntent?.mode === "after" ? (
                <span className="ml-auto rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[10px] font-bold shadow-sm animate-in fade-in duration-100">
                  ↕ Abaixo
                </span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="border-t border-[var(--border)] px-2.5 pt-3 pb-[calc(1.125rem+env(safe-area-inset-bottom,0px))]">
        <UserMenu />
      </div>
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
  onDuplicate: () => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: encodeId("notebook", notebook.id) });
  const [renaming, setRenaming] = useState(false);
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
              ↕ Acima
            </span>
          </div>
        )}
        {dropIntent === "after" && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-1 z-30 flex items-center">
            <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <span className="absolute left-2 -bottom-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
              ↕ Abaixo
            </span>
          </div>
        )}
        {dropIntent === "inside" && (
          <div className="pointer-events-none absolute right-1.5 top-1/2 z-30 -translate-y-1/2 flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10.5px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
            <FolderPlus className="size-3" />
            <span>{draggingKind === "page" ? "Mover nota para cá" : "Inserir dentro"}</span>
          </div>
        )}
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={async () => {
              setRenaming(false);
              if (draft.trim() && draft.trim() !== notebook.name) await onRename(draft.trim());
              else setDraft(notebook.name);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(notebook.name);
                setRenaming(false);
              }
            }}
            className="my-0.5 min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--surface)] px-1 py-0.5 text-[13.5px] text-ink outline-none"
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1 py-1">
            <button
              type="button"
              onClick={onToggle}
              className="flex size-4 shrink-0 items-center justify-center rounded text-faint transition hover:text-ink"
              aria-label={collapseNotebookLabel(open, notebook)}
            >
              <ChevronRight
                className={cn("size-3 transition-transform", open && "rotate-90")}
              />
            </button>
            <Link
              href={`/home/n/${notebook.id}`}
              prefetch={true}
              onMouseEnter={() => router.prefetch(`/home/n/${notebook.id}`)}
              draggable={false}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 text-left",
                active ? "font-medium text-ink" : "text-ink"
              )}
            >
              <SidebarItemIcon
                icon={notebook.emoji}
                fallback="📓"
                size={isNestedNotebook(notebook) ? undefined : isIconUrl(notebook.emoji ?? "") ? 24 : 16}
              />
              <span className="truncate text-[13.5px] font-medium">{notebook.name}</span>
            </Link>
          </div>
        )}
        <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{count}</span>
        <div className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:grid-cols-[1fr]">
          <div className="flex min-w-0 items-center overflow-hidden">
        <Tooltip label="Nova nota">
          <button
            onClick={onCreatePage}
            className="rounded p-0.5 text-faint hover:text-ink"
            aria-label="Nova nota"
          >
            <Plus className="size-3.5" />
          </button>
        </Tooltip>
        <Menu>
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
              <FolderPlus /> {openNotebookLabel(notebook)}
            </MenuItem>
            <MenuItem onSelect={() => router.push(`/home/notes?notebook=${notebook.id}`)}>
              <FileStack /> Ver todas as notas
            </MenuItem>
            <MenuItem onSelect={() => setRenaming(true)}>Renomear</MenuItem>
            <MenuItem onSelect={onCreateSubnotebook}>
              <FolderPlus /> {NOTEBOOK_COPY.newChildAction}
            </MenuItem>
            <MenuItem onSelect={onCreatePage}>
              <Plus /> Nova nota
            </MenuItem>
            <MenuItem onSelect={() => void onDuplicate()}>
              <Copy /> {duplicateNotebookLabel(notebook)}
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => void onDelete()}>
              <Trash2 /> {deleteNotebookLabel(notebook)}
            </MenuItem>
          </MenuContent>
        </Menu>
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className={GRIP_CLASS}
              aria-label={`Reordenar ${notebook.name}`}
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
            className="overflow-hidden pl-2"
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
  onCreateChild: () => Promise<void>;
  onToggleFavorite: () => void;
  onDuplicate: () => Promise<void>;
  onTrash: () => Promise<void>;
}) {
  const router = useRouter();
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
            ↕ Acima
          </span>
        </div>
      )}
      {dropIntent === "after" && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 z-30 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
          <span className="absolute left-2 -bottom-2.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5 text-[9px] font-bold shadow-sm">
            ↕ Abaixo
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
        <div className="pointer-events-none absolute right-1.5 top-1/2 z-30 -translate-y-1/2 flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10.5px] font-bold text-white shadow-md animate-in fade-in zoom-in-95 duration-100">
          <FilePlus className="size-3" />
          <span>Subpágina</span>
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
        <span className="truncate">{node.page.title || "Sem título"}</span>
      </Link>
      <div className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:grid-cols-[1fr]">
        <div className="flex min-w-0 items-center overflow-hidden">
          <Menu>
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
                <Plus /> Nova subpágina
              </MenuItem>
              <MenuItem onSelect={onToggleFavorite}>
                <Star /> {node.page.favorite ? "Remover dos favoritos" : "Favoritar"}
              </MenuItem>
              <MenuItem onSelect={() => void onDuplicate()}>
                <Copy /> Duplicar nota
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => void onTrash()}>
                <Trash2 /> Mover para lixeira
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
