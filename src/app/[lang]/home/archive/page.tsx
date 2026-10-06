"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Check,
  Lock,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useTranslation } from "@/lib/i18n/translations";
import {
  planUnarchiveNotebookTree,
  planUnarchivePageTree,
  unarchiveNotebookTree,
  unarchivePageTree,
  type ArchivePlan,
} from "@/lib/data/archive";
import { usePlanGates, type PlanGate } from "@/lib/plans/gates";
import { usePlanT } from "@/lib/plans/i18n";
import { GateTooltip, PlanNotice } from "@/components/plans/plan-lock";
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
  plan: ArchivePlan | null;
  unarchive: () => Promise<void>;
  trash: () => Promise<void>;
}

export default function ArchivePage() {
  const { t } = useTranslation();
  const { tp } = usePlanT();
  const gates = usePlanGates();
  const archiveFeature = gates.feature("archive");
  const {
    archivedNotebooks,
    archivedPages,
    notebooks,
    livePages,
    adapter,
  } = useWorkspace();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const untitled = t("untitled");

  const rows = useMemo<ArchiveRow[]>(() => {
    const allNotebooks = new Map<string, Notebook>();
    for (const nb of notebooks) allNotebooks.set(nb.id, nb);
    for (const nb of archivedNotebooks) allNotebooks.set(nb.id, nb);

    const allPagesMap = new Map<string, Page>();
    for (const p of livePages) allPagesMap.set(p.id, p);
    for (const p of archivedPages) allPagesMap.set(p.id, p);

    const pathOf = (notebookId: string | null | undefined): string | null => {
      const names: string[] = [];
      let cursor = notebookId ? allNotebooks.get(notebookId) : undefined;
      let guard = 0;
      while (cursor && guard < 12) {
        names.unshift(cursor.name || untitled);
        const nextId = cursor.parentId ?? cursor.archivedFromParentId;
        cursor = nextId ? allNotebooks.get(nextId) : undefined;
        guard += 1;
      }
      return names.length ? names.join(" › ") : null;
    };

    const out: ArchiveRow[] = [];

    for (const nb of archivedNotebooks) {
      const parentId = nb.parentId ?? nb.archivedFromParentId;
      const isRootPage = !parentId;
      out.push({
        key: `notebook:${nb.id}`,
        id: nb.id,
        kind: isRootPage ? "page" : "notebook",
        title: nb.name || untitled,
        icon: nb.emoji,
        place: pathOf(parentId),
        href: `/home/n/${nb.id}`,
        badgeLabel: isRootPage ? t("trash_kind_page") : t("trash_kind_notebook"),
        openLabel: isRootPage ? t("archived_open_page") : t("archived_open_notebook"),
        plan: planUnarchiveNotebookTree(
          [...notebooks, ...archivedNotebooks],
          [...livePages, ...archivedPages],
          nb.id
        ),
        unarchive: async () => {
          const result = await unarchiveNotebookTree(
            adapter,
            [...notebooks, ...archivedNotebooks],
            [...livePages, ...archivedPages],
            nb.id
          );
          toast.success(result.isRootPage ? t("root_page_unarchived") : t("notebook_unarchived"));
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
      const parentPageId = page.parentPageId ?? page.archivedFromParentPageId;
      const notebookId = page.notebookId ?? page.archivedFromNotebookId;
      const isSubnote = Boolean(parentPageId);
      const parentPage = parentPageId ? allPagesMap.get(parentPageId) : undefined;
      const nbPlace = pathOf(notebookId);
      const place = parentPage
        ? nbPlace
          ? `${nbPlace} › ${parentPage.title || untitled}`
          : parentPage.title || untitled
        : nbPlace;

      out.push({
        key: `page:${page.id}`,
        id: page.id,
        kind: isSubnote ? "subnote" : "note",
        title: page.title || untitled,
        icon: page.icon,
        place,
        href: `/home/p/${page.id}`,
        badgeLabel: isSubnote ? t("trash_kind_subnote") : t("trash_kind_note"),
        openLabel: t("archived_open_note"),
        plan: planUnarchivePageTree([...livePages, ...archivedPages], page.id),
        unarchive: async () => {
          await unarchivePageTree(
            adapter,
            [...livePages, ...archivedPages],
            page.id
          );
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
  }, [archivedNotebooks, archivedPages, notebooks, livePages, adapter, t, untitled]);

  const unarchiveGates = useMemo(() => {
    const map = new Map<string, PlanGate>();
    for (const row of rows) map.set(row.key, gates.archive(row.plan));
    return map;
  }, [gates, rows]);

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

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.key)), [rows, selected]);
  const selecting = selectedRows.length > 0;

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runMany = async (mode: "unarchive" | "trash") => {
    const targets = selectedRows;
    if (!targets.length) return;
    if (mode === "trash") {
      const unit = targets.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items");
      if (!window.confirm(t("trash_confirm", { count: targets.length, unit, label: `${targets.length} ${unit}` }))) return;
    }
    setBusy("bulk");
    const done: string[] = [];
    for (const row of targets) {
      try {
        if (mode === "unarchive") {
          await row.unarchive();
        } else {
          await row.trash();
        }
        done.push(row.key);
      } catch {}
    }
    setSelected((current) => {
      const next = new Set(current);
      done.forEach((key) => next.delete(key));
      return next;
    });
    setBusy(null);
    if (done.length && mode === "unarchive") {
      toast.success(t("trash_restored_many", { count: done.length }));
    }
  };

  const filterOptions = (
    [
      { id: "all", label: t("archived_filter_all"), count: counts.all },
      { id: "pages", label: t("archived_filter_pages"), count: counts.pages },
      { id: "notebooks", label: t("archived_filter_notebooks"), count: counts.notebooks },
      { id: "notes", label: t("archived_filter_notes"), count: counts.notes },
    ] as { id: Filter; label: string; count: number }[]
  ).filter((opt) => opt.id === "all" || opt.count > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-28 pt-6 sm:px-6 md:px-8 md:pt-10 xl:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl 4xl:max-w-[96rem]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.75rem]">
            {t("archived_title")}
          </h1>
          <p className="mt-1.5 text-xs text-muted sm:text-[13.5px]">
            {t("archived_subtitle")}
          </p>
        </div>
      </header>

      {archiveFeature.allowed ? null : (
        <PlanNotice
          className="mt-5"
          title={tp("archive_locked_title")}
          body={tp("archive_locked_body")}
        />
      )}

      {rows.length > 0 ? (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {filterOptions.length > 1 ? (
              <div
                role="tablist"
                className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-full bg-[var(--surface-2)] p-1 [scrollbar-width:none]"
              >
                {filterOptions.map((opt) => {
                  const active = filter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(opt.id)}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition",
                        active
                          ? "bg-[var(--surface)] text-ink shadow-[0_1px_2px_rgba(15,44,76,0.12)]"
                          : "text-muted hover:text-ink"
                      )}
                    >
                      {opt.label}
                      <span className="tabular-nums text-faint">({opt.count})</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="relative w-full sm:w-64 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("archived_search_placeholder")}
                className="h-9 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-9 pr-8 text-[13px] text-ink placeholder:text-faint transition focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                  aria-label={t("clear_filter")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {filteredRows.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
              <ul className="divide-y divide-[var(--border)]">
                {filteredRows.map((row) => {
                  const isSelected = selected.has(row.key);
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        "group flex flex-col gap-3 p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-3",
                        isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={t("trash_select_item", { name: row.title })}
                          onClick={() => toggle(row.key)}
                          className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-2)] outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)]"
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center transition-opacity",
                              isSelected || selecting ? "opacity-0" : "group-hover:opacity-0"
                            )}
                          >
                            <WorkspaceIcon
                              icon={row.icon}
                              fallback={row.kind === "page" ? "📄" : row.kind === "notebook" ? "📓" : "📝"}
                              size={18}
                            />
                          </span>
                          <span
                            className={cn(
                              "absolute inset-0 flex items-center justify-center transition-opacity",
                              isSelected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-[18px] items-center justify-center rounded-[5px] transition",
                                isSelected
                                  ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                  : "bg-[var(--surface)] shadow-[inset_0_0_0_1.5px_var(--border-strong)]"
                              )}
                            >
                              {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                            </span>
                          </span>
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={row.href}
                              className="truncate text-[13.5px] font-medium text-ink hover:underline sm:text-sm"
                            >
                              {row.title}
                            </Link>
                            <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                              {row.badgeLabel}
                            </span>
                          </div>
                          {row.place ? (
                            <p className="mt-0.5 truncate text-[11.5px] text-faint sm:text-xs">
                              {row.place}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex w-full items-center justify-between gap-1.5 border-t border-[var(--border)]/40 pt-2.5 sm:w-auto sm:border-0 sm:pt-0">
                        <Link
                          href={row.href}
                          className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs font-medium text-ink transition hover:bg-[var(--surface-hover)] active:scale-[0.98] sm:h-7 sm:flex-initial sm:rounded-md sm:bg-[var(--surface)] sm:px-2.5 sm:text-muted sm:hover:bg-[var(--surface-2)] sm:hover:text-ink sm:active:scale-100"
                        >
                          <ArrowUpRight className="size-3.5 shrink-0 sm:size-3" />
                          <span className="truncate">{row.openLabel}</span>
                        </Link>
                        <GateTooltip gate={unarchiveGates.get(row.key) ?? archiveFeature}>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy === row.key || !(unarchiveGates.get(row.key) ?? archiveFeature).allowed}
                            onClick={async () => {
                              setBusy(row.key);
                              try {
                                await row.unarchive();
                              } finally {
                                setBusy(null);
                              }
                            }}
                            className="h-8 flex-1 text-xs active:scale-[0.98] sm:h-7 sm:flex-initial sm:active:scale-100"
                          >
                            {(unarchiveGates.get(row.key) ?? archiveFeature).allowed ? (
                              <RotateCcw className="mr-1 size-3.5 shrink-0 sm:size-3" />
                            ) : (
                              <Lock className="mr-1 size-3.5 shrink-0 sm:size-3" />
                            )}
                            <span className="truncate">{t("unarchive")}</span>
                          </Button>
                        </GateTooltip>
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
                          className="size-8 shrink-0 p-0 text-faint hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] active:scale-[0.98] sm:h-7 sm:w-auto sm:px-2 sm:active:scale-100"
                          aria-label={t("delete_page")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                title={t("nothing_found")}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    {t("clear_filter")}
                  </Button>
                }
              />
            </div>
          )}
        </>
      ) : (
        <div className="mt-10">
          <EmptyState
            icon={<Archive className="size-6 text-muted" />}
            title={t("archived_empty_title")}
            description={t("archived_empty_desc")}
            action={
              <Link href="/home" className="text-[12.5px] text-[var(--accent)] hover:underline">
                {t("back_to_home")}
              </Link>
            }
          />
        </div>
      )}

      {selecting ? (
        <div className="pointer-events-none sticky bottom-24 z-20 mt-6 flex justify-center md:bottom-6">
          <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[var(--text)] p-1.5 ps-4 text-[13px] text-[var(--surface)] shadow-[0_16px_40px_-14px_rgba(4,10,20,0.6)] [scrollbar-width:none]">
            <span className="me-1.5 shrink-0 font-medium tabular-nums">
              {t("trash_selected", { count: selectedRows.length })}
            </span>
            {selectedRows.length < filteredRows.length ? (
              <button
                type="button"
                onClick={() => setSelected(new Set(filteredRows.map((r) => r.key)))}
                disabled={busy !== null}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium transition hover:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] disabled:opacity-50"
              >
                {t("select_all")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== null || !archiveFeature.allowed}
              title={archiveFeature.reason ?? undefined}
              onClick={() => void runMany("unarchive")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium transition hover:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] disabled:opacity-50"
            >
              {archiveFeature.allowed ? <RotateCcw className="size-3.5" /> : <Lock className="size-3.5" />}
              <span className="hidden sm:inline">{t("unarchive")}</span>
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runMany("trash")}
              aria-label={t("delete_page")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">{t("delete_page")}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label={t("cancel")}
              className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

