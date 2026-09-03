"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Clock,
  CloudOff,
  History,
  Loader2,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppBlock, Page, PageVersion } from "@/types/models";
import { useWorkspace } from "@/lib/data/provider";
import { useDebounceAutoSave } from "@/hooks/use-debounce-auto-save";
import { BlockEditor } from "@/components/editor/block-editor";
import { AudioRecorder } from "@/components/media/audio-recorder";
import { Button } from "@/components/ui/button";
import { Badge, Input, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn, formatRelative } from "@/lib/utils";

const ICONS = ["📄", "🧠", "📌", "🚀", "🔍", "🎙️", "📥", "🏛️", "✍️", "⚡", "🌱", "🗺️"];

export function PageView({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { adapter, pages, livePages, notebooks, pageById, ready } = useWorkspace();
  const page = pageById(pageId);

  const [titleDraft, setTitleDraft] = useState<{ id: string; value: string } | null>(null);
  const title = titleDraft?.id === pageId ? titleDraft.value : (page?.title ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { schedule, status, lastSavedAt } = useDebounceAutoSave<Partial<Page>>({
    onSave: async (patch) => {
      await adapter.updatePage(pageId, patch);
    },
    onError: () => toast.error("Não foi possível salvar. Tentaremos novamente."),
  });

  const mentionCandidates = useMemo(
    () =>
      livePages
        .filter((candidate) => candidate.id !== pageId)
        .map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          icon: candidate.icon,
          breadcrumb: notebooks.find((n) => n.id === candidate.notebookId)?.name,
        })),
    [livePages, notebooks, pageId]
  );

  const backlinks = useMemo(
    () => pages.filter((candidate) => candidate.outgoingLinks.includes(pageId) && !candidate.deletedAt),
    [pageId, pages]
  );

  const breadcrumbs = useMemo(() => {
    if (!page) return [];
    return page.path
      .map((ancestorId) => pages.find((candidate) => candidate.id === ancestorId))
      .filter(Boolean) as Page[];
  }, [page, pages]);

  if (!ready && !page) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="h-9 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="mt-6 space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--surface-2)]" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-ink">Esta página não existe mais</p>
        <p className="max-w-xs text-[12.5px] text-muted">
          Ela pode ter sido excluída ou movida para a lixeira.
        </p>
        <Button variant="secondary" onClick={() => router.push("/app")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  const notebook = notebooks.find((n) => n.id === page.notebookId);

  const handleEditorChange = ({
    blocks,
    outgoingLinks,
  }: {
    blocks: AppBlock[];
    outgoingLinks: string[];
  }) => {
    schedule({ blocks, outgoingLinks });
  };

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (!page.tags.includes(tag)) void adapter.updatePage(pageId, { tags: [...page.tags, tag] });
    setTagDraft("");
    setShowTagInput(false);
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--canvas)]/85 px-4 py-2 backdrop-blur-xl md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-muted">
          {notebook ? (
            <>
              <span>{notebook.emoji}</span>
              <span className="truncate">{notebook.name}</span>
              <span className="text-faint">/</span>
            </>
          ) : null}
          {breadcrumbs.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1.5">
              <Link href={`/app/p/${ancestor.id}`} className="truncate hover:text-ink">
                {ancestor.title}
              </Link>
              <span className="text-faint">/</span>
            </span>
          ))}
          <span className="truncate text-ink">{page.title || "Sem título"}</span>
        </div>

        <SaveIndicator status={status} lastSavedAt={lastSavedAt ?? page.updatedAt} />

        <Tooltip label={page.favorite ? "Remover dos favoritos" : "Favoritar"}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => adapter.updatePage(pageId, { favorite: !page.favorite })}
            aria-label="Favoritar"
          >
            <Star className={cn(page.favorite && "fill-[var(--warning)] text-[var(--warning)]")} />
          </Button>
        </Tooltip>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => fileInput.current?.click()}>
              <Paperclip /> Anexar arquivo
            </MenuItem>
            <MenuItem onSelect={() => setAudioOpen(true)}>
              <AudioLines /> Gravar nota de voz
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                await adapter.snapshotVersion(pageId, "Manual");
                toast.success("Versão salva no histórico");
              }}
            >
              <Clock /> Salvar versão
            </MenuItem>
            <MenuItem
              onSelect={async () => {
                setVersions(await adapter.listVersions(pageId));
                setVersionsOpen(true);
              }}
            >
              <History /> Histórico de versões
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                await adapter.trashPage(pageId);
                toast.success("Página movida para a lixeira");
                router.push("/app");
              }}
            >
              <Trash2 /> Mover para lixeira
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="mx-auto max-w-3xl px-5 pb-24 pt-8 md:px-8">
        {/* Icon + title */}
        <div className="group flex items-start gap-3">
          <Menu>
            <MenuTrigger asChild>
              <button className="mt-1 rounded-lg px-1 text-4xl leading-none transition hover:bg-[var(--surface-hover)]">
                {page.icon ?? "📄"}
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="min-w-0">
              <div className="grid grid-cols-6 gap-0.5 p-1">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => adapter.updatePage(pageId, { icon })}
                    className="rounded p-1.5 text-lg transition hover:bg-[var(--surface-hover)]"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </MenuContent>
          </Menu>

          <textarea
            value={title}
            rows={1}
            placeholder="Sem título"
            onChange={(event) => {
              setTitleDraft({ id: pageId, value: event.target.value });
              schedule({ title: event.target.value });
            }}
            onInput={(event) => {
              const el = event.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            className="w-full resize-none border-none bg-transparent pt-0.5 text-[34px] font-semibold leading-tight tracking-[-0.025em] text-ink outline-none placeholder:text-faint"
          />
        </div>

        {/* Tags + metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {page.tags.map((tag) => (
            <span
              key={tag}
              className="group/tag inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted"
            >
              {tag}
              <button
                onClick={() =>
                  adapter.updatePage(pageId, { tags: page.tags.filter((t) => t !== tag) })
                }
                className="opacity-0 transition group-hover/tag:opacity-100"
                aria-label={`Remover tag ${tag}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {showTagInput ? (
            <Input
              autoFocus
              value={tagDraft}
              placeholder="nome da tag"
              onChange={(event) => setTagDraft(event.target.value)}
              onBlur={addTag}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTag();
                if (event.key === "Escape") setShowTagInput(false);
              }}
              className="h-6 w-32 text-[11px]"
            />
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-faint transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              + tag
            </button>
          )}
          {page.notionPageId ? <Badge tone="accent">importada do Notion</Badge> : null}
          <span className="ml-auto text-[11px] text-faint">
            Atualizada {formatRelative(page.updatedAt)}
          </span>
        </div>

        {/* Editor */}
        <div className="mt-6">
          <BlockEditor
            page={page}
            mentionCandidates={mentionCandidates}
            onChange={handleEditorChange}
            onRequestUpload={() => fileInput.current?.click()}
            onRequestAudio={() => setAudioOpen(true)}
          />
        </div>

        {/* Extracted intelligence */}
        {page.extractedOCRText || page.transcriptText ? (
          <div className="mt-8 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Texto indexado dos anexos
            </p>
            {page.extractedOCRText ? (
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {page.extractedOCRText}
              </p>
            ) : null}
            {page.transcriptText ? (
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {page.transcriptText}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Backlinks */}
        <div className="mt-8 border-t border-[var(--border)] pt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Backlinks ({backlinks.length})
          </p>
          {backlinks.length ? (
            <div className="flex flex-wrap gap-2">
              {backlinks.map((source) => (
                <Link
                  key={source.id}
                  href={`/app/p/${source.id}`}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-muted transition hover:border-[var(--accent)] hover:text-ink"
                >
                  <span>{source.icon ?? "📄"}</span>
                  {source.title}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-faint">
              Nenhuma página menciona esta ainda. Use <span className="font-mono">@</span> em outra
              página para criar um link bidirecional.
            </p>
          )}
        </div>
      </div>

      {/* Version history drawer */}
      {versionsOpen ? (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-y-0 right-0 z-50 w-[320px] border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Histórico de versões</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setVersionsOpen(false)}>
              <X />
            </Button>
          </div>
          <p className="mt-1 text-[11.5px] text-muted">
            Snapshots ficam disponíveis por 30 dias, como a lixeira.
          </p>
          <div className="mt-4 space-y-1.5">
            {versions.length ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink">{version.title}</p>
                    <p className="text-[11px] text-faint">
                      {formatRelative(version.createdAt)} · {version.label ?? "automática"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Restaurar"
                    onClick={async () => {
                      await adapter.restoreVersion(pageId, version.id);
                      toast.success("Versão restaurada");
                      setVersionsOpen(false);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-faint">
                Ainda não há versões salvas para esta página.
              </p>
            )}
          </div>
        </motion.div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await adapter.saveAttachment(pageId, file);
          toast.success(
            file.type.startsWith("image/")
              ? "Imagem anexada. OCR em andamento."
              : "Arquivo anexado."
          );
          event.target.value = "";
        }}
      />

      <AudioRecorder
        open={audioOpen}
        onOpenChange={setAudioOpen}
        onSave={(blob, duration) => adapter.saveAudioNote(pageId, blob, duration)}
      />
    </div>
  );
}

function SaveIndicator({ status, lastSavedAt }: { status: string; lastSavedAt: number | null }) {
  const map: Record<string, { icon: React.ReactNode; label: string; className?: string }> = {
    idle: { icon: <Check className="size-3" />, label: `Salvo ${formatRelative(lastSavedAt)}` },
    dirty: { icon: <Loader2 className="size-3 animate-spin" />, label: "Alterações pendentes" },
    saving: { icon: <Loader2 className="size-3 animate-spin" />, label: "Salvando…" },
    saved: { icon: <Check className="size-3" />, label: "Salvo" },
    error: {
      icon: <CloudOff className="size-3" />,
      label: "Offline — será sincronizado",
      className: "text-[var(--warning)]",
    },
  };
  const state = map[status] ?? map.idle;
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-faint sm:flex",
        state.className
      )}
    >
      {state.icon}
      {state.label}
    </span>
  );
}
