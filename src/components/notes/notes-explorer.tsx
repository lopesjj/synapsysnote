"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { BlockEditor } from "@/components/editor/block-editor";
import { getMentionCandidates } from "@/components/editor/extensions/mention-suggestion";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { cn, compareNatural, formatRelative } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import type { Page } from "@/types/models";

export interface NotesScope {
  notebookId?: string | null;
  tag?: string;
  favoritesOnly?: boolean;
}

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
  const { t, language } = useTranslation();
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
  const [pickedId, setPickedId] = useState<string | null>(null);

  const sortLabels: Record<NotesSortKey, string> = {
    updated: t("sort_updated"),
    created: t("sort_created"),
    title: t("sort_title"),
  };

  const layoutOptions: { value: NotesLayout; label: string; icon: React.ReactNode }[] = [
    { value: "list", label: t("layout_list"), icon: <List className="size-3.5" /> },
    { value: "cards", label: t("layout_cards"), icon: <LayoutGrid className="size-3.5" /> },
    { value: "split", label: t("layout_split"), icon: <Columns2 className="size-3.5" /> },
  ];

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
      if (sort === "title") return compareNatural(a.title, b.title);
      return (sort === "created" ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt);
    };

    return filtered.sort((a, b) => (direction === "asc" ? compare(a, b) : compare(b, a)));
  }, [direction, favoritesOnly, livePages, notebookFilter, query, scope.tag, sort]);

  const selected = pages.find((page) => page.id === pickedId) ?? pages[0] ?? null;
  const selectedId = selected?.id ?? null;
  const activeNotebook = notebooks.find((notebook) => notebook.id === notebookFilter);
  const mentionCandidates = useMemo(
    () =>
      selectedId
        ? getMentionCandidates({
            currentPageId: selectedId,
            currentNotebookId: selected?.notebookId ?? notebookFilter ?? null,
            livePages,
            notebooks,
          })
        : [],
    [livePages, notebooks, selectedId, selected?.notebookId, notebookFilter]
  );

  const createNote = async () => {
    const page = await adapter.createPage({
      notebookId: notebookFilter ?? null,
      tags: scope.tag ? [scope.tag] : [],
      title: t("untitled"),
    });
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[var(--border)] px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {description ??
                `${pages.length} ${pages.length === 1 ? t("note_singular") : t("notes_plural")}${
                  activeNotebook ? ` ${t("in_word")} ${activeNotebook.name}` : ""
                }`}
            </p>
          </div>
          <Button variant="primary" onClick={() => void createNote()}>
            <Plus /> {t("new_note")}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filter_placeholder")}
              className="pl-8"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint transition hover:text-ink"
                aria-label={t("clear_filter")}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Tooltip label={favoritesOnly ? t("show_all") : t("only_favorites")}>
            <Button
              variant={favoritesOnly ? "primary" : "secondary"}
              size="icon"
              onClick={() => setFavoritesOnly((previous) => !previous)}
              aria-pressed={favoritesOnly}
              aria-label={t("filter_favorites")}
            >
              <Star />
            </Button>
          </Tooltip>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary">
                <NotebookIcon />
                <span className="max-w-[140px] truncate">
                  {activeNotebook?.name ?? t("all_pages")}
                </span>
              </Button>
            </MenuTrigger>
            <MenuContent align="start" className="max-h-72 overflow-y-auto">
              <MenuLabel>{t("pages")}</MenuLabel>
              <MenuItem onSelect={() => setNotebookFilter(null)}>{t("all_pages")}</MenuItem>
              {notebooks.map((notebook) => (
                <MenuItem key={notebook.id} onSelect={() => setNotebookFilter(notebook.id)}>
                  <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={14} /> {notebook.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary">{sortLabels[sort]}</Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>{t("sort_by")}</MenuLabel>
              {(Object.keys(sortLabels) as NotesSortKey[]).map((key) => (
                <MenuItem key={key} onSelect={() => useUiStore.getState().setNotesSort(key)}>
                  {sortLabels[key]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <Tooltip label={direction === "desc" ? t("descending") : t("ascending")}>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => useUiStore.getState().toggleNotesSortDirection()}
              aria-label={t("invert_sort")}
            >
              {direction === "desc" ? <ArrowDownWideNarrow /> : <ArrowUpWideNarrow />}
            </Button>
          </Tooltip>

          <div className="flex rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {layoutOptions.map((option) => (
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
            title={query ? t("nothing_found") : t("no_notes_here")}
            description={
              query
                ? `${t("no_notes_match")} “${query}”.`
                : t("create_first_note_prompt")
            }
            action={
              <Button variant="secondary" onClick={() => void createNote()}>
                <Plus /> {t("new_note")}
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
                onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
                onDoubleClick={() => {
                  useUiStore.getState().closeMenu();
                  router.push(`/home/p/${page.id}`);
                }}
                className={cn(
                  "block w-full border-b border-[var(--border)] px-4 text-left transition",
                  density === "compact" ? "py-1.5" : "py-3.5",
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
              <article className="mx-auto w-full max-w-full sm:max-w-[var(--reading-width,46rem)] px-1.5 sm:px-5 md:px-8 py-4 sm:py-6">
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className="min-w-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink"
                    style={{ fontFamily: "var(--font-editor, var(--font-sans))" }}
                  >
                    <span className="mr-3 inline-flex align-middle">
                      <WorkspaceIcon icon={selected.icon} fallback="📄" size={28} />
                    </span>
                    {selected.title || t("untitled")}
                  </h2>
                  <Button variant="secondary" asChild>
                    <Link
                      href={`/home/p/${selected.id}`}
                      prefetch={true}
                      onMouseEnter={() => router.prefetch(`/home/p/${selected.id}`)}
                      onClick={() => useUiStore.getState().closeMenu()}
                    >
                      {t("open")}
                    </Link>
                  </Button>
                </div>
                <NoteMeta page={selected} className="mt-2" />
                <div className="mt-4 sm:mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-1 py-2 sm:px-4 sm:py-3 dark:border-transparent dark:bg-transparent dark:px-0 dark:py-0 md:px-5">
                  <BlockEditor
                    key={selected.id}
                    page={selected}
                    editable={false}
                    chrome={false}
                    mentionCandidates={mentionCandidates}
                  />
                </div>
              </article>
            ) : null}
          </div>
        </div>
      ) : layout === "cards" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
          <div
            className={cn(
              "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
              density === "compact" ? "gap-2" : "gap-3"
            )}
          >
            {pages.map((page) => (
              <Link
                key={page.id}
                href={`/home/p/${page.id}`}
                prefetch={true}
                onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
                onClick={() => useUiStore.getState().closeMenu()}
                className={cn(
                  "panel group flex flex-col transition hover:border-[var(--accent)]",
                  density === "compact" ? "gap-1 px-3 py-2" : "gap-2 px-4 py-3.5"
                )}
              >
                <div className="flex items-start gap-2">
                  <WorkspaceIcon icon={page.icon} fallback="📄" size={16} />
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                    {page.title || t("untitled")}
                  </p>
                  {page.favorite ? (
                    <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                  ) : null}
                </div>
                {density === "comfortable" ? (
                  <p className="line-clamp-4 text-[12px] leading-relaxed text-muted">
                    {excerpt(page, 220) || t("empty_note")}
                  </p>
                ) : null}
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
              href={`/home/p/${page.id}`}
              prefetch={true}
              onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
              onClick={() => useUiStore.getState().closeMenu()}
              className={cn(
                "flex items-center gap-3 border-b border-[var(--border)] px-5 transition hover:bg-[var(--surface-hover)] sm:px-8",
                density === "compact" ? "py-1.5" : "py-3.5"
              )}
            >
              <WorkspaceIcon icon={page.icon} fallback="📄" size={16} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-ink">
                    {page.title || t("untitled")}
                  </span>
                  {page.favorite ? (
                    <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                  ) : null}
                </span>
                {density === "comfortable" ? (
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {excerpt(page, 160) || t("empty_note")}
                  </span>
                ) : null}
              </span>
              <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">
                {formatRelative(page.updatedAt, language)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRowContent({ page, density }: { page: Page; density: "comfortable" | "compact" }) {
  const { t, language } = useTranslation();
  return (
    <>
      <div className="flex items-center gap-2">
        <WorkspaceIcon icon={page.icon} fallback="📄" size={14} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {page.title || t("untitled")}
        </span>
        {page.favorite ? (
          <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
        ) : null}
      </div>
      {density === "comfortable" ? (
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
          {excerpt(page, 140) || t("empty_note")}
        </p>
      ) : null}
      <p className="mt-1 text-[10.5px] text-faint">{formatRelative(page.updatedAt, language)}</p>
    </>
  );
}

function NoteMeta({ page, className }: { page: Page; className?: string }) {
  const { t, language } = useTranslation();
  const { notebooks } = useWorkspace();
  const notebook = notebooks.find((candidate) => candidate.id === page.notebookId);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint", className)}>
      {notebook ? (
        <span>
          <span className="inline-flex items-center gap-1">
            <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={12} /> {notebook.name}
          </span>
        </span>
      ) : null}
      <span>{t("updated")} {formatRelative(page.updatedAt, language)}</span>
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

function excerpt(page: Page, length: number): string {
  const text = page.plainText.replace(/\s+/g, " ").trim();
  const withoutTitle = text.startsWith(page.title) ? text.slice(page.title.length).trim() : text;
  return withoutTitle.slice(0, length);
}
