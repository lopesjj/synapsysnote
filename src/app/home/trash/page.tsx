"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";

export default function TrashPage() {
  const { trashedPages, adapter } = useWorkspace();
  const [emptying, setEmptying] = useState(false);

  const expiresOn = (deletedAt: number | null) =>
    new Date((deletedAt ?? 0) + TRASH_RETENTION_DAYS * 86_400_000).toLocaleDateString("pt-BR");

  const emptyTrash = async () => {
    const count = trashedPages.length;
    if (!count) return;
    const label = count === 1 ? "1 página" : `${count} páginas`;
    if (
      !window.confirm(
        `Excluir definitivamente ${label} da lixeira? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setEmptying(true);
    try {
      await adapter.emptyTrash();
      toast.success(count === 1 ? "Lixeira esvaziada" : `${count} páginas excluídas definitivamente`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível esvaziar a lixeira. Tente novamente."
      );
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">
              <Trash2 className="size-5" />
            </span>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">Lixeira</h1>
              <p className="mt-0.5 text-[12px] text-faint">
                {trashedPages.length
                  ? `${trashedPages.length} ${trashedPages.length === 1 ? "página" : "páginas"} · recuperáveis por ${TRASH_RETENTION_DAYS} dias`
                  : `Itens excluídos ficam aqui por ${TRASH_RETENTION_DAYS} dias`}
              </p>
            </div>
          </div>
        </div>
        {trashedPages.length ? (
          <Button
            variant="danger"
            size="sm"
            className="w-full shrink-0 rounded-full px-3.5 sm:w-auto"
            disabled={emptying}
            onClick={() => void emptyTrash()}
          >
            <Trash2 />
            {emptying ? "Esvaziando…" : "Esvaziar lixeira"}
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        {trashedPages.length ? (
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
            {trashedPages.map((page, index) => (
              <div
                key={page.id}
                className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
                style={
                  index < trashedPages.length - 1
                    ? { borderBottom: "1px solid var(--border)" }
                    : undefined
                }
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)]">
                  <WorkspaceIcon icon={page.icon} fallback="📄" variant="list" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                    {page.title || "Sem título"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-faint">
                    Excluída {formatRelative(page.deletedAt)} · até {expiresOn(page.deletedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                    disabled={emptying}
                    onClick={async () => {
                      try {
                        await adapter.restorePage(page.id);
                        toast.success("Página restaurada");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Não foi possível restaurar. Tente novamente."
                        );
                      }
                    }}
                  >
                    <RotateCcw /> Restaurar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full hover:bg-red-50 hover:text-[var(--danger)] dark:hover:bg-red-950/40"
                    aria-label="Excluir definitivamente"
                    disabled={emptying}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Excluir "${page.title || "Sem título"}" definitivamente? Esta ação não pode ser desfeita.`
                        )
                      ) {
                        return;
                      }
                      try {
                        await adapter.purgePage(page.id);
                        toast.success("Página excluída definitivamente");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Não foi possível excluir. Tente novamente."
                        );
                      }
                    }}
                  >
                    <Trash2 className="text-[var(--danger)]" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="A lixeira está vazia"
            description="Nada foi excluído nos últimos 30 dias."
            action={
              <Link href="/home" className="text-[12.5px] text-[var(--accent)] hover:underline">
                Voltar ao início
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
