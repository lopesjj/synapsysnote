"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { ImportWizard } from "@/components/notion/import-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";

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
  const { integration, importJobs, adapter } = useWorkspace();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const oauthError = params.get("error");
  const justConnected = params.get("connected") === "notion";

  const connect = async () => {
    setBusy(true);
    try {
      const result = await adapter.connectNotion();
      if ("redirectUrl" in result) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success(t("connected_to", { name: result.connected.workspaceName }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("connection_failed"));
    } finally {
      setBusy(false);
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
      default:
        return status;
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t("integrations_title")}</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        {t("integrations_desc")}
      </p>

      {oauthError ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">
            {t("notion_auth_failed")}: {oauthErrorLabel(oauthError)}
          </p>
        </div>
      ) : null}

      {justConnected ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">{t("notion_connected_ready")}</p>
        </div>
      ) : null}

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Notion</h2>
          {integration?.connected ? (
            <Badge tone="success">{t("notion_connected")}</Badge>
          ) : (
            <Badge>{t("notion_disconnected")}</Badge>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {integration?.connected
            ? `${t("notion_account")}: ${integration.workspaceName} · token ${integration.tokenPreview ?? "•••"} · ${t("last_sync")} ${formatRelative(integration.lastSyncAt ?? null, language)}`
            : t("notion_connect_prompt")}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {integration?.connected ? (
            <>
              <Button variant="primary" onClick={() => setWizardOpen(true)}>
                {t("import_pages")}
              </Button>
              <Button variant="secondary" onClick={connect} disabled={busy}>
                {t("reconnect")}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await adapter.disconnectNotion();
                  toast.success(t("access_revoked"));
                }}
              >
                {t("revoke_access")}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={connect} disabled={busy}>
              {t("connect_notion_account")}
            </Button>
          )}
        </div>

        {importJobs.length ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {t("import_history")}
            </p>
            <div className="space-y-1.5">
              {importJobs.slice(0, 6).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
                >
                  <span
                    className="w-[11.5rem] shrink-0 truncate text-[12.5px] font-medium text-ink"
                    title={importJobTitle(job)}
                  >
                    {importJobTitle(job)}
                  </span>
                  <span className="text-[12px] text-ink">
                    {job.processedPages}/{Math.max(job.totalPages, job.processedPages)} {t("pages_unit")} · {job.processedFiles}/{Math.max(job.totalFiles, job.processedFiles)} {t("files_unit")}
                  </span>
                  <span className="ml-auto">
                    <Badge
                      tone={
                        job.status === "completed"
                          ? "success"
                          : job.status === "failed"
                            ? "danger"
                            : job.status === "completed_with_errors"
                              ? "warning"
                              : "accent"
                      }
                    >
                      {getStatusLabel(job.status)}
                    </Badge>
                  </span>
                  <span className="text-[11px] text-faint">{formatRelative(job.createdAt, language)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <ImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

function importJobTitle(job: { items: { title?: string }[] }): string {
  const title = job.items.find((item) => item.title?.trim())?.title?.trim();
  return title || "Importação Notion";
}

function oauthErrorLabel(code: string) {
  if (code === "access_denied") return "A autorização no Notion foi cancelada.";
  if (/restring|restricted/i.test(code)) {
    return "Esta conexão Notion só aceita workspaces escolhidos pelo desenvolvedor. Recrie a integração pública com o escopo Any workspace.";
  }
  return code;
}

