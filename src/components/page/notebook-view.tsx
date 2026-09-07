"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
import { Copy, FilePlus, FolderPlus, GripVertical, ImageOff, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUiStore } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/data/provider";
import { childrenOf, isNotebookDescendant, notebookSubtreeIds, parentIdOf } from "@/lib/data/notebook-tree";
import {
  NOTEBOOK_COPY,
  childNotebookCountLabel,
  deleteNotebookConfirm,
  deleteNotebookLabel,
  duplicateNotebookLabel,
  emptyNotebookTitle,
  iconNotebookLabel,
  notebookNamePlaceholder,
} from "@/lib/data/notebook-copy";
import { Button } from "@/components/ui/button";
import { EmptyState, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { WorkspaceCrumbs } from "./workspace-crumbs";
import { cn, compareNatural, formatRelative } from "@/lib/utils";
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

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function NotebookView({ notebookId }: { notebookId: string }) {
  const router = useRouter();
  const { adapter, notebooks, livePages, databases, treeFor, ready } = useWorkspace();
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);

  const [titleDraft, setTitleDraft] = useState<{ id: string; value: string } | null>(null);
  const title = titleDraft?.id === notebookId ? titleDraft.value : (notebook?.name ?? "");

  const childNotebooks = useMemo(
    () => childrenOf(notebooks, notebookId),
    [notebookId, notebooks]
  );

  const notes = useMemo(() => {
    const tree = treeFor(notebookId);
    return tree
      .map((node) => node.page)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || compareNatural(a.title, b.title));
  }, [notebookId, treeFor]);

  const notebookDatabases = useMemo(
    () => databases.filter((database) => database.notebookId === notebookId && !database.deletedAt),
    [databases, notebookId]
  );

  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; mode: DropMode } | null>(null);
  const dropTargetRef = useRef<{ id: string; mode: DropMode } | null>(null);
  const pointerYRef = useRef<number>(0);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
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
    () => (activeNoteId ? notes.find((p) => p.id === activeNoteId) : null),
    [activeNoteId, notes]
  );

  const onNotebookDragStart = (event: DragStartEvent) => {
    dropTargetRef.current = null;
    setActiveNotebookId(String(event.active.id));
    setDropTarget(null);
  };

  // Wired to onDragMove (not onDragOver): onDragOver only fires when the
  // "over" target itself changes, so during a slow drag the mode computed
  // the instant you entered a row (often "before", near its top edge) would
  // otherwise stay frozen even after the cursor reaches the row's center.
  // onDragMove fires on every pointer movement, so the zone keeps recomputing.
  const onNotebookDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }

    const overId = String(over.id);
    const targetNb = childNotebooks.find((n) => n.id === overId);
    if (!targetNb) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }

    const overRect = over.rect;
    if (!overRect) return;

    // Coordenada REAL do cursor do usuário para máxima precisão e controle
    const cursorY = pointerYRef.current || (active.rect.current.translated ? active.rect.current.translated.top + active.rect.current.translated.height / 2 : overRect.top + overRect.height / 2);
    const relativeY = (cursorY - overRect.top) / overRect.height;

    let mode: DropMode = "inside";
    if (relativeY < 0.25) {
      mode = "before";
    } else if (relativeY > 0.75) {
      mode = "after";
    } else {
      mode = "inside"; // 50% central da área do caderno é para Inserir Dentro
    }

    dropTargetRef.current = { id: overId, mode };
    setDropTarget({ id: overId, mode });
  };

  const onNotebookDragCancel = () => {
    dropTargetRef.current = null;
    setActiveNotebookId(null);
    setDropTarget(null);
  };

  const onNotebookDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const targetState = dropTargetRef.current ?? dropTarget;
    dropTargetRef.current = null;
    setActiveNotebookId(null);
    setDropTarget(null);

    if (!over || active.id === over.id || !targetState) return;

    const draggedId = String(active.id);
    const targetId = String(over.id);
    const dragged = childNotebooks.find((n) => n.id === draggedId);
    const target = childNotebooks.find((n) => n.id === targetId);
    if (!dragged || !target) return;

    // INSERIR DENTRO DO CADERNO
    if (targetState.mode === "inside") {
      if (isNotebookDescendant(notebooks, target.id, dragged.id)) {
        toast.error("Não é possível mover um caderno para dentro de seus subcadernos.");
        return;
      }
      try {
        await adapter.moveNotebook(dragged.id, { parentId: target.id });
        toast.success(`Caderno “${dragged.name}” inserido dentro de “${target.name}”`);
      } catch {
        toast.error("Não foi possível mover o caderno.");
      }
      return;
    }

    // REORDENAR ENTRE CADERNOS
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
      toast.success("Ordem dos cadernos atualizada");
    } catch {
      toast.error("Não foi possível reordenar os cadernos.");
    }
  };

  const onNoteDragStart = (event: DragStartEvent) => {
    setActiveNoteId(String(event.active.id));
  };

  const onNoteDragCancel = () => {
    setActiveNoteId(null);
  };

  const onNoteDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNoteId(null);
    if (!over || active.id === over.id) return;

    const fromIndex = notes.findIndex((p) => p.id === active.id);
    const toIndex = notes.findIndex((p) => p.id === over.id);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = moveItem(notes, fromIndex, toIndex);
    try {
      await adapter.applyPageOrders(
        reordered.map((p, index) => ({ id: p.id, order: index * 100 }))
      );
      toast.success("Ordem das notas atualizada");
    } catch {
      toast.error("Não foi possível reordenar as notas.");
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
        <p className="text-sm font-medium text-ink">{NOTEBOOK_COPY.missing}</p>
        <p className="max-w-xs text-[12.5px] text-muted">{NOTEBOOK_COPY.missingHint}</p>
        <Button variant="secondary" onClick={() => router.push("/home")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  const createSubnotebook = async () => {
    const created = await adapter.createNotebook({
      name: NOTEBOOK_COPY.newChildName,
      parentId: notebookId,
    });
    toast.success(NOTEBOOK_COPY.createdChild);
    router.push(`/home/n/${created.id}`);
  };

  const createNote = async () => {
    const page = await adapter.createPage({ notebookId, title: "Sem título" });
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
          onChange={(coverUrl) => void adapter.updateNotebook(notebookId, { coverUrl })}
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
            <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => void createSubnotebook()}>
              <FolderPlus /> {NOTEBOOK_COPY.newChildAction}
            </MenuItem>
            <MenuItem onSelect={() => void createNote()}>
              <FilePlus /> Nova nota
            </MenuItem>
            {hasCover ? (
              <MenuItem
                onSelect={async () => {
                  await adapter.updateNotebook(notebookId, { coverUrl: null });
                  toast.success("Capa removida");
                }}
              >
                <ImageOff /> Remover capa
              </MenuItem>
            ) : null}
            <MenuItem
              onSelect={async () => {
                try {
                  const copy = await adapter.duplicateNotebook(notebookId);
                  toast.success(
                    parentIdOf(notebook) ? NOTEBOOK_COPY.duplicatedChild : NOTEBOOK_COPY.duplicatedRoot
                  );
                  router.push(`/home/n/${copy.id}`);
                } catch {
                  toast.error("Não foi possível duplicar.");
                }
              }}
            >
              <Copy /> {duplicateNotebookLabel(notebook)}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                if (!window.confirm(deleteNotebookConfirm(notebook))) return;
                const parent = parentIdOf(notebook);
                await adapter.deleteNotebook(notebookId);
                toast.success(parent ? NOTEBOOK_COPY.removedChild : NOTEBOOK_COPY.removedRoot);
                router.push(parent ? `/home/n/${parent}` : "/home");
              }}
            >
              <Trash2 /> {deleteNotebookLabel(notebook)}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {!hasCover ? (
        <CoverPicker
          coverUrl={notebook.coverUrl}
          onChange={(coverUrl) => void adapter.updateNotebook(notebookId, { coverUrl })}
          onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
        />
      ) : null}

      <div className="relative z-10 mx-auto w-full max-w-[46rem] px-4 pb-24 pb-safe sm:px-5 md:px-8">
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
                aria-label={iconNotebookLabel(notebook)}
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
              value={title}
              rows={1}
              cols={1}
              placeholder={notebookNamePlaceholder(notebook)}
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
              className="w-full min-w-0 resize-none overflow-hidden border-none bg-transparent py-0 text-[26px] font-bold leading-[1.18] tracking-[-0.025em] text-ink outline-none placeholder:text-faint [scrollbar-width:none] [-ms-overflow-style:none] sm:text-[34px] sm:font-semibold sm:leading-[1.15] [&::-webkit-scrollbar]:hidden"
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-faint sm:mt-2 sm:justify-start sm:gap-2 sm:text-[11px]">
          <div className="flex items-center gap-2">
            <span>
              {childNotebooks.length} {childNotebookCountLabel(childNotebooks.length)}
            </span>
            <span>·</span>
            <span>
              {notes.length} {notes.length === 1 ? "nota" : "notas"}
            </span>
          </div>
          <span className="sm:ml-auto">Atualizado {formatRelative(notebook.updatedAt)}</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void createSubnotebook()}>
            <FolderPlus /> {NOTEBOOK_COPY.newChildAction}
          </Button>
          <Button variant="secondary" onClick={() => void createNote()}>
            <FilePlus /> Nova nota
          </Button>
        </div>

        {empty ? (
          <div className="mt-8">
            <EmptyState
              title={emptyNotebookTitle(notebook)}
              description={NOTEBOOK_COPY.emptyDescription}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => void createSubnotebook()}>
                    <FolderPlus /> {NOTEBOOK_COPY.newChildAction}
                  </Button>
                  <Button variant="primary" onClick={() => void createNote()}>
                    <FilePlus /> Nova nota
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {childNotebooks.length ? (
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                    {NOTEBOOK_COPY.childrenHeading}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 font-medium text-muted shadow-2xs">
                      <span>↕</span> Bordas: <strong>Reordenar</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 font-semibold text-[var(--accent)] shadow-2xs">
                      <FolderPlus className="size-3.5" /> Centro: <strong>Mover para dentro</strong>
                    </span>
                  </div>
                </div>
                <DndContext
                  sensors={sensors}
                  modifiers={[restrictToVerticalAxis]}
                  onDragStart={onNotebookDragStart}
                  onDragMove={onNotebookDragMove}
                  onDragCancel={onNotebookDragCancel}
                  onDragEnd={onNotebookDragEnd}
                >
                  <SortableContext
                    items={childNotebooks.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                      {childNotebooks.map((child) => (
                        <NotebookRow
                          key={child.id}
                          notebook={child}
                          isDropTarget={dropTarget?.id === child.id}
                          dropMode={dropTarget?.id === child.id ? dropTarget.mode : undefined}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
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
                            Soltar para inserir DENTRO
                          </span>
                        ) : dropTarget?.mode === "before" ? (
                          <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-1 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
                            <span>↕</span> Reordenar acima
                          </span>
                        ) : dropTarget?.mode === "after" ? (
                          <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-1 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
                            <span>↕</span> Reordenar abaixo
                          </span>
                        ) : (
                          <span className="ml-auto text-[11px] font-medium text-faint">
                            Arraste para uma posição
                          </span>
                        )}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </section>
            ) : null}

            {notes.length || notebookDatabases.length ? (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                    Notas
                  </h2>
                  {notes.length > 1 ? (
                    <span className="text-[10.5px] text-faint">
                      Arraste para reordenar notas
                    </span>
                  ) : null}
                </div>
                <DndContext
                  sensors={sensors}
                  modifiers={[restrictToVerticalAxis]}
                  onDragStart={onNoteDragStart}
                  onDragCancel={onNoteDragCancel}
                  onDragEnd={onNoteDragEnd}
                >
                  <SortableContext
                    items={notes.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                      {notes.map((page) => (
                        <NoteRow key={page.id} page={page} />
                      ))}
                      {notebookDatabases.map((database) => (
                        <Link
                          key={database.id}
                          href={`/home/db/${database.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-hover)]"
                        >
                          <WorkspaceIcon icon={database.icon} fallback="🗃️" size={16} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                            {database.name}
                          </span>
                          <span className="text-[11px] text-faint">Base</span>
                        </Link>
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeNote ? (
                      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-float)] ring-4 ring-[var(--accent)]/15">
                        <GripVertical className="size-4 text-[var(--accent)]" />
                        <WorkspaceIcon icon={activeNote.icon} fallback="📄" variant="list" />
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {activeNote.title || "Sem título"}
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function NotebookRow({
  notebook,
  isDropTarget,
  dropMode,
}: {
  notebook: Notebook;
  isDropTarget?: boolean;
  dropMode?: DropMode;
}) {
  const router = useRouter();
  const { adapter, livePages, notebooks } = useWorkspace();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: notebook.id });

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
      toast.success(NOTEBOOK_COPY.duplicatedChild);
      router.push(`/home/n/${copy.id}`);
    } catch {
      toast.error("Não foi possível duplicar.");
    }
  };

  const remove = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(deleteNotebookConfirm(notebook))) return;
    await adapter.deleteNotebook(notebook.id);
    toast.success(NOTEBOOK_COPY.removedChild);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-3 transition-all",
        isDragging && "opacity-25",
        isDropTarget && dropMode === "inside" && "bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent)] z-20 scale-[1.01] shadow-md rounded-[var(--radius-md)]",
        !isDropTarget && "hover:bg-[var(--surface-hover)]"
      )}
    >
      {/* Indicador visual de REORDENAR ACIMA */}
      {isDropTarget && dropMode === "before" && (
        <div className="pointer-events-none absolute inset-x-0 -top-1.5 z-30 flex items-center">
          <div className="h-1 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <span className="absolute left-6 -top-3.5 flex items-center gap-1.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-0.5 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
            <span>↕</span> Reordenar ACIMA de “{notebook.name}”
          </span>
        </div>
      )}

      {/* Indicador visual de REORDENAR ABAIXO */}
      {isDropTarget && dropMode === "after" && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-1.5 z-30 flex items-center">
          <div className="h-1 flex-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <span className="absolute left-6 -bottom-3.5 flex items-center gap-1.5 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-0.5 text-[11px] font-bold shadow-md animate-in fade-in duration-100">
            <span>↕</span> Reordenar ABAIXO de “{notebook.name}”
          </span>
        </div>
      )}

      {/* Indicador visual de INSERIR DENTRO */}
      {isDropTarget && dropMode === "inside" && (
        <div className="pointer-events-none absolute inset-y-1.5 right-3 z-30 flex items-center">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-xl ring-2 ring-white/30 animate-in fade-in zoom-in-95 duration-100">
            <FolderPlus className="size-4" />
            <span>Soltar para inserir DENTRO</span>
          </span>
        </div>
      )}

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Arrastar para reordenar ou mover ${notebook.name}`}
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-faint opacity-40 transition hover:bg-[var(--surface-hover)] hover:text-ink hover:opacity-100 active:cursor-grabbing group-hover:opacity-80"
      >
        <GripVertical className="size-4" />
      </button>

      <Link href={`/home/n/${notebook.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <WorkspaceIcon icon={notebook.emoji} fallback="📓" variant="list" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{notebook.name}</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">
            {nested ? `${nested} ${childNotebookCountLabel(nested)} · ` : null}
            {noteCount} {noteCount === 1 ? "nota" : "notas"}
          </span>
        </span>
      </Link>
      <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
        {formatRelative(notebook.updatedAt)}
      </span>
      <Tooltip label={duplicateNotebookLabel(notebook)}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={duplicateNotebookLabel(notebook)}
          className="shrink-0 text-faint opacity-70 hover:text-ink group-hover:opacity-100"
          onClick={(event) => void duplicate(event)}
        >
          <Copy />
        </Button>
      </Tooltip>
      <Tooltip label={deleteNotebookLabel(notebook)}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={deleteNotebookLabel(notebook)}
          className="shrink-0 text-faint opacity-70 hover:text-[var(--danger)] group-hover:opacity-100"
          onClick={(event) => void remove(event)}
        >
          <Trash2 />
        </Button>
      </Tooltip>
    </div>
  );
}

function NoteRow({ page }: { page: Page }) {
  const router = useRouter();
  const { adapter } = useWorkspace();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: page.id });

  const duplicate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const copy = await adapter.duplicatePage(page.id);
      toast.success("Nota duplicada");
      useUiStore.getState().closeMenu();
      router.push(`/home/p/${copy.id}`);
    } catch {
      toast.error("Não foi possível duplicar a nota.");
    }
  };

  const remove = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Mover "${page.title || "Sem título"}" para a lixeira?`)) return;
    await adapter.trashPage(page.id);
    toast.success("Movida para a lixeira");
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-3 transition hover:bg-[var(--surface-hover)]",
        isDragging && "opacity-30"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Arrastar para reordenar ${page.title || "Sem título"}`}
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-faint opacity-40 transition hover:bg-[var(--surface-hover)] hover:text-ink hover:opacity-100 active:cursor-grabbing group-hover:opacity-80"
      >
        <GripVertical className="size-4" />
      </button>

      <Link
        href={`/home/p/${page.id}`}
        onClick={() => useUiStore.getState().closeMenu()}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <WorkspaceIcon icon={page.icon} fallback="📄" variant="list" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">
            {page.title || "Sem título"}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
            {excerpt(page) || "Nota vazia"}
          </span>
        </span>
      </Link>
      <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
        {formatRelative(page.updatedAt)}
      </span>
      <Tooltip label="Duplicar nota">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Duplicar nota"
          className="shrink-0 text-faint opacity-70 hover:text-ink group-hover:opacity-100"
          onClick={(event) => void duplicate(event)}
        >
          <Copy />
        </Button>
      </Tooltip>
      <Tooltip label="Mover para a lixeira">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Mover para a lixeira"
          className="shrink-0 text-faint opacity-70 hover:text-[var(--danger)] group-hover:opacity-100"
          onClick={(event) => void remove(event)}
        >
          <Trash2 />
        </Button>
      </Tooltip>
    </div>
  );
}

function excerpt(page: Page): string {
  const text = page.plainText.replace(/\s+/g, " ").trim();
  const withoutTitle = text.startsWith(page.title) ? text.slice(page.title.length).trim() : text;
  return withoutTitle.slice(0, 120);
}
