"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Database, FileText, Lock, Notebook as NotebookGlyph, NotebookText, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/i18n/navigation";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { cn, formatRelative, truncate } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { TrashCanIcon } from "@/lib/icons/trash-icon";
import { localizeErrorMessage, useTranslation } from "@/lib/i18n/translations";
import { intlLocale } from "@/lib/study/format";
import { isPlanningName } from "@/components/database/database-i18n";
import type { Notebook } from "@/types/models";
import { usePlanGates, type PlanGate, type PlanGates } from "@/lib/plans/gates";
import { notifyPlanError } from "@/lib/plans/client";

type Kind = "note" | "page" | "notebook" | "database";
type Filter = "all" | "notes" | "folders" | "databases";

const DAY_MS = 86_400_000;

interface TrashRow {
  key: string;
  kind: Kind;
  icon: string | null | undefined;
  title: string;
  place: string | null;
  detail: string | null;
  excerpt: string;
  deletedAt: number;
  restore: () => Promise<void>;
  restoreGate: (gates: PlanGates) => PlanGate;
  purge: () => Promise<void>;
  restoredMessage: string;
  purgedMessage: string;
}

const KIND_FILTER: Record<Kind, Filter> = { note: "notes", page: "folders", notebook: "folders", database: "databases" };

function dayStart(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function KindGlyph({ kind }: { kind: Kind }) {
  const Icon = kind === "note" ? FileText : kind === "page" ? NotebookText : kind === "notebook" ? NotebookGlyph : Database;
  return <Icon className="size-[18px] text-muted" strokeWidth={1.7} />;
}

function Countdown({ days, label, title }: { days: number; label: string; title: string }) {
  const radius = 6.5;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, days / TRASH_RETENTION_DAYS));
  const tone = days <= 3 ? "var(--danger)" : days <= 7 ? "var(--warning)" : "var(--text-muted)";
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-2 text-[12px] tabular-nums" style={{ color: days <= 7 ? tone : undefined }}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 -rotate-90">
        <circle cx="8" cy="8" r={radius} fill="none" stroke="var(--border)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className={cn(days > 7 && "text-muted")}>{label}</span>
    </span>
  );
}

export default function TrashPage() {
  const { t, language } = useTranslation();
  const { trashedPages, trashedDatabases = [], trashedNotebooks = [], notebooks, livePages, adapter } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const locale = intlLocale(language);
  const dayUnit = TRASH_RETENTION_DAYS === 1 ? t("unit_day_singular") : t("unit_day_plural");
  const untitled = t("untitled");

  const rows = useMemo<TrashRow[]>(() => {
    const allNotebooks = new Map<string, Notebook>();
    for (const notebook of notebooks) allNotebooks.set(notebook.id, notebook);
    for (const notebook of trashedNotebooks) allNotebooks.set(notebook.id, notebook);
    const trashedIds = new Set(trashedNotebooks.map((notebook) => notebook.id));
    const hiddenInside = (trashedWith: string | null | undefined) => Boolean(trashedWith && trashedIds.has(trashedWith));

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

    const contents = new Map<string, number>();
    const count = (owner: string | null | undefined) => {
      if (owner) contents.set(owner, (contents.get(owner) ?? 0) + 1);
    };
    trashedNotebooks.forEach((notebook) => count(notebook.trashedWith));
    trashedPages.forEach((page) => count(page.trashedWith));
    trashedDatabases.forEach((database) => count(database.trashedWith));

    const pageTitle = new Map([...livePages, ...trashedPages].map((page) => [page.id, page.title || untitled]));
    const out: TrashRow[] = [];

    for (const notebook of trashedNotebooks) {
      if (hiddenInside(notebook.trashedWith)) continue;
      const inside = contents.get(notebook.id) ?? 0;
      out.push({
        key: `notebook:${notebook.id}`,
        kind: notebook.parentId ? "notebook" : "page",
        icon: notebook.emoji,
        title: notebook.name,
        place: pathOf(notebook.parentId),
        detail: inside ? t("notebook_trash_contents", { count: inside }) : null,
        excerpt: "",
        deletedAt: Number(notebook.deletedAt) || now,
        restore: () => adapter.restoreNotebook(notebook.id),
        restoreGate: (gates) => gates.restoreNotebook(notebook.id),
        purge: () => adapter.purgeNotebook(notebook.id),
        restoredMessage: t("notebook_restored"),
        purgedMessage: t("notebook_purged"),
      });
    }

    for (const page of trashedPages) {
      if (hiddenInside(page.trashedWith)) continue;
      out.push({
        key: `page:${page.id}`,
        kind: "note",
        icon: page.icon,
        title: page.title,
        place: pathOf(page.notebookId),
        detail: null,
        excerpt: truncate((page.plainText ?? "").replace(/\s+/g, " ").trim(), 140),
        deletedAt: Number(page.deletedAt) || now,
        restore: () => adapter.restorePage(page.id),
        restoreGate: (gates) => gates.restorePage(page.id),
        purge: () => adapter.purgePage(page.id),
        restoredMessage: t("page_restored"),
        purgedMessage: t("page_purged"),
      });
    }

    for (const database of trashedDatabases) {
      if (hiddenInside(database.trashedWith)) continue;
      out.push({
        key: `database:${database.id}`,
        kind: "database",
        icon: database.icon,
        title: isPlanningName(database.name) ? t("planning") : database.name,
        place: database.parentPageId ? (pageTitle.get(database.parentPageId) ?? null) : pathOf(database.notebookId),
        detail: null,
        excerpt: "",
        deletedAt: Number(database.deletedAt) || now,
        restore: () => adapter.restoreDatabase(database.id),
        restoreGate: (gates) => gates.restoreDatabase(database.notebookId),
        purge: () => adapter.purgeDatabase(database.id),
        restoredMessage: t("database_restored"),
        purgedMessage: t("database_purged"),
      });
    }

    return out.sort((a, b) => b.deletedAt - a.deletedAt);
  }, [adapter, livePages, notebooks, now, t, trashedDatabases, trashedNotebooks, trashedPages, untitled]);

  const planGates = usePlanGates();
  const restoreGates = useMemo(
    () => new Map(rows.map((row) => [row.key, row.restoreGate(planGates)])),
    [planGates, rows]
  );

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: rows.length, notes: 0, folders: 0, databases: 0 };
    for (const row of rows) result[KIND_FILTER[row.kind]] += 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return rows.filter((row) => {
      if (filter !== "all" && KIND_FILTER[row.kind] !== filter) return false;
      if (!needle) return true;
      return [row.title || untitled, row.place ?? "", row.excerpt, row.detail ?? ""].some((value) => value.toLocaleLowerCase(locale).includes(needle));
    });
  }, [filter, locale, query, rows, untitled]);

  const groups = useMemo(() => {
    const today = dayStart(now);
    const yesterday = today - DAY_MS;
    const dateFormat = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
    const map = new Map<number, TrashRow[]>();
    for (const row of visible) {
      const day = dayStart(row.deletedAt);
      const list = map.get(day);
      if (list) list.push(row);
      else map.set(day, [row]);
    }
    return [...map.entries()].map(([day, items]) => ({
      day,
      label:
        day >= today
          ? t("trash_group_today")
          : day === yesterday
            ? t("trash_group_yesterday")
            : t("trash_group_date", { date: dateFormat.format(new Date(day)) }),
      items,
    }));
  }, [locale, now, t, visible]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.key)), [rows, selected]);
  const selecting = selectedRows.length > 0;

  const remainingDays = (deletedAt: number) => Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS));
  const expiryText = (deletedAt: number) => {
    const days = remainingDays(deletedAt);
    const date = new Date(deletedAt + TRASH_RETENTION_DAYS * DAY_MS).toLocaleDateString(locale);
    const unit = days === 1 ? t("unit_day_singular") : t("unit_day_plural");
    const lead =
      days <= 0 ? t("trash_days_left_zero") : days === 1 ? t("trash_days_left_single", { days, dayUnit: unit }) : t("trash_days_left_plural", { days, dayUnit: unit });
    return `${lead} · ${t("expires_until", { date })}`;
  };

  const errorText = (error: unknown, fallback: string) => localizeErrorMessage(error instanceof Error ? error.message : null, t) || fallback;

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const forget = (keys: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.delete(key));
      return next;
    });

  const runOne = async (row: TrashRow, mode: "restore" | "purge") => {
    if (mode === "purge" && !window.confirm(t("purge_confirm", { name: row.title || untitled }))) return;
    setBusy(row.key);
    try {
      await (mode === "restore" ? row.restore() : row.purge());
      forget([row.key]);
      toast.success(mode === "restore" ? row.restoredMessage : row.purgedMessage);
    } catch (error) {
      if (!notifyPlanError(error)) toast.error(errorText(error, t(mode === "restore" ? "restore_failed" : "purge_failed")));
    } finally {
      setBusy(null);
    }
  };

  const runMany = async (mode: "restore" | "purge") => {
    const targets = selectedRows;
    if (!targets.length) return;
    if (mode === "purge") {
      const unit = targets.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items");
      if (!window.confirm(t("trash_confirm", { count: targets.length, unit, label: `${targets.length} ${unit}` }))) return;
    }
    setBusy("bulk");
    const done: string[] = [];
    for (const row of targets) {
      try {
        await (mode === "restore" ? row.restore() : row.purge());
        done.push(row.key);
      } catch {}
    }
    forget(done);
    setBusy(null);
    if (done.length) toast.success(t(mode === "restore" ? "trash_restored_many" : "trash_purged_many", { count: done.length }));
    if (done.length < targets.length) toast.error(t("trash_partial_failure"));
  };

  const emptyTrash = async () => {
    const total = trashedPages.length + trashedDatabases.length + trashedNotebooks.length;
    if (!total) return;
    const unit = total === 1 ? t("wizard_unit_item") : t("wizard_unit_items");
    if (!window.confirm(t("trash_confirm", { count: total, unit, label: `${total} ${unit}` }))) return;
    setBusy("empty");
    try {
      await adapter.emptyTrash();
      setSelected(new Set());
      toast.success(t("trash_emptied_success"));
    } catch (error) {
      toast.error(errorText(error, t("trash_empty_failed")));
    } finally {
      setBusy(null);
    }
  };

  const filters: { id: Filter; label: string }[] = (
    [
      { id: "all", label: t("trash_filter_all") },
      { id: "notes", label: t("trash_filter_notes") },
      { id: "folders", label: t("trash_filter_folders") },
      { id: "databases", label: t("trash_filter_databases") },
    ] as { id: Filter; label: string }[]
  ).filter((option) => option.id === "all" || counts[option.id] > 0);

  const kindLabel = (kind: Kind) =>
    t(kind === "note" ? "trash_kind_note" : kind === "page" ? "trash_kind_page" : kind === "notebook" ? "trash_kind_notebook" : "trash_kind_database");

  const hint = t(TRASH_RETENTION_DAYS === 1 ? "trash_default_hint_single" : "trash_default_hint", { days: TRASH_RETENTION_DAYS, dayUnit });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6 md:px-8 md:pt-12 xl:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl 4xl:max-w-[96rem]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{t("trash")}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{hint}.</p>
        </div>
        {rows.length ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void emptyTrash()}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-[var(--danger)] shadow-[inset_0_0_0_1px_var(--border)] transition hover:bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_35%,transparent)] disabled:opacity-50"
          >
            <TrashCanIcon className="size-3.5" />
            {busy === "empty" ? t("emptying_trash") : t("empty_trash_button")}
          </button>
        ) : null}
      </header>

      {rows.length ? (
        <>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-xs">
              <span className="sr-only">{t("trash_search")}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("trash_search")}
                className="h-9 w-full rounded-full bg-[var(--surface)] pe-8 ps-9 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--border)] outline-none transition placeholder:text-faint focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("clear_filter")}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-faint transition hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </label>
            {filters.length > 2 ? (
              <div role="tablist" className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-[var(--surface-2)] p-1 [scrollbar-width:none]">
                {filters.map((option) => {
                  const active = option.id === filter;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(option.id)}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition",
                        active ? "bg-[var(--surface)] text-ink shadow-[0_1px_2px_rgba(15,44,76,0.12)]" : "text-muted hover:text-ink"
                      )}
                    >
                      {option.label}
                      <span className="tabular-nums text-faint">{counts[option.id]}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {visible.length ? (
            <div className="@container mt-5 overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
              {groups.map((group) => (
                <section key={group.day} aria-label={group.label}>
                  <h2 className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-2 text-[12px] font-medium text-muted first:rounded-t-[20px] sm:px-5">
                    {group.label}
                  </h2>
                  <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)] last:border-b-0">
                    {group.items.map((row) => (
                      <TrashItem
                        key={row.key}
                        row={row}
                        kindLabel={kindLabel(row.kind)}
                        selected={selected.has(row.key)}
                        selecting={selecting}
                        disabled={busy !== null}
                        days={remainingDays(row.deletedAt)}
                        expiry={expiryText(row.deletedAt)}
                        deletedLabel={formatRelative(row.deletedAt, language)}
                        onToggle={() => toggle(row.key)}
                        restoreGate={restoreGates.get(row.key) ?? null}
                        onRestore={() => void runOne(row, "restore")}
                        onPurge={() => void runOne(row, "purge")}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-5">
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
            title={t("trash_empty_title")}
            description={t(TRASH_RETENTION_DAYS === 1 ? "trash_empty_desc_single" : "trash_empty_desc", { days: TRASH_RETENTION_DAYS, dayUnit })}
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
            <span className="me-1.5 shrink-0 font-medium tabular-nums">{t("trash_selected", { count: selectedRows.length })}</span>
            {selectedRows.length < visible.length ? (
              <BarButton onClick={() => setSelected(new Set([...selected, ...visible.map((row) => row.key)]))} disabled={busy !== null}>
                {t("select_all")}
              </BarButton>
            ) : null}
            <BarButton onClick={() => void runMany("restore")} disabled={busy !== null} label={t("trash_restore")}>
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">{t("trash_restore")}</span>
            </BarButton>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runMany("purge")}
              aria-label={t("delete_permanently")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <TrashCanIcon className="size-3.5" />
              <span className="hidden sm:inline">{t("delete_permanently")}</span>
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

function BarButton({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium transition hover:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function TrashItem({
  row,
  kindLabel,
  selected,
  selecting,
  disabled,
  days,
  expiry,
  deletedLabel,
  restoreGate,
  onToggle,
  onRestore,
  onPurge,
}: {
  row: TrashRow;
  kindLabel: string;
  selected: boolean;
  selecting: boolean;
  disabled: boolean;
  days: number;
  expiry: string;
  deletedLabel: string;
  restoreGate: PlanGate | null;
  onToggle: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { t } = useTranslation();
  const raw = row.title?.trim() || "";
  const title = raw === t("untitled") ? "" : raw;
  const wasIn = row.place ? t("trash_was_in", { place: row.place }) : null;
  const meta = [wasIn, row.detail, row.excerpt || null].filter(Boolean).join(" · ");
  const wideMeta = [row.detail, row.excerpt || null].filter(Boolean).join(" · ");
  const countdownLabel = days <= 0 ? t("trash_last_day") : t("trash_days_short", { count: days });

  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-3 py-3 transition-colors sm:gap-4 sm:px-5",
        selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={t("trash_select_item", { name: title || t("untitled") })}
        onClick={onToggle}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-2)] outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)]"
      >
        <span className={cn("flex items-center justify-center transition-opacity", selected || selecting ? "opacity-0" : "group-hover:opacity-0")}>
          {row.icon?.trim() ? <WorkspaceIcon icon={row.icon} size={18} /> : <KindGlyph kind={row.kind} />}
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity",
            selected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <span
            className={cn(
              "flex size-[18px] items-center justify-center rounded-[5px] transition",
              selected
                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "bg-[var(--surface)] shadow-[inset_0_0_0_1.5px_var(--border-strong)]"
            )}
          >
            {selected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate text-[14px]", title ? "font-medium text-ink" : "italic text-muted")}>{title || t("untitled")}</span>
          <span className="shrink-0 text-[11.5px] text-faint">{kindLabel}</span>
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-faint @3xl:hidden">
          <span className="shrink-0 @lg:hidden" title={expiry}>
            {countdownLabel}
            {meta ? " ·" : ""}
          </span>
          <span className="truncate" title={`${deletedLabel}${meta ? ` · ${meta}` : ""}`}>
            {meta || deletedLabel}
          </span>
        </p>
        <p className="mt-0.5 hidden truncate text-[12.5px] text-faint @3xl:block" title={`${deletedLabel}${wideMeta ? ` · ${wideMeta}` : ""}`}>
          {wideMeta || deletedLabel}
        </p>
      </div>

      <span className="hidden w-56 shrink-0 truncate text-[12.5px] text-muted @3xl:block @6xl:w-72" title={wasIn ?? undefined}>
        {wasIn}
      </span>

      <span className="hidden w-[5.75rem] shrink-0 @lg:inline-flex">
        <Countdown days={days} label={countdownLabel} title={expiry} />
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || restoreGate?.allowed === false}
          onClick={onRestore}
          title={restoreGate?.reason ?? undefined}
          className="rounded-full px-2.5 text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          aria-label={restoreGate?.reason ? `${t("trash_restore")}: ${restoreGate.reason}` : t("trash_restore")}
        >
          {restoreGate?.allowed === false ? <Lock className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          <span className="hidden @2xl:inline">{t("trash_restore")}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onPurge}
          aria-label={t("delete_permanently")}
          title={t("delete_permanently")}
          className="rounded-full text-faint hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
        >
          <TrashCanIcon className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
