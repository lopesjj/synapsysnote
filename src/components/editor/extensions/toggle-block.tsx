"use client";

import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(() => Boolean(node.attrs.open ?? true));
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(Boolean(node.attrs.open ?? true));
  }, [node.attrs.open]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const apply = () => {
      const target =
        el.querySelector(":scope > .synapsys-toggle-content > [data-node-view-content-react]") ||
        el.querySelector(":scope > .synapsys-toggle-content") ||
        el.querySelector("[data-node-view-content-react]") ||
        el.querySelector("[data-node-view-content]") ||
        el.querySelector(".synapsys-toggle-content");
      if (!target) return;
      const children = Array.from(target.children) as HTMLElement[];
      for (let i = 1; i < children.length; i++) {
        if (open) {
          children[i].style.removeProperty("display");
        } else {
          children[i].style.setProperty("display", "none", "important");
        }
      }
    };

    apply();
    const timer = setTimeout(apply, 0);

    const observer = new MutationObserver(() => {
      apply();
    });

    observer.observe(el, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [open]);

  const handleToggle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !open;
    setOpen(next);
    updateAttributes({ open: next });
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <NodeViewWrapper
      className={cn(
        "synapsys-toggle group/toggle relative my-1.5 transition-colors",
        open ? "synapsys-toggle--open" : "synapsys-toggle--closed"
      )}
      data-toggle-open={open ? "true" : "false"}
    >
      <div ref={innerRef} className="synapsys-toggle-inner w-full">
        <button
          type="button"
          contentEditable={false}
          aria-label={open ? "Recolher toggle" : "Expandir toggle"}
          onMouseDown={handleMouseDown}
          onClick={handleToggle}
          className="synapsys-toggle__trigger"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-200",
              open ? "rotate-90" : "rotate-0"
            )}
          />
        </button>
        <NodeViewContent className="synapsys-toggle-content min-w-0 flex-1" />
      </div>
    </NodeViewWrapper>
  );
}

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-toggle-open") !== "false" && element.getAttribute("data-open") !== "false",
        renderHTML: (attributes) => ({
          "data-toggle-open": attributes.open ? "true" : "false",
          "data-open": attributes.open ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        let toggleDepth = -1;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            toggleDepth = depth;
            break;
          }
        }

        if (toggleDepth === -1) return false;

        const toggleNode = $from.node(toggleDepth);
        const togglePos = $from.before(toggleDepth);
        const childIndex = $from.index(toggleDepth);
        const currentChild = toggleNode.child(childIndex);

        if (childIndex === 0) {
          const tr = state.tr;
          if (!toggleNode.attrs.open) {
            tr.setNodeMarkup(togglePos, undefined, {
              ...toggleNode.attrs,
              open: true,
            });
          }

          if ($from.parent.type.name === "heading" && $from.parentOffset === $from.parent.content.size) {
            const afterHeaderPos = $from.after();
            tr.insert(afterHeaderPos, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, afterHeaderPos + 1));
            view.dispatch(tr.scrollIntoView());
            return true;
          }

          if (tr.docChanged) {
            view.dispatch(tr);
          }
        }

        if (childIndex > 0 && currentChild.textContent === "" && currentChild.childCount === 0) {
          const directChildDepth = toggleDepth + 1;
          const currentBeforePos = $from.before(directChildDepth);
          const currentAfterPos = $from.after(directChildDepth);
          const toggleAfterPos = togglePos + toggleNode.nodeSize;

          const tr = state.tr;
          tr.delete(currentBeforePos, currentAfterPos);
          const insertPos = tr.mapping.map(toggleAfterPos);
          const newParagraph = state.schema.nodes.paragraph.create();
          tr.insert(insertPos, newParagraph);
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
          view.dispatch(tr.scrollIntoView());
          return true;
        }

        return this.editor.commands.splitBlock();
      },

      Backspace: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;

        let toggleDepth = -1;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            toggleDepth = depth;
            break;
          }
        }

        if (toggleDepth === -1) return false;

        if ($from.parentOffset !== 0) return false;

        const toggleNode = $from.node(toggleDepth);
        const togglePos = $from.before(toggleDepth);
        const childIndex = $from.index(toggleDepth);

        if (childIndex === 0) {
          const firstChild = toggleNode.child(0);
          if (firstChild.textContent === "" && firstChild.childCount === 0 && toggleNode.childCount === 1) {
            return this.editor.chain().lift(this.name).run() || this.editor.commands.clearNodes();
          }
          return false;
        }

        return false;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest(".synapsys-toggle__trigger"));
      },
    });
  },
});
