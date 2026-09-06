"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Callout } from "./extensions/callout";
import { ToggleBlock } from "./extensions/toggle-block";
import { EquationBlock } from "./extensions/equation-block";
import { MediaBlock } from "./extensions/media-block";
import { TableBlock } from "./extensions/table-block";
import { DragHandle } from "./extensions/drag-handle";
import { ParagraphIndent } from "./extensions/paragraph-indent";
import { TextAlign } from "./extensions/text-align";
import { SynapsysCodeBlock } from "./extensions/code-block";
import { SlashCommand } from "./extensions/slash-command";
import { HeadingShortcut } from "./extensions/heading-shortcut";
import { createMentionSuggestion, type MentionCandidate } from "./extensions/mention-suggestion";
import { BubbleToolbar } from "./bubble-toolbar";
import { EditorToolbar, useEditorTick } from "./editor-toolbar";
import { FindBar } from "./find-bar";
import { NoteOutline } from "./note-outline";
import { blocksToDoc, collectMentionIds, docToBlocks } from "./serializer";
import { indexMedia, isRicherMedia, mediaIdentity } from "@/lib/data/media-enrichment";
import { cn } from "@/lib/utils";

export interface BlockEditorProps {
  page: Page;
  editable?: boolean;
  /** Toolbar, outline, status bar and the extra click-to-type region. */
  chrome?: boolean;
  mentionCandidates?: MentionCandidate[];
  onChange?: (payload: { blocks: AppBlock[]; outgoingLinks: string[] }) => void;
  onRequestUpload?: () => void;
  onRequestAudio?: () => void;
  onInsertFiles?: (files: File[]) => void;
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

function mentionFromEvent(event: { target: EventTarget | null }): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(".mention");
}

function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  return [...data.files].filter(
    (file) => file.type.startsWith("image/") || file.type === "application/pdf" || file.type.startsWith("audio/")
  );
}

/**
 * The editor surface.
 *
 * Loading strategy: the TipTap document is created once per page id. Remote
 * updates for the *same* page are not force-applied while the user is typing —
 * that would fight the caret — so the debounced writer stays authoritative
 * until the user navigates away.
 */
export function BlockEditor({
  page,
  editable = true,
  chrome = true,
  mentionCandidates = [],
  onChange,
  onRequestUpload,
  onRequestAudio,
  onInsertFiles,
}: BlockEditorProps) {
  const router = useRouter();
  const { livePages, notebooks } = useWorkspace();
  const [findOpen, setFindOpen] = useState(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const storeBlockCount = useRef(page.blocks.length);
  const emittedBlockCount = useRef(page.blocks.length);
  const trackedPageId = useRef(page.id);
  const applyingRemote = useRef(false);
  const candidatesRef = useRef(mentionCandidates);
  const mentionNavRef = useRef({ router, livePages, notebooks });
  mentionNavRef.current = { router, livePages, notebooks };

  const openMention = useCallback((event: React.MouseEvent | MouseEvent) => {
    const mention = mentionFromEvent(event);
    if (!mention) return false;
    const href = mentionHref(
      mention.getAttribute("data-id") ?? "",
      mentionNavRef.current.livePages,
      mentionNavRef.current.notebooks
    );
    if (!href) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      mentionNavRef.current.router.push(href);
    }
    return true;
  }, []);
  const openMentionRef = useRef(openMention);
  openMentionRef.current = openMention;
  useEffect(() => {
    candidatesRef.current = mentionCandidates;
  }, [mentionCandidates]);

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

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: !editable,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Título da seção"
            : "Escreva, cole, use # para um título ou / para inserir um bloco",
        includeChildren: true,
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
      ...(editable ? [DragHandle, HeadingShortcut, SlashCommand.configure({ handlers })] : []),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderHTML({ options, node }) {
          const id = String(node.attrs.id ?? "");
          const label = String(node.attrs.label ?? id);
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
        // TipTap invokes this on "@", never during React render.
        // eslint-disable-next-line react-hooks/refs
        suggestion: createMentionSuggestion(() => candidatesRef.current),
      }),
    ],
    [editable, handlers]
  );

  const editor = useEditor(
    {
      extensions,
      content: blocksToDoc(page.blocks),
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "focus:outline-none",
          spellcheck: "true",
        },
        handleDOMEvents: {
          click: (_view, event) => openMentionRef.current(event),
        },
        handlePaste: (_view, event) => {
          if (!editable) return false;
          const text = event.clipboardData?.getData("text/plain")?.trim();
          if (text) return false;
          const files = filesFromDataTransfer(event.clipboardData);
          if (files.length && insertFilesRef.current) {
            event.preventDefault();
            insertFilesRef.current(files);
            return true;
          }
          return false;
        },
        handleDrop: (view, event) => {
          if (!editable) return false;
          // Moving a block inside the editor (images, files) must stay with
          // ProseMirror — do not treat that as a new upload.
          if (view.dragging) return false;
          const files = filesFromDataTransfer(event.dataTransfer);
          if (files.length && insertFilesRef.current) {
            event.preventDefault();
            insertFilesRef.current(files);
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          if (!editable) return false;
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.key.toLowerCase() === "f") {
            event.preventDefault();
            setFindOpen(true);
            return true;
          }
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
      onUpdate: ({ editor: instance }) => {
        if (!editable || applyingRemote.current) return;
        const blocks = docToBlocks(instance.getJSON());
        emittedBlockCount.current = blocks.length;
        onChange?.({ blocks, outgoingLinks: collectMentionIds(blocks) });
      },
    },
    [page.id, editable]
  );
  editorRef.current = editor;

  // Media added outside the editor (uploads, voice notes) arrives through the
  // page document. A local Enter also grows `blocks` and comes back via the
  // debounced save — that echo must not replace the doc or the caret jumps
  // to the end of the note. Only apply when the store has *more* blocks than
  // both the last snapshot and what the user already typed.
  useEffect(() => {
    if (!editor) return;
    if (trackedPageId.current !== page.id) {
      trackedPageId.current = page.id;
      storeBlockCount.current = page.blocks.length;
      emittedBlockCount.current = page.blocks.length;
      return;
    }
    if (!editable) {
      editor.commands.setContent(blocksToDoc(page.blocks), { emitUpdate: false });
      storeBlockCount.current = page.blocks.length;
      emittedBlockCount.current = page.blocks.length;
      return;
    }
    const incoming = page.blocks.length;
    if (incoming > storeBlockCount.current && incoming > emittedBlockCount.current) {
      const { from, to } = editor.state.selection;
      const focused = editor.isFocused;
      editor.commands.setContent(blocksToDoc(page.blocks), { emitUpdate: false });
      if (focused) {
        const size = editor.state.doc.content.size;
        editor
          .chain()
          .setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) })
          .focus()
          .run();
      }
    } else {
      applyRemoteMediaEnrichment(editor, page.blocks, applyingRemote);
    }
    storeBlockCount.current = incoming;
  }, [editable, editor, page.blocks, page.id]);

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
        <div className="sticky top-[41px] z-10 -mx-4 mb-3 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 backdrop-blur-xl dark:bg-[var(--canvas)]/90 md:-mx-5 md:px-3">
          <div className="flex flex-wrap items-center justify-center gap-0.5">
            <EditorToolbar
              editor={editor}
              onRequestUpload={onRequestUpload ?? (() => undefined)}
              onToggleFind={() => setFindOpen((open) => !open)}
            />
            {chrome ? <NoteOutline editor={editor} /> : null}
            {findOpen ? <FindBar editor={editor} open={findOpen} onClose={() => setFindOpen(false)} /> : null}
          </div>
        </div>
      ) : null}
      <div className="relative min-w-0 px-8" onClickCapture={openMention}>
        {editable ? <BubbleToolbar editor={editor} /> : null}
        <EditorContent editor={editor} />
        {chrome ? (
          <>
            <div className="min-h-28 cursor-text" onClick={focusEnd} />
            <EditorStatusBar editor={editor} />
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
      ocrText: (node.attrs.ocrText as string) ?? undefined,
    };
    if (!isRicherMedia(match, local)) return;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      pending: match.pending ?? false,
      transcript: match.transcript ?? node.attrs.transcript,
      transcriptSummary: match.transcriptSummary ?? node.attrs.transcriptSummary,
      ocrText: match.ocrText ?? node.attrs.ocrText,
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
  useEditorTick(editor);
  const words = editor.storage.characterCount?.words() ?? 0;
  const characters = editor.storage.characterCount?.characters() ?? 0;
  return (
    <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-faint">
      <span>
        {words} {words === 1 ? "palavra" : "palavras"} · {characters} caracteres
      </span>
      <span className="hidden sm:inline"># título · / blocos · @ menção · Ctrl F localizar</span>
    </div>
  );
}
