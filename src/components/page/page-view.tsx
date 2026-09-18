"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Accessibility,
  AudioLines,
  Check,
  Clock,
  Copy,
  CloudOff,
  FileDown,
  FilePlus,
  Hand,
  History,
  ImageOff,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppBlock, Page, PageVersion } from "@/types/models";
import { exportNoteToPdf } from "@/lib/export/export-note-pdf";
import { useWorkspace } from "@/lib/data/provider";
import { useDebounceAutoSave } from "@/hooks/use-debounce-auto-save";
import { useUiStore } from "@/lib/store/ui-store";
import {
  announceToScreenReader,
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
} from "@/components/accessibility/screen-reader";
import { BlockEditor } from "@/components/editor/block-editor";
import { blocksToPlainText } from "@/components/editor/serializer";
import { getMentionCandidates } from "@/components/editor/extensions/mention-suggestion";
import { AudioRecorder } from "@/components/media/audio-recorder";
import { Button } from "@/components/ui/button";
import { Badge, Input, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { WorkspaceCrumbs } from "./workspace-crumbs";
import { cn, formatRelative } from "@/lib/utils";
import { isAudioFile, prepareEditorAttachment } from "@/lib/media/compress-attachment";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";

import { PAGE_ICONS } from "@/lib/icons/catalog";
import {
  WorkspaceIcon,
  isIconUrl,
  workspaceHeroSize,
  workspaceIconOnCoverClass,
} from "@/lib/icons/workspace-icon";
import { IconPickerMenu } from "@/components/ui/icon-picker";
import { CoverPicker } from "./cover-picker";
import { resolveNoteCreationTarget, expandContainerInSession } from "@/lib/data/page-tree";
import { useLibrasStore } from "@/lib/store/libras-store";

function isAudioBlockElement(el: Element): boolean {
  if (el.tagName === "AUDIO") return true;
  if (el.getAttribute("data-audio-block") === "true") return true;
  if (el.getAttribute("data-media-type") === "audio") return true;
  if (el.getAttribute("data-media") === "audio") return true;

  const audioName = el.getAttribute("data-audio-name");
  if (audioName && isAudioFile({ name: audioName })) return true;

  if (el.hasAttribute("data-media") || el.hasAttribute("data-node-view-wrapper") || el.classList.contains("my-3")) {
    if (el.querySelector('audio, [data-media-type="audio"], [data-audio-block="true"], [data-media="audio"]')) {
      return true;
    }
    const innerName = el.querySelector("[data-audio-name]")?.getAttribute("data-audio-name");
    if (innerName && isAudioFile({ name: innerName })) {
      return true;
    }
  }
  return false;
}

function extractEditorDomText(
  editorEl: HTMLElement,
  audioFileLabel: string,
  forLibras = false
): string {
  const parts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = node.nodeValue?.trim();
      if (val) {
        parts.push(val);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (isAudioBlockElement(el)) {
      if (forLibras) {
        const transcript = el.getAttribute("data-transcript")?.trim();
        if (transcript) {
          parts.push(transcript);
        }
      } else {
        parts.push(audioFileLabel);
      }
      return;
    }

    if (
      el.hasAttribute("data-drag-handle") ||
      el.classList.contains("vlibras-ignore") ||
      el.getAttribute("aria-hidden") === "true" ||
      el.tagName === "BUTTON"
    ) {
      return;
    }

    const containsAudio =
      el.querySelector(
        'audio, [data-media-type="audio"], [data-audio-block="true"], [data-media="audio"], [data-audio-name]'
      ) !== null;

    if (containsAudio) {
      for (const child of Array.from(el.childNodes)) {
        walk(child);
      }
      return;
    }

    const blockTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
    if (blockTags.has(el.tagName)) {
      const text = el.innerText?.trim();
      if (text) {
        parts.push(text);
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  }

  for (const child of Array.from(editorEl.childNodes)) {
    walk(child);
  }

  return parts.join("\n\n").trim();
}

function extractPageText(
  page?: Page | null,
  includeTitle = true,
  currentTitle?: string,
  fallbackUntitled?: string,
  audioFileLabel = "Arquivo de Áudio",
  forLibras = false
): string {
  if (!page) return "";

  let noteTitle = (currentTitle ?? "").trim();
  if (!noteTitle && typeof document !== "undefined") {
    const titleEl = document.getElementById("page-title-input") as HTMLTextAreaElement | null;
    if (titleEl && titleEl.value.trim()) {
      noteTitle = titleEl.value.trim();
    }
  }
  if (!noteTitle) {
    noteTitle = page.title?.trim() || "";
  }

  let editorText = "";
  if (typeof document !== "undefined") {
    const editorEl = document.querySelector<HTMLElement>(
      ".synapsys-editor .ProseMirror, #synapsys-note-editor, [data-note-editor]"
    );
    if (editorEl) {
      editorText = extractEditorDomText(editorEl, audioFileLabel, forLibras);
    }
  }

  if (!editorText && Array.isArray(page.blocks) && page.blocks.length > 0) {
    editorText = blocksToPlainText(page.blocks, audioFileLabel).trim();
  }

  if (!editorText && page.plainText?.trim()) {
    editorText = page.plainText.trim();
  }

  if (!includeTitle) {
    return editorText || noteTitle;
  }

  const effectiveTitle = noteTitle || fallbackUntitled || "";
  if (!effectiveTitle && !editorText) {
    return "";
  }

  const parts: string[] = [];
  if (effectiveTitle) {
    const cleanTitle = effectiveTitle.replace(/[.\s]+$/, "");
    parts.push(`${cleanTitle}.`);
  }

  if (editorText) {
    const titleRegex = effectiveTitle
      ? new RegExp(`^${effectiveTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.:\\s]*`, "i")
      : null;
    const cleanEditorText = titleRegex ? editorText.replace(titleRegex, "").trim() : editorText;
    if (cleanEditorText) {
      parts.push(cleanEditorText);
    } else if (!effectiveTitle) {
      parts.push(editorText);
    }
  }

  return parts.join("\n\n");
}

export function PageView({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { adapter, pages, livePages, notebooks, databases, pageById, ready } = useWorkspace();
  const page = pageById(pageId);

  const [titleDraft, setTitleDraft] = useState<{ id: string; value: string } | null>(null);
  const title = titleDraft?.id === pageId ? titleDraft.value : (page?.title ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorInsertFilesRef = useRef<((files: File[]) => Promise<void>) | null>(null);
  const editorInsertAudioRef = useRef<((blob: Blob, duration: number, transcript?: string) => Promise<void>) | null>(null);
  const latestPageRef = useRef<Page | null>(null);
  const hasEditedRef = useRef(false);
  const announcedPageIdRef = useRef<string | null>(null);

  const zenMode = useUiStore((state) => state.zenMode);
  const showSaveIndicator = useUiStore((state) => state.showSaveIndicator);
  const screenReader = useUiStore((state) => state.screenReader);
  const speechRate = useUiStore((state) => state.speechRate);
  const libras = useUiStore((state) => state.libras);
  const [narrating, setNarrating] = useState(false);
  const [pausedNarration, setPausedNarration] = useState(false);
  const lastNarrationLangRef = useRef<string>(language);

  useEffect(() => {
    if (lastNarrationLangRef.current !== language) {
      if (narrating || pausedNarration) {
        stopSpeaking();
        setNarrating(false);
        setPausedNarration(false);
      }
      lastNarrationLangRef.current = language;
    }
  }, [language, narrating, pausedNarration]);

  const toggleNarration = () => {
    if (!page) return;

    const isLangChanged = lastNarrationLangRef.current !== language;
    if (narrating && !isLangChanged) {
      if (pausedNarration) {
        resumeSpeaking();
        setPausedNarration(false);
      } else {
        pauseSpeaking();
        setPausedNarration(true);
      }
      return;
    }

    stopSpeaking();
    lastNarrationLangRef.current = language;

    const currentTitleText = title?.trim() || page.title?.trim() || "";
    const fullText = extractPageText(page, true, currentTitleText, t("untitled"), t("audio_file"));
    if (!fullText.trim()) {
      toast.error(t("empty_note"));
      setNarrating(false);
      setPausedNarration(false);
      return;
    }

    setNarrating(true);
    setPausedNarration(false);

    speakText(fullText, {
      rate: speechRate,
      lang: language,
      onStart: () => {
        setNarrating(true);
        setPausedNarration(false);
      },
      onEnd: () => {
        setNarrating(false);
        setPausedNarration(false);
      },
      onError: () => {
        setNarrating(false);
        setPausedNarration(false);
      },
    });
  };

  const handleStopNarration = () => {
    stopSpeaking();
    setNarrating(false);
    setPausedNarration(false);
  };

  useEffect(() => {
    if (!page || !screenReader) return;
    if (announcedPageIdRef.current === page.id) return;
    announcedPageIdRef.current = page.id;

    const titleText = page.title || t("untitled");
    const message = `${t("note_loaded_announcement")}, ${titleText}`;
    announceToScreenReader(message);
    speakText(message, { lang: language, rate: speechRate, translate: false });
  }, [page?.id, screenReader, language, speechRate, t]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [pageId]);

  const handleInterpretLibras = useCallback(() => {
    if (!page) return;
    if (!useUiStore.getState().libras) return;
    const currentTitleText = title?.trim() || page.title?.trim() || "";
    const fullText = extractPageText(page, true, currentTitleText, t("untitled"), t("audio_file"), true);
    if (!fullText.trim()) {
      toast.error(t("empty_note"));
      return;
    }
    useLibrasStore.getState().openWithText(fullText, {
      title: currentTitleText || t("untitled"),
    });
  }, [page, title, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          toggleNarration();
        } else if ((e.key === "l" || e.key === "L") && libras) {
          e.preventDefault();
          handleInterpretLibras();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, narrating, pausedNarration, speechRate, language, handleInterpretLibras, libras]);

  const { schedule, flush, status, lastSavedAt } = useDebounceAutoSave<Partial<Page>>({
    resetKey: pageId,
    delay: 900,
    maxWait: 6000,
    onSave: async (patch) => {
      await adapter.updatePage(pageId, patch);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t("page_save_error"),
        { id: "page-save-error" }
      ),
  });

  useEffect(() => {
    if (page) {
      latestPageRef.current = page;
    }
  }, [page]);





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
      <div className="mx-auto max-w-[var(--reading-width,64rem)] px-6 py-14">
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
        <p className="text-sm font-medium text-ink">{t("page_not_found")}</p>
        <p className="max-w-xs text-[12.5px] text-muted">
          {t("page_not_found_hint")}
        </p>
        <Button variant="secondary" onClick={() => router.push("/home")}>
          {t("back_to_home")}
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
    hasEditedRef.current = true;
    if (latestPageRef.current) {
      latestPageRef.current = {
        ...latestPageRef.current,
        blocks,
        outgoingLinks,
      };
    }
    schedule({ blocks, outgoingLinks });
  };

  const handleExportPdf = async () => {
    if (!page || exportingPdf) return;
    setExportingPdf(true);
    const toastId = toast.loading(t("pdf_export_preparing"));

    try {
      await exportNoteToPdf(page, {
        notebookName: notebook?.name,
        t,
        onProgress: (status) => {
          toast.loading(status, { id: toastId });
        },
      });

      toast.dismiss(toastId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("pdf_export_failed"),
        { id: toastId }
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const attachEditorFiles = async (files: File[]) => {
    if (editorInsertFilesRef.current) {
      await editorInsertFilesRef.current(files);
      return;
    }
    for (const file of files) {
      try {
        const isAudio = isAudioFile(file);
        const prepared = await prepareEditorAttachment(file);
        if (isAudio && typeof adapter.uploadAudioNote === "function") {
          await adapter.uploadAudioNote(pageId, prepared, 0);
        } else {
          await adapter.saveAttachment(pageId, prepared);
        }
        toast.success(
          isAudio
            ? t("audio_attached")
            : prepared.type.startsWith("image/")
              ? t("image_attached")
              : prepared.type === "application/pdf"
                ? t("pdf_attached")
                : t("file_attached")
        );
      } catch (error) {
        toast.error(
          localizeErrorMessage(error instanceof Error ? error.message : null, t) ||
            t("file_attach_error")
        );
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

        <Tooltip label={page.favorite ? t("unfavorite") : t("favorite")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined}
            onClick={() => adapter.updatePage(pageId, { favorite: !page.favorite })}
            aria-label={t("favorite")}
          >
            <Star className={cn(page.favorite && "fill-[var(--warning)] text-[var(--warning)]")} />
          </Button>
        </Tooltip>

        {libras ? (
          <Tooltip label={t("interpret_in_libras")} shortcut="Alt L">
            <Button
              variant="ghost"
              size="icon-sm"
              className={hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined}
              onClick={handleInterpretLibras}
              aria-label={t("interpret_in_libras")}
            >
              <Hand className="size-4" />
            </Button>
          </Tooltip>
        ) : null}

        {screenReader || narrating ? (
          <div className="flex items-center gap-1">
            <Tooltip
              label={
                narrating
                  ? pausedNarration
                    ? t("resume_reading")
                    : t("pause_reading")
                  : t("read_note_aloud")
              }
              shortcut="Alt R"
            >
              <Button
                variant={narrating ? "secondary" : "ghost"}
                size="icon-sm"
                className={cn(
                  hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined,
                  narrating && "text-[var(--accent)] font-semibold border border-[var(--accent)]/30"
                )}
                onClick={toggleNarration}
                aria-label={
                  narrating
                    ? pausedNarration
                      ? t("resume_reading")
                      : t("pause_reading")
                    : t("read_note_aloud")
                }
              >
                {narrating ? (
                  pausedNarration ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </Button>
            </Tooltip>
            {narrating ? (
              <Tooltip label={t("stop_reading")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={handleStopNarration}
                  aria-label={t("stop_reading")}
                >
                  <VolumeX className="size-4" />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}

        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={hasCover ? "text-white hover:bg-white/15 hover:text-white" : undefined}
              aria-label={t("more_actions")}
            >
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              onSelect={async () => {
                const target = resolveNoteCreationTarget(`/home/p/${pageId}`, pages, databases);
                const newPage = await adapter.createPage({
                  notebookId: target.notebookId,
                  parentPageId: target.parentPageId,
                  title: t("untitled"),
                });
                expandContainerInSession(target);
                router.push(`/home/p/${newPage.id}`);
              }}
            >
              <FilePlus /> {t("new_note")}
            </MenuItem>
            {libras ? (
              <MenuItem onSelect={handleInterpretLibras}>
                <Hand /> {t("interpret_in_libras")}
              </MenuItem>
            ) : null}
            {screenReader || narrating ? (
              <MenuItem onSelect={toggleNarration}>
                <Volume2 /> {narrating ? t("stop_reading") : t("read_note_aloud")}
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => fileInput.current?.click()}>
              <Paperclip /> {t("attach_file")}
            </MenuItem>
            <MenuItem
              onSelect={(event) => {
                event.preventDefault();
                setAudioOpen(true);
              }}
            >
              <AudioLines /> {t("record_audio")}
            </MenuItem>
            {hasCover ? (
              <MenuItem
                onSelect={async () => {
                  await adapter.updatePage(pageId, { coverUrl: null });
                  toast.success(t("remove_cover"));
                }}
              >
                <ImageOff /> {t("remove_cover")}
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                await adapter.snapshotVersion(pageId, "Manual");
                toast.success(`${t("save_version")} - ${t("saved")}`);
              }}
            >
              <Clock /> {t("save_version")}
            </MenuItem>
            <MenuItem
              onSelect={async () => {
                setVersions(await adapter.listVersions(pageId));
                setVersionsOpen(true);
              }}
            >
              <History /> {t("history_versions")}
            </MenuItem>
            <MenuItem
              onSelect={async () => {
                try {
                  const copy = await adapter.duplicatePage(pageId);
                  toast.success(t("note_duplicated"));
                  useUiStore.getState().closeMenu();
                  router.push(`/home/p/${copy.id}`);
                } catch {
                  toast.error(t("could_not_duplicate"));
                }
              }}
            >
              <Copy /> {t("duplicate_note")}
            </MenuItem>
            <MenuItem
              disabled={exportingPdf}
              onSelect={() => void handleExportPdf()}
            >
              <FileDown /> {t("export_pdf")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                await adapter.trashPage(pageId);
                toast.success(t("moved_to_trash"));
                router.push("/home");
              }}
            >
              <Trash2 /> {t("delete_page")}
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

      <article
        role="article"
        aria-label={page.title || t("untitled")}
        className="relative z-10 mx-auto w-full max-w-full sm:max-w-[var(--reading-width,64rem)] px-4 pb-28 sm:pb-36 pb-safe sm:px-5 md:px-8"
      >
        
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
                aria-label="Ícone da página"
              >
                <WorkspaceIcon
                  icon={page.icon}
                  fallback="📄"
                  size={isIconUrl(page.icon ?? "") ? workspaceHeroSize(page.icon) : 30}
                  className={cn(
                    hasCover && isIconUrl(page.icon ?? "") && workspaceIconOnCoverClass
                  )}
                />
              </button>
            }
          />

          <div
            className={cn(
              "flex-1 min-w-0 w-full",
              hasCover && isIconUrl(page.icon ?? "") && "pt-1 sm:pt-0"
            )}
          >
            <textarea
              id="page-title-input"
              aria-label={page.title ? `Título: ${page.title}` : t("untitled")}
              value={title}
              rows={1}
              cols={1}
              placeholder={t("untitled")}
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onChange={(event) => {
                hasEditedRef.current = true;
                const val = event.target.value;
                setTitleDraft({ id: pageId, value: val });
                if (latestPageRef.current) {
                  latestPageRef.current = { ...latestPageRef.current, title: val };
                }
                schedule({ title: val });
              }}
              style={{ fontFamily: "var(--font-editor, var(--font-sans))" }}
              className="w-full min-w-0 resize-none overflow-hidden border-none bg-transparent py-0 text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink outline-none placeholder:text-faint [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
              placeholder={t("tag_name_placeholder")}
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
              {t("add_tag")}
            </button>
          )}
          {page.notionPageId ? (
            <Badge tone="accent">{t("imported_from_notion")}</Badge>
          ) : page.importSource === "notion-zip" ? (
            <Badge tone="accent">{t("imported_from_notion_zip")}</Badge>
          ) : null}
          <span className="ml-auto text-[11px] text-faint">
            {t("updated")} {formatRelative(page.updatedAt, language)}
          </span>
        </div>

        
        <div className="vlibras-ignore mt-4 sm:mt-6 -mx-4 sm:mx-0 rounded-none sm:rounded-[var(--radius-lg)] border-x-0 sm:border border-y border-[var(--border)] bg-[var(--surface)] px-2 py-2 sm:px-4 sm:py-3 dark:border-transparent dark:bg-transparent dark:px-0 dark:py-0 md:px-5">
          <BlockEditor
            key={`${page.id}-${editorKey}`}
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
            onRegisterInsertAudio={(fn) => {
              editorInsertAudioRef.current = fn;
            }}
          />
        </div>



        <div className="mt-10 border-t border-[var(--border)] pt-6 pb-12 sm:pb-16">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            {t("backlinks_title", { count: backlinks.length })}
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
              {t("backlinks_empty")}
            </p>
          )}
        </div>
      </article>

      {versionsOpen ? (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-y-0 right-0 z-50 w-full border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-float)] sm:w-[320px]"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{t("history_versions")}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setVersionsOpen(false)}>
              <X />
            </Button>
          </div>
          <p className="mt-1 text-[11.5px] text-muted">
            {t("versions_retention_hint")}
          </p>
          <div className="mt-4 space-y-1.5">
            {versions.length ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink">{version.title || t("untitled")}</p>
                    <p className="text-[11px] text-faint">
                      {formatRelative(version.createdAt, language)} · {version.label ?? t("version_automatic")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("undo")}
                    onClick={async () => {
                      await adapter.restoreVersion(pageId, version.id);
                      toast.success(t("undo_action"));
                      setVersionsOpen(false);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-faint">
                {t("versions_empty")}
              </p>
            )}
          </div>
        </motion.div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf,audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.opus,.wma,.webm,.weba,.mp4"
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
        onSave={async (blob, duration, transcript) => {
          if (editorInsertAudioRef.current) {
            await editorInsertAudioRef.current(blob, duration, transcript);
          } else {
            await adapter.saveAudioNote(pageId, blob, duration);
          }
        }}
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
  const { t, language } = useTranslation();
  const map: Record<string, { icon: React.ReactNode; label: string; className?: string }> = {
    idle: { icon: <Check className="size-3" />, label: `${t("saved")} ${formatRelative(lastSavedAt, language)}` },
    dirty: { icon: <Loader2 className="size-3 animate-spin" />, label: t("pending_changes") },
    saving: { icon: <Loader2 className="size-3 animate-spin" />, label: t("saving") },
    saved: { icon: <Check className="size-3" />, label: t("saved") },
    error: {
      icon: <CloudOff className="size-3" />,
      label: t("offline_sync"),
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
