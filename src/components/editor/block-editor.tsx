"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useRouter } from "@/lib/i18n/navigation";
import { localizePath } from "@/lib/i18n/locale";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Mention from "@tiptap/extension-mention";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import type { AppBlock, BlockMedia, Page } from "@/types/models";
import { useWorkspace } from "@/lib/data/provider";
import { toast } from "sonner";
import {
  VIDEO_UPLOAD_TARGET,
  isAudioFile,
  isVideoFile,
  prepareAudioAttachment,
  prepareEditorAttachment,
} from "@/lib/media/compress-attachment";
import { useMediaProgressStore } from "@/lib/store/media-progress-store";
import { Callout } from "./extensions/callout";
import { ToggleBlock } from "./extensions/toggle-block";
import { EquationBlock } from "./extensions/equation-block";
import { MediaBlock } from "./extensions/media-block";
import { TableBlock } from "./extensions/table-block";
import { DragHandle } from "./extensions/drag-handle";
import { DragAutoScroll } from "./extensions/drag-auto-scroll";
import { ParagraphIndent } from "./extensions/paragraph-indent";
import { TextAlign } from "./extensions/text-align";
import { SynapsysCodeBlock } from "./extensions/code-block";
import { SlashCommand } from "./extensions/slash-command";
import { HeadingShortcut } from "./extensions/heading-shortcut";
import { MultiSelectionDecorator } from "./extensions/multi-selection-decorator";
import {
  createMentionSuggestion,
  getMentionCandidates,
  type MentionCandidate,
} from "./extensions/mention-suggestion";
import { BubbleToolbar } from "./bubble-toolbar";
import { EditorToolbar, useEditorTick } from "./editor-toolbar";
import { NoteOutline } from "./note-outline";
import {
  blocksSignature,
  blocksToDoc,
  collectMentionIds,
  docToBlocks,
  mentionDisplayText,
  persistableBlocks,
} from "./serializer";
import { PreservedBlock } from "./extensions/preserved-block";
import { indexMedia, isRicherMedia, mediaIdentity } from "@/lib/data/media-enrichment";
import { cn } from "@/lib/utils";
import { useTranslation, localizeErrorMessage } from "@/lib/i18n/translations";

export interface BlockEditorProps {
  page: Page;
  editable?: boolean;
  chrome?: boolean;
  mentionCandidates?: MentionCandidate[];
  onChange?: (payload: { blocks: AppBlock[]; outgoingLinks: string[] }) => void;
  onRequestUpload?: () => void;
  onRequestAudio?: () => void;
  onInsertFiles?: (files: File[]) => void;
  onRegisterInsertFiles?: (fn: (files: File[]) => Promise<void>) => void;
  onRegisterInsertAudio?: (fn: (blob: Blob, durationSeconds: number, transcript?: string) => Promise<void>) => void;
}

function mentionHref(
  id: string,
  pages: { id: string }[],
  notebooks: { id: string }[]
): string | null {
  if (!id) return null;
  if (notebooks.some((notebook) => notebook.id === id)) return `/home/n/${id}`;
  if (pages.some((page) => page.id === id)) return `/home/p/${id}`;
  return `/home/p/${id}`;
}

/** Mencao do Notion pode ser de pagina, de pessoa ou de data; so a de pagina abre algo. */
const SynapsysMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: "page",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-kind") || "page",
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.kind && attributes.kind !== "page" ? { "data-kind": attributes.kind } : {},
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'span[data-type="mention"]' },
      // O editor desenha a mencao de pagina como link; sem esta regra, copiar e
      // colar a transformava em texto com link comum.
      { tag: 'a[data-type="mention"]', priority: 60 },
    ];
  },
});

function hasPendingMedia(editor: Editor): boolean {
  let pending = false;
  editor.state.doc.descendants((node) => {
    if (pending) return false;
    if (node.type.name !== "mediaBlock") return;
    const url = String(node.attrs.url ?? "");
    if (node.attrs.tempId || !url || url.startsWith("blob:")) pending = true;
    return false;
  });
  return pending;
}

function mentionFromEvent(event: { target: EventTarget | null }): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(".mention");
}

function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.items && data.items.length > 0) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (
          file &&
          (isAudioFile(file) ||
            isVideoFile(file) ||
            file.type.startsWith("image/") ||
            file.type === "application/pdf" ||
            /\.pdf$/i.test(file.name) ||
            file.type.startsWith("audio/") ||
            file.type.startsWith("video/"))
        ) {
          files.push(file);
        }
      }
    }
  }
  if (files.length === 0 && data.files && data.files.length > 0) {
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i];
      if (
        file &&
        (isAudioFile(file) ||
          isVideoFile(file) ||
          file.type.startsWith("image/") ||
          file.type === "application/pdf" ||
          /\.pdf$/i.test(file.name) ||
          file.type.startsWith("audio/") ||
          file.type.startsWith("video/"))
      ) {
        files.push(file);
      }
    }
  }
  return files;
}

export function BlockEditor({
  page,
  editable = true,
  chrome = true,
  mentionCandidates,
  onChange,
  onRequestUpload,
  onRequestAudio,
  onInsertFiles,
  onRegisterInsertFiles,
  onRegisterInsertAudio,
}: BlockEditorProps) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const languageRef = useRef(language);
  languageRef.current = language;
  const { livePages, notebooks, adapter } = useWorkspace();
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const trackedPageId = useRef(page.id);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Ultimo conteudo enviado para salvar que ainda nao voltou do banco. Enquanto
  // existir, nada que chegue do banco substitui o editor (seria uma versao velha).
  const pendingEmitted = useRef<{ blocks: AppBlock[]; signature: string | null } | null>(null);
  const latestBlocksRef = useRef(page.blocks);
  latestBlocksRef.current = page.blocks;
  const [syncTick, setSyncTick] = useState(0);

  const emitBlocks = useCallback((instance: Editor) => {
    const blocks = persistableBlocks(docToBlocks(instance.getJSON()));
    pendingEmitted.current = { blocks, signature: null };
    onChangeRef.current?.({ blocks, outgoingLinks: collectMentionIds(blocks) });
  }, []);
  const applyingRemote = useRef(false);
  const lastLocalEditAt = useRef(0);
  const effectiveCandidates = useMemo(() => {
    if (mentionCandidates !== undefined) {
      return mentionCandidates;
    }
    return getMentionCandidates({
      currentPageId: page.id,
      currentNotebookId: page.notebookId,
      livePages,
      notebooks,
    });
  }, [mentionCandidates, page.id, page.notebookId, livePages, notebooks]);

  const candidatesRef = useRef(effectiveCandidates);
  const locale = useLocale();
  const mentionNavRef = useRef({ router, livePages, notebooks, locale });
  mentionNavRef.current = { router, livePages, notebooks, locale };
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const openMention = useCallback((event: React.MouseEvent | MouseEvent) => {
    const mention = mentionFromEvent(event);
    if (!mention) return false;
    const kind = mention.getAttribute("data-kind");
    if (kind && kind !== "page") return false;
    const href = mentionHref(
      mention.getAttribute("data-id") ?? "",
      mentionNavRef.current.livePages,
      mentionNavRef.current.notebooks
    );
    if (!href) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      window.open(localizePath(href, mentionNavRef.current.locale), "_blank", "noopener,noreferrer");
    } else {
      mentionNavRef.current.router.push(href);
    }
    return true;
  }, []);
  const openMentionRef = useRef(openMention);
  openMentionRef.current = openMention;
  useEffect(() => {
    candidatesRef.current = effectiveCandidates;
  }, [effectiveCandidates]);

  const handlers = useMemo(
    () => ({
      onRequestUpload: onRequestUpload ?? (() => undefined),
      onRequestAudio: onRequestAudio ?? (() => undefined),
    }),
    [onRequestAudio, onRequestUpload]
  );
  const insertFilesRef = useRef(onInsertFiles);
  useEffect(() => {
    insertFilesRef.current = onInsertFiles;
  }, [onInsertFiles]);

  const activePreviewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = activePreviewUrlsRef.current;
    return () => {
      urls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
      urls.clear();
    };
  }, []);

  const getMediaFileDuration = (file: File | Blob, video = false): Promise<number> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(0);
      try {
        const url = URL.createObjectURL(file);
        const element: HTMLMediaElement = video
          ? document.createElement("video")
          : new Audio();
        if (video) {
          (element as HTMLVideoElement).playsInline = true;
        }
        element.preload = "metadata";
        let done = false;
        const cleanup = () => {
          if (!done) {
            done = true;
            try {
              URL.revokeObjectURL(url);
            } catch {}
          }
        };
        const settle = () => {
          const value = element.duration;
          const dur = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
          cleanup();
          resolve(dur);
        };
        element.onloadedmetadata = () => {
          // WebM/Ogg gravados em fluxo não guardam a duração no cabeçalho: o
          // navegador chuta um valor (inflado no celular) até alguém procurar o
          // fim do arquivo. O seek abaixo obriga a leitura da duração real.
          element.ondurationchange = settle;
          element.onseeked = settle;
          try {
            element.currentTime = 1e7;
          } catch {
            settle();
          }
        };
        element.onerror = () => {
          cleanup();
          resolve(0);
        };
        element.src = url;
        setTimeout(() => {
          if (!done) settle();
        }, 8000);
      } catch {
        resolve(0);
      }
    });
  };

  const insertFilesIntoEditor = useCallback(
    async (files: File[], customPos?: number) => {
      const instance = editorRef.current;
      if (!instance || !editable) return;

      const supportedFiles = files.filter((f) => {
        return (
          isAudioFile(f) ||
          isVideoFile(f) ||
          f.type.startsWith("image/") ||
          f.type === "application/pdf" ||
          /\.pdf$/i.test(f.name) ||
          f.type.startsWith("video/")
        );
      });

      if (!supportedFiles.length) return;

      for (const file of supportedFiles) {
        const isAudio = isAudioFile(file);
        const isVideo = !isAudio && (isVideoFile(file) || file.type.startsWith("video/"));
        const isImage = !isAudio && !isVideo && file.type.startsWith("image/");
        const mediaType = isAudio ? "audio" : isImage ? "image" : isVideo ? "video" : "file";
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const previewUrl = URL.createObjectURL(file);
        activePreviewUrlsRef.current.add(previewUrl);
        const durationSeconds =
          isAudio || isVideo ? await getMediaFileDuration(file, isVideo) : undefined;

        let targetPos: number;
        if (typeof customPos === "number") {
          targetPos = Math.min(Math.max(0, customPos), instance.state.doc.content.size);
        } else if (instance.isFocused) {
          targetPos = instance.state.selection.from;
        } else if (lastSelectionRef.current) {
          targetPos = Math.min(lastSelectionRef.current.from, instance.state.doc.content.size);
        } else {
          targetPos = instance.state.doc.content.size;
        }

        instance
          .chain()
          .focus()
          .setTextSelection(targetPos)
          .insertContent({
            type: "mediaBlock",
            attrs: {
              mediaType,
              url: previewUrl,
              name: file.name,
              mimeType: file.type || (isAudio ? "audio/mpeg" : "application/octet-stream"),
              sizeBytes: file.size,
              durationSeconds,
              pending: true,
              tempId,
            },
          })
          .run();

        lastSelectionRef.current = instance.state.selection;

        void (async () => {
          let uploadSuccess = false;
          const progress = useMediaProgressStore.getState();
          try {
            const heavyVideo = isVideo && file.size > VIDEO_UPLOAD_TARGET;
            if (heavyVideo) {
              progress.setProgress(tempId, { stage: "compress", percent: 0, round: 1 });
            }
            const prepared = await prepareEditorAttachment(
              file,
              isVideo
                ? {
                    onVideoProgress: (percent, round) =>
                      useMediaProgressStore
                        .getState()
                        .setProgress(tempId, { stage: "compress", percent, round }),
                  }
                : undefined
            );
            if (heavyVideo) {
              useMediaProgressStore
                .getState()
                .setProgress(tempId, { stage: "upload", percent: 0 });
            }
            const reportUpload = isVideo
              ? (percent: number) =>
                  useMediaProgressStore
                    .getState()
                    .setProgress(tempId, { stage: "upload", percent })
              : undefined;
            const { url: permanentUrl, storagePath } =
              isAudio && typeof adapter.uploadAudioNote === "function"
                ? await adapter.uploadAudioNote(page.id, prepared, durationSeconds ?? 0)
                : await adapter.uploadAttachment(page.id, prepared, reportUpload);

            const { tr } = instance.state;
            let found = false;

            instance.state.doc.descendants((node, pos) => {
              if (found) return false;
              if (
                node.type.name === "mediaBlock" &&
                (node.attrs.tempId === tempId || node.attrs.url === previewUrl)
              ) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  url: permanentUrl,
                  storagePath: storagePath ?? null,
                  name: prepared.name || node.attrs.name,
                  mimeType: prepared.type || node.attrs.mimeType,
                  sizeBytes: prepared.size,
                  pending: false,
                  tempId: null,
                });
                found = true;
                return false;
              }
            });

            if (found) {
              uploadSuccess = true;
              instance.view.dispatch(tr);
              emitBlocks(instance);

              toast.success(
                isAudio
                  ? tRef.current("audio_attached")
                  : isVideo
                    ? tRef.current("video_attached")
                    : isImage
                      ? tRef.current("image_attached")
                      : prepared.type === "application/pdf"
                        ? tRef.current("pdf_attached")
                        : tRef.current("file_attached")
              );
            } else if (storagePath) {
              void adapter.deleteMedia([storagePath], page.id);
            }
          } catch (error) {
            console.error("Erro ao salvar anexo:", error);
            const { tr } = instance.state;
            let removed = false;
            instance.state.doc.descendants((node, pos) => {
              if (removed) return false;
              if (
                node.type.name === "mediaBlock" &&
                (node.attrs.tempId === tempId || node.attrs.url === previewUrl)
              ) {
                tr.delete(pos, pos + node.nodeSize);
                removed = true;
                return false;
              }
            });
            if (removed) {
              instance.view.dispatch(tr);
              emitBlocks(instance);
            }
            toast.error(
              localizeErrorMessage(error instanceof Error ? error.message : null, tRef.current) ||
                tRef.current("file_attach_error")
            );
          } finally {
            useMediaProgressStore.getState().clearProgress(tempId);
            if (uploadSuccess) {
              setTimeout(() => {
                try {
                  activePreviewUrlsRef.current.delete(previewUrl);
                  URL.revokeObjectURL(previewUrl);
                } catch {}
              }, 60000);
            } else {
              activePreviewUrlsRef.current.delete(previewUrl);
              try {
                URL.revokeObjectURL(previewUrl);
              } catch {}
            }
          }
        })();
      }
    },
    [adapter, editable, emitBlocks, page.id]
  );

  useEffect(() => {
    onRegisterInsertFiles?.(insertFilesIntoEditor);
  }, [insertFilesIntoEditor, onRegisterInsertFiles]);

  const insertAudioIntoEditor = useCallback(
    async (blob: Blob, durationSeconds: number, transcriptText?: string) => {
      const instance = editorRef.current;
      if (!instance || !editable) return;

      let targetPos: number;
      if (instance.isFocused) {
        targetPos = instance.state.selection.from;
      } else if (lastSelectionRef.current) {
        targetPos = Math.min(lastSelectionRef.current.from, instance.state.doc.content.size);
      } else {
        targetPos = instance.state.doc.content.size;
      }

      const tempId = `temp_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(blob);
      activePreviewUrlsRef.current.add(previewUrl);

      instance
        .chain()
        .focus()
        .setTextSelection(targetPos)
        .insertContent({
          type: "mediaBlock",
          attrs: {
            mediaType: "audio",
            url: previewUrl,
            name: `${tRef.current("voice_note").toLowerCase().replace(/\s+/g, "-")}-${new Date().toLocaleTimeString(languageRef.current === "pt" ? "pt-BR" : languageRef.current)}.${(blob.type || "").includes("mp4") ? "mp4" : (blob.type || "").includes("ogg") ? "ogg" : (blob.type || "").includes("wav") ? "wav" : "webm"}`,
            mimeType: blob.type || "audio/webm",
            sizeBytes: blob.size,
            durationSeconds,
            transcript: transcriptText || undefined,
            pending: true,
            tempId,
          },
        })
        .run();

      lastSelectionRef.current = instance.state.selection;

      void (async () => {
        let uploadSuccess = false;
        try {
          const prepared = await prepareAudioAttachment(blob);
          const { url: permanentUrl, storagePath } = await adapter.uploadAudioNote(
            page.id,
            prepared,
            durationSeconds
          );

          const { tr } = instance.state;
          let found = false;

          instance.state.doc.descendants((node, pos) => {
            if (found) return false;
            if (
              node.type.name === "mediaBlock" &&
              (node.attrs.tempId === tempId || node.attrs.url === previewUrl)
            ) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                url: permanentUrl,
                storagePath: storagePath ?? null,
                sizeBytes: prepared.size,
                pending: false,
                transcript: transcriptText || node.attrs.transcript || null,
                tempId: null,
              });
              found = true;
              return false;
            }
          });

          if (found) {
            uploadSuccess = true;
            instance.view.dispatch(tr);
            emitBlocks(instance);
            toast.success(tRef.current("audio_attached"));
          } else if (storagePath) {
            void adapter.deleteMedia([storagePath], page.id);
          }
        } catch (error) {
          console.error("Erro ao salvar áudio:", error);
          const { tr } = instance.state;
          let removed = false;
          instance.state.doc.descendants((node, pos) => {
            if (removed) return false;
            if (
              node.type.name === "mediaBlock" &&
              (node.attrs.tempId === tempId || node.attrs.url === previewUrl)
            ) {
              tr.delete(pos, pos + node.nodeSize);
              removed = true;
              return false;
            }
          });
          if (removed) {
            instance.view.dispatch(tr);
            emitBlocks(instance);
          }
          toast.error(
            localizeErrorMessage(error instanceof Error ? error.message : null, tRef.current) ||
              tRef.current("audio_save_error")
          );
        } finally {
          if (uploadSuccess) {
            setTimeout(() => {
              try {
                activePreviewUrlsRef.current.delete(previewUrl);
                URL.revokeObjectURL(previewUrl);
              } catch {}
            }, 60000);
          } else {
            activePreviewUrlsRef.current.delete(previewUrl);
            try {
              URL.revokeObjectURL(previewUrl);
            } catch {}
          }
        }
      })();
    },
    [adapter, editable, emitBlocks, page.id]
  );

  useEffect(() => {
    onRegisterInsertAudio?.(insertAudioIntoEditor);
  }, [insertAudioIntoEditor, onRegisterInsertAudio]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: true,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
            class: "synapsys-link",
          },
        },
      }),
      Placeholder.configure({
        placeholder: ({ node, editor }) => {
          if (node.type.name === "heading") {
            return "Título da seção";
          }
          const { doc } = editor.state;
          const isEmpty =
            doc.childCount === 0 ||
            (doc.childCount === 1 &&
              doc.firstChild?.type.name === "paragraph" &&
              doc.firstChild.content.size === 0);

          return isEmpty
            ? t("editor_placeholder")
            : "";
        },
        includeChildren: false,
      }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      Typography,
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      SynapsysCodeBlock,
      Callout,
      ToggleBlock,
      EquationBlock,
      MediaBlock,
      TableBlock,
      ParagraphIndent,
      TextAlign,
      MultiSelectionDecorator,
      ...(editable ? [DragAutoScroll, DragHandle, HeadingShortcut, SlashCommand.configure({ handlers })] : []),
      PreservedBlock,
      SynapsysMention.configure({
        HTMLAttributes: { class: "mention" },
        renderText({ node }) {
          const id = String(node.attrs.id ?? "");
          return mentionDisplayText(node.attrs.kind, String(node.attrs.label ?? id));
        },
        renderHTML({ options, node }) {
          const id = String(node.attrs.id ?? "");
          const label = String(node.attrs.label ?? id);
          const kind = String(node.attrs.kind ?? "page");
          if (kind !== "page") {
            return [
              "span",
              mergeAttributes(options.HTMLAttributes, { "data-id": id, "data-label": label }),
              mentionDisplayText(kind, label),
            ];
          }
          return [
            "a",
            mergeAttributes(options.HTMLAttributes, {
              href: `/home/p/${id}`,
              "data-id": id,
              "data-label": label,
            }),
            `@${label}`,
          ];
        },
        suggestion: createMentionSuggestion(() => candidatesRef.current),
      }),
    ],
    [editable, handlers, t]
  );

  const editor = useEditor(
    {
      extensions,
      content: blocksToDoc(page.blocks),
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          id: "synapsys-note-editor",
          class: "focus:outline-none",
          spellcheck: "true",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": t("editor_placeholder"),
        },
        handleDOMEvents: {
          click: (_view, event) => openMentionRef.current(event),
        },
        handlePaste: (_view, event) => {
          if (!editable) return false;
          const files = filesFromDataTransfer(event.clipboardData);
          if (files.length) {
            event.preventDefault();
            void insertFilesIntoEditor(files);
            return true;
          }
          return false;
        },
        handleDrop: (view, event) => {
          if (!editable) return false;
          if (view.dragging) return false;
          const files = filesFromDataTransfer(event.dataTransfer);
          if (files.length) {
            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const dropPos = coordinates ? coordinates.pos : undefined;
            void insertFilesIntoEditor(files, dropPos);
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          if (!editable) return false;
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.altKey && ["1", "2", "3", "0"].includes(event.key)) {
            event.preventDefault();
            const instance = editorRef.current;
            if (event.key === "0") instance?.chain().focus().setParagraph().run();
            else instance?.chain().focus().toggleHeading({ level: Number(event.key) as 1 | 2 | 3 }).run();
            return true;
          }
          return false;
        },
      },
      onSelectionUpdate: ({ editor: instance }) => {
        lastSelectionRef.current = instance.state.selection;
      },
      onFocus: ({ editor: instance }) => {
        lastSelectionRef.current = instance.state.selection;
      },
      onUpdate: ({ editor: instance }) => {
        if (!editable || applyingRemote.current) return;
        lastLocalEditAt.current = Date.now();
        emitBlocks(instance);
      },
    },
    [page.id, editable]
  );
  editorRef.current = editor;

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const storage = (editor.storage as unknown as Record<string, unknown>)?.mediaBlock as
        | Record<string, unknown>
        | undefined;
      if (storage) {
        storage.adapter = adapter;
        storage.pageId = page.id;
      }
    }
  }, [editor, adapter, page.id]);

  useEffect(() => {
    if (!editor) return;
    if (trackedPageId.current !== page.id) {
      trackedPageId.current = page.id;
      pendingEmitted.current = null;
      return;
    }
    if (!editable) {
      const timer = setTimeout(() => {
        if (!editor.isDestroyed) {
          editor.commands.setContent(blocksToDoc(page.blocks), { emitUpdate: false });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    if (editor.isDestroyed) return;

    const incoming = blocksSignature(page.blocks);
    const pending = pendingEmitted.current;
    if (pending) {
      pending.signature ??= blocksSignature(pending.blocks);
      // O que chegou e o nosso proprio salvamento: confirmado.
      if (pending.signature === incoming) pendingEmitted.current = null;
      // Com edicao local ainda nao confirmada, o que chega do banco e mais
      // antigo que o editor; so as transcricoes prontas entram.
      applyRemoteMediaEnrichment(editor, page.blocks, applyingRemote);
      return;
    }

    if (incoming === blocksSignature(docToBlocks(editor.getJSON()))) {
      applyRemoteMediaEnrichment(editor, page.blocks, applyingRemote);
      return;
    }

    // Mudanca feita em outra aba ou aparelho. Espera a pessoa parar de digitar
    // e os envios de midia terminarem, para nao apagar nada que esta em curso.
    const idleFor = Date.now() - lastLocalEditAt.current;
    if (idleFor < 4000 || hasPendingMedia(editor)) {
      applyRemoteMediaEnrichment(editor, page.blocks, applyingRemote);
      const timer = setTimeout(() => setSyncTick((tick) => tick + 1), Math.max(4000 - idleFor, 1500));
      return () => clearTimeout(timer);
    }

    const { from, to } = editor.state.selection;
    const focused = editor.isFocused;
    const timer = setTimeout(() => {
      if (editor.isDestroyed || pendingEmitted.current) return;
      editor.commands.setContent(blocksToDoc(latestBlocksRef.current), { emitUpdate: false });
      const size = editor.state.doc.content.size;
      const chain = editor
        .chain()
        .setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
      if (focused) chain.focus();
      chain.run();
    }, 0);
    return () => clearTimeout(timer);
  }, [editable, editor, page.blocks, page.id, syncTick]);

  const focusEnd = useCallback(() => editor?.commands.focus("end"), [editor]);

  if (!editor) {
    return (
      <div className="space-y-3 py-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-[var(--surface-2)]" />
      </div>
    );
  }

  return (
    <div className={cn("synapsys-editor relative", !chrome && "synapsys-editor--preview")}>
      {chrome ? (
        <div data-editor-toolbar="true" className="sticky top-[41px] z-10 -mx-1 sm:-mx-4 md:-mx-5 mb-3 border-b border-[var(--border)] bg-[var(--surface)] px-1 sm:px-2 md:px-3 py-1.5 backdrop-blur-xl dark:bg-[var(--canvas)]/90">
          <div className="flex flex-wrap items-center justify-center gap-0.5">
            <EditorToolbar
              editor={editor}
              onRequestUpload={onRequestUpload ?? (() => undefined)}
            />
            {chrome ? <NoteOutline editor={editor} /> : null}
          </div>
        </div>
      ) : null}
      <div className="relative min-w-0 px-1 sm:px-4 md:px-8" onClickCapture={openMention}>
        {editable ? <BubbleToolbar editor={editor} /> : null}
        <EditorContent editor={editor} />
        {chrome ? (
          <>
            <div className="min-h-6 cursor-text" onClick={focusEnd} />
            <div>
              <EditorStatusBar editor={editor} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function applyRemoteMediaEnrichment(
  editor: Editor,
  blocks: AppBlock[],
  applyingRemote: { current: boolean }
) {
  const remote = indexMedia(blocks);
  const { tr } = editor.state;
  let changed = false;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "mediaBlock") return;
    const key = mediaIdentity({
      storagePath: (node.attrs.storagePath as string | null) ?? undefined,
      url: (node.attrs.url as string | null) ?? undefined,
    });
    if (!key) return;
    const match = remote.get(key);
    if (!match) return;
    const local: BlockMedia = {
      url: String(node.attrs.url ?? ""),
      storagePath: (node.attrs.storagePath as string) ?? undefined,
      pending: Boolean(node.attrs.pending),
      transcript: (node.attrs.transcript as string) ?? undefined,
      transcriptSummary: (node.attrs.transcriptSummary as string) ?? undefined,
      transcriptLanguage: (node.attrs.transcriptLanguage as string) ?? undefined,
      transcriptCollapsed: typeof node.attrs.transcriptCollapsed === "boolean" ? node.attrs.transcriptCollapsed : undefined,
    };
    if (!isRicherMedia(match, local)) return;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      pending: match.pending ?? false,
      transcript: match.transcript ?? node.attrs.transcript,
      transcriptSummary: match.transcriptSummary ?? node.attrs.transcriptSummary,
      transcriptLanguage: match.transcriptLanguage ?? node.attrs.transcriptLanguage,
      transcriptCollapsed: typeof match.transcriptCollapsed === "boolean" ? match.transcriptCollapsed : node.attrs.transcriptCollapsed,
    });
    changed = true;
  });

  if (!changed) return;
  tr.setMeta("addToHistory", false);
  applyingRemote.current = true;
  editor.view.dispatch(tr);
  applyingRemote.current = false;
}

function EditorStatusBar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  useEditorTick(editor);
  const words = editor.storage.characterCount?.words() ?? 0;
  const characters = editor.storage.characterCount?.characters() ?? 0;
  return (
    <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[11px] text-faint">
      <span>
        {words} {t("editor_words_count", { count: words })} · {characters}{" "}
        {t("editor_characters", { count: characters })}
      </span>
      <span className="hidden sm:inline">{t("editor_shortcuts_hint")}</span>
    </div>
  );
}
