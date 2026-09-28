"use client";

import { Link } from "@/lib/i18n/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState, Badge } from "@/components/ui/primitives";
import { formatRelative, cn } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { TrashCanIcon } from "@/lib/icons/trash-icon";
import { localizeErrorMessage, useTranslation } from "@/lib/i18n/translations";
import { isPlanningName } from "@/components/database/database-i18n";

interface TrashRow {
  id: string;
  icon: string | null | undefined;
  fallbackIcon: string;
  title: string;
  deletedAt: number | null;
  detail?: string;
  restore: () => Promise<void>;
  restoredMessage: string;
  purge: () => Promise<void>;
  purgeLabel: string;
  purgedMessage: string;
}

export default function TrashPage() {
  const { t, language } = useTranslation();
  const { trashedPages, trashedDatabases = [], trashedNotebooks = [], adapter } = useWorkspace();
  const [emptying, setEmptying] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "notebooks" | "pages" | "databases">("all");

  const { notebookRows, visiblePages, visibleDatabases } = useMemo(() => {
    const trashedNotebookIds = new Set(trashedNotebooks.map((notebook) => notebook.id));
    const insideTrashedNotebook = (trashedWith: string | null | undefined) =>
      Boolean(trashedWith && trashedNotebookIds.has(trashedWith));

    const contents = new Map<string, number>();
    const count = (trashedWith: string | null | undefined) => {
      if (!trashedWith) return;
      contents.set(trashedWith, (contents.get(trashedWith) ?? 0) + 1);
    };
    trashedNotebooks.forEach((notebook) => count(notebook.trashedWith));
    trashedPages.forEach((page) => count(page.trashedWith));
    trashedDatabases.forEach((database) => count(database.trashedWith));

    return {
      notebookRows: trashedNotebooks
        .filter((notebook) => !insideTrashedNotebook(notebook.trashedWith))
        .map((notebook) => ({ notebook, contents: contents.get(notebook.id) ?? 0 })),
      visiblePages: trashedPages.filter((page) => !insideTrashedNotebook(page.trashedWith)),
      visibleDatabases: trashedDatabases.filter((database) => !insideTrashedNotebook(database.trashedWith)),
    };
  }, [trashedDatabases, trashedNotebooks, trashedPages]);

  const totalTrashedCount =
    trashedPages.length + trashedDatabases.length + trashedNotebooks.length;
  const dayUnit = TRASH_RETENTION_DAYS === 1 ? t("unit_day_singular") : t("unit_day_plural");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const expiresOn = (deletedAt: number | null) =>
    new Date((deletedAt ?? 0) + TRASH_RETENTION_DAYS * 86_400_000).toLocaleDateString(
      language === "pt" ? "pt-BR" : language
    );

  const getRemainingDays = (deletedAt: number | null) => {
    if (!deletedAt) return TRASH_RETENTION_DAYS;
    const expiresAt = deletedAt + TRASH_RETENTION_DAYS * 86_400_000;
    const diff = expiresAt - now;
    return Math.max(0, Math.ceil(diff / 86_400_000));
  };

  const getExpiresText = (deletedAt: number | null) => {
    const days = getRemainingDays(deletedAt);
    const date = expiresOn(deletedAt);
    const itemDayUnit = days === 1 ? t("unit_day_singular") : t("unit_day_plural");
    if (days <= 0) {
      return `${t("trash_days_left_zero")} · ${t("expires_until", { date })}`;
    }
    if (days === 1) {
      return `${t("trash_days_left_single", { days, dayUnit: itemDayUnit })} · ${t("expires_until", { date })}`;
    }
    return `${t("trash_days_left_plural", { days, dayUnit: itemDayUnit })} · ${t("expires_until", { date })}`;
  };

  const errorText = (error: unknown, fallback: string) =>
    localizeErrorMessage(error instanceof Error ? error.message : null, t) || fallback;

  const emptyTrash = async () => {
    if (!totalTrashedCount) return;
    const label = `${totalTrashedCount} ${totalTrashedCount === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}`;
    if (
      !window.confirm(
        t("trash_confirm", {
          count: totalTrashedCount,
          unit: totalTrashedCount === 1 ? t("wizard_unit_item") : t("wizard_unit_items"),
          label,
        })
      )
    ) {
      return;
    }
    setEmptying(true);
    try {
      await adapter.emptyTrash();
      toast.success(t("trash_emptied_success"));
    } catch (error) {
      toast.error(errorText(error, t("trash_empty_failed")));
    } finally {
      setEmptying(false);
    }
  };

  const runAction = async (id: string, action: () => Promise<void>, success: string, failure: string) => {
    setActiveActionId(id);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorText(error, failure));
    } finally {
      setActiveActionId(null);
    }
  };

  const notebookSection: TrashRow[] = useMemo(
    () =>
      notebookRows.map(({ notebook, contents }) => ({
        id: notebook.id,
        icon: notebook.emoji,
        fallbackIcon: "📁",
        title: notebook.name,
        deletedAt: notebook.deletedAt ?? null,
        detail: contents > 0 ? t("notebook_trash_contents", { count: contents }) : undefined,
        restore: () => adapter.restoreNotebook(notebook.id),
        restoredMessage: t("notebook_restored"),
        purge: () => adapter.purgeNotebook(notebook.id),
        purgeLabel: t("delete_permanently"),
        purgedMessage: t("notebook_purged"),
      })),
    [adapter, notebookRows, t]
  );

  const pageSection: TrashRow[] = useMemo(
    () =>
      visiblePages.map((page) => ({
        id: page.id,
        icon: page.icon,
        fallbackIcon: "📄",
        title: page.title,
        deletedAt: page.deletedAt,
        restore: () => adapter.restorePage(page.id),
        restoredMessage: t("page_restored"),
        purge: () => adapter.purgePage(page.id),
        purgeLabel: t("delete_permanently"),
        purgedMessage: t("page_purged"),
      })),
    [adapter, visiblePages, t]
  );

  const databaseSection: TrashRow[] = useMemo(
    () =>
      visibleDatabases.map((database) => ({
        id: database.id,
        icon: database.icon,
        fallbackIcon: "🗂️",
        title: isPlanningName(database.name) ? t("planning") : (database.name || t("untitled")),
        deletedAt: database.deletedAt,
        restore: () => adapter.restoreDatabase(database.id),
        restoredMessage: t("database_restored"),
        purge: () => adapter.purgeDatabase(database.id),
        purgeLabel: t("delete_permanently"),
        purgedMessage: t("database_purged"),
      })),
    [adapter, visibleDatabases, t]
  );

  const query = searchQuery.trim().toLowerCase();

  const filteredNotebooks = useMemo(
    () =>
      notebookSection.filter(
        (row) =>
          !query ||
          row.title.toLowerCase().includes(query) ||
          Boolean(row.detail && row.detail.toLowerCase().includes(query))
      ),
    [notebookSection, query]
  );

  const filteredPages = useMemo(
    () =>
      pageSection.filter(
        (row) =>
          !query ||
          row.title.toLowerCase().includes(query) ||
          Boolean(row.detail && row.detail.toLowerCase().includes(query))
      ),
    [pageSection, query]
  );

  const filteredDatabases = useMemo(
    () =>
      databaseSection.filter(
        (row) =>
          !query ||
          row.title.toLowerCase().includes(query) ||
          Boolean(row.detail && row.detail.toLowerCase().includes(query))
      ),
    [databaseSection, query]
  );

  const filteredTotalCount =
    filteredNotebooks.length + filteredPages.length + filteredDatabases.length;

  const renderSection = (title: string, rows: TrashRow[]): ReactNode => {
    if (!rows.length) return null;
    return (
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] transition-all">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <span>
            {title} ({rows.length})
          </span>
          <div className="hidden lg:flex items-center gap-10 pe-24 text-[10.5px] font-medium tracking-normal text-muted">
            <span className="w-32 text-start">{t("updated")}</span>
            <span className="w-44 text-start">{t("trash")}</span>
          </div>
        </div>
        {rows.map((row, index) => {
          const isItemBusy = emptying || activeActionId === row.id;
          const remainingDays = getRemainingDays(row.deletedAt);
          const isUrgent = remainingDays <= 3;
          const isWarning = remainingDays > 3 && remainingDays <= 7;

          return (
            <div
              key={row.id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
              style={index < rows.length - 1 ? { borderBottom: "1px solid var(--border)" } : undefined}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-ink transition-transform group-hover:scale-105">
                  <WorkspaceIcon icon={row.icon} fallback={row.fallbackIcon} variant="list" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                    {row.title || t("untitled")}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-faint sm:hidden">
                    <span>{t("deleted_time", { time: formatRelative(row.deletedAt, language) })}</span>
                    <span>·</span>
                    <span className={cn(isUrgent ? "text-red-500 font-medium" : isWarning ? "text-amber-500" : "")}>
                      {getExpiresText(row.deletedAt)}
                    </span>
                    {row.detail ? (
                      <>
                        <span>·</span>
                        <span>{row.detail}</span>
                      </>
                    ) : null}
                  </div>
                  {row.detail ? (
                    <p className="mt-0.5 hidden sm:block text-[11.5px] text-faint truncate">
                      {row.detail}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-4 shrink-0">
                <div className="w-32 lg:w-36 text-start">
                  <span className="text-[12px] text-muted">
                    {formatRelative(row.deletedAt, language)}
                  </span>
                </div>

                <div className="w-40 lg:w-48 text-start">
                  <Badge
                    tone={isUrgent ? "danger" : isWarning ? "warning" : "neutral"}
                    className="max-w-full truncate text-[11px] px-2 py-0.5"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        isUrgent ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                      )}
                    />
                    <span className="truncate">{getExpiresText(row.deletedAt)}</span>
                  </Badge>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-1.5 self-end sm:self-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  disabled={isItemBusy}
                  onClick={() => void runAction(row.id, row.restore, row.restoredMessage, t("restore_failed"))}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="inline">{t("undo_action")}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full hover:bg-red-50 hover:text-[var(--danger)] dark:hover:bg-red-950/40"
                  aria-label={row.purgeLabel}
                  disabled={isItemBusy}
                  onClick={() => {
                    if (!window.confirm(t("purge_confirm", { name: row.title || t("untitled") }))) return;
                    void runAction(row.id, row.purge, row.purgedMessage, t("purge_failed"));
                  }}
                >
                  <TrashCanIcon className="size-3.5 text-[var(--danger)]" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] px-4 sm:px-6 md:px-8 xl:px-10 py-6 md:py-9 transition-all">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-muted shadow-sm transition-colors">
              <TrashCanIcon className="size-5 text-muted" />
            </span>
            <div>
              <h1 className="text-[22px] sm:text-[24px] lg:text-[26px] font-semibold tracking-[-0.025em] text-ink">
                {t("trash")}
              </h1>
              <p className="mt-0.5 text-[12px] sm:text-[12.5px] text-faint">
                {totalTrashedCount
                  ? totalTrashedCount === 1
                    ? t("trash_items_retention_single", {
                        count: totalTrashedCount,
                        unit: t("wizard_unit_item"),
                        days: TRASH_RETENTION_DAYS,
                        dayUnit,
                      })
                    : t("trash_items_retention_plural", {
                        count: totalTrashedCount,
                        unit: t("wizard_unit_items"),
                        days: TRASH_RETENTION_DAYS,
                        dayUnit,
                      })
                  : t(TRASH_RETENTION_DAYS === 1 ? "trash_default_hint_single" : "trash_default_hint", {
                      days: TRASH_RETENTION_DAYS,
                      dayUnit,
                    })}
              </p>
            </div>
          </div>
        </div>

        {totalTrashedCount ? (
          <Button
            variant="danger"
            size="sm"
            className="w-full shrink-0 rounded-full px-4 sm:w-auto self-start sm:self-center"
            disabled={emptying || activeActionId !== null}
            onClick={() => void emptyTrash()}
          >
            <TrashCanIcon className="size-3.5" />
            {emptying ? t("emptying_trash") : t("empty_trash_button")}
          </Button>
        ) : null}
      </div>

      {totalTrashedCount > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-6">
            <button
              type="button"
              onClick={() => setSelectedFilter("all")}
              className={cn(
                "flex flex-col justify-between rounded-[var(--radius-lg)] border p-4 text-start transition-all cursor-pointer",
                selectedFilter === "all"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted">{t("show_all")}</span>
                <TrashCanIcon className="size-4 text-muted" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] md:text-[24px] font-semibold text-ink tabular-nums">
                  {totalTrashedCount}
                </span>
                <span className="text-[11px] text-faint">
                  {totalTrashedCount === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter("notebooks")}
              className={cn(
                "flex flex-col justify-between rounded-[var(--radius-lg)] border p-4 text-start transition-all cursor-pointer",
                selectedFilter === "notebooks"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted">{t("notebooks")}</span>
                <span className="text-[14px]">📁</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] md:text-[24px] font-semibold text-ink tabular-nums">
                  {notebookRows.length}
                </span>
                <span className="text-[11px] text-faint">
                  {t("notebooks")}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter("pages")}
              className={cn(
                "flex flex-col justify-between rounded-[var(--radius-lg)] border p-4 text-start transition-all cursor-pointer",
                selectedFilter === "pages"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted">{t("pages_plural")}</span>
                <span className="text-[14px]">📄</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] md:text-[24px] font-semibold text-ink tabular-nums">
                  {visiblePages.length}
                </span>
                <span className="text-[11px] text-faint">
                  {t("pages_plural")}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter("databases")}
              className={cn(
                "flex flex-col justify-between rounded-[var(--radius-lg)] border p-4 text-start transition-all cursor-pointer",
                selectedFilter === "databases"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted">{t("wizard_summary_databases")}</span>
                <span className="text-[14px]">🗂️</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] md:text-[24px] font-semibold text-ink tabular-nums">
                  {visibleDatabases.length}
                </span>
                <span className="text-[11px] text-faint">
                  {t("wizard_summary_databases")}
                </span>
              </div>
            </button>
          </div>

          <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("search_placeholder")}
                className="h-9.5 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] ps-9 pe-8 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <Button
                variant={selectedFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full text-[12px] shrink-0"
                onClick={() => setSelectedFilter("all")}
              >
                {t("show_all")} ({totalTrashedCount})
              </Button>
              <Button
                variant={selectedFilter === "notebooks" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full text-[12px] shrink-0"
                onClick={() => setSelectedFilter("notebooks")}
              >
                {t("notebooks")} ({notebookRows.length})
              </Button>
              <Button
                variant={selectedFilter === "pages" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full text-[12px] shrink-0"
                onClick={() => setSelectedFilter("pages")}
              >
                {t("pages_plural")} ({visiblePages.length})
              </Button>
              <Button
                variant={selectedFilter === "databases" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full text-[12px] shrink-0"
                onClick={() => setSelectedFilter("databases")}
              >
                {t("wizard_summary_databases")} ({visibleDatabases.length})
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <div className="mt-8 space-y-6">
        {totalTrashedCount > 0 && filteredTotalCount === 0 ? (
          <EmptyState
            title={t("nothing_found")}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedFilter("all");
                }}
              >
                {t("clear_filter")}
              </Button>
            }
          />
        ) : null}

        {(selectedFilter === "all" || selectedFilter === "notebooks") &&
          renderSection(t("notebooks"), filteredNotebooks)}

        {(selectedFilter === "all" || selectedFilter === "pages") &&
          renderSection(t("pages_plural"), filteredPages)}

        {(selectedFilter === "all" || selectedFilter === "databases") &&
          renderSection(t("wizard_summary_databases"), filteredDatabases)}

        {totalTrashedCount === 0 && (
          <EmptyState
            title={t("trash_empty_title")}
            description={t(TRASH_RETENTION_DAYS === 1 ? "trash_empty_desc_single" : "trash_empty_desc", {
              days: TRASH_RETENTION_DAYS,
              dayUnit,
            })}
            action={
              <Link href="/home" className="text-[12.5px] text-[var(--accent)] hover:underline">
                {t("back_to_home")}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
