"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import katex from "katex";
import { Sigma } from "lucide-react";

function EquationView({ node, updateAttributes, editor }: NodeViewProps) {
  const expression = (node.attrs.expression as string) || "";
  const [editing, setEditing] = useState(!expression);

  let html = "";
  let error: string | null = null;
  try {
    html = katex.renderToString(expression || "\\;", {
      displayMode: true,
      throwOnError: true,
      output: "html",
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Expressão inválida";
  }

  return (
    <NodeViewWrapper className="my-3">
      {editing && editor.isEditable ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <Sigma className="size-3.5" /> LaTeX
          </div>
          <textarea
            autoFocus
            value={expression}
            spellCheck={false}
            onChange={(event) => updateAttributes({ expression: event.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape" || (event.key === "Enter" && event.metaKey)) setEditing(false);
            }}
            rows={2}
            className="w-full resize-none bg-transparent font-mono text-[12.5px] text-ink outline-none"
            placeholder="e = mc^2"
          />
          {error ? <p className="font-mono text-[11px] text-[var(--danger)]">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => editor.isEditable && setEditing(true)}
          className="w-full rounded-[var(--radius-md)] px-2 py-3 text-center transition hover:bg-[var(--surface-hover)]"
        >
          {error ? (
            <span className="font-mono text-[12px] text-[var(--danger)]">{expression}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const EquationBlock = Node.create({
  name: "equationBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { expression: { default: "" } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="equation"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "equation" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EquationView);
  },
});
