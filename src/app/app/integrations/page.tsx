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
  const { integration, importJobs, adapter, mode } = useWorkspace();
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
        servidor, gravados pelo Firebase Admin.
      </p>

      {oauthError ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
          <p className="text-[12.5px] text-ink">
            A autorização do Notion falhou: <span className="font-mono">{oauthError}</span>
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
            ? `Workspace ${integration.workspaceName} · token ${integration.tokenPreview ?? "•••"} · última sincronização ${formatRelative(integration.lastSyncAt ?? null)}`
            : "Importe páginas aninhadas, bases de dados e anexos. A árvore e o worker rodam no servidor com Firebase Admin — o navegador nunca vê o token."}
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
              Conectar workspace
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
                  <span className="font-mono text-[11px] text-faint">{job.id.slice(0, 10)}</span>
                  <span className="text-[12px] text-ink">
                    {job.processedPages}/{job.totalPages} páginas · {job.processedFiles}/{job.totalFiles} arquivos
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

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ServiceCard
          title="Firestore & Storage"
          status={mode === "firestore" ? "Ativo" : "Demonstração local"}
          description={
            mode === "firestore"
              ? "Sincronização em tempo real com cache offline persistente."
              : "Preencha NEXT_PUBLIC_FIREBASE_* para ativar."
          }
          active={mode === "firestore"}
        />
        <ServiceCard
          title="Firebase Admin"
          status={mode === "firestore" ? "Importação Notion" : "Indisponível"}
          description="OAuth, árvore e worker de importação rodam no servidor, sem Cloud Functions obrigatórias."
          active={mode === "firestore"}
        />
        <ServiceCard
          title="OCR e Gemini"
          status={mode === "firestore" ? "Via Cloud Functions" : "Simulado"}
          description="Texto de imagens, transcrição de voz e embeddings para a busca."
          active={mode === "firestore"}
        />
      </section>

      <ImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

function ServiceCard({
  title,
  status,
  description,
  active,
}: {
  title: string;
  status: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-[11.5px] text-muted">{description}</p>
      <div className="mt-2.5">
        <Badge tone={active ? "success" : "neutral"}>{status}</Badge>
      </div>
    </div>
  );
}
