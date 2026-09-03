"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FolderTree,
  Image as ImageIcon,
  Loader2,
  Table2,
  Upload,
} from "lucide-react";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Switch } from "@/components/ui/primitives";
import { useZipImport } from "@/hooks/use-zip-import";
import { cn } from "@/lib/utils";

/**
 * Notion `.zip` import.
 *
 * The whole pipeline runs in the browser — unzip, Markdown/CSV conversion,
 * media upload, batched writes — so no export ever passes through a server the
 * user did not choose. The archive is analysed and summarised before anything
 * is written, since the import creates notebooks and notes in bulk.
 */
export function ZipImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const {
    file,
    plan,
    progress,
    result,
    error,
    running,
    uploadMedia,
    resolveLinks,
    setUploadMedia,
    setResolveLinks,
    analyse,
    start,
    cancel,
    reset,
  } = useZipImport();

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const analysing = progress.stage === "reading" || progress.stage === "analysing";
  const done = progress.stage === "done";

  const mediaPercent = progress.mediaTotal
    ? Math.round((progress.mediaUploaded / progress.mediaTotal) * 100)
    : 0;

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <DialogHeader
        icon={<FileArchive className="size-4" />}
        title="Importar arquivo .zip do Notion"
        description="Exporte no Notion em “Markdown & CSV”, com subpáginas incluídas. Nada sai do seu navegador além das mídias, que vão direto para o seu Storage."
      />

      <div className="max-h-[58vh] space-y-4 overflow-y-auto px-5 py-4">
        {!plan && !done ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) void analyse(dropped);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed px-6 py-10 text-center transition",
              dropActive
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)]"
            )}
          >
            {analysing ? (
              <>
                <Loader2 className="size-6 animate-spin text-[var(--accent)]" />
                <p className="text-[13px] text-ink">{progress.step}</p>
                <p className="max-w-sm text-[11.5px] text-muted">{file?.name}</p>
              </>
            ) : (
              <>
                <div className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
                  <Upload className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-medium text-ink">
                    Arraste o .zip aqui ou selecione o arquivo
                  </p>
                  <p className="text-[11.5px] text-muted">
                    Pastas viram cadernos e subcadernos; imagens são reenviadas para o Firebase
                    Storage.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => input.current?.click()}>
                  Selecionar arquivo
                </Button>
              </>
            )}
            <input
              ref={input}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void analyse(selected);
                event.target.value = "";
              }}
            />
          </div>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] px-3 py-2 text-[12px] text-[var(--danger)]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {plan && !done ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={<FolderTree className="size-3.5" />} value={plan.notebooks.length} label="Cadernos" />
              <Stat icon={<FileArchive className="size-3.5" />} value={plan.summary.pageCount} label="Notas" />
              <Stat icon={<Table2 className="size-3.5" />} value={plan.summary.databaseCount} label="Bases" />
              <Stat icon={<ImageIcon className="size-3.5" />} value={plan.summary.mediaCount} label="Mídias" />
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)]">
              <p className="border-b border-[var(--border)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
                Estrutura detectada
              </p>
              <ul className="max-h-40 divide-y divide-[var(--border)] overflow-y-auto">
                {plan.summary.notebooks.map((notebook) => (
                  <li
                    key={notebook.name}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12.5px]"
                  >
                    <span className="truncate text-ink">📓 {notebook.name}</span>
                    <span className="shrink-0 text-[11px] text-faint">
                      {notebook.pages} na raiz
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Option
                label="Reenviar mídias para o Storage"
                hint="Imagens e anexos do zip são hospedados no seu bucket e os links relativos passam a apontar para lá."
                checked={uploadMedia}
                onCheckedChange={setUploadMedia}
                disabled={running}
              />
              <Option
                label="Reconectar links internos"
                hint="Links entre páginas do export passam a apontar para as notas importadas."
                checked={resolveLinks}
                onCheckedChange={setResolveLinks}
                disabled={running}
              />
            </div>

            {running ? (
              <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-3">
                <p className="flex items-center gap-2 text-[12.5px] text-ink">
                  <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
                  {progress.step}
                </p>
                {progress.mediaTotal ? (
                  <Progress value={mediaPercent} indeterminate={progress.stage === "writing"} />
                ) : null}
              </div>
            ) : null}

            {plan.summary.skipped.length ? (
              <p className="text-[11px] text-faint">
                {plan.summary.skipped.length} arquivo(s) de formato não suportado serão ignorados.
              </p>
            ) : null}
          </>
        ) : null}

        {done && result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--success)]">
              <CheckCircle2 className="size-4" />
              {result.pageIds.length} nota(s) importada(s) em {result.notebookIds.length} caderno(s).
            </p>
            {result.warnings.length ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--warning)]">
                  <AlertTriangle className="size-3.5" />
                  {result.warnings.length} aviso(s)
                </p>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                  {result.warnings.map((warning) => (
                    <li key={warning} className="truncate text-[11.5px] text-muted">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <span className="text-[11px] text-faint">
          {plan && !done ? `${file?.name}` : "Processamento 100% no navegador"}
        </span>
        <div className="flex gap-2">
          {done ? (
            <>
              <Button variant="secondary" onClick={reset}>
                Importar outro
              </Button>
              <Button
                variant="primary"
                disabled={!result?.firstPageId}
                onClick={() => {
                  onOpenChange(false);
                  if (result?.firstPageId) router.push(`/app/p/${result.firstPageId}`);
                }}
              >
                Abrir nota
              </Button>
            </>
          ) : running ? (
            <Button variant="secondary" onClick={cancel}>
              Cancelar
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button variant="primary" disabled={!plan} onClick={() => void start()}>
                Importar {plan ? `${plan.pages.length} nota(s)` : ""}
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-faint">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Option({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}

/** Kept for the integrations page badge. */
export function ZipImportBadge() {
  return <Badge tone="accent">Client-side</Badge>;
}
