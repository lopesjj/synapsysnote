"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { NotionTreeNode } from "@/types/models";
import { useNotionImport } from "@/hooks/use-notion-import";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { WizardFooter, WizardSteps } from "@/components/import/wizard-footer";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Progress, Skeleton, Switch } from "@/components/ui/primitives";
import { cn, formatBytes } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";

type Step = "connect" | "select" | "preview" | "progress";

export function ImportWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    integration,
    notebooks,
    tree,
    loadingTree,
    treeError,
    loadTree,
    selected,
    summary,
    toggle,
    toggleAll,
    stateOf,
    start,
    submitting,
    cancel,
    reset,
    job,
    progress,
    connect,
    existingNotionIds,
  } = useNotionImport();

  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const [targetNotebookId, setTargetNotebookId] = useState<string | null>(null);
  const [options, setOptions] = useState({
    downloadMedia: true,
    preserveHierarchy: true,
    createBacklinks: true,
  });
  const [connecting, setConnecting] = useState(false);
  // Reimportar substitui o que ja existe: so libera depois da confirmacao.
  const [reimportConfirmed, setReimportConfirmed] = useState(false);
  const needsReimportConfirmation = summary.existingCount > 0 && !reimportConfirmed;

  const connected = Boolean(integration?.connected);
  const isJobActive = Boolean(job && ["pending", "discovering", "running"].includes(job.status));
  const step: Step = isJobActive ? "progress" : (stepOverride ?? (connected ? "select" : "connect"));
  const validNotebooks = useMemo(
    () => notebooks.filter((nb) => !("deletedAt" in nb && Boolean(nb.deletedAt))),
    [notebooks]
  );
  const resolvedNotebookId =
    targetNotebookId && validNotebooks.some((nb) => nb.id === targetNotebookId)
      ? targetNotebookId
      : null;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await connect();
      if ("redirectUrl" in result) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success(t("connected_to", { name: result.connected.workspaceName }));
      setStepOverride("select");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("connection_failed"));
    } finally {
      setConnecting(false);
    }
  };

  const handleStart = async () => {
    if (needsReimportConfirmation) return;
    try {
      await start({ targetNotebookId: resolvedNotebookId, ...options });
      setStepOverride("progress");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("import_start_failed"));
    }
  };

  const finished =
    job && ["completed", "completed_with_errors", "failed", "canceled"].includes(job.status);

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next && job && !finished) {
          toast.info(t("wizard_continue_background"));
        }
        if (!next && finished) setStepOverride(null);
        onOpenChange(next);
      }}
      className="max-w-3xl"
    >
      <DialogHeader
        className="px-4 pr-12 sm:px-5 sm:pr-12"
        title={t("import_from_notion_title")}
        description={
          integration?.connected
            ? t("wizard_connected_desc", { name: integration.workspaceName })
            : t("wizard_unconnected_desc")
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {step === "connect" ? (
          <ConnectStep connecting={connecting} onConnect={handleConnect} />
        ) : null}

        {step === "select" ? (
          <SelectStep
            tree={tree}
            loading={loadingTree}
            error={treeError}
            onRetry={loadTree}
            selectedCount={selected.size}
            stateOf={stateOf}
            toggle={toggle}
            toggleAll={toggleAll}
            existingNotionIds={existingNotionIds}
          />
        ) : null}

        {step === "preview" ? (
          <PreviewStep
            summary={summary}
            reimportConfirmed={reimportConfirmed}
            onConfirmReimport={setReimportConfirmed}
            notebooks={validNotebooks}
            targetNotebookId={resolvedNotebookId}
            onChangeNotebook={setTargetNotebookId}
            options={options}
            onChangeOptions={setOptions}
          />
        ) : null}

        {step === "progress" && job ? (
          <ProgressStep job={job} progress={progress} onOpenPage={(id) => {
            onOpenChange(false);
            router.push(`/home/p/${id}`);
          }} />
        ) : null}
      </div>

      <WizardFooter
        steps={
          step === "select" ? (
            <WizardSteps current={1} label={t("wizard_step1")} />
          ) : step === "preview" ? (
            <WizardSteps current={2} label={t("wizard_step2")} />
          ) : step === "progress" ? (
            <WizardSteps current={3} label={t("wizard_step3")} />
          ) : null
        }
      >
        {step === "select" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("wizard_cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!selected.size}
              onClick={() => {
                setReimportConfirmed(false);
                setStepOverride("preview");
              }}
            >
              {t("wizard_review", { count: selected.size ? `(${selected.size})` : "" })}
              <ArrowRight />
            </Button>
          </>
        ) : null}

        {step === "preview" ? (
          <>
            <Button variant="ghost" onClick={() => setStepOverride("select")}>
              <ArrowLeft /> {t("wizard_back")}
            </Button>
            <Button
              variant="primary"
              disabled={submitting || needsReimportConfirmation}
              onClick={handleStart}
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {t("wizard_import_action", {
                count: summary.total,
                unit: summary.total === 1 ? t("wizard_unit_item") : t("wizard_unit_items"),
              })}
            </Button>
          </>
        ) : null}

        {step === "progress" ? (
          finished ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  setStepOverride("select");
                }}
              >
                {t("wizard_new_import")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const imported = job?.items.find(
                    (item) => item.status === "done" && item.appId && item.type === "page"
                  );
                  onOpenChange(false);
                  if (imported?.appId) router.push(`/home/p/${imported.appId}`);
                }}
              >
                <Check /> {t("wizard_finish")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("wizard_continue_background")}
              </Button>
              <Button variant="danger" onClick={() => void cancel()}>
                <X /> {t("wizard_cancel_import")}
              </Button>
            </>
          )
        ) : null}
      </WizardFooter>
    </DialogShell>
  );
}

function ConnectStep({ connecting, onConnect }: { connecting: boolean; onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-5 py-10 text-center sm:px-8 sm:py-14">
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-semibold text-ink">{t("wizard_connect_heading")}</h3>
        <p className="mx-auto max-w-md text-[12.5px] leading-relaxed text-muted">
          {t("wizard_connect_desc")}
        </p>
      </div>
      <Button variant="primary" size="lg" disabled={connecting} onClick={onConnect}>
        {connecting ? <Loader2 className="animate-spin" /> : null}
        {t("wizard_login_btn")}
      </Button>
      <p className="text-[11px] text-faint">
        {t("wizard_login_hint")}
      </p>
    </div>
  );
}


function SelectStep({
  tree,
  loading,
  error,
  onRetry,
  selectedCount,
  stateOf,
  toggle,
  toggleAll,
  existingNotionIds,
}: {
  tree: NotionTreeNode[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedCount: number;
  stateOf: (id: string) => "checked" | "unchecked" | "indeterminate";
  toggle: (id: string, checked: boolean) => void;
  toggleAll: (checked: boolean) => void;
  existingNotionIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const total = useMemo(() => {
    const count = (nodes: NotionTreeNode[]): number =>
      nodes.reduce((sum, node) => sum + 1 + count(node.children ?? []), 0);
    return count(tree);
  }, [tree]);

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const walk = (nodes: NotionTreeNode[]) => {
      for (const n of nodes) {
        next[n.id] = true;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(tree);
    setExpanded(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    const walk = (nodes: NotionTreeNode[]) => {
      for (const n of nodes) {
        next[n.id] = false;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(tree);
    setExpanded(next);
  };

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-5 sm:px-5">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3" style={{ paddingLeft: `${(index % 3) * 20}px` }}>
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4" />
            <Skeleton className={cn("h-4", index % 2 ? "w-40" : "w-64")} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center sm:px-8 sm:py-16">
        <AlertTriangle className="size-6 text-[var(--warning)]" />
        <p className="text-[13px] text-ink">{localizeErrorMessage(error, t)}</p>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw /> {t("wizard_try_again")}
        </Button>
      </div>
    );
  }

  const renderNodes = (nodes: NotionTreeNode[], depth = 0) =>
    nodes.map((node) => {
      const state = stateOf(node.id);
      const open = expanded[node.id] ?? depth <= 1;
      const hasChildren = Boolean(node.children?.length);
      return (
        <div key={node.id}>
          <div
            className="group flex items-center gap-2 rounded-[var(--radius-xs)] py-1.5 pr-2 ps-[calc(8px_+_var(--tree-depth)_*_12px)] transition-colors hover:bg-[var(--surface-hover)] sm:ps-[calc(8px_+_var(--tree-depth)_*_20px)]"
            style={{ "--tree-depth": depth } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [node.id]: !open }))}
              className={cn(
                "flex size-4 items-center justify-center rounded text-faint transition hover:text-ink",
                !hasChildren && "invisible"
              )}
              aria-label={open ? t("collapse_sidebar") : t("expand_sidebar")}
            >
              <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
            </button>

            <Checkbox
              checked={state === "checked" ? true : state === "indeterminate" ? "indeterminate" : false}
              onCheckedChange={(value) => toggle(node.id, value === true)}
              aria-label={node.title}
            />

            <span className="w-4 shrink-0 text-center text-[13px]">
              <WorkspaceIcon
                icon={node.icon}
                fallback={hasChildren ? "📓" : node.type === "database" ? "🗂️" : "📄"}
                size={14}
              />
            </span>

            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{node.title}</span>

            {existingNotionIds?.has(node.id) ? (
              <Badge tone="neutral" className="shrink-0 text-[10.5px] opacity-75">
                {t("wizard_already_in_synapsys")}
              </Badge>
            ) : null}

            {node.type === "database" ? (
              hasChildren ? (
                <Badge tone="accent" className="shrink-0">
                  {node.children!.length} {node.children!.length === 1 ? t("note_singular") : t("notes_plural")}
                </Badge>
              ) : (
                <Badge tone="accent" className="shrink-0">
                  {node.childCount ?? 0} {t("wizard_summary_records").toLowerCase()}
                </Badge>
              )
            ) : hasChildren ? (
              <span className="hidden shrink-0 text-[11px] text-faint sm:inline">
                {node.children!.length} {node.children!.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}
              </span>
            ) : null}
          </div>

          {open && hasChildren ? (
            <div className="overflow-hidden">
              {renderNodes(node.children!, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <label className="flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-ink">
          <Checkbox
            checked={selectedCount === total && total > 0}
            onCheckedChange={(value) => toggleAll(value === true)}
          />
          {t("wizard_import_all")}
          <span className="text-faint">({total} {total === 1 ? t("wizard_unit_item") : t("wizard_unit_items")})</span>
        </label>
        <div className="flex items-center justify-between gap-3 text-[11.5px] sm:justify-end">
          <div className="flex items-center gap-1.5 text-muted">
            <button
              type="button"
              onClick={expandAll}
              className="transition hover:text-ink hover:underline"
            >
              {t("wizard_expand_all")}
            </button>
            <span className="text-faint">·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="transition hover:text-ink hover:underline"
            >
              {t("wizard_collapse_all")}
            </button>
          </div>
          <span className="font-medium text-ink">{t("wizard_selected_count", { count: selectedCount })}</span>
        </div>
      </div>
      <div className="max-h-[min(55vh,480px)] min-h-[180px] overflow-y-auto px-2 py-2">{renderNodes(tree)}</div>
    </div>
  );
}


function PreviewStep({
  summary,
  reimportConfirmed,
  onConfirmReimport,
  notebooks,
  targetNotebookId,
  onChangeNotebook,
  options,
  onChangeOptions,
}: {
  summary: { pages: number; databases: number; rows: number; total: number; existingCount: number };
  reimportConfirmed: boolean;
  onConfirmReimport: (confirmed: boolean) => void;
  notebooks: { id: string; name: string; emoji?: string; parentId?: string | null }[];
  targetNotebookId: string | null;
  onChangeNotebook: (id: string | null) => void;
  options: {
    downloadMedia: boolean;
    preserveHierarchy: boolean;
    createBacklinks: boolean;
  };
  onChangeOptions: (next: typeof options) => void;
}) {
  const { t } = useTranslation();
  const [filterTab, setFilterTab] = useState<"all" | "pages" | "notebooks">("all");
  const [targetSearch, setTargetSearch] = useState("");

  const rootPages = useMemo(() => notebooks.filter((nb) => !nb.parentId), [notebooks]);
  const nestedNotebooks = useMemo(() => notebooks.filter((nb) => Boolean(nb.parentId)), [notebooks]);
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const nb of notebooks) {
      map.set(nb.id, nb.name || t("untitled"));
    }
    return map;
  }, [notebooks, t]);

  const normalizedSearch = targetSearch.trim().toLowerCase();
  const visiblePages = useMemo(() => {
    if (filterTab === "notebooks") return [];
    if (!normalizedSearch) return rootPages;
    return rootPages.filter((nb) => nb.name.toLowerCase().includes(normalizedSearch));
  }, [filterTab, normalizedSearch, rootPages]);

  const visibleNotebooks = useMemo(() => {
    if (filterTab === "pages") return [];
    if (!normalizedSearch) return nestedNotebooks;
    return nestedNotebooks.filter((nb) => {
      const parentName = nb.parentId ? parentMap.get(nb.parentId) || "" : "";
      return nb.name.toLowerCase().includes(normalizedSearch) || parentName.toLowerCase().includes(normalizedSearch);
    });
  }, [filterTab, nestedNotebooks, normalizedSearch, parentMap]);

  const toggles = [
    {
      key: "downloadMedia" as const,
      title: t("wizard_media_title"),
      description: t("wizard_media_desc"),
    },
    {
      key: "preserveHierarchy" as const,
      title: t("wizard_hierarchy_title"),
      description: t("wizard_hierarchy_desc"),
    },
    {
      key: "createBacklinks" as const,
      title: t("wizard_backlinks_title"),
      description: t("wizard_backlinks_desc"),
    },
  ];

  return (
    <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label={t("wizard_summary_pages")} value={summary.pages} />
        <SummaryCard label={t("wizard_summary_databases")} value={summary.databases} />
        <SummaryCard label={t("wizard_summary_records")} value={summary.rows} />
      </div>

      {summary.existingCount > 0 ? (
        <div
          role="alert"
          className="space-y-2.5 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-3"
        >
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" aria-hidden />
            {t("notion_reimport_warning_title")}
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            {t("notion_reimport_warning_body", { count: summary.existingCount })}
          </p>
          <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-ink">
            <Checkbox
              checked={reimportConfirmed}
              onCheckedChange={(value) => onConfirmReimport(value === true)}
            />
            {t("notion_reimport_confirm")}
          </label>
        </div>
      ) : null}

      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4 bg-[var(--surface-2)]/40">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            {t("wizard_unfiled_target")}
          </p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            {t("wizard_unfiled_target_desc")}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "flex-1 whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-medium transition sm:flex-none",
                filterTab === "all"
                  ? "bg-[var(--surface-2)] text-ink shadow-xs"
                  : "text-muted hover:text-ink"
              )}
            >
              {t("archived_filter_all")} ({rootPages.length + nestedNotebooks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pages")}
              className={cn(
                "flex-1 whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-medium transition sm:flex-none",
                filterTab === "pages"
                  ? "bg-[var(--surface-2)] text-ink shadow-xs"
                  : "text-muted hover:text-ink"
              )}
            >
              {t("archived_filter_pages")} ({rootPages.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("notebooks")}
              className={cn(
                "flex-1 whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-medium transition sm:flex-none",
                filterTab === "notebooks"
                  ? "bg-[var(--surface-2)] text-ink shadow-xs"
                  : "text-muted hover:text-ink"
              )}
            >
              {t("archived_filter_notebooks")} ({nestedNotebooks.length})
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
              placeholder={t("wizard_target_search_placeholder")}
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[11.5px] text-ink placeholder:text-faint focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>

        {filterTab !== "notebooks" && !normalizedSearch ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5">
              <FileText className="size-3.5 text-muted" />
              {t("wizard_unfiled_root_section")}
            </p>
            <button
              type="button"
              onClick={() => onChangeNotebook(null)}
              className={cn(
                "w-full flex items-center justify-between rounded-[var(--radius-sm)] border p-2 text-left text-[12px] transition",
                targetNotebookId === null
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink ring-1 ring-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-muted hover:text-ink hover:border-[var(--border-strong)]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded bg-[var(--surface-2)] text-ink">
                  📄
                </span>
                <div>
                  <span className="block font-medium text-ink">{t("wizard_target_root_title")}</span>
                  <span className="block text-[11px] text-faint">{t("wizard_target_root_desc")}</span>
                </div>
              </div>
              {targetNotebookId === null ? <Check className="size-4 text-[var(--accent)] shrink-0" /> : null}
            </button>
          </div>
        ) : null}

        {visiblePages.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5">
              <FileText className="size-3.5 text-muted" />
              {t("wizard_target_pages_section")} ({visiblePages.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
              {visiblePages.map((pageItem) => {
                const isSelected = targetNotebookId === pageItem.id;
                return (
                  <button
                    key={pageItem.id}
                    type="button"
                    onClick={() => onChangeNotebook(pageItem.id)}
                    className={cn(
                      "flex items-center justify-between rounded-[var(--radius-sm)] border p-2 text-left text-[12px] transition",
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink ring-1 ring-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-muted hover:text-ink hover:border-[var(--border-strong)]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <WorkspaceIcon icon={pageItem.emoji} fallback="📄" size={16} />
                      <div className="min-w-0">
                        <span className="truncate font-medium text-ink block">{pageItem.name}</span>
                        <span className="text-[10px] text-muted font-normal block">{t("wizard_target_page_badge")}</span>
                      </div>
                    </div>
                    {isSelected ? <Check className="size-3.5 text-[var(--accent)] shrink-0 ml-1" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {visibleNotebooks.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5">
              <Folder className="size-3.5 text-muted" />
              {t("wizard_target_notebooks_section")} ({visibleNotebooks.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
              {visibleNotebooks.map((nb) => {
                const isSelected = targetNotebookId === nb.id;
                const parentName = nb.parentId ? parentMap.get(nb.parentId) : null;
                return (
                  <button
                    key={nb.id}
                    type="button"
                    onClick={() => onChangeNotebook(nb.id)}
                    className={cn(
                      "flex items-center justify-between rounded-[var(--radius-sm)] border p-2 text-left text-[12px] transition",
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink ring-1 ring-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-muted hover:text-ink hover:border-[var(--border-strong)]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <WorkspaceIcon icon={nb.emoji} fallback="📓" size={16} />
                      <div className="min-w-0">
                        <span className="truncate font-medium text-ink block">{nb.name}</span>
                        <span className="text-[10px] text-faint truncate block">
                          {parentName ? t("wizard_target_in_parent", { parent: parentName }) : t("wizard_target_notebook_badge")}
                        </span>
                      </div>
                    </div>
                    {isSelected ? <Check className="size-3.5 text-[var(--accent)] shrink-0 ml-1" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t("wizard_conversion")}</p>
        {toggles.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition hover:border-[var(--border-strong)]"
          >
            <Switch
              checked={options[item.key]}
              onCheckedChange={(checked) => onChangeOptions({ ...options, [item.key]: checked })}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">{item.title}</span>
              <span className="block text-[11.5px] leading-relaxed text-muted">{item.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 sm:p-3">
      <p className="break-words text-[10.5px] uppercase leading-tight tracking-[0.06em] text-muted sm:text-[11px]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-ink sm:text-2xl">{value}</p>
    </div>
  );
}

function formatImportStep(
  job: import("@/types/models").ImportJob,
  t: (key: import("@/lib/i18n/translations").TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (job.status === "completed") {
    return t("import_completed");
  }
  if (job.status === "completed_with_errors") {
    return t("wizard_step_completed_with_warnings", { count: job.errors.length });
  }
  if (job.status === "canceled") {
    return t("status_canceled");
  }
  if (job.status === "failed") {
    const raw = job.currentStep || "";
    const clean = raw.replace(/^Falhou:\s*/i, "").replace(/^Failed:\s*/i, "");
    return localizeErrorMessage(clean, t) || t("status_failed");
  }
  const step = (job.currentStep || "").trim();
  const convertingMatch = step.match(/^\((\d+\/\d+)\)\s*Convertendo\s*[“"']?(.*?)[”"']?[\.…]*$/i);
  if (convertingMatch) {
    return t("wizard_step_converting", {
      current: convertingMatch[1],
      title: convertingMatch[2],
    });
  }
  const importingRecordsMatch = step.match(/^Importando registros de\s*[“"']?(.*?)[”"']?\s*\((.*?)\)[\.…]*$/i);
  if (importingRecordsMatch) {
    return t("wizard_step_importing_records", {
      title: importingRecordsMatch[1],
      order: importingRecordsMatch[2],
    });
  }
  const preparingMatch = step.match(/^Preparando\s*(\d+)\s*itens[\.…]*$/i);
  if (preparingMatch) {
    return t("wizard_step_preparing", {
      count: preparingMatch[1],
    });
  }
  const completedWarningsMatch = step.match(/^Importação concluída com\s*(\d+)\s*avisos/i);
  if (completedWarningsMatch) {
    return t("wizard_step_completed_with_warnings", {
      count: completedWarningsMatch[1],
    });
  }
  const authFailedMatch = step.match(/^Falha de autenticação:\s*(.*)/i);
  if (authFailedMatch) {
    return t("wizard_step_auth_failed", {
      message: localizeErrorMessage(authFailedMatch[1], t),
    });
  }
  return localizeErrorMessage(step, t);
}

function ProgressStep({
  job,
  progress,
  onOpenPage,
}: {
  job: import("@/types/models").ImportJob;
  progress: number;
  onOpenPage: (appId: string) => void;
}) {
  const { t } = useTranslation();

  const statusTone: Record<string, "accent" | "success" | "danger" | "warning" | "neutral"> = {
    pending: "neutral",
    discovering: "accent",
    running: "accent",
    completed: "success",
    completed_with_errors: "warning",
    failed: "danger",
    canceled: "neutral",
  };

  const statusLabel: Record<string, string> = {
    pending: t("wizard_status_queued"),
    discovering: t("wizard_status_discovering"),
    running: t("wizard_status_importing"),
    completed: t("status_completed"),
    completed_with_errors: t("status_completed_with_errors"),
    failed: t("status_failed"),
    canceled: t("status_canceled"),
  };

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <Badge tone={statusTone[job.status]} className="shrink-0">
              {["pending", "discovering", "running"].includes(job.status) ? (
                <Loader2 className="size-3 animate-spin" />
              ) : job.status === "completed" ? (
                <Check className="size-3" />
              ) : (
                <AlertTriangle className="size-3" />
              )}
              {statusLabel[job.status]}
            </Badge>
            <span className="min-w-0 break-words text-[12.5px] text-muted">{formatImportStep(job, t)}</span>
          </div>
          <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-ink">{progress}%</span>
        </div>

        <Progress value={progress} indeterminate={job.status === "discovering"} />

        <div className="grid grid-cols-3 gap-2 pt-1 sm:gap-3">
          <Metric
            label={t("wizard_summary_pages")}
            value={`${job.processedPages}/${Math.max(job.totalPages, job.processedPages)}`}
          />
          <Metric
            label={t("files_unit")}
            value={`${job.processedFiles}/${Math.max(job.totalFiles, job.processedFiles)}`}
          />
          <Metric label={t("wizard_metric_transferred")} value={formatBytes(job.totalBytes)} />
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        {job.items.map((item) => (
          <div
            key={item.notionId}
            className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0"
          >
            <span className="shrink-0">
              {item.status === "done" ? (
                <Check className="size-3.5 text-[var(--success)]" />
              ) : item.status === "processing" ? (
                <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
              ) : item.status === "error" ? (
                <AlertTriangle className="size-3.5 text-[var(--danger)]" />
              ) : (
                <CircleDashed className="size-3.5 text-faint" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{item.title}</span>
            {item.fileCount ? (
              <span className="shrink-0 text-[11px] text-faint">{item.fileCount} {t("files_unit")}</span>
            ) : null}
            {item.status === "done" && item.appId && item.type === "page" ? (
              <button
                type="button"
                onClick={() => onOpenPage(item.appId!)}
                className="shrink-0 text-[11.5px] text-[var(--accent)] hover:underline"
              >
                {t("wizard_open_imported")}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {job.errors.length ? (
        <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
          <p className="text-[12px] font-medium text-[var(--danger)]">
            {t("wizard_issues_count", { count: job.errors.length })}
          </p>
          {job.errors.slice(0, 4).map((error) => (
            <p key={`${error.itemId}-${error.at}`} className="text-[11.5px] text-muted">
              <span className="font-mono">{error.stage}</span> · {error.itemTitle ?? error.itemId}:{" "}
              {localizeErrorMessage(error.message, t)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2 sm:px-3">
      <p className="truncate text-[10px] uppercase tracking-[0.07em] text-faint sm:text-[10.5px]">{label}</p>
      <p className="truncate font-mono text-[12.5px] tabular-nums text-ink sm:text-[13px]">{value}</p>
    </div>
  );
}
