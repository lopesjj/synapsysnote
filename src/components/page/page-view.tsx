"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Clock,
  Copy,
  CloudOff,
  History,
  ImageOff,
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
import { useUiStore } from "@/lib/store/ui-store";
import { BlockEditor } from "@/components/editor/block-editor";
import { getMentionCandidates } from "@/components/editor/extensions/mention-suggestion";
import { AudioRecorder } from "@/components/media/audio-recorder";
import { Button } from "@/components/ui/button";
import { Badge, Input, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { WorkspaceCrumbs } from "./workspace-crumbs";
import { cn, formatRelative } from "@/lib/utils";
import { prepareEditorAttachment } from "@/lib/media/compress-attachment";

import { PAGE_ICONS } from "@/lib/icons/catalog";
import {
  WorkspaceIcon,
  isIconUrl,
  workspaceHeroSize,
  workspaceIconOnCoverClass,
} from "@/lib/icons/workspace-icon";
import { IconPickerMenu } from "@/components/ui/icon-picker";
import { CoverPicker } from "./cover-picker";
import { pendingAudioPaths } from "@/lib/data/media-enrichment";

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
  const editorInsertFilesRef = useRef<((files: File[]) => Promise<void>) | null>(null);
  const scannedPendingAudio = useRef<string | null>(null);

  const zenMode = useUiStore((state) => state.zenMode);
  const showSaveIndicator = useUiStore((state) => state.showSaveIndicator);

  const { schedule, status, lastSavedAt } = useDebounceAutoSave<Partial<Page>>({
    resetKey: pageId,
    delay: 900,
    maxWait: 6000,
    onSave: async (patch) => {
      await adapter.updatePage(pageId, patch);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar. Tentaremos novamente.",
        { id: "page-save-error" }
      ),
  });

  useEffect(() => {
    if (!page) return;
    if (scannedPendingAudio.current === page.id) return;
    scannedPendingAudio.current = page.id;
    for (const path of pendingAudioPaths(page.blocks)) {
      void adapter.retryMediaProcessing(page.id, path).catch(() => undefined);
    }
  }, [adapter, page]);

  const mentionCandidates = useMemo(
    () =>
      pageId
        ? getMentionCandidates({
            currentPageId: pageId,
            currentNotebookId: page?.notebookId ?? null,
            livePages,
            notebooks,
          })
        : [],
    [livePages, notebooks, pageId, page?.notebookId]
  );

  const backlinks = useMemo(
    () => pages.filter((candidate) => candidate.outgoingLinks.includes(pageId) && !candidate.deletedAt),
    [pageId, pages]
  );


  if (!ready && !page) {
    return (
      <div className="mx-auto max-w-[var(--reading-width,46rem)] px-6 py-14">
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
        <Button variant="secondary" onClick={() => router.push("/home")}>
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

  const attachEditorFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith("audio/")) {
        toast.error("Use o gravador de áudio para notas de voz.");
        continue;
      }
      try {
        const prepared = await prepareEditorAttachment(file);
        await adapter.saveAttachment(pageId, prepared);
        toast.success(
          prepared.type.startsWith("image/")
            ? "Imagem anexada."
            : prepared.type === "application/pdf"
              ? "PDF anexado."
              : "Arquivo anexado."
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível anexar o arquivo.");
      }
    }
  };

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (!page.tags.includes(tag)) void adapter.updatePage(pageId, { tags: [...page.tags, tag] });
    setTagDraft("");
    setShowTagInput(false);
  };

  const hasCover = Boolean(page.coverUrl);

  return (
    <div className="relative">
      {hasCover ? (
        <CoverPicker
          coverUrl={page.coverUrl}
          onChange={(coverUrl) => adapter.updatePage(pageId, { coverUrl })}
          onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
        />
      ) : null}

      
      <div
        className={cn(
          "z-30 flex items-center gap-2 px-4 py-2 md:px-8",
          hasCover
            ? "absolute inset-x-0 top-0 border-transparent bg-gradient-to-b from-black/45 via-black/20 to-transparent text-white"
            : "sticky top-0 border-b border-[var(--border)] bg-[var(--canvas)]/85 backdrop-blur-xl",
          zenMode && "border-transparent opacity-0 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100"
        )}
      >
        <WorkspaceCrumbs notebook={notebook} page={page} inverted={hasCover} />

        {showSaveIndicator ? (
          <SaveIndicator
            status={status}
            lastSavedAt={lastSavedAt ?? page.updatedAt}
            inverted={hasCover}
          />
        ) : null}

        <Tooltip label={page.favorite ? "Remover dos favoritos" : "Favoritar"}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined}
            onClick={() => adapter.updatePage(pageId, { favorite: !page.favorite })}
            aria-label="Favoritar"
          >
            <Star className={cn(page.favorite && "fill-[var(--warning)] text-[var(--warning)]")} />
          </Button>
        </Tooltip>

        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined}
              aria-label="Mais ações"
            >
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
            {hasCover ? (
              <MenuItem
                onSelect={async () => {
                  await adapter.updatePage(pageId, { coverUrl: null });
                  toast.success("Capa removida");
                }}
              >
                <ImageOff /> Remover capa
              </MenuItem>
            ) : null}
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
            <MenuItem
              onSelect={async () => {
                try {
                  const copy = await adapter.duplicatePage(pageId);
                  toast.success("Nota duplicada");
                  useUiStore.getState().closeMenu();
                  router.push(`/home/p/${copy.id}`);
                } catch {
                  toast.error("Não foi possível duplicar a nota.");
                }
              }}
            >
              <Copy /> Duplicar nota
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                await adapter.trashPage(pageId);
                toast.success("Página movida para a lixeira");
                router.push("/home");
              }}
            >
              <Trash2 /> Mover para lixeira
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {!hasCover ? (
        <CoverPicker
          coverUrl={page.coverUrl}
          onChange={(coverUrl) => adapter.updatePage(pageId, { coverUrl })}
          onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
        />
      ) : null}

      
      <div className="relative z-10 mx-auto w-full max-w-full sm:max-w-[var(--reading-width,46rem)] px-4 pb-6 sm:pb-8 pb-safe sm:px-5 md:px-8">
        
        <div
          className={cn(
            "group flex flex-col items-start sm:flex-row sm:items-center",
            isIconUrl(page.icon ?? "") ? "gap-2 sm:gap-5" : "gap-2 sm:gap-3",
            hasCover ? "pt-0" : "pt-3 sm:pt-6"
          )}
        >
          <IconPickerMenu
            icons={PAGE_ICONS}
            current={page.icon}
            fallback="📄"
            onSelect={(icon) => void adapter.updatePage(pageId, { icon })}
            onUploadImage={(file) => adapter.uploadWorkspaceIcon(file)}
            className={
              hasCover
                ? cn(
                    "relative z-20",
                    isIconUrl(page.icon ?? "") ? "-mt-12 sm:-mt-14" : "-mt-6 sm:mt-0"
                  )
                : undefined
            }
            trigger={
              <button
                type="button"
                className={cn(
                  "shrink-0 self-start sm:self-center leading-none transition",
                  isIconUrl(page.icon ?? "") ? "rounded-[22px] sm:rounded-[28px]" : "rounded-[10px]",
                  !hasCover && "hover:bg-[var(--surface-hover)]"
                )}
                aria-label="Alterar ícone da nota"
              >
                <WorkspaceIcon
                  icon={page.icon}
                  fallback="📄"
                  variant="hero"
                  className={hasCover && isIconUrl(page.icon ?? "") ? workspaceIconOnCoverClass : undefined}
                />
              </button>
            }
          />

          <div
            className={cn(
              "mt-2 w-full min-w-0 sm:mt-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center",
              hasCover && isIconUrl(page.icon ?? "") && "sm:-mt-10",
              isIconUrl(page.icon ?? "") ? "sm:min-h-[160px]" : "sm:min-h-[44px]"
            )}
          >
            <textarea
              value={title}
              rows={1}
              cols={1}
              placeholder="Sem título"
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onChange={(event) => {
                setTitleDraft({ id: pageId, value: event.target.value });
                schedule({ title: event.target.value });
              }}
              style={{ fontFamily: "var(--font-editor, var(--font-sans))" }}
              className="w-full min-w-0 resize-none overflow-hidden border-none bg-transparent py-0 text-[26px] font-bold leading-[1.2] tracking-[-0.025em] text-ink outline-none placeholder:text-faint [scrollbar-width:none] [-ms-overflow-style:none] sm:text-[34px] sm:font-semibold sm:leading-[1.15] [&::-webkit-scrollbar]:hidden"
            />
          </div>
        </div>

        
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
        className="h-7 w-32 text-[11px]"
            />
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-faint transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              + tag
            </button>
          )}
          {page.notionPageId ? (
            <Badge tone="accent">importada do Notion</Badge>
          ) : page.importSource === "notion-zip" ? (
            <Badge tone="accent">importada de um .zip do Notion</Badge>
          ) : null}
          <span className="ml-auto text-[11px] text-faint">
            Atualizada {formatRelative(page.updatedAt)}
          </span>
        </div>

        
        <div className="mt-4 sm:mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-1 py-2 sm:px-4 sm:py-3 dark:border-transparent dark:bg-transparent dark:px-0 dark:py-0 md:px-5">
          <BlockEditor
            page={page}
            mentionCandidates={mentionCandidates}
            onChange={handleEditorChange}
            onRequestUpload={() => fileInput.current?.click()}
            onRequestAudio={() => setAudioOpen(true)}
            onInsertFiles={(files) => {
              if (editorInsertFilesRef.current) {
                void editorInsertFilesRef.current(files);
              } else {
                void attachEditorFiles(files);
              }
            }}
            onRegisterInsertFiles={(fn) => {
              editorInsertFilesRef.current = fn;
            }}
          />
        </div>

        
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

        
        <div className="mt-8 border-t border-[var(--border)] pt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Backlinks ({backlinks.length})
          </p>
          {backlinks.length ? (
            <div className="flex flex-wrap gap-2">
              {backlinks.map((source) => (
                <Link
                  key={source.id}
                  href={`/home/p/${source.id}`}
                  onClick={() => useUiStore.getState().closeMenu()}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-muted transition hover:border-[var(--accent)] hover:text-ink"
                >
                  <WorkspaceIcon icon={source.icon} fallback="📄" size={16} />
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

      
      {versionsOpen ? (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-y-0 right-0 z-50 w-full border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-float)] sm:w-[320px]"
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
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          if (editorInsertFilesRef.current) {
            await editorInsertFilesRef.current(files);
          } else {
            await attachEditorFiles(files);
          }
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

function SaveIndicator({
  status,
  lastSavedAt,
  inverted,
}: {
  status: string;
  lastSavedAt: number | null;
  inverted?: boolean;
}) {
  const map: Record<string, { icon: React.ReactNode; label: string; className?: string }> = {
    idle: { icon: <Check className="size-3" />, label: `Salvo ${formatRelative(lastSavedAt)}` },
    dirty: { icon: <Loader2 className="size-3 animate-spin" />, label: "Alterações pendentes" },
    saving: { icon: <Loader2 className="size-3 animate-spin" />, label: "Salvando…" },
    saved: { icon: <Check className="size-3" />, label: "Salvo" },
    error: {
      icon: <CloudOff className="size-3" />,
      label: "Offline - será sincronizado",
      className: "text-[var(--warning)]",
    },
  };
  const state = map[status] ?? map.idle;
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] sm:flex",
        inverted ? "text-white/85" : "text-faint",
        state.className
      )}
    >
      {state.icon}
      {state.label}
    </span>
  );
}
