"use client";

import { Link } from "@/lib/i18n/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { TrashCanIcon } from "@/lib/icons/trash-icon";
import { localizeErrorMessage, useTranslation } from "@/lib/i18n/translations";

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

  // O que foi para a lixeira junto com um caderno aparece dentro dele: volta ou
  // sai junto com o caderno.
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

  const renderSection = (title: string, rows: TrashRow[]): ReactNode => {
    if (!rows.length) return null;
    return (
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          {title} ({rows.length})
        </div>
        {rows.map((row, index) => {
          const isItemBusy = emptying || activeActionId === row.id;
          return (
            <div
              key={row.id}
              className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
              style={index < rows.length - 1 ? { borderBottom: "1px solid var(--border)" } : undefined}
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)]">
                <WorkspaceIcon icon={row.icon} fallback={row.fallbackIcon} variant="list" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                  {row.title || t("untitled")}
                </p>
                <p className="mt-0.5 text-[11.5px] text-faint">
                  {t("deleted_time", { time: formatRelative(row.deletedAt, language) })} · {getExpiresText(row.deletedAt)}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  disabled={isItemBusy}
                  onClick={() => void runAction(row.id, row.restore, row.restoredMessage, t("restore_failed"))}
                >
                  <RotateCcw /> {t("undo_action")}
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

  const notebookSection: TrashRow[] = notebookRows.map(({ notebook, contents }) => ({
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
  }));

  const pageSection: TrashRow[] = visiblePages.map((page) => ({
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
  }));

  const databaseSection: TrashRow[] = visibleDatabases.map((database) => ({
    id: database.id,
    icon: database.icon,
    fallbackIcon: "🗂️",
    title: database.name,
    deletedAt: database.deletedAt,
    restore: () => adapter.restoreDatabase(database.id),
    restoredMessage: t("database_restored"),
    purge: () => adapter.purgeDatabase(database.id),
    purgeLabel: t("delete_permanently"),
    purgedMessage: t("database_purged"),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl px-5 py-10 md:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9.5 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-muted shadow-sm transition-colors">
              <TrashCanIcon className="size-5 text-muted" />
            </span>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">{t("trash")}</h1>
              <p className="mt-0.5 text-[12px] text-faint">
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
            className="w-full shrink-0 rounded-full px-3.5 sm:w-auto"
            disabled={emptying || activeActionId !== null}
            onClick={() => void emptyTrash()}
          >
            <TrashCanIcon className="size-3.5" />
            {emptying ? t("emptying_trash") : t("empty_trash_button")}
          </Button>
        ) : null}
      </div>

      <div className="mt-8 space-y-6">
        {renderSection(t("notebooks"), notebookSection)}
        {renderSection(t("pages_plural"), pageSection)}
        {renderSection(t("wizard_summary_databases"), databaseSection)}

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
