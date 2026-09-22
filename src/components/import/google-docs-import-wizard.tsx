"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  Cloud,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Switch } from "@/components/ui/primitives";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";
import { useGoogleDocsImport } from "@/hooks/use-google-docs-import";
import { filterImportTree } from "@/hooks/use-import-tree";
import { ImportTreeView } from "./import-tree-view";
import { connectGoogleDocsAccount } from "@/lib/import/google-connect";

type Step = "connect" | "select" | "preview" | "progress";

export function GoogleDocsImportWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    tabsError,
    running,
    progress,
    results,
    cancel,
    reset,
    notebooks,
  } = useGoogleDocsImport({ active: open });

  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const [targetNotebookId, setTargetNotebookId] = useState<string | null>(null);
  const [uploadMedia, setUploadMedia] = useState(true);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState(false);

  const step: Step = running || results ? "progress" : (stepOverride ?? (connected ? "select" : "connect"));
  const visibleTree = useMemo(() => filterImportTree(tree, search), [tree, search]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await connectGoogleDocsAccount(connect);
      if (result.redirected) return;
      toast.success(t("connected_to", { name: result.accountName || "Google Docs" }));
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
      await start({ targetNotebookId, uploadMedia, preserveStructure });
      if (tabsError.current) {
        toast.warning(
          tabsError.current === "docs_api_disabled"
            ? t("gdoc_tabs_api_disabled")
            : t("gdoc_tabs_unavailable")
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? localizeErrorMessage(err.message, t) : t("import_start_failed")
      );
    }
  };

  const close = (next: boolean) => {
    if (!next && running) {
      toast.info(t("wizard_continue_background"));
      onOpenChange(false);
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
        title="Google Docs"
        description={
          connected
            ? `${integration?.accountEmail || integration?.accountName || "Google"} · ${t("gdoc_wizard_subtitle")}`
            : t("gdoc_wizard_connect_desc")
        }
        icon={<Cloud className="size-4 text-blue-400" />}
      />

      <div className="relative flex min-h-[380px] max-h-[540px] flex-1 flex-col overflow-hidden">
        {step === "connect" ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm">
              <Cloud className="size-7 text-blue-400" />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{t("gdoc_connect_title")}</h3>
            <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
              {t("gdoc_connect_desc")}
            </p>
            <p className="mt-2 max-w-sm text-[11.5px] leading-relaxed text-faint">
              {t("gdoc_structure_hint")}
            </p>
            <Button variant="primary" className="mt-6" disabled={connecting} onClick={handleConnect}>
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
              {t("connect_google_account")}
            </Button>
          </div>
        ) : null}

        {step === "select" ? (
          error && /expirou|expired|401|sessão/i.test(error) ? (
            <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] text-2xl">
                ⚠️
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-ink">{t("google_session_expired_title")}</p>
                <p className="mt-1 text-[12px] text-muted">{t("google_session_expired_desc")}</p>
              </div>
              <Button variant="primary" disabled={connecting} onClick={handleConnect}>
                {connecting ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
                {t("reconnect")}
              </Button>
            </div>
          ) : (
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
              accentClassName="text-blue-400"
            />
          )
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
                  <div className="text-[11.5px] text-muted">{t("preserve_structure_gdoc_desc")}</div>
                </div>
                <Switch checked={preserveStructure} onCheckedChange={setPreserveStructure} />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
                <div>
                  <div className="text-[12.5px] font-medium text-ink">
                    {t("preserve_images_and_media")}
                  </div>
                  <div className="text-[11.5px] text-muted">{t("preserve_images_desc")}</div>
                </div>
                <Switch checked={uploadMedia} onCheckedChange={setUploadMedia} />
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
              {running ? (
                <p className="text-[11.5px] leading-relaxed text-muted">
                  {t("import_background_hint")}
                </p>
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

          {step === "progress" && running ? (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {t("wizard_continue_background")}
              </Button>
              <Button variant="danger" onClick={cancel}>
                {t("wizard_cancel_import")}
              </Button>
            </>
          ) : null}

          {step === "progress" && !running && results ? (
            <>
              {firstCreatedId ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    close(false);
                    router.push(`/home/p/${firstCreatedId}`);
                  }}
                >
                  {t("open_imported_page")}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => close(false)}>
                {t("close")}
              </Button>
            </>
          ) : null}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
