"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/data/provider";
import { ImportWizard } from "@/components/notion/import-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsBody />
    </Suspense>
  );
}

function IntegrationsBody() {
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
      toast.success(`Conectado a ${result.connected.workspaceName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Integrações</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        Conecte serviços externos. Tokens são criptografados com AES-256-GCM e ficam apenas no
        servidor.
      </p>

      {oauthError ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">
            A autorização do Notion falhou: {oauthErrorLabel(oauthError)}
          </p>
        </div>
      ) : null}

      {justConnected ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">Notion conectado. Você já pode importar páginas.</p>
        </div>
      ) : null}

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Notion</h2>
          {integration?.connected ? (
            <Badge tone="success">conectado</Badge>
          ) : (
            <Badge>desconectado</Badge>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {integration?.connected
            ? `Conta Notion: ${integration.workspaceName} · token ${integration.tokenPreview ?? "•••"} · última sincronização ${formatRelative(integration.lastSyncAt ?? null)}`
            : "Cada pessoa conecta a própria conta do Notion. O login e a senha ficam no site deles; aqui só entra o token dessa conta, neste workspace."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {integration?.connected ? (
            <>
              <Button variant="primary" onClick={() => setWizardOpen(true)}>
                Importar páginas
              </Button>
              <Button variant="secondary" onClick={connect} disabled={busy}>
                Reconectar
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await adapter.disconnectNotion();
                  toast.success("Integração revogada");
                }}
              >
                Revogar acesso
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={connect} disabled={busy}>
              Conectar minha conta Notion
            </Button>
          )}
        </div>

        {importJobs.length ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Histórico de importações
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
                    {job.processedPages}/{Math.max(job.totalPages, job.processedPages)} páginas · {job.processedFiles}/{Math.max(job.totalFiles, job.processedFiles)} arquivos
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
                      {job.status}
                    </Badge>
                  </span>
                  <span className="text-[11px] text-faint">{formatRelative(job.createdAt)}</span>
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

