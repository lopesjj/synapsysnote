"use client";

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FilePlus, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { childrenOf, notebookSubtreeIds, parentIdOf } from "@/lib/data/notebook-tree";
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
    return tree.map((node) => node.page).sort((a, b) => compareNatural(a.title, b.title));
  }, [notebookId, treeFor]);

  const notebookDatabases = useMemo(
    () => databases.filter((database) => database.notebookId === notebookId && !database.deletedAt),
    [databases, notebookId]
  );

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
        <Button variant="secondary" onClick={() => router.push("/app")}>
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
    router.push(`/app/n/${created.id}`);
  };

  const createNote = async () => {
    const page = await adapter.createPage({ notebookId, title: "Sem título" });
    router.push(`/app/p/${page.id}`);
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
            <MenuItem
              onSelect={async () => {
                try {
                  const copy = await adapter.duplicateNotebook(notebookId);
                  toast.success(
                    parentIdOf(notebook) ? NOTEBOOK_COPY.duplicatedChild : NOTEBOOK_COPY.duplicatedRoot
                  );
                  router.push(`/app/n/${copy.id}`);
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
                router.push(parent ? `/app/n/${parent}` : "/app");
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

      <div className="relative z-10 mx-auto w-full max-w-[46rem] px-5 pb-24 md:px-8">
        <div className={cn("flex items-center", isIconUrl(notebook.emoji ?? "") ? "gap-5" : "gap-3", hasCover ? "pt-0" : "pt-6")}>
          <IconPickerMenu
            icons={NOTEBOOK_ICONS}
            current={notebook.emoji}
            fallback="📓"
            onSelect={(icon) => void adapter.updateNotebook(notebookId, { emoji: icon })}
            onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
            className={hasCover && isIconUrl(notebook.emoji ?? "") ? "relative z-20 -mt-14" : undefined}
            trigger={
              <button
                type="button"
                className={cn(
                  "shrink-0 self-center leading-none transition",
                  isIconUrl(notebook.emoji ?? "") ? "rounded-[28px]" : "rounded-[10px]",
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
              "flex min-w-0 flex-1 items-center",
              hasCover && isIconUrl(notebook.emoji ?? "") && "-mt-10"
            )}
            style={{ minHeight: workspaceHeroSize(notebook.emoji) }}
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
              className="w-full min-w-0 resize-none overflow-hidden border-none bg-transparent py-0 text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink outline-none placeholder:text-faint [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
          <span>
            {childNotebooks.length} {childNotebookCountLabel(childNotebooks.length)}
          </span>
          <span>·</span>
          <span>
            {notes.length} {notes.length === 1 ? "nota" : "notas"}
          </span>
          <span className="ml-auto">Atualizado {formatRelative(notebook.updatedAt)}</span>
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
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                  {NOTEBOOK_COPY.childrenHeading}
                </h2>
                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                  {childNotebooks.map((child) => (
                    <NotebookRow key={child.id} notebook={child} />
                  ))}
                </div>
              </section>
            ) : null}

            {notes.length || notebookDatabases.length ? (
              <section>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Notas
                </h2>
                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                  {notes.map((page) => (
                    <NoteRow key={page.id} page={page} />
                  ))}
                  {notebookDatabases.map((database) => (
                    <Link
                      key={database.id}
                      href={`/app/db/${database.id}`}
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
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function NotebookRow({ notebook }: { notebook: Notebook }) {
  const router = useRouter();
  const { adapter, livePages, notebooks } = useWorkspace();
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
      router.push(`/app/n/${copy.id}`);
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
    <div className="group flex items-center gap-2 px-4 py-3 transition hover:bg-[var(--surface-hover)]">
      <Link href={`/app/n/${notebook.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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

  const duplicate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const copy = await adapter.duplicatePage(page.id);
      toast.success("Nota duplicada");
      router.push(`/app/p/${copy.id}`);
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
    <div className="group flex items-center gap-2 px-4 py-3 transition hover:bg-[var(--surface-hover)]">
      <Link href={`/app/p/${page.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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
