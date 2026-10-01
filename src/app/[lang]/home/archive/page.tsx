"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Database,
  FileText,
  Folder,
  Notebook as NotebookGlyph,
  NotebookText,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useTranslation } from "@/lib/i18n/translations";
import type { Notebook, Page } from "@/types/models";

type Filter = "all" | "pages" | "notebooks" | "notes";
type ArchiveKind = "page" | "notebook" | "note" | "subnote";

interface ArchiveRow {
  key: string;
  id: string;
  kind: ArchiveKind;
  title: string;
  icon?: string | null;
  place: string | null;
  href: string;
  badgeLabel: string;
  openLabel: string;
  unarchive: () => Promise<void>;
  trash: () => Promise<void>;
}

export default function ArchivePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    archivedNotebooks,
    archivedPages,
    notebooks,
    pages,
    adapter,
  } = useWorkspace();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const untitled = t("untitled");

  const rows = useMemo<ArchiveRow[]>(() => {
    const allNotebooks = new Map<string, Notebook>();
    for (const nb of notebooks) allNotebooks.set(nb.id, nb);
    for (const nb of archivedNotebooks) allNotebooks.set(nb.id, nb);

    const pathOf = (notebookId: string | null | undefined): string | null => {
      const names: string[] = [];
      let cursor = notebookId ? allNotebooks.get(notebookId) : undefined;
      let guard = 0;
      while (cursor && guard < 12) {
        names.unshift(cursor.name || untitled);
        cursor = cursor.parentId ? allNotebooks.get(cursor.parentId) : undefined;
        guard += 1;
      }
      return names.length ? names.join(" › ") : null;
    };

    const out: ArchiveRow[] = [];

    for (const nb of archivedNotebooks) {
      const isRootPage = !nb.parentId;
      out.push({
        key: `notebook:${nb.id}`,
        id: nb.id,
        kind: isRootPage ? "page" : "notebook",
        title: nb.name || untitled,
        icon: nb.emoji,
        place: pathOf(nb.parentId),
        href: `/home/n/${nb.id}`,
        badgeLabel: isRootPage ? t("trash_kind_page") : t("trash_kind_notebook"),
        openLabel: isRootPage ? t("archived_open_page") : t("archived_open_notebook"),
        unarchive: async () => {
          await adapter.updateNotebook(nb.id, { archived: false });
          toast.success(isRootPage ? t("page_unarchived") : t("notebook_unarchived"));
        },
        trash: async () => {
          const confirmText = isRootPage
            ? t("delete_page_confirm", { name: nb.name || untitled })
            : t("delete_notebook_confirm", { name: nb.name || untitled });
          if (!window.confirm(confirmText)) return;
          await adapter.deleteNotebook(nb.id);
          toast.success(isRootPage ? t("page_deleted") : t("notebook_deleted"));
        },
      });
    }

    for (const page of archivedPages) {
      const isSubnote = Boolean(page.parentPageId);
      out.push({
        key: `page:${page.id}`,
        id: page.id,
        kind: isSubnote ? "subnote" : "note",
        title: page.title || untitled,
        icon: page.icon,
        place: pathOf(page.notebookId),
        href: `/home/p/${page.id}`,
        badgeLabel: isSubnote ? t("trash_kind_subnote") : t("trash_kind_note"),
        openLabel: t("archived_open_note"),
        unarchive: async () => {
          await adapter.updatePage(page.id, { archived: false });
          toast.success(t("page_unarchived"));
        },
        trash: async () => {
          await adapter.trashPage(page.id);
          toast.success(t("moved_to_trash"), {
            action: {
              label: t("undo_action"),
              onClick: () => adapter.restorePage(page.id),
            },
          });
        },
      });
    }

    return out;
  }, [archivedNotebooks, archivedPages, notebooks, adapter, t, untitled]);

  const counts = useMemo(() => {
    let pagesCount = 0;
    let notebooksCount = 0;
    let notesCount = 0;
    for (const row of rows) {
      if (row.kind === "page") pagesCount++;
      else if (row.kind === "notebook") notebooksCount++;
      else if (row.kind === "note" || row.kind === "subnote") notesCount++;
    }
    return {
      all: rows.length,
      pages: pagesCount,
      notebooks: notebooksCount,
      notes: notesCount,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "pages" && row.kind !== "page") return false;
      if (filter === "notebooks" && row.kind !== "notebook") return false;
      if (filter === "notes" && row.kind !== "note" && row.kind !== "subnote") return false;
      if (!q) return true;
      const titleMatch = row.title.toLowerCase().includes(q);
      const placeMatch = row.place?.toLowerCase().includes(q) ?? false;
      return titleMatch || placeMatch;
    });
  }, [rows, filter, query]);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pb-24 pt-8 sm:px-6 md:px-8 xl:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl 4xl:max-w-[96rem]">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{t("archived_title")}</h1>
        <p className="text-xs text-muted sm:text-sm">{t("archived_subtitle")}</p>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              filter === "all"
                ? "bg-[var(--surface)] text-ink shadow-sm ring-1 ring-[var(--border)]"
                : "text-muted hover:text-ink"
            )}
          >
            {t("archived_filter_all")} ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter("pages")}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              filter === "pages"
                ? "bg-[var(--surface)] text-ink shadow-sm ring-1 ring-[var(--border)]"
                : "text-muted hover:text-ink"
            )}
          >
            {t("archived_filter_pages")} ({counts.pages})
          </button>
          <button
            type="button"
            onClick={() => setFilter("notebooks")}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              filter === "notebooks"
                ? "bg-[var(--surface)] text-ink shadow-sm ring-1 ring-[var(--border)]"
                : "text-muted hover:text-ink"
            )}
          >
            {t("archived_filter_notebooks")} ({counts.notebooks})
          </button>
          <button
            type="button"
            onClick={() => setFilter("notes")}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              filter === "notes"
                ? "bg-[var(--surface)] text-ink shadow-sm ring-1 ring-[var(--border)]"
                : "text-muted hover:text-ink"
            )}
          >
            {t("archived_filter_notes")} ({counts.notes})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("archived_search_placeholder")}
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-7 text-xs text-ink placeholder:text-faint focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {filteredRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
            <Archive className="mb-3 size-10 text-faint" />
            <h3 className="text-sm font-semibold text-ink">{t("archived_empty_title")}</h3>
            <p className="mt-1 max-w-sm text-xs text-muted">{t("archived_empty_desc")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filteredRows.map((row) => (
              <li
                key={row.key}
                className="group flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[var(--surface-hover)] transition-colors"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)]">
                    <WorkspaceIcon
                      icon={row.icon}
                      fallback={row.kind === "page" ? "📄" : row.kind === "notebook" ? "📓" : "📝"}
                      size={18}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={row.href}
                        className="truncate text-sm font-medium text-ink hover:underline"
                      >
                        {row.title}
                      </Link>
                      <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {row.badgeLabel}
                      </span>
                    </div>
                    {row.place ? (
                      <p className="truncate text-xs text-faint">{row.place}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  <Link
                    href={row.href}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-muted hover:bg-[var(--surface-2)] hover:text-ink transition"
                  >
                    <ArrowUpRight className="size-3" />
                    <span>{row.openLabel}</span>
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === row.key}
                    onClick={async () => {
                      setBusy(row.key);
                      try {
                        await row.unarchive();
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="h-7 text-xs"
                  >
                    <RotateCcw className="mr-1 size-3" />
                    {t("unarchive")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === row.key}
                    onClick={async () => {
                      setBusy(row.key);
                      try {
                        await row.trash();
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="h-7 px-2 text-faint hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    aria-label={t("delete_page")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
