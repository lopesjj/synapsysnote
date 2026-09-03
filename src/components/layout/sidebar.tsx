"use client";

import { useMemo, useState } from "react";
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
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  FileStack,
  FolderPlus,
  GripVertical,
  Home,
  Import,
  Minimize2,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, isMac } from "@/lib/utils";
import { useWorkspace, type PageTreeNode } from "@/lib/data/provider";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUiStore } from "@/lib/store/ui-store";
import { useTheme } from "@/components/theme-provider";
import { SynapsysMark, SynapsysWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Kbd, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { Notebook } from "@/types/models";
import {
  ORDER_STEP,
  decodeId,
  encodeId,
  planSidebarDrop,
  type DragId,
} from "./sidebar-dnd";

/**
 * Collapsible sidebar: notebook tree, favorites, tags and workspace entry
 * points, plus drag-and-drop reordering.
 *
 * Order is stored as a sparse `order` field. On drop the affected sibling list
 * is renumbered in fixed steps, which keeps the writes bounded to one list and
 * avoids the fractional-index drift you get from midpoint insertion.
 *
 * Deciding *what* a drop means lives in `sidebar-dnd.ts`, which is dnd-kit-free
 * and unit-tested; this file only applies the resulting plan.
 */

/**
 * A notebook row is a few pixels tall while its expanded page list can fill the
 * viewport, so unfiltered detection almost always resolves a notebook drag to
 * one of the pages inside the target. Dragging a notebook therefore only
 * considers other notebooks; dragging a page considers everything, since a page
 * legitimately drops either next to a sibling or onto a notebook header.
 *
 * `pointerWithin` first because it is exact when the cursor is inside a row,
 * with `closestCenter` as the fallback for the gaps between them.
 */
const detectCollisions: CollisionDetection = (args) => {
  const active = decodeId(args.active.id);
  const droppableContainers =
    active?.kind === "notebook"
      ? args.droppableContainers.filter(
          (container) => decodeId(container.id)?.kind === "notebook"
        )
      : args.droppableContainers;

  const scoped = { ...args, droppableContainers };
  const within = pointerWithin(scoped);
  return within.length ? within : closestCenter(scoped);
};

/**
 * Drag handle. Kept faintly visible rather than hidden until hover: a target
 * that only exists once the cursor is already on it is hard to aim at, and
 * reserving its width keeps the row from shifting. The padding is what makes
 * the hit area comfortable — the glyph itself is only 12px.
 */
const GRIP_CLASS = cn(
  "-my-1 shrink-0 cursor-grab rounded px-1 py-2 text-faint opacity-30 transition",
  "hover:bg-[var(--surface-hover)] hover:opacity-100 group-hover:opacity-70",
  "active:cursor-grabbing"
);

/** Flattens a page subtree into sortable ids, nested descendants included. */
function sortableIds(nodes: PageTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    encodeId("page", node.page.id),
    ...sortableIds(node.children),
  ]);
}

export function Sidebar({ collapsed, width }: { collapsed: boolean; width: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile();
  const { notebooks, livePages, databases, tags, trashedPages, treeFor, adapter } = useWorkspace();

  const [openNotebooks, setOpenNotebooks] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<DragId | null>(null);

  const sensors = useSensors(
    // A small distance threshold keeps a click on a page link from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const favorites = useMemo(() => livePages.filter((page) => page.favorite), [livePages]);
  const orphanPages = useMemo(
    () => treeFor(null).filter((node) => !node.page.notebookId),
    [treeFor]
  );

  // `treeFor` walks every page, so resolve each notebook's contents once per
  // render rather than on each of the several places that need them.
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

  const displayName = profile?.displayName ?? user?.displayName ?? "";

  const createPage = async (notebookId: string | null) => {
    const page = await adapter.createPage({ notebookId, title: "Sem título" });
    if (notebookId) setOpenNotebooks((prev) => ({ ...prev, [notebookId]: true }));
    router.push(`/app/p/${page.id}`);
  };

  const createNotebook = async () => {
    const notebook = await adapter.createNotebook({ name: "Novo caderno" });
    setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: true }));
    toast.success("Caderno criado");
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setDragging(null);

    const plan = planSidebarDrop(event.active.id, event.over?.id, {
      notebooks,
      pages: livePages,
    });
    if (!plan) return;

    try {
      if (plan.kind === "reorder-notebooks") {
        await Promise.all(
          plan.notebookIds.map((id, index) =>
            adapter.updateNotebook(id, { order: index * ORDER_STEP })
          )
        );
        return;
      }

      // The move has to land before the sibling list is renumbered, so the
      // page is already in its destination when the orders are written.
      if (plan.kind === "move-page") {
        await adapter.movePage(plan.pageId, {
          notebookId: plan.notebookId,
          parentPageId: plan.parentPageId,
        });
      }

      await Promise.all(
        plan.pageIds.map((id, index) => adapter.updatePage(id, { order: index * ORDER_STEP }))
      );

      if (plan.kind === "move-page") toast.success("Página movida");
    } catch {
      toast.error("Não foi possível reordenar. Tente novamente.");
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface)] py-3">
        <Tooltip label="Expandir barra lateral" shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <button
            onClick={() => useUiStore.getState().toggleSidebar()}
            className="rounded-lg p-1.5 transition hover:bg-[var(--surface-hover)]"
            aria-label="Expandir barra lateral"
          >
            <SynapsysMark size={26} />
          </button>
        </Tooltip>
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
        <Tooltip label="Nova nota" shortcut={isMac() ? "⌘N" : "Ctrl N"} side="right">
          <Button variant="ghost" size="icon" onClick={() => createPage(null)} aria-label="Nova nota">
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip label="Todas as notas" side="right">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/app/notes" aria-label="Todas as notas">
              <FileStack />
            </Link>
          </Button>
        </Tooltip>
        <div className="mt-auto">
          <Tooltip label="Preferências" shortcut={isMac() ? "⌘," : "Ctrl ,"} side="right">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => useUiStore.getState().setPreferencesOpen(true)}
              aria-label="Preferências"
            >
              <Settings2 />
            </Button>
          </Tooltip>
        </div>
      </aside>
    );
  }

  const renderTree = (nodes: PageTreeNode[]) =>
    nodes.map((node) => {
      const isOpen = expanded[node.page.id] ?? node.depth < 1;
      const active = pathname === `/app/p/${node.page.id}`;
      return (
        <div key={node.page.id}>
          <SortablePageRow
            node={node}
            active={active}
            isOpen={isOpen}
            onToggle={() => setExpanded((prev) => ({ ...prev, [node.page.id]: !isOpen }))}
            onCreateChild={async () => {
              const child = await adapter.createPage({
                parentPageId: node.page.id,
                notebookId: node.page.notebookId,
                title: "Sem título",
              });
              setExpanded((prev) => ({ ...prev, [node.page.id]: true }));
              router.push(`/app/p/${child.id}`);
            }}
            onToggleFavorite={() =>
              adapter.updatePage(node.page.id, { favorite: !node.page.favorite })
            }
            onTrash={async () => {
              await adapter.trashPage(node.page.id);
              toast.success("Movida para a lixeira", {
                action: { label: "Desfazer", onClick: () => adapter.restorePage(node.page.id) },
              });
              if (active) router.push("/app");
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

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
      style={{ width }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Menu>
          <MenuTrigger asChild>
            <button className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 transition hover:bg-[var(--surface-hover)]">
              <SynapsysWordmark size={30} />
              <ChevronDown className="size-3.5 shrink-0 text-faint" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="min-w-[240px]">
            <div className="px-2 py-1.5">
              <p className="truncate text-[12.5px] font-medium text-ink">{displayName}</p>
              <p className="truncate text-[11px] text-muted">{user?.email}</p>
            </div>
            <MenuSeparator />
            <MenuItem onSelect={() => useUiStore.getState().setPreferencesOpen(true)}>
              <Settings2 /> Preferências
            </MenuItem>
            <MenuItem onSelect={() => router.push("/app/integrations")}>Integrações</MenuItem>
            <MenuItem onSelect={toggle}>Tema {theme === "dark" ? "claro" : "escuro"}</MenuItem>
            <MenuItem onSelect={() => useUiStore.getState().toggleZenMode()}>
              <Minimize2 /> Modo foco
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                await signOut();
                router.push("/");
              }}
            >
              Sair
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip label="Recolher barra lateral" shortcut={isMac() ? "⌘B" : "Ctrl B"} side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => useUiStore.getState().toggleSidebar()}
            aria-label="Recolher barra lateral"
          >
            <PanelLeftClose />
          </Button>
        </Tooltip>
      </div>

      <div className="space-y-0.5 px-2">
        <button
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Search className="size-3.5" />
          Buscar
          <Kbd className="ml-auto">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <NavLink href="/app" active={pathname === "/app"} icon={<Home className="size-3.5" />}>
          Início
        </NavLink>
        <NavLink
          href="/app/notes"
          active={pathname === "/app/notes"}
          icon={<FileStack className="size-3.5" />}
        >
          Todas as notas
          <span className="ml-auto text-[10.5px] text-faint">{livePages.length}</span>
        </NavLink>
        <button
          onClick={() => useUiStore.getState().setImportOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Import className="size-3.5" />
          Importar do Notion
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={detectCollisions}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(event: DragStartEvent) => setDragging(decodeId(event.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={(event) => void onDragEnd(event)}
      >
        <div className="mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          {favorites.length ? (
            <Section
              title="Favoritos"
              action={
                <Tooltip label="Ver todos os favoritos">
                  <Link
                    href="/app/notes?favorites=1"
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
                  href={`/app/p/${page.id}`}
                  className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                >
                  <span className="w-4 text-center text-[12px]">{page.icon ?? "⭐"}</span>
                  <span className="truncate">{page.title || "Sem título"}</span>
                </Link>
              ))}
            </Section>
          ) : null}

          <Section
            title="Cadernos"
            action={
              <Tooltip label="Novo caderno" shortcut={isMac() ? "⌘⇧N" : "Ctrl ⇧ N"}>
                <button
                  onClick={createNotebook}
                  className="rounded p-0.5 text-faint transition hover:text-ink"
                  aria-label="Novo caderno"
                >
                  <FolderPlus className="size-3.5" />
                </button>
              </Tooltip>
            }
          >
            <SortableContext
              items={notebooks.map((notebook) => encodeId("notebook", notebook.id))}
              strategy={verticalListSortingStrategy}
            >
              {notebooks.map((notebook) => {
                const { tree, databases: notebookDatabases } =
                  contents.get(notebook.id) ?? { tree: [], databases: [] };
                const open = openNotebooks[notebook.id] ?? true;

                return (
                  <NotebookRow
                    key={notebook.id}
                    notebook={notebook}
                    open={open}
                    count={tree.length + notebookDatabases.length}
                    onToggle={() =>
                      setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: !open }))
                    }
                    onCreatePage={() => createPage(notebook.id)}
                    onRename={(name) => adapter.updateNotebook(notebook.id, { name })}
                    onDelete={async () => {
                      await adapter.deleteNotebook(notebook.id);
                      toast.success("Caderno removido");
                    }}
                  >
                    {open ? (
                      <SortableContext
                        items={sortableIds(tree)}
                        strategy={verticalListSortingStrategy}
                      >
                        {renderTree(tree)}
                        {notebookDatabases.map((database) => (
                          <Link
                            key={database.id}
                            href={`/app/db/${database.id}`}
                            className={cn(
                              "flex items-center gap-1.5 rounded-[var(--radius-xs)] py-1 pl-5 pr-2 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
                              pathname === `/app/db/${database.id}`
                                ? "font-medium text-ink"
                                : "text-muted hover:text-ink"
                            )}
                          >
                            <span className="truncate">{database.name}</span>
                          </Link>
                        ))}
                        {!tree.length && !notebookDatabases.length ? (
                          <p className="px-6 py-1 text-[11.5px] text-faint">
                            Vazio — arraste notas para cá
                          </p>
                        ) : null}
                      </SortableContext>
                    ) : null}
                  </NotebookRow>
                );
              })}
            </SortableContext>
          </Section>

          {orphanPages.length ? (
            <Section title="Sem caderno">
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
                    href={`/app/tag/${encodeURIComponent(tag.name)}`}
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
            <div className="rounded-[var(--radius-xs)] border border-[var(--accent)] bg-[var(--surface)] px-2 py-1 text-[12.5px] text-ink shadow-[var(--shadow-float)]">
              {draggedLabel || "Sem título"}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="border-t border-[var(--border)] px-2 py-2">
        <NavLink href="/app/trash" active={pathname === "/app/trash"} icon={<Trash2 className="size-3.5" />}>
          Lixeira
          {trashedPages.length ? (
            <span className="ml-auto text-[10.5px] text-faint">{trashedPages.length}</span>
          ) : null}
        </NavLink>
        <button
          onClick={() => useUiStore.getState().setPreferencesOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <Settings2 className="size-3.5" />
          Preferências
          <Kbd className="ml-auto">{isMac() ? "⌘," : "Ctrl ,"}</Kbd>
        </button>
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
  return (
    <Link
      href={href}
      className={cn(
        "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
        active ? "font-medium text-ink" : "text-muted hover:text-ink"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/** Notebook header: sortable itself, and a drop target for pages. */
function NotebookRow({
  notebook,
  open,
  count,
  onToggle,
  onCreatePage,
  onRename,
  onDelete,
  children,
}: {
  notebook: Notebook;
  open: boolean;
  count: number;
  onToggle: () => void;
  onCreatePage: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // `useSortable` already registers this id as a drop target, which is what
  // makes the header accept pages dragged onto it — no second droppable.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: encodeId("notebook", notebook.id) });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(notebook.name);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <div
        className={cn(
          "group flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 transition-colors",
          isOver && !isDragging
            ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
            : "hover:bg-[var(--surface-hover)]"
        )}
      >
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={GRIP_CLASS}
          aria-label={`Reordenar ${notebook.name}`}
        >
          <GripVertical className="size-3" />
        </button>
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
            className="my-0.5 min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--surface)] px-1 py-0.5 text-[12.5px] text-ink outline-none"
          />
        ) : (
          <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
            <ChevronRight
              className={cn("size-3 shrink-0 text-faint transition-transform", open && "rotate-90")}
            />
            <span className="text-[12px]">{notebook.emoji ?? "📓"}</span>
            <span className="truncate text-[12.5px] font-medium text-ink">{notebook.name}</span>
            <span className="ml-auto text-[10.5px] text-faint">{count}</span>
          </button>
        )}
        <Tooltip label="Nova nota">
          <button
            onClick={onCreatePage}
            className="rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
            aria-label="Nova nota"
          >
            <Plus className="size-3.5" />
          </button>
        </Tooltip>
        <Menu>
          <MenuTrigger asChild>
            <button
              className="rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
              aria-label={`Ações de ${notebook.name}`}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuItem onSelect={() => router.push(`/app/notes?notebook=${notebook.id}`)}>
              <FileStack /> Ver todas as notas
            </MenuItem>
            <MenuItem onSelect={() => setRenaming(true)}>Renomear</MenuItem>
            <MenuItem onSelect={onCreatePage}>
              <Plus /> Nova nota
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => void onDelete()}>
              <Trash2 /> Excluir caderno
            </MenuItem>
          </MenuContent>
        </Menu>
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
  onToggle,
  onCreateChild,
  onToggleFavorite,
  onTrash,
}: {
  node: PageTreeNode;
  active: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onCreateChild: () => Promise<void>;
  onToggleFavorite: () => void;
  onTrash: () => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: encodeId("page", node.page.id) });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: `${node.depth * 12}px`,
      }}
      className={cn(
        "group flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 transition-colors",
        isDragging && "opacity-40",
        isOver && !isDragging && "ring-1 ring-[var(--accent)]",
        active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className={GRIP_CLASS}
        aria-label={`Reordenar ${node.page.title || "página"}`}
      >
        <GripVertical className="size-3" />
      </button>
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
        href={`/app/p/${node.page.id}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[12.5px]",
          active ? "font-medium text-ink" : "text-muted group-hover:text-ink"
        )}
      >
        <span className="w-4 shrink-0 text-center text-[12px]">{node.page.icon ?? "📄"}</span>
        <span className="truncate">{node.page.title || "Sem título"}</span>
      </Link>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
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
          <MenuSeparator />
          <MenuItem destructive onSelect={() => void onTrash()}>
            <Trash2 /> Mover para lixeira
          </MenuItem>
        </MenuContent>
      </Menu>
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
