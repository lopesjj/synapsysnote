"use client";

import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, TRASH_RETENTION_DAYS } from "@/lib/data/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";

export default function TrashPage() {
  const { trashedPages, adapter } = useWorkspace();

  const expiresOn = (deletedAt: number | null) =>
    new Date((deletedAt ?? 0) + TRASH_RETENTION_DAYS * 86_400_000).toLocaleDateString("pt-BR");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Lixeira</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        Páginas excluídas são recuperáveis por {TRASH_RETENTION_DAYS} dias. Depois disso, uma função
        agendada remove os documentos e os arquivos correspondentes no Cloud Storage.
      </p>

      <div className="mt-6 space-y-2">
        {trashedPages.length ? (
          trashedPages.map((page) => (
            <div
              key={page.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5"
            >
              <span className="text-base">{page.icon ?? "📄"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{page.title || "Sem título"}</p>
                <p className="text-[11px] text-faint">
                  Excluída {formatRelative(page.deletedAt)} · recuperável até {expiresOn(page.deletedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await adapter.restorePage(page.id);
                  toast.success("Página restaurada");
                }}
              >
                <RotateCcw /> Restaurar
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Excluir definitivamente"
                onClick={async () => {
                  await adapter.purgePage(page.id);
                  toast.success("Página excluída definitivamente");
                }}
              >
                <Trash2 className="text-[var(--danger)]" />
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            title="A lixeira está vazia"
            description="Nada foi excluído nos últimos 30 dias."
            action={
              <Link href="/app" className="text-[12.5px] text-[var(--accent)] hover:underline">
                Voltar ao início
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
