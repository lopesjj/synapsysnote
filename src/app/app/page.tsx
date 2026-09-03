"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useWorkspace } from "@/lib/data/provider";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { formatRelative, truncate } from "@/lib/utils";

export default function WorkspaceHome() {
  const router = useRouter();
  const { user } = useAuth();
  const { livePages, databases, notebooks, importJobs, adapter, integration } = useWorkspace();

  const recent = useMemo(
    () => [...livePages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [livePages]
  );

  const stats = useMemo(() => {
    const withOcr = livePages.filter((p) => p.extractedOCRText).length;
    const withAudio = livePages.filter((p) => p.transcriptText).length;
    const imported = livePages.filter((p) => p.notionPageId).length;
    return [
      { label: "Páginas", value: livePages.length },
      { label: "Bases", value: databases.length },
      { label: "Com OCR", value: withOcr },
      { label: "Com áudio", value: withAudio },
      { label: "Do Notion", value: imported },
    ];
  }, [databases.length, livePages]);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-[12.5px] text-muted">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.025em] text-ink">
            {greeting}, {user?.displayName?.split(" ")[0] ?? "você"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const database = await adapter.createDatabase({ name: "Nova base" });
              router.push(`/app/db/${database.id}`);
            }}
          >
            Nova base
          </Button>
          <Button variant="primary" size="sm" onClick={async () => {
              const page = await adapter.createPage({ title: "Sem título" });
              router.push(`/app/p/${page.id}`);
            }}>
            Nova página
          </Button>
        </div>
      </motion.div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
          >
            <p className="text-[22px] font-semibold tabular-nums tracking-tight text-ink">{stat.value}</p>
            <p className="text-[11.5px] text-muted">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-9 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_0.6fr]">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-ink">Editadas recentemente</h2>

          {recent.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recent.map((page) => (
                <Link
                  key={page.id}
                  href={`/app/p/${page.id}`}
                  className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 transition hover:border-[var(--accent)]/50 hover:shadow-[var(--shadow-panel)]"
                >
                  <p className="truncate text-[13px] font-medium text-ink">{page.title || "Sem título"}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                    {truncate(page.plainText.replace(/\n/g, " "), 110) || "Página vazia"}
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-faint">{formatRelative(page.updatedAt)}</span>
                    {page.notionPageId ? <Badge tone="accent">Notion</Badge> : null}
                    {page.extractedOCRText ? <Badge>OCR</Badge> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Seu workspace está vazio"
              description="Crie a primeira página ou traga tudo o que já existe no seu Notion."
              action={
                <Button
                  variant="primary"
                  onClick={async () => {
                    const page = await adapter.createPage({ title: "Sem título" });
                    router.push(`/app/p/${page.id}`);
                  }}
                >
                  Criar página
                </Button>
              }
            />
          )}
        </section>

        <aside className="space-y-6">
          <div>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Cadernos</h2>
            <div className="space-y-1.5">
              {notebooks.map((notebook) => {
                const count = livePages.filter((p) => p.notebookId === notebook.id).length;
                return (
                  <div
                    key={notebook.id}
                    className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{notebook.name}</span>
                    <span className="text-[11px] text-faint">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[13px] font-semibold text-ink">Migração do Notion</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              {integration?.connected
                ? `Conectado a ${integration.workspaceName}. ${
                    importJobs.length
                      ? `${importJobs.length} importação(ões) registrada(s).`
                      : "Nenhuma importação executada ainda."
                  }`
                : "Traga páginas aninhadas, bases de dados e anexos. Arquivos são rehospedados no Cloud Storage via Firebase Admin."}
            </p>
            <Link
              href="/app/integrations"
              className="mt-3 inline-flex items-center text-[12px] font-medium text-[var(--accent)] hover:underline"
            >
              Abrir integrações
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
