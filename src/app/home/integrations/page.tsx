"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Cloud, FileText, Layers, NotebookPen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { useUiStore } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { useTranslation, localizeErrorMessage, type TranslationKey } from "@/lib/i18n/translations";
import { connectGoogleDocsAccount } from "@/lib/import/google-connect";

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

  const oauthError = params.get("error");
  const justConnected = params.get("connected");

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
    <div className="mx-auto w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {t("integrations_title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted leading-relaxed">
            {t("integrations_desc")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] text-muted">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span>AES-256-GCM</span>
        </div>
      </div>

      {oauthError ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">
            {t("notion_auth_failed")}: {localizeErrorMessage(oauthErrorLabel(oauthError, t), t)}
          </p>
        </div>
      ) : null}

      {justConnected ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">
            {t("connected_to", { name: connectedProviderLabel(justConnected, t) })}
          </p>
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">{t("cloud_services_title")}</h2>
          <p className="text-[12.5px] text-muted">{t("cloud_services_desc")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-[var(--border-strong)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] font-semibold text-[13px] text-ink">
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

              <p className="mt-3 min-h-[4rem] text-[12px] leading-relaxed text-muted">
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
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={connectNotion}
                      disabled={busyService === "notion"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted hover:text-red-400"
                      onClick={async () => {
                        await adapter.disconnectNotion();
                        toast.success(t("access_revoked"));
                      }}
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

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-[var(--border-strong)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-blue-500/10 text-blue-400">
                    <Cloud className="size-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">Google Docs</h3>
                </div>
                {googleDocsIntegration?.connected ? (
                  <Badge tone="success">{t("google_connected")}</Badge>
                ) : (
                  <Badge>{t("google_disconnected")}</Badge>
                )}
              </div>

              <p className="mt-3 min-h-[4rem] text-[12px] leading-relaxed text-muted">
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
                    onClick={() => useUiStore.getState().setGoogleDocsImportOpen(true)}
                  >
                    {t("import_google_docs")}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={connectGoogle}
                      disabled={busyService === "google"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted hover:text-red-400"
                      onClick={async () => {
                        if (adapter.disconnectGoogleDocs) await adapter.disconnectGoogleDocs();
                        toast.success(t("access_revoked"));
                      }}
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

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-[var(--border-strong)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-emerald-500/10 text-emerald-400">
                    <NotebookPen className="size-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">Evernote</h3>
                </div>
                {evernoteIntegration?.connected ? (
                  <Badge tone="success">{t("evernote_connected")}</Badge>
                ) : (
                  <Badge>{t("evernote_disconnected")}</Badge>
                )}
              </div>

              <p className="mt-3 min-h-[4rem] text-[12px] leading-relaxed text-muted">
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
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={connectEvernote}
                      disabled={busyService === "evernote"}
                    >
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted hover:text-red-400"
                      onClick={async () => {
                        if (adapter.disconnectEvernote) await adapter.disconnectEvernote();
                        toast.success(t("access_revoked"));
                      }}
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

      <div className="mt-10 space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">
            {t("local_file_imports_title")}
          </h2>
          <p className="text-[12.5px] text-muted">{t("local_file_imports_desc")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-ink">
                  <FileText className="size-4 text-blue-400" />
                </span>
                <span className="text-[13.5px] font-medium text-ink">Microsoft Word (.docx)</span>
              </div>
              <p className="mt-2.5 min-h-[3rem] text-[12px] leading-relaxed text-muted">
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

          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-ink">
                  <NotebookPen className="size-4 text-emerald-400" />
                </span>
                <span className="text-[13.5px] font-medium text-ink">Evernote (.enex)</span>
              </div>
              <p className="mt-2.5 min-h-[3rem] text-[12px] leading-relaxed text-muted">
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

      {importJobs.length ? (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="size-4 text-muted" />
            <h2 className="text-[14px] font-semibold text-ink">{t("import_history")}</h2>
          </div>
          <div className="space-y-1.5">
            {importJobs.slice(0, 12).map((job) => {
              const provider = resolveJobProvider(job, t);
              return (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center gap-2.5 sm:gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 transition hover:bg-[var(--surface-2)]/40"
                >
                  <div className="w-[8.75rem] shrink-0">
                    <Badge tone={provider.tone} className="gap-1.5 px-2 py-0.5 font-medium text-[11px]">
                      {provider.icon}
                      <span className="truncate">{provider.label}</span>
                    </Badge>
                  </div>
                  <span className="shrink-0 text-[12px] text-muted tabular-nums">
                    {job.processedPages}/{Math.max(job.totalPages, job.processedPages)} {t("notes_unit")} · {job.processedFiles}/{Math.max(job.totalFiles, job.processedFiles)} {t("files_unit")}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
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
                    >
                      {getStatusLabel(job.status)}
                    </Badge>
                    <span className="text-[11px] text-faint tabular-nums">
                      {formatRelative(job.createdAt, language)}
                    </span>
                  </span>
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
  return code;
}

function oauthErrorLabel(code: string, t: (key: TranslationKey) => string): string {
  if (code === "access_denied") return t("oauth_error_access_denied");
  if (/restring|restricted/i.test(code)) return t("oauth_error_restricted");
  if (code === "firebase_admin_not_configured") return t("firebase_admin_not_configured");
  if (code === "google_client_not_configured") return t("oauth_error_google_not_configured");
  if (/state_mismatch|invalid_state/.test(code)) return t("oauth_error_state");
  if (/incomplete_response/.test(code)) return t("oauth_error_incomplete");
  if (/start_from_app/.test(code)) return t("oauth_error_start_from_app");
  if (/token_exchange_failed|connection_failed/.test(code)) return t("oauth_error_generic");
  return code;
}
