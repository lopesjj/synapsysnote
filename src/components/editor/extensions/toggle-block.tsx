"use client";

import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function ToggleView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(() => Boolean(node.attrs.open ?? true));

  useEffect(() => {
    setOpen(Boolean(node.attrs.open ?? true));
  }, [node.attrs.open]);

  const handleToggle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !open;
    setOpen(next);
    updateAttributes({ open: next });

    if (!next && typeof getPos === "function") {
      const togglePos = getPos();
      if (typeof togglePos === "number") {
        const { state } = editor;
        const { selection } = state;
        const firstChild = node.child(0);
        const headerEnd = togglePos + 1 + firstChild.nodeSize;
        const toggleEnd = togglePos + node.nodeSize;

        if (selection.from >= headerEnd && selection.to <= toggleEnd) {
          const targetPos = togglePos + 1 + Math.min(selection.from - togglePos - 1, firstChild.content.size);
          editor.chain().setTextSelection(Math.max(togglePos + 1, targetPos)).run();
        }
      }
    }
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
      data-indent={node.attrs.indent ? String(node.attrs.indent) : undefined}
    >
      <div className="synapsys-toggle-inner w-full">
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
      indent: {
        default: 0,
        parseHTML: (element) => {
          const val = parseInt(element.getAttribute("data-indent") || "0", 10);
          return isNaN(val) ? 0 : Math.min(8, Math.max(0, val));
        },
        renderHTML: (attributes) => {
          const indent = Number(attributes.indent ?? 0);
          if (!indent || indent <= 0) return {};
          return { "data-indent": String(Math.min(8, indent)) };
        },
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

        if (
          this.editor.isActive("listItem") ||
          this.editor.isActive("taskItem") ||
          this.editor.isActive("table") ||
          this.editor.isActive("codeBlock")
        ) {
          return false;
        }

        const toggleNode = $from.node(toggleDepth);
        const togglePos = $from.before(toggleDepth);
        const childIndex = $from.index(toggleDepth);
        const currentChild = toggleNode.child(childIndex);

        if (childIndex === 0) {
          if (selection.empty && $from.parentOffset === 0) {
            const tr = state.tr;
            const newParagraph = state.schema.nodes.paragraph.create();
            tr.insert(togglePos, newParagraph);
            tr.setSelection(TextSelection.create(tr.doc, togglePos + newParagraph.nodeSize + 1));
            view.dispatch(tr.scrollIntoView());
            return true;
          }

          if ($from.parentOffset === $from.parent.content.size) {
            const tr = state.tr;
            const isOpen = Boolean(toggleNode.attrs.open ?? true);
            if (!isOpen) {
              const toggleAfterPos = togglePos + toggleNode.nodeSize;
              const newParagraph = state.schema.nodes.paragraph.create();
              tr.insert(toggleAfterPos, newParagraph);
              tr.setSelection(TextSelection.create(tr.doc, toggleAfterPos + 1));
              view.dispatch(tr.scrollIntoView());
              return true;
            } else {
              const afterHeaderPos = $from.after();
              const newParagraph = state.schema.nodes.paragraph.create();
              tr.insert(afterHeaderPos, newParagraph);
              tr.setSelection(TextSelection.create(tr.doc, afterHeaderPos + 1));
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
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

        if (toggleDepth === -1) {
          if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.parentOffset === 0) {
            const currentParaPos = $from.before();
            if (currentParaPos > 0) {
              const $resolve = state.doc.resolve(currentParaPos);
              const prevNode = $resolve.nodeBefore;
              if (prevNode && prevNode.type.name === this.name) {
                const tr = state.tr;
                tr.delete(currentParaPos, currentParaPos + $from.parent.nodeSize);
                const prevTogglePos = currentParaPos - prevNode.nodeSize;
                const headerSize = prevNode.child(0).content.size;
                const targetPos = prevTogglePos + 1 + headerSize;
                tr.setSelection(TextSelection.create(tr.doc, targetPos));
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
          }
          return false;
        }

        if (
          this.editor.isActive("listItem") ||
          this.editor.isActive("taskItem") ||
          this.editor.isActive("table") ||
          this.editor.isActive("codeBlock")
        ) {
          return false;
        }

        if ($from.parentOffset !== 0) return false;

        const toggleNode = $from.node(toggleDepth);
        const togglePos = $from.before(toggleDepth);
        const childIndex = $from.index(toggleDepth);

        if (childIndex === 0) {
          if ((toggleNode.attrs.indent ?? 0) > 0) {
            return this.editor.commands.outdent();
          }
          const firstChild = toggleNode.child(0);
          if (firstChild.textContent === "" && firstChild.childCount === 0 && toggleNode.childCount === 1) {
            return this.editor.chain().lift(this.name).run() || this.editor.commands.clearNodes();
          }
          return false;
        }

        return false;
      },

      Delete: () => {
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

        if (toggleDepth === -1) {
          if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.parentOffset === 0) {
            const currentParaPos = $from.before();
            if (currentParaPos > 0) {
              const $resolve = state.doc.resolve(currentParaPos);
              const prevNode = $resolve.nodeBefore;
              if (prevNode && prevNode.type.name === this.name) {
                const tr = state.tr;
                tr.delete(currentParaPos, currentParaPos + $from.parent.nodeSize);
                const prevTogglePos = currentParaPos - prevNode.nodeSize;
                const headerSize = prevNode.child(0).content.size;
                const targetPos = prevTogglePos + 1 + headerSize;
                tr.setSelection(TextSelection.create(tr.doc, targetPos));
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
          }
          return false;
        }

        if (
          this.editor.isActive("listItem") ||
          this.editor.isActive("taskItem") ||
          this.editor.isActive("table") ||
          this.editor.isActive("codeBlock")
        ) {
          return false;
        }

        const toggleNode = $from.node(toggleDepth);
        const togglePos = $from.before(toggleDepth);
        const childIndex = $from.index(toggleDepth);

        if (childIndex === 0 && $from.parentOffset === $from.parent.content.size) {
          const isOpen = Boolean(toggleNode.attrs.open ?? true);

          if (!isOpen || toggleNode.childCount === 1) {
            const toggleAfterPos = togglePos + toggleNode.nodeSize;
            if (toggleAfterPos < state.doc.content.size) {
              const $after = state.doc.resolve(toggleAfterPos);
              const nextNode = $after.nodeAfter;
              if (!nextNode) return false;

              const tr = state.tr;
              if (nextNode.isTextblock) {
                const nextContent = nextNode.content;
                tr.delete(toggleAfterPos, toggleAfterPos + nextNode.nodeSize);
                if (nextContent.size > 0) {
                  tr.insert($from.pos, nextContent);
                }
                tr.setSelection(TextSelection.create(tr.doc, $from.pos));
                view.dispatch(tr.scrollIntoView());
                return true;
              } else if (nextNode.content.size === 0 || nextNode.textContent === "") {
                tr.delete(toggleAfterPos, toggleAfterPos + nextNode.nodeSize);
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
            return false;
          } else {
            const firstChild = toggleNode.child(0);
            const child1Pos = togglePos + 1 + firstChild.nodeSize;
            const child1Node = toggleNode.child(1);

            const tr = state.tr;
            if (child1Node.isTextblock) {
              const child1Content = child1Node.content;
              tr.delete(child1Pos, child1Pos + child1Node.nodeSize);
              if (child1Content.size > 0) {
                tr.insert($from.pos, child1Content);
              }
              tr.setSelection(TextSelection.create(tr.doc, $from.pos));
              view.dispatch(tr.scrollIntoView());
              return true;
            } else if (
              child1Node.type.name === "bulletList" ||
              child1Node.type.name === "orderedList" ||
              child1Node.type.name === "taskList"
            ) {
              if (child1Node.childCount > 0) {
                const firstItem = child1Node.child(0);
                const itemPara = firstItem.firstChild;
                if (child1Node.childCount === 1 && (!itemPara || itemPara.content.size === 0)) {
                  tr.delete(child1Pos, child1Pos + child1Node.nodeSize);
                  view.dispatch(tr.scrollIntoView());
                  return true;
                } else if (itemPara && itemPara.content.size > 0) {
                  const itemContent = itemPara.content;
                  if (child1Node.childCount === 1 && firstItem.childCount === 1) {
                    tr.delete(child1Pos, child1Pos + child1Node.nodeSize);
                  } else {
                    tr.delete(child1Pos + 1, child1Pos + 1 + firstItem.nodeSize);
                  }
                  tr.insert($from.pos, itemContent);
                  tr.setSelection(TextSelection.create(tr.doc, $from.pos));
                  view.dispatch(tr.scrollIntoView());
                  return true;
                }
              }
            } else if (child1Node.content.size === 0 || child1Node.textContent === "") {
              tr.delete(child1Pos, child1Pos + child1Node.nodeSize);
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
        }

        if (childIndex === toggleNode.childCount - 1 && $from.parentOffset === $from.parent.content.size) {
          const toggleAfterPos = togglePos + toggleNode.nodeSize;
          if (toggleAfterPos < state.doc.content.size) {
            const $after = state.doc.resolve(toggleAfterPos);
            const nextNode = $after.nodeAfter;
            if (nextNode && nextNode.isTextblock) {
              const nextContent = nextNode.content;
              const tr = state.tr;
              tr.delete(toggleAfterPos, toggleAfterPos + nextNode.nodeSize);
              if (nextContent.size > 0) {
                tr.insert($from.pos, nextContent);
              }
              tr.setSelection(TextSelection.create(tr.doc, $from.pos));
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
        }

        return false;
      },

      ArrowDown: () => {
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
        const isOpen = Boolean(toggleNode.attrs.open ?? true);

        if (!isOpen) {
          const childIndex = $from.index(toggleDepth);
          if (childIndex === 0) {
            const togglePos = $from.before(toggleDepth);
            const afterTogglePos = togglePos + toggleNode.nodeSize;
            if (afterTogglePos < state.doc.content.size) {
              const tr = state.tr;
              tr.setSelection(TextSelection.near(tr.doc.resolve(afterTogglePos + 1)));
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
        }

        return false;
      },

      ArrowUp: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        const posBefore = $from.before();
        if (posBefore > 0) {
          const $resolve = state.doc.resolve(posBefore);
          const prevNode = $resolve.nodeBefore;
          if (prevNode && prevNode.type.name === this.name) {
            const isOpen = Boolean(prevNode.attrs.open ?? true);
            if (!isOpen) {
              const prevTogglePos = posBefore - prevNode.nodeSize;
              const targetPos = prevTogglePos + 1 + prevNode.child(0).content.size;
              const tr = state.tr;
              tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)));
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
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
