"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  ExternalLink,
  Info,
  Loader2,
  LogIn,
  NotebookPen,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Switch } from "@/components/ui/primitives";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";
import { useEvernoteImport } from "@/hooks/use-evernote-import";
import { filterImportTree } from "@/hooks/use-import-tree";
import { EVERNOTE_LOGIN_PAGE } from "@/lib/import/evernote-login";
import { ImportTreeView } from "./import-tree-view";

type Step = "connect" | "select" | "preview" | "progress";

export function EvernoteImportWizard({
  open,
  onOpenChange,
  onSwitchToFileImport,
  initialStep,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToFileImport?: () => void;
  initialStep?: Step;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    connected,
    integration,
    tree,
    loading,
    error,
    load,
    documentIds,
    selectedIds,
    toggleNode,
    toggleAll,
    stateOf,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
    connect,
    start,
    running,
    progress,
    results,
    reset,
    notebooks,
  } = useEvernoteImport({ active: open });

  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const [targetNotebookId, setTargetNotebookId] = useState<string | null>(null);
  const [keepTags, setKeepTags] = useState(true);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState(false);

  const step: Step =
    running || results ? "progress" : (stepOverride ?? initialStep ?? (connected ? "select" : "connect"));
  const visibleTree = useMemo(() => filterImportTree(tree, search), [tree, search]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await connect();
      if (result && "redirectUrl" in result && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success(t("connected_to", { name: "Evernote" }));
      setStepOverride("select");
    } catch (err) {
      toast.error(
        err instanceof Error ? localizeErrorMessage(err.message, t) : t("connection_failed")
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleStart = async () => {
    try {
      const res = await start({ targetNotebookId, keepTags, preserveStructure });
      if (res) {
        const doneCount = res.filter((item) => item.status === "done").length;
        if (doneCount) toast.success(t("fimp_done_summary", { count: doneCount }));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? localizeErrorMessage(err.message, t) : t("import_start_failed")
      );
    }
  };

  const close = (next: boolean) => {
    if (!next && running) {
      toast.info(t("fimp_importing"));
      return;
    }
    if (!next) {
      setStepOverride(null);
      reset();
    }
    onOpenChange(next);
  };

  const firstCreatedId = results?.find((item) => item.status === "done" && item.pageId)?.pageId ?? null;

  return (
    <DialogShell open={open} onOpenChange={close} className="max-w-2xl" closeAriaLabel={t("close")}>
      <DialogHeader
        title="Evernote"
        description={
          connected
            ? `${integration?.displayName || integration?.username || "Evernote"} · ${t("evernote_wizard_subtitle")}`
            : t("evernote_wizard_connect_desc")
        }
        icon={<NotebookPen className="size-4 text-emerald-400" />}
      />

      <div className="relative flex min-h-[380px] max-h-[540px] flex-1 flex-col overflow-hidden">
        {step === "connect" ? (
          <div className="overflow-y-auto px-6 py-7">
            <div className="flex flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm">
                <NotebookPen className="size-7 text-emerald-400" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">
                {t("evernote_connect_title")}
              </h3>
              <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                {t("evernote_connect_desc")}
              </p>
            </div>

            <div className="mx-auto mt-6 w-full max-w-md space-y-2.5">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[11px] font-semibold text-muted">
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-ink">
                      {t("evernote_step_login_title")}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                      {t("evernote_step_login_desc")}
                    </p>
                    <a
                      href={EVERNOTE_LOGIN_PAGE}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-400 transition hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {t("evernote_open_login")}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[11px] font-semibold text-muted">
                    2
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-ink">
                      {t("evernote_step_authorize_title")}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                      {t("evernote_step_authorize_desc")}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                variant="primary"
                className="w-full"
                disabled={connecting}
                onClick={handleConnect}
              >
                {connecting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {t("evernote_signin_action")}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-faint">
                <ShieldCheck className="size-3 text-emerald-400" />
                {t("evernote_credentials_notice")}
              </p>

              <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-3">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
                <p className="text-[11.5px] leading-relaxed text-muted">
                  {t("evernote_paid_plan_notice")}
                </p>
              </div>
            </div>

            {onSwitchToFileImport ? (
              <div className="mx-auto mt-6 w-full max-w-md border-t border-[var(--border)] pt-4">
                <Button
                  variant="ghost"
                  className="w-full text-[12px] text-muted hover:text-ink"
                  onClick={() => {
                    onOpenChange(false);
                    onSwitchToFileImport();
                  }}
                >
                  <Upload className="size-3.5" />
                  {t("evernote_import_enex_file_option")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "select" ? (
          <ImportTreeView
            tree={visibleTree}
            loading={loading}
            error={error}
            search={search}
            onSearchChange={setSearch}
            onReload={() => void load(search)}
            onRetry={() => void load(search)}
            selectedCount={selectedIds.size}
            totalCount={documentIds.length}
            stateOf={stateOf}
            toggleNode={toggleNode}
            toggleAll={toggleAll}
            isExpanded={isExpanded}
            toggleExpanded={toggleExpanded}
            expandAll={expandAll}
            collapseAll={collapseAll}
            accentClassName="text-emerald-400"
          />
        ) : null}

        {step === "preview" ? (
          <div className="space-y-5 overflow-y-auto px-5 py-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="text-[13px] font-medium text-ink">{t("import_destination_title")}</div>
              <p className="mt-1 text-[12px] text-muted">{t("import_destination_desc")}</p>
              <select
                value={targetNotebookId ?? ""}
                onChange={(event) => setTargetNotebookId(event.target.value || null)}
                className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-ink outline-none"
              >
                <option value="">{t("root_no_notebook")}</option>
                {notebooks.map((notebook) => (
                  <option key={notebook.id} value={notebook.id}>
                    {notebook.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="text-[13px] font-medium text-ink">{t("options")}</div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[12.5px] font-medium text-ink">{t("preserve_structure")}</div>
                  <div className="text-[11.5px] text-muted">
                    {t("preserve_structure_evernote_desc")}
                  </div>
                </div>
                <Switch checked={preserveStructure} onCheckedChange={setPreserveStructure} />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
                <div>
                  <div className="text-[12.5px] font-medium text-ink">{t("preserve_tags")}</div>
                  <div className="text-[11.5px] text-muted">{t("preserve_tags_desc")}</div>
                </div>
                <Switch checked={keepTags} onCheckedChange={setKeepTags} />
              </div>
            </div>
          </div>
        ) : null}

        {step === "progress" ? (
          <div className="space-y-4 overflow-y-auto px-5 py-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-ink">
                  {running ? t("importing_progress_running") : t("status_completed")}
                </span>
                <span className="text-muted">
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} />
              {progress.currentTitle ? (
                <div className="truncate text-[11.5px] text-muted">{progress.currentTitle}</div>
              ) : null}
            </div>

            {results ? (
              <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto border-t border-[var(--border)] pt-4">
                {results.map((item) => (
                  <div
                    key={item.sourceId}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-[12px]"
                  >
                    {item.status === "done" ? (
                      <Check className="size-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <CircleDashed className="size-3.5 shrink-0 text-red-400" />
                    )}
                    <span className="flex-1 truncate font-medium text-ink">{item.title}</span>
                    <Badge tone={item.status === "done" ? "success" : "danger"}>
                      {item.status === "done" ? t("status_completed") : t("status_failed")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <div className="flex items-center gap-2">
          {step === "select" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("wizard_cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!selectedIds.size}
                onClick={() => setStepOverride("preview")}
              >
                {t("wizard_review", { count: selectedIds.size ? `(${selectedIds.size})` : "" })}
                <ArrowRight className="size-3.5" />
              </Button>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <Button variant="ghost" onClick={() => setStepOverride("select")}>
                <ArrowLeft className="size-3.5" /> {t("wizard_back")}
              </Button>
              <Button variant="primary" disabled={running} onClick={handleStart}>
                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t("wizard_import_action", {
                  count: selectedIds.size,
                  unit: selectedIds.size === 1 ? t("wizard_unit_item") : t("wizard_unit_items"),
                })}
              </Button>
            </>
          ) : null}

          {step === "progress" && results ? (
            <>
              {firstCreatedId ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/home/p/${firstCreatedId}`);
                  }}
                >
                  {t("open_imported_page")}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {t("close")}
              </Button>
            </>
          ) : null}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
