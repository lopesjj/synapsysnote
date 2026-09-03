"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Columns2,
  LayoutGrid,
  List,
  Notebook as NotebookIcon,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { useWorkspace } from "@/lib/data/provider";
import { useUiStore, type NotesLayout, type NotesSortKey } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { EmptyState, Input, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { BlockPreview } from "./block-preview";
import { cn } from "@/lib/utils";
import type { Page } from "@/types/models";

/**
 * The note list, in the three shapes the classic apps established: a compact
 * list, a card grid, and the dual pane where the list sits beside a live
 * preview. The chosen layout, sort key and density come from the user's
 * preferences, so this view looks the same on every device.
 *
 * Used by "Todas as notas", by a notebook and by a tag — the only difference
 * between them is the incoming scope.
 */

export interface NotesScope {
  notebookId?: string | null;
  tag?: string;
  favoritesOnly?: boolean;
}

const SORT_LABELS: Record<NotesSortKey, string> = {
  updated: "Modificação",
  created: "Criação",
  title: "Título",
};

const LAYOUT_OPTIONS: { value: NotesLayout; label: string; icon: React.ReactNode }[] = [
  { value: "list", label: "Lista compacta", icon: <List className="size-3.5" /> },
  { value: "cards", label: "Cartões", icon: <LayoutGrid className="size-3.5" /> },
  { value: "split", label: "Painel duplo", icon: <Columns2 className="size-3.5" /> },
];

export function NotesExplorer({
  title,
  description,
  scope = {},
}: {
  title: string;
  description?: string;
  scope?: NotesScope;
}) {
  const router = useRouter();
  const { livePages, notebooks, adapter } = useWorkspace();

  const layout = useUiStore((state) => state.notesLayout);
  const sort = useUiStore((state) => state.notesSort);
  const direction = useUiStore((state) => state.notesSortDirection);
  const density = useUiStore((state) => state.notesDensity);

  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(scope.favoritesOnly ?? false);
  const [notebookFilter, setNotebookFilter] = useState<string | null>(
    scope.notebookId ?? null
  );
  // Which row the user clicked in the dual pane. The *effective* selection is
  // derived below, so a filter change cannot leave a stale note on screen.
  const [pickedId, setPickedId] = useState<string | null>(null);

  const pages = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = livePages.filter((page) => {
      if (scope.tag && !page.tags.includes(scope.tag)) return false;
      if (notebookFilter && page.notebookId !== notebookFilter) return false;
      if (favoritesOnly && !page.favorite) return false;
      if (!needle) return true;
      return (
        page.title.toLowerCase().includes(needle) ||
        page.plainText.toLowerCase().includes(needle) ||
        page.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });

    const compare = (a: Page, b: Page) => {
      if (sort === "title") return a.title.localeCompare(b.title, "pt-BR");
      return (sort === "created" ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt);
    };

    return filtered.sort((a, b) => (direction === "asc" ? compare(a, b) : compare(b, a)));
  }, [direction, favoritesOnly, livePages, notebookFilter, query, scope.tag, sort]);

  // Fall back to the first row whenever the picked note is filtered out.
  const selected = pages.find((page) => page.id === pickedId) ?? pages[0] ?? null;
  const selectedId = selected?.id ?? null;
  const activeNotebook = notebooks.find((notebook) => notebook.id === notebookFilter);

  const createNote = async () => {
    const page = await adapter.createPage({
      notebookId: notebookFilter ?? null,
      tags: scope.tag ? [scope.tag] : [],
      title: "Sem título",
    });
    router.push(`/app/p/${page.id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[var(--border)] px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {description ??
                `${pages.length} ${pages.length === 1 ? "nota" : "notas"}${
                  activeNotebook ? ` em ${activeNotebook.name}` : ""
                }`}
            </p>
          </div>
          <Button variant="primary" onClick={() => void createNote()}>
            <Plus /> Nova nota
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar por título, conteúdo ou tag…"
              className="pl-8"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint transition hover:text-ink"
                aria-label="Limpar filtro"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Tooltip label={favoritesOnly ? "Mostrar todas" : "Só favoritas"}>
            <Button
              variant={favoritesOnly ? "primary" : "secondary"}
              size="icon"
              onClick={() => setFavoritesOnly((previous) => !previous)}
              aria-pressed={favoritesOnly}
              aria-label="Filtrar favoritas"
            >
              <Star />
            </Button>
          </Tooltip>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary">
                <NotebookIcon />
                <span className="max-w-[140px] truncate">
                  {activeNotebook?.name ?? "Todos os cadernos"}
                </span>
              </Button>
            </MenuTrigger>
            <MenuContent align="start" className="max-h-72 overflow-y-auto">
              <MenuLabel>Caderno</MenuLabel>
              <MenuItem onSelect={() => setNotebookFilter(null)}>Todos os cadernos</MenuItem>
              {notebooks.map((notebook) => (
                <MenuItem key={notebook.id} onSelect={() => setNotebookFilter(notebook.id)}>
                  {notebook.emoji ?? "📓"} {notebook.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary">{SORT_LABELS[sort]}</Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>Ordenar por</MenuLabel>
              {(Object.keys(SORT_LABELS) as NotesSortKey[]).map((key) => (
                <MenuItem key={key} onSelect={() => useUiStore.getState().setNotesSort(key)}>
                  {SORT_LABELS[key]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <Tooltip label={direction === "desc" ? "Decrescente" : "Crescente"}>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => useUiStore.getState().toggleNotesSortDirection()}
              aria-label="Inverter ordenação"
            >
              {direction === "desc" ? <ArrowDownWideNarrow /> : <ArrowUpWideNarrow />}
            </Button>
          </Tooltip>

          <div className="flex rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {LAYOUT_OPTIONS.map((option) => (
              <Tooltip key={option.value} label={option.label}>
                <button
                  onClick={() => useUiStore.getState().setNotesLayout(option.value)}
                  aria-pressed={layout === option.value}
                  aria-label={option.label}
                  className={cn(
                    "rounded-[6px] px-2 py-1.5 transition",
                    layout === option.value
                      ? "bg-[var(--surface)] text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  )}
                >
                  {option.icon}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      </header>

      {!pages.length ? (
        <div className="px-5 py-10 sm:px-8">
          <EmptyState
            title={query ? "Nada encontrado" : "Nenhuma nota por aqui"}
            description={
              query
                ? `Nenhuma nota corresponde a “${query}”.`
                : "Crie a primeira nota deste recorte para começar."
            }
            action={
              <Button variant="secondary" onClick={() => void createNote()}>
                <Plus /> Nova nota
              </Button>
            }
          />
        </div>
      ) : layout === "split" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-[var(--border)] lg:border-b-0 lg:border-r">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => setPickedId(page.id)}
                onDoubleClick={() => router.push(`/app/p/${page.id}`)}
                className={cn(
                  "block w-full border-b border-[var(--border)] px-4 text-left transition",
                  density === "compact" ? "py-2" : "py-3",
                  selectedId === page.id
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--surface-hover)]"
                )}
              >
                <NoteRowContent page={page} density={density} />
              </button>
            ))}
          </div>

          <div className="min-h-0 overflow-y-auto">
            {selected ? (
              <article className="mx-auto max-w-[var(--reading-width)] px-6 py-6 sm:px-10">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
                    <span className="mr-2">{selected.icon ?? "📄"}</span>
                    {selected.title || "Sem título"}
                  </h2>
                  <Button variant="secondary" asChild>
                    <Link href={`/app/p/${selected.id}`}>Abrir</Link>
                  </Button>
                </div>
                <NoteMeta page={selected} className="mt-2" />
                <div className="mt-5">
                  <BlockPreview blocks={selected.blocks} />
                </div>
              </article>
            ) : null}
          </div>
        </div>
      ) : layout === "cards" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.id}
                href={`/app/p/${page.id}`}
                className="panel group flex flex-col gap-2 px-4 py-3.5 transition hover:border-[var(--accent)]"
              >
                <div className="flex items-start gap-2">
                  <span className="text-[15px]">{page.icon ?? "📄"}</span>
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                    {page.title || "Sem título"}
                  </p>
                  {page.favorite ? (
                    <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                  ) : null}
                </div>
                <p className="line-clamp-4 text-[12px] leading-relaxed text-muted">
                  {excerpt(page, 220) || "Nota vazia"}
                </p>
                <NoteMeta page={page} className="mt-auto pt-1" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {pages.map((page) => (
            <Link
              key={page.id}
              href={`/app/p/${page.id}`}
              className={cn(
                "flex items-center gap-3 border-b border-[var(--border)] px-5 transition hover:bg-[var(--surface-hover)] sm:px-8",
                density === "compact" ? "py-2" : "py-3"
              )}
            >
              <span className="shrink-0 text-[14px]">{page.icon ?? "📄"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-ink">
                    {page.title || "Sem título"}
                  </span>
                  {page.favorite ? (
                    <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                  ) : null}
                </span>
                {density === "comfortable" ? (
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {excerpt(page, 160) || "Nota vazia"}
                  </span>
                ) : null}
              </span>
              <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
                {relative(page.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRowContent({ page, density }: { page: Page; density: "comfortable" | "compact" }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[13px]">{page.icon ?? "📄"}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {page.title || "Sem título"}
        </span>
        {page.favorite ? (
          <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
        ) : null}
      </div>
      {density === "comfortable" ? (
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
          {excerpt(page, 140) || "Nota vazia"}
        </p>
      ) : null}
      <p className="mt-1 text-[10.5px] text-faint">{relative(page.updatedAt)}</p>
    </>
  );
}

function NoteMeta({ page, className }: { page: Page; className?: string }) {
  const { notebooks } = useWorkspace();
  const notebook = notebooks.find((candidate) => candidate.id === page.notebookId);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint", className)}>
      {notebook ? (
        <span>
          {notebook.emoji ?? "📓"} {notebook.name}
        </span>
      ) : null}
      <span>Atualizada {relative(page.updatedAt)}</span>
      {page.tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-muted"
        >
          {tag}
        </span>
      ))}
      {page.importSource === "notion-zip" ? (
        <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
          Notion
        </span>
      ) : null}
    </div>
  );
}

/** First readable text of a note, taken from the indexed plain text. */
function excerpt(page: Page, length: number): string {
  const text = page.plainText.replace(/\s+/g, " ").trim();
  // The title is usually the first line of plainText; drop it so the preview
  // adds information instead of repeating the heading next to it.
  const withoutTitle = text.startsWith(page.title) ? text.slice(page.title.length).trim() : text;
  return withoutTitle.slice(0, length);
}

function relative(timestamp: number): string {
  if (!timestamp) return "agora";
  try {
    return formatDistanceToNow(timestamp, { addSuffix: true, locale: ptBR });
  } catch {
    return "agora";
  }
}
