"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { NotionTreeNode } from "@/types/models";
import { useNotionImport } from "@/hooks/use-notion-import";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Progress, Skeleton, Switch } from "@/components/ui/primitives";
import { cn, formatBytes } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useTranslation } from "@/lib/i18n/translations";

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

  const connected = Boolean(integration?.connected);
  const isJobActive = Boolean(job && ["pending", "discovering", "running"].includes(job.status));
  const step: Step = isJobActive ? "progress" : (stepOverride ?? (connected ? "select" : "connect"));
  const resolvedNotebookId = targetNotebookId;

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
    try {
      await start({ targetNotebookId: resolvedNotebookId, ...options });
      setStepOverride("progress");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a importação");
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
        title={t("import_from_notion_title")}
        description={
          integration?.connected
            ? t("wizard_connected_desc", { name: integration.workspaceName })
            : t("wizard_unconnected_desc")
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
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
                notebooks={notebooks}
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
          </motion.div>
        </AnimatePresence>
      </div>

      <DialogFooter>
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          {step === "select" ? (
            <>
              <StepDot active /> <StepDot /> <StepDot />
              <span className="ml-1">{t("wizard_step1")}</span>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <StepDot done /> <StepDot active /> <StepDot />
              <span className="ml-1">{t("wizard_step2")}</span>
            </>
          ) : null}
          {step === "progress" ? (
            <>
              <StepDot done /> <StepDot done /> <StepDot active />
              <span className="ml-1">{t("wizard_step3")}</span>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {step === "select" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("wizard_cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!selected.size}
                onClick={() => setStepOverride("preview")}
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
              <Button variant="primary" disabled={submitting} onClick={handleStart}>
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
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

function StepDot({ active, done }: { active?: boolean; done?: boolean }) {
  return (
    <span
      className={cn(
        "size-1.5 rounded-full transition-colors",
        done ? "bg-[var(--accent)]" : active ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
      )}
    />
  );
}

function ConnectStep({ connecting, onConnect }: { connecting: boolean; onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 py-14 text-center">
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
      <div className="space-y-2 px-5 py-5">
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
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <AlertTriangle className="size-6 text-[var(--warning)]" />
        <p className="text-[13px] text-ink">{error}</p>
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
            className="group flex items-center gap-2 rounded-[var(--radius-xs)] py-1.5 pr-2 transition-colors hover:bg-[var(--surface-hover)]"
            style={{ paddingLeft: `${8 + depth * 20}px` }}
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
              aria-label={`Selecionar ${node.title}`}
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
              <Badge tone="neutral" className="text-[10.5px] opacity-75">
                {t("wizard_already_in_synapsys")}
              </Badge>
            ) : null}

            {node.type === "database" ? (
              hasChildren ? (
                <Badge tone="accent">
                  {node.children!.length} {node.children!.length === 1 ? t("note_singular") : t("notes_plural")}
                </Badge>
              ) : (
                <Badge tone="accent">
                  {node.childCount ?? 0} {t("wizard_summary_records").toLowerCase()}
                </Badge>
              )
            ) : hasChildren ? (
              <span className="text-[11px] text-faint">
                {node.children!.length} {node.children!.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}
              </span>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {open && hasChildren ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {renderNodes(node.children!, depth + 1)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ink">
          <Checkbox
            checked={selectedCount === total && total > 0}
            onCheckedChange={(value) => toggleAll(value === true)}
          />
          {t("wizard_import_all")}
          <span className="text-faint">({total} {total === 1 ? t("wizard_unit_item") : t("wizard_unit_items")})</span>
        </label>
        <div className="flex items-center gap-3 text-[11.5px]">
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
  notebooks,
  targetNotebookId,
  onChangeNotebook,
  options,
  onChangeOptions,
}: {
  summary: { pages: number; databases: number; rows: number; total: number };
  notebooks: { id: string; name: string; emoji?: string }[];
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
    <div className="space-y-5 px-5 py-5">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label={t("wizard_summary_pages")} value={summary.pages} />
        <SummaryCard label={t("wizard_summary_databases")} value={summary.databases} />
        <SummaryCard label={t("wizard_summary_records")} value={summary.rows} />
      </div>

      {"existingCount" in summary && (summary as { existingCount: number }).existingCount > 0 ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[12px] text-muted">
          💡 <strong className="text-ink">{(summary as { existingCount: number }).existingCount}</strong> {t("wizard_existing_notice")}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {t("wizard_unfiled_target")}
        </p>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {t("wizard_unfiled_target_desc")}
        </p>
        <div className="flex flex-wrap gap-2">
          {notebooks.map((notebook) => (
            <button
              key={notebook.id}
              type="button"
              onClick={() => onChangeNotebook(notebook.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition",
                targetNotebookId === notebook.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-muted hover:text-ink"
              )}
            >
              <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={14} />
              {notebook.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeNotebook(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] transition",
              targetNotebookId === null
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] text-muted hover:text-ink"
            )}
          >
            {t("wizard_no_parent_page")}
          </button>
        </div>
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
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
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
    canceled: "Cancelada",
  };

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone={statusTone[job.status]}>
              {["pending", "discovering", "running"].includes(job.status) ? (
                <Loader2 className="size-3 animate-spin" />
              ) : job.status === "completed" ? (
                <Check className="size-3" />
              ) : (
                <AlertTriangle className="size-3" />
              )}
              {statusLabel[job.status]}
            </Badge>
            <span className="text-[12.5px] text-muted">{job.currentStep}</span>
          </div>
          <span className="font-mono text-[12.5px] tabular-nums text-ink">{progress}%</span>
        </div>

        <Progress value={progress} indeterminate={job.status === "discovering"} />

        <div className="grid grid-cols-3 gap-3 pt-1">
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
              {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-[0.07em] text-faint">{label}</p>
      <p className="font-mono text-[13px] tabular-nums text-ink">{value}</p>
    </div>
  );
}
