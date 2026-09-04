"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

const EMOJIS = ["💡", "📌", "⚠️", "✅", "🔥", "🧠", "📥", "🛡️", "❓"];

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const emoji = (node.attrs.emoji as string) || "💡";
  return (
    <NodeViewWrapper className="synapsys-callout my-2" data-callout>
      <button
        type="button"
        contentEditable={false}
        disabled={!editor.isEditable}
        title="Trocar emoji"
        onClick={() => {
          const index = EMOJIS.indexOf(emoji);
          updateAttributes({ emoji: EMOJIS[(index + 1) % EMOJIS.length] });
        }}
        className="mt-0.5 select-none text-base leading-none transition hover:scale-110"
      >
        {emoji}
      </button>
      <NodeViewContent className="min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      emoji: { default: "💡" },
      color: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
