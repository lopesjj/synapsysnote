"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { TrashCanIcon } from "@/lib/icons/trash-icon";
import { useTranslation } from "@/lib/i18n/translations";

export default function TrashPage() {
  const { t, language } = useTranslation();
  const { trashedPages, trashedDatabases = [], adapter } = useWorkspace();
  const [emptying, setEmptying] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const totalTrashedCount = trashedPages.length + trashedDatabases.length;
  const dayUnit = TRASH_RETENTION_DAYS === 1 ? t("unit_day_singular") : t("unit_day_plural");

  const expiresOn = (deletedAt: number | null) =>
    new Date((deletedAt ?? 0) + TRASH_RETENTION_DAYS * 86_400_000).toLocaleDateString(
      language === "pt" ? "pt-BR" : language
    );

  const getRemainingDays = (deletedAt: number | null) => {
    if (!deletedAt) return TRASH_RETENTION_DAYS;
    const expiresAt = deletedAt + TRASH_RETENTION_DAYS * 86_400_000;
    const diff = expiresAt - Date.now();
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
      toast.error(
        error instanceof Error ? error.message : t("trash_empty_failed")
      );
    } finally {
      setEmptying(false);
    }
  };

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
        {trashedPages.length > 0 && (
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {t("pages_plural")} ({trashedPages.length})
            </div>
            {trashedPages.map((page, index) => {
              const isItemBusy = emptying || activeActionId === page.id;
              return (
                <div
                  key={page.id}
                  className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
                  style={
                    index < trashedPages.length - 1
                      ? { borderBottom: "1px solid var(--border)" }
                      : undefined
                  }
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)]">
                    <WorkspaceIcon icon={page.icon} fallback="📄" variant="list" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                      {page.title || t("untitled")}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {t("deleted_time", { time: formatRelative(page.deletedAt, language) })} · {getExpiresText(page.deletedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                      disabled={isItemBusy}
                      onClick={async () => {
                        setActiveActionId(page.id);
                        try {
                          await adapter.restorePage(page.id);
                          toast.success(t("page_restored"));
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : t("restore_failed")
                          );
                        } finally {
                          setActiveActionId(null);
                        }
                      }}
                    >
                      <RotateCcw /> {t("undo_action")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full hover:bg-red-50 hover:text-[var(--danger)] dark:hover:bg-red-950/40"
                      aria-label={t("delete_page")}
                      disabled={isItemBusy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Excluir "${page.title || t("untitled")}" definitivamente? Esta ação não pode ser desfeita.`
                          )
                        ) {
                          return;
                        }
                        setActiveActionId(page.id);
                        try {
                          await adapter.purgePage(page.id);
                          toast.success(t("trash_emptied_success"));
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : t("trash_empty_failed")
                          );
                        } finally {
                          setActiveActionId(null);
                        }
                      }}
                    >
                      <TrashCanIcon className="size-3.5 text-[var(--danger)]" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {trashedDatabases.length > 0 && (
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {t("wizard_summary_databases")} ({trashedDatabases.length})
            </div>
            {trashedDatabases.map((db, index) => {
              const isItemBusy = emptying || activeActionId === db.id;
              return (
                <div
                  key={db.id}
                  className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
                  style={
                    index < trashedDatabases.length - 1
                      ? { borderBottom: "1px solid var(--border)" }
                      : undefined
                  }
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)]">
                    <WorkspaceIcon icon={db.icon} fallback="🗂️" variant="list" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                      {db.name || t("untitled")}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {t("deleted_time", { time: formatRelative(db.deletedAt, language) })} · {getExpiresText(db.deletedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                      disabled={isItemBusy}
                      onClick={async () => {
                        setActiveActionId(db.id);
                        try {
                          await adapter.updateDatabase(db.id, { deletedAt: null });
                          toast.success(t("database_restored"));
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : t("restore_failed")
                          );
                        } finally {
                          setActiveActionId(null);
                        }
                      }}
                    >
                      <RotateCcw /> {t("undo_action")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
