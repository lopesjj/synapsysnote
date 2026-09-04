"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronRight } from "lucide-react";

/**
 * Notion-style toggle list. The summary lives in an attribute (not in the doc)
 * so collapsing never hides editable content behind a closed node — the body is
 * simply unmounted while `open` is false.
 */
function ToggleView({ node, updateAttributes, editor }: NodeViewProps) {
  const open = node.attrs.open as boolean;
  const summary = (node.attrs.summary as string) ?? "";

  return (
    <NodeViewWrapper className="my-1.5 rounded-[var(--radius-sm)]">
      <div className="flex items-start gap-1.5" contentEditable={false}>
        <button
          type="button"
          aria-label={open ? "Recolher" : "Expandir"}
          onClick={() => updateAttributes({ open: !open })}
          className="mt-[3px] rounded p-0.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <ChevronRight
            className={`size-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
        </button>
        <input
          value={summary}
          readOnly={!editor.isEditable}
          onChange={(event) => updateAttributes({ summary: event.target.value })}
          placeholder="Título do toggle"
          className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-faint"
        />
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
