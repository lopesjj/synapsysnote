"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronRight, Trash2 } from "lucide-react";

function ToggleView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const open = node.attrs.open as boolean;
  const summary = (node.attrs.summary as string) ?? "";

  return (
    <NodeViewWrapper className="group/toggle my-1.5 rounded-[var(--radius-sm)]">
      <div className="flex items-center gap-1.5" contentEditable={false}>
        <button
          type="button"
          aria-label={open ? "Recolher" : "Expandir"}
          onClick={() => updateAttributes({ open: !open })}
          className="rounded p-0.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <ChevronRight
            className={`size-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
        </button>
        <input
          value={summary}
          readOnly={!editor.isEditable}
          onChange={(event) => updateAttributes({ summary: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !summary && editor.isEditable) {
              event.preventDefault();
              deleteNode();
            }
          }}
          placeholder="Título do toggle"
          className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-faint"
        />
        {editor.isEditable ? (
          <button
            type="button"
            title="Excluir toggle"
            aria-label="Excluir toggle"
            onClick={() => deleteNode()}
            className="flex size-6 shrink-0 items-center justify-center rounded text-faint opacity-0 transition group-hover/toggle:opacity-100 hover:bg-[var(--surface-hover)] hover:text-red-500"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <NodeViewContent className={`ml-[26px] border-l border-[var(--border)] pl-3 ${open ? "" : "hidden"}`} />
    </NodeViewWrapper>
  );
}

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      summary: { default: "" },
      open: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
