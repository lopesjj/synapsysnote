"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Cloud, Download, FileText, FolderArchive, Layers, Loader2, NotebookPen, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useUiStore } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { useTranslation, localizeErrorMessage, type TranslationKey } from "@/lib/i18n/translations";
import { connectGoogleDocsAccount } from "@/lib/import/google-connect";
import { downloadAccountData } from "@/lib/account/account-client";

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsBody />
    </Suspense>
  );
}

function IntegrationsBody() {
  const { t, language } = useTranslation();
  const params = useSearchParams();
  const {
    integration,
    googleDocsIntegration,
    evernoteIntegration,
    importJobs,
    adapter,
  } = useWorkspace();

  const [busyService, setBusyService] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const googleTokenExpiresAt =
    googleDocsIntegration?.tokenExpiresAt ??
    (googleDocsIntegration?.connectedAt ? googleDocsIntegration.connectedAt + 55 * 60_000 : null);
  const googleSessionExpired = Boolean(
    googleDocsIntegration?.connected &&
      googleDocsIntegration.refreshable !== true &&
      googleTokenExpiresAt !== null &&
      googleTokenExpiresAt <= now
  );

  const [downloadingWorkspace, setDownloadingWorkspace] = useState(false);

  const oauthError = params.get("error");
  const oauthProvider = oauthError
    ? connectedProviderLabel(params.get("provider") || oauthError, t)
    : "";
  const justConnected = params.get("connected");
  const justConnectedLabel = justConnected ? connectedProviderLabel(justConnected, t) : "";

  const handleDownloadSynapsysWorkspace = async () => {
    setDownloadingWorkspace(true);
    try {
      await downloadAccountData({ workspaceId: adapter.workspaceId });
      toast.success(t("account_export_running"));
    } catch {
      toast.error(t("account_export_failed"));
    } finally {
      setDownloadingWorkspace(false);
    }
  };

  const connectNotion = async () => {
    setBusyService("notion");
    try {
      const result = await adapter.connectNotion();
      if ("redirectUrl" in result) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success(t("connected_to", { name: result.connected.workspaceName }));
    } catch (error) {
      toast.error(error instanceof Error ? localizeErrorMessage(error.message, t) : t("connection_failed"));
    } finally {
      setBusyService(null);
    }
  };

  const connectGoogle = async () => {
    setBusyService("google");
    try {
      const result = await connectGoogleDocsAccount((input) => {
        if (!adapter.connectGoogleDocs) throw new Error("guest_account_required");
        return adapter.connectGoogleDocs(input);
      });
      if (result.redirected) return;
      toast.success(t("connected_to", { name: result.accountName || "Google Docs" }));
      useUiStore.getState().setGoogleDocsImportOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? localizeErrorMessage(error.message, t) : t("connection_failed")
      );
    } finally {
      setBusyService(null);
    }
  };

  const connectEvernote = () => {
    useUiStore.getState().setEvernoteImportOpen(true, "connect");
  };

  const revokeAccess = async (service: string, disconnect: () => Promise<void> | undefined) => {
    setBusyService(service);
    try {
      await disconnect();
      toast.success(t("access_revoked"));
    } catch {
      toast.error(`${t("revoke_access")}: ${t("status_failed")}`);
    } finally {
      setBusyService(null);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return t("status_completed");
      case "failed":
        return t("status_failed");
      case "completed_with_errors":
        return t("status_completed_with_errors");
      case "canceled":
        return t("status_canceled");
      case "pending":
        return t("wizard_status_queued");
      case "discovering":
        return t("wizard_status_discovering");
      case "running":
        return t("wizard_status_importing");
      default:
        return status;
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] px-4 sm:px-6 md:px-8 xl:px-10 py-6 md:py-9 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-ink shadow-xs">
              <Cloud className="size-5 text-[var(--accent)]" />
            </span>
            <div>
              <h1 className="text-[22px] sm:text-[24px] lg:text-[26px] font-semibold tracking-[-0.025em] text-ink">
                {t("integrations_title")}
              </h1>
              <p className="mt-0.5 text-[12.5px] sm:text-[13px] text-muted max-w-2xl leading-relaxed">
                {t("integrations_desc")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] text-muted shadow-xs">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span className="font-mono font-medium">AES-256-GCM</span>
        </div>
      </div>

      {oauthError ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3.5">
          <p className="text-[12.5px] text-ink">
            {oauthProvider ? t("integration_auth_failed", { provider: oauthProvider }) : t("connection_failed")}:{" "}
            {oauthErrorLabel(oauthError, t)}
          </p>
        </div>
      ) : null}

      {justConnectedLabel ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)] p-3.5">
          <p className="text-[12.5px] text-ink">
            {t("connected_to", { name: justConnectedLabel })}
          </p>
        </div>
      ) : null}

      <div className="mt-8 sm:mt-10 space-y-4">
        <div>
          <h2 className="text-[16px] sm:text-[17px] font-semibold text-ink">{t("cloud_services_title")}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{t("cloud_services_desc")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5">
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)] hover:shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] font-semibold text-[13px] text-ink">
                    N
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">Notion</h3>
                </div>
                {integration?.connected ? (
                  <Badge tone="success">{t("notion_connected")}</Badge>
                ) : (
                  <Badge>{t("notion_disconnected")}</Badge>
                )}
              </div>

              <p className="mt-3.5 min-h-[3.5rem] sm:min-h-[4rem] text-[12px] leading-relaxed text-muted">
                {integration?.connected
                  ? `${t("notion_account")}: ${integration.workspaceName} · ${t("last_sync")} ${formatRelative(integration.lastSyncAt ?? null, language)}`
                  : t("notion_connect_prompt")}
              </p>
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
              {integration?.connected ? (
                <>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => useUiStore.getState().setImportOpen(true)}
                  >
                    {t("import_pages")}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full truncate"
                      onClick={connectNotion}
                      disabled={busyService === "notion"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted hover:text-red-400 truncate"
                      disabled={busyService === "notion"}
                      onClick={() => void revokeAccess("notion", () => adapter.disconnectNotion())}
                    >
                      {t("revoke_access")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={connectNotion}
                  disabled={busyService === "notion"}
                >
                  {t("connect_notion_account")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)] hover:shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-blue-500/10 text-blue-400">
                    <Cloud className="size-4.5" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">Google Docs</h3>
                </div>
                {googleSessionExpired ? (
                  <Badge tone="warning">{t("google_session_expired_title")}</Badge>
                ) : googleDocsIntegration?.connected ? (
                  <Badge tone="success">{t("google_connected")}</Badge>
                ) : (
                  <Badge>{t("google_disconnected")}</Badge>
                )}
              </div>

              <p className="mt-3.5 min-h-[3.5rem] sm:min-h-[4rem] text-[12px] leading-relaxed text-muted">
                {googleDocsIntegration?.connected
                  ? `${t("google_account")}: ${googleDocsIntegration.accountEmail} · ${t("last_sync")} ${formatRelative(googleDocsIntegration.lastSyncAt ?? null, language)}`
                  : t("google_connect_prompt")}
              </p>
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
              {googleDocsIntegration?.connected ? (
                <>
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={busyService === "google"}
                    onClick={() =>
                      googleSessionExpired
                        ? void connectGoogle()
                        : useUiStore.getState().setGoogleDocsImportOpen(true)
                    }
                  >
                    {t("import_google_docs")}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full truncate"
                      onClick={connectGoogle}
                      disabled={busyService === "google"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted hover:text-red-400 truncate"
                      disabled={busyService === "google"}
                      onClick={() => void revokeAccess("google", () => adapter.disconnectGoogleDocs?.())}
                    >
                      {t("revoke_access")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={connectGoogle}
                  disabled={busyService === "google"}
                >
                  {t("connect_google_account")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)] hover:shadow-sm sm:col-span-2 lg:col-span-1">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-emerald-500/10 text-emerald-400">
                    <NotebookPen className="size-4.5" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">Evernote</h3>
                </div>
                {evernoteIntegration?.connected ? (
                  <Badge tone="success">{t("evernote_connected")}</Badge>
                ) : (
                  <Badge>{t("evernote_disconnected")}</Badge>
                )}
              </div>

              <p className="mt-3.5 min-h-[3.5rem] sm:min-h-[4rem] text-[12px] leading-relaxed text-muted">
                {evernoteIntegration?.connected
                  ? `${t("evernote_account")}: ${evernoteIntegration.displayName || evernoteIntegration.username} · ${t("last_sync")} ${formatRelative(evernoteIntegration.lastSyncAt ?? null, language)}`
                  : t("evernote_connect_prompt")}
              </p>
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
              {evernoteIntegration?.connected ? (
                <>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => useUiStore.getState().setEvernoteImportOpen(true)}
                  >
                    {t("import_evernote_notes")}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full truncate"
                      onClick={connectEvernote}
                      disabled={busyService === "evernote"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted hover:text-red-400 truncate"
                      disabled={busyService === "evernote"}
                      onClick={() => void revokeAccess("evernote", () => adapter.disconnectEvernote?.())}
                    >
                      {t("revoke_access")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={connectEvernote}
                  disabled={busyService === "evernote"}
                >
                  {t("connect_evernote_account")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 sm:mt-12 space-y-4">
        <div>
          <h2 className="text-[16px] sm:text-[17px] font-semibold text-ink">
            {t("local_file_imports_title")}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{t("local_file_imports_desc")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:gap-5">
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-ink">
                  <FileText className="size-4.5 text-blue-400" />
                </span>
                <span className="text-[14px] font-medium text-ink">Microsoft Word (.docx)</span>
              </div>
              <p className="mt-3 min-h-[3rem] text-[12px] leading-relaxed text-muted">
                {t("fimp_card_word_desc")}
              </p>
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => useUiStore.getState().setFileImportProvider("word")}
            >
              {t("word_file_import_button")}
            </Button>
          </div>

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-ink">
                  <NotebookPen className="size-4.5 text-emerald-400" />
                </span>
                <span className="text-[14px] font-medium text-ink">Evernote (.enex)</span>
              </div>
              <p className="mt-3 min-h-[3rem] text-[12px] leading-relaxed text-muted">
                {t("fimp_card_evernote_desc")}
              </p>
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => useUiStore.getState().setFileImportProvider("evernote")}
            >
              {t("evernote_file_import_button")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-10 sm:mt-12 space-y-4">
        <div>
          <h2 className="text-[16px] sm:text-[17px] font-semibold text-ink">
            {t("synapsys_workspace_backup_title")}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {t("synapsys_workspace_backup_desc")}
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-all hover:border-[var(--border-strong)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="flex size-10.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-ink shrink-0">
                <FolderArchive className="size-5.5 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14.5px] font-semibold text-ink">Synapsys Workspace</h3>
                  <Badge tone="accent">.zip</Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted max-w-xl leading-relaxed">
                  {t("synapsys_workspace_card_hint")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 shrink-0 self-start md:self-center w-full md:w-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadSynapsysWorkspace}
                disabled={downloadingWorkspace}
                className="flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              >
                {downloadingWorkspace ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                <span>{t("synapsys_workspace_export_btn")}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => useUiStore.getState().setWorkspaceRestoreOpen(true)}
                className="flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              >
                <Upload className="size-3.5" />
                <span>{t("synapsys_workspace_import_btn")}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {importJobs.length ? (
        <div className="mt-10 sm:mt-12 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-4 border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-muted" />
              <h2 className="text-[14.5px] font-semibold text-ink">{t("import_history")}</h2>
            </div>
            <span className="text-[11.5px] text-faint font-medium">
              {importJobs.length} {importJobs.length === 1 ? t("wizard_unit_item") : t("wizard_unit_items")}
            </span>
          </div>
          <div className="space-y-2">
            {importJobs.slice(0, 12).map((job) => {
              const provider = resolveJobProvider(job, t);
              return (
                <div
                  key={job.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 rounded-[var(--radius-sm)] border border-[var(--border)] px-3.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-36 md:w-40 shrink-0">
                      <Badge tone={provider.tone} className="gap-1.5 px-2 py-0.5 font-medium text-[11px] max-w-full">
                        {provider.icon}
                        <span className="truncate">{provider.label}</span>
                      </Badge>
                    </div>
                    <span className="text-[12px] text-muted tabular-nums truncate">
                      {job.processedPages}/{Math.max(job.totalPages, job.processedPages)} {t("notes_unit")} · {job.processedFiles}/{Math.max(job.totalFiles, job.processedFiles)} {t("files_unit")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 ps-1 sm:ps-0">
                    <Badge
                      tone={
                        job.status === "completed"
                          ? "success"
                          : job.status === "failed"
                            ? "danger"
                            : job.status === "completed_with_errors"
                              ? "warning"
                              : job.status === "canceled"
                                ? "neutral"
                                : "accent"
                      }
                      className="text-[11px]"
                    >
                      {getStatusLabel(job.status)}
                    </Badge>
                    <span className="text-[11.5px] text-faint tabular-nums w-24 text-right">
                      {formatRelative(job.createdAt, language)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resolveJobProvider(
  job: import("@/types/models").ImportJob,
  t: (key: TranslationKey) => string
): { id: string; label: string; icon: React.ReactNode; tone: "neutral" | "accent" | "success" | "warning" } {
  const p = (job.provider || (job as { source?: string }).source || "").toLowerCase();
  if (p === "google_docs" || p === "google-docs" || p === "google") {
    return {
      id: "google_docs",
      label: t("provider_google_docs"),
      icon: <Cloud className="size-3 text-blue-400 shrink-0" />,
      tone: "accent",
    };
  }
  if (p === "evernote") {
    return {
      id: "evernote",
      label: t("provider_evernote"),
      icon: <NotebookPen className="size-3 text-emerald-400 shrink-0" />,
      tone: "success",
    };
  }
  if (p === "docx" || p === "word") {
    return {
      id: "docx",
      label: t("provider_docx"),
      icon: <FileText className="size-3 text-sky-400 shrink-0" />,
      tone: "accent",
    };
  }
  if (p === "enex") {
    return {
      id: "enex",
      label: t("provider_enex"),
      icon: <FileText className="size-3 text-emerald-400 shrink-0" />,
      tone: "success",
    };
  }
  if (p === "file" || p === "html") {
    return {
      id: "file",
      label: t("provider_file"),
      icon: <FileText className="size-3 text-muted shrink-0" />,
      tone: "neutral",
    };
  }
  return {
    id: "notion",
    label: t("provider_notion"),
    icon: (
      <span className="flex size-3 items-center justify-center font-bold text-[9.5px] leading-none text-ink shrink-0">
        N
      </span>
    ),
    tone: "neutral",
  };
}

function connectedProviderLabel(code: string, t: (key: TranslationKey) => string): string {
  const normalized = code.toLowerCase();
  if (normalized.startsWith("google")) return t("provider_google_docs");
  if (normalized.startsWith("evernote")) return t("provider_evernote");
  if (normalized.startsWith("notion")) return t("provider_notion");
  return "";
}

function oauthErrorLabel(code: string, t: (key: TranslationKey) => string): string {
  if (code === "access_denied") return t("oauth_error_access_denied");
  if (/restring|restricted/i.test(code)) return t("oauth_error_restricted");
  if (code === "firebase_admin_not_configured") return t("firebase_admin_not_configured");
  if (code === "google_client_not_configured") return t("oauth_error_google_not_configured");
  if (/state_mismatch|invalid_state/.test(code)) return t("oauth_error_state");
  if (/incomplete_response/.test(code)) return t("oauth_error_incomplete");
  if (/start_from_app/.test(code)) return t("oauth_error_start_from_app");
  return t("oauth_error_generic");
}
