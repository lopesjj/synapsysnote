"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Mention from "@tiptap/extension-mention";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import type { AppBlock, Page } from "@/types/models";
import { Callout } from "./extensions/callout";
import { ToggleBlock } from "./extensions/toggle-block";
import { EquationBlock } from "./extensions/equation-block";
import { MediaBlock } from "./extensions/media-block";
import { DragHandle } from "./extensions/drag-handle";
import { SlashCommand } from "./extensions/slash-command";
import { createMentionSuggestion, type MentionCandidate } from "./extensions/mention-suggestion";
import { BubbleToolbar } from "./bubble-toolbar";
import { blocksToDoc, collectMentionIds, docToBlocks } from "./serializer";

const lowlight = createLowlight(common);

export interface BlockEditorProps {
  page: Page;
  editable?: boolean;
  mentionCandidates: MentionCandidate[];
  onChange: (payload: { blocks: AppBlock[]; outgoingLinks: string[] }) => void;
  onRequestUpload: () => void;
  onRequestAudio: () => void;
}

/**
 * ETAPA 5 — The editor surface.
 *
 * Loading strategy: the TipTap document is created once per page id. Remote
 * updates for the *same* page are not force-applied while the user is typing —
 * that would fight the caret — so the debounced writer stays authoritative
 * until the user navigates away.
 */
export function BlockEditor({
  page,
  editable = true,
  mentionCandidates,
  onChange,
  onRequestUpload,
  onRequestAudio,
}: BlockEditorProps) {
  const candidatesRef = useRef(mentionCandidates);
  useEffect(() => {
    candidatesRef.current = mentionCandidates;
  }, [mentionCandidates]);

  const handlers = useMemo(
    () => ({ onRequestUpload, onRequestAudio }),
    [onRequestAudio, onRequestUpload]
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Título da seção"
            : "Escreva, cole ou digite / para inserir um bloco",
        includeChildren: true,
      }),
      Highlight.configure({ multicolor: false }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "typescript" }),
      Callout,
      ToggleBlock,
      EquationBlock,
      MediaBlock,
      DragHandle,
      SlashCommand.configure({ handlers }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        // TipTap invokes this on "@", never during React render.
        // eslint-disable-next-line react-hooks/refs
        suggestion: createMentionSuggestion(() => candidatesRef.current),
      }),
    ],
    [handlers]
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
      },
      onUpdate: ({ editor: instance }) => {
        const blocks = docToBlocks(instance.getJSON());
        onChange({ blocks, outgoingLinks: collectMentionIds(blocks) });
      },
    },
    [page.id, editable]
  );

  // Media added outside the editor (uploads, voice notes) arrives through the
  // page document; append-only diffs are safe to apply without losing the caret.
  const lastBlockCount = useRef(page.blocks.length);
  useEffect(() => {
    if (!editor) return;
    if (page.blocks.length > lastBlockCount.current) {
      const isFocused = editor.isFocused;
      editor.commands.setContent(blocksToDoc(page.blocks), { emitUpdate: false });
      if (isFocused) editor.commands.focus("end");
    }
    lastBlockCount.current = page.blocks.length;
  }, [editor, page.blocks]);

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
    <div className="synapsys-editor relative">
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} />
      {/* Clicking the empty space below the last block continues writing. */}
      <div className="min-h-24 cursor-text" onClick={focusEnd} />
    </div>
  );
}
