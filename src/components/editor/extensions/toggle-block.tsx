"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronRight, Palette, Trash2 } from "lucide-react";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "@/components/editor/editor-colors";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

function ToggleView({ node, updateAttributes, editor, deleteNode, getPos }: NodeViewProps) {
  const open = node.attrs.open as boolean;
  const summary = (node.attrs.summary as string) ?? "";
  const textColor = (node.attrs.textColor as string) || null;
  const backgroundColor = (node.attrs.backgroundColor as string) || null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selStart = input.selectionStart ?? 0;
    const selEnd = input.selectionEnd ?? 0;
    const rawPos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof rawPos !== "number") return;
    const pos: number = rawPos;

    if (event.key === "Backspace" && editor.isEditable) {
      if (selStart === 0 && selEnd === 0) {
        if (pos > 0) {
          const $pos = editor.state.doc.resolve(pos);
          const prevNode = $pos.nodeBefore;
          if (prevNode) {
            event.preventDefault();
            const from = pos - prevNode.nodeSize;
            if (prevNode.isTextblock && prevNode.textContent === "") {
              editor.chain().deleteRange({ from, to: pos }).run();
              const keepFocus = () => {
                input.focus();
                input.setSelectionRange(0, 0);
              };
              keepFocus();
              requestAnimationFrame(keepFocus);
              setTimeout(keepFocus, 0);
              return;
            }
            if (prevNode.isTextblock) {
              const prevText = prevNode.textContent;
              const newSummary = prevText + summary;
              updateAttributes({ summary: newSummary });
              editor.chain().deleteRange({ from, to: pos }).run();
              const keepFocus = () => {
                input.focus();
                input.setSelectionRange(prevText.length, prevText.length);
              };
              keepFocus();
              requestAnimationFrame(keepFocus);
              setTimeout(keepFocus, 0);
              return;
            }
            editor.chain().deleteRange({ from, to: pos }).run();
            const keepFocus = () => {
              input.focus();
              input.setSelectionRange(0, 0);
            };
            keepFocus();
            requestAnimationFrame(keepFocus);
            setTimeout(keepFocus, 0);
            return;
          }
        }
        if (!summary) {
          event.preventDefault();
          deleteNode();
          return;
        }
      }
      if (!summary) {
        event.preventDefault();
        deleteNode();
        return;
      }
    }

    if (event.key === "Delete" && editor.isEditable) {
      if (selStart === summary.length && selEnd === summary.length) {
        event.preventDefault();

        const pullFromOutside = () => {
          const afterPos = pos + node.nodeSize;
          if (afterPos < editor.state.doc.content.size) {
            const $after = editor.state.doc.resolve(afterPos);
            const nextNode = $after.nodeAfter;
            if (nextNode) {
              const nextText = nextNode.isTextblock
                ? nextNode.textContent
                : nextNode.type.name === "toggleBlock"
                ? ((nextNode.attrs.summary as string) || "")
                : "";
              const targetCursorPos = summary.length;
              if (nextText) {
                updateAttributes({ summary: summary + nextText });
              }
              editor
                .chain()
                .deleteRange({ from: afterPos, to: afterPos + nextNode.nodeSize })
                .run();
              const keepFocus = () => {
                input.focus();
                input.setSelectionRange(targetCursorPos, targetCursorPos);
              };
              keepFocus();
              requestAnimationFrame(keepFocus);
              setTimeout(keepFocus, 0);
              return;
            }
          }
          const keepFocus = () => {
            input.focus();
            input.setSelectionRange(summary.length, summary.length);
          };
          keepFocus();
          requestAnimationFrame(keepFocus);
          setTimeout(keepFocus, 0);
        };

        if (open) {
          const insidePos = pos + 1;
          const firstChild = node.childCount > 0 ? node.child(0) : null;
          if (firstChild) {
            const childText = firstChild.textContent;
            if (childText) {
              const targetCursorPos = summary.length;
              updateAttributes({ summary: summary + childText });
              if (node.childCount > 1) {
                editor
                  .chain()
                  .deleteRange({ from: insidePos, to: insidePos + firstChild.nodeSize })
                  .run();
              } else {
                editor
                  .chain()
                  .insertContentAt(
                    { from: insidePos, to: insidePos + firstChild.nodeSize },
                    { type: "paragraph" }
                  )
                  .run();
              }
              const keepFocus = () => {
                input.focus();
                input.setSelectionRange(targetCursorPos, targetCursorPos);
              };
              keepFocus();
              requestAnimationFrame(keepFocus);
              setTimeout(keepFocus, 0);
              return;
            } else if (node.childCount > 1) {
              editor
                .chain()
                .deleteRange({ from: insidePos, to: insidePos + firstChild.nodeSize })
                .run();
              const keepFocus = () => {
                input.focus();
                input.setSelectionRange(summary.length, summary.length);
              };
              keepFocus();
              requestAnimationFrame(keepFocus);
              setTimeout(keepFocus, 0);
              return;
            }
          }
          pullFromOutside();
          return;
        } else {
          pullFromOutside();
          return;
        }
      }
    }

    if (event.key === "Enter" && editor.isEditable) {
      event.preventDefault();

      if (selStart === 0 && selEnd === 0) {
        editor.chain().insertContentAt(pos, { type: "paragraph" }).run();
        const keepFocus = () => {
          input.focus();
          input.setSelectionRange(0, 0);
        };
        keepFocus();
        requestAnimationFrame(keepFocus);
        setTimeout(keepFocus, 0);
        return;
      }

      if (selStart === summary.length && selEnd === summary.length) {
        if (!open) {
          const afterPos = pos + node.nodeSize;
          editor
            .chain()
            .insertContentAt(afterPos, { type: "paragraph" })
            .focus(afterPos + 1)
            .run();
        } else {
          const insidePos = pos + 1;
          editor
            .chain()
            .insertContentAt(insidePos, { type: "paragraph" })
            .focus(insidePos + 1)
            .run();
        }
        return;
      }

      const beforeText = summary.slice(0, selStart);
      const afterText = summary.slice(selEnd);
      updateAttributes({ summary: beforeText });

      if (!open) {
        const afterPos = pos + node.nodeSize;
        editor
          .chain()
          .insertContentAt(afterPos, {
            type: "paragraph",
            content: afterText ? [{ type: "text", text: afterText }] : undefined,
          })
          .focus(afterPos + 1)
          .run();
      } else {
        const insidePos = pos + 1;
        editor
          .chain()
          .insertContentAt(insidePos, {
            type: "paragraph",
            content: afterText ? [{ type: "text", text: afterText }] : undefined,
          })
          .focus(insidePos + 1)
          .run();
      }
    }
  };

  return (
    <NodeViewWrapper
      className={cn(
        "group/toggle my-1.5 rounded-[var(--radius-md)] transition-colors duration-150",
        backgroundColor ? "p-2 sm:p-2.5" : ""
      )}
      style={{
        backgroundColor: backgroundColor || undefined,
      }}
    >
      <div className="flex items-center gap-1.5" contentEditable={false}>
        <button
          type="button"
          aria-label={open ? "Recolher" : "Expandir"}
          onClick={() => updateAttributes({ open: !open })}
          style={{ color: textColor || undefined }}
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
          onKeyDown={handleKeyDown}
          placeholder="Título do toggle"
          style={{ color: textColor || undefined }}
          className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-faint"
        />
        {editor.isEditable ? (
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover/toggle:opacity-100 focus-within:opacity-100">
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  title="Cor do toggle"
                  aria-label="Cor do toggle"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                >
                  <Palette className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="w-56 p-2">
                <div>
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                      Cor do texto
                    </span>
                    {textColor ? (
                      <button
                        type="button"
                        onClick={() => updateAttributes({ textColor: null })}
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        Redefinir
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-6 gap-1 p-1">
                    {TEXT_COLORS.map((color) => (
                      <button
                        key={`text-${color.label}`}
                        type="button"
                        title={color.label}
                        onClick={() => updateAttributes({ textColor: color.value })}
                        className={cn(
                          "size-5 rounded-full border border-[var(--border)] transition hover:scale-110",
                          textColor === color.value && "ring-2 ring-[var(--accent)] ring-offset-1"
                        )}
                        style={{ background: color.value ?? "var(--text)" }}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-2 border-t border-[var(--border)] pt-2">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                      Cor de fundo
                    </span>
                    {backgroundColor ? (
                      <button
                        type="button"
                        onClick={() => updateAttributes({ backgroundColor: null })}
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        Redefinir
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-6 gap-1 p-1">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={`bg-${color.label}`}
                        type="button"
                        title={color.label}
                        onClick={() => updateAttributes({ backgroundColor: color.value })}
                        className={cn(
                          "size-5 rounded-[4px] border border-[var(--border)] transition hover:scale-110",
                          backgroundColor === color.value && "ring-2 ring-[var(--accent)] ring-offset-1"
                        )}
                        style={{ background: color.value ?? "var(--surface)" }}
                      />
                    ))}
                  </div>
                </div>
              </MenuContent>
            </Menu>
            <button
              type="button"
              title="Excluir toggle"
              aria-label="Excluir toggle"
              onClick={() => deleteNode()}
              className="flex size-6 shrink-0 items-center justify-center rounded text-faint transition hover:bg-[var(--surface-hover)] hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
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
  isolating: true,

  addAttributes() {
    return {
      summary: { default: "" },
      open: { default: true },
      textColor: { default: null },
      backgroundColor: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
        getAttrs: (element) => {
          if (typeof element === "string") return {};
          const el = element as HTMLElement;
          return {
            summary: el.getAttribute("data-summary") || "",
            open: el.getAttribute("data-open") !== "false",
            textColor: el.getAttribute("data-text-color") || null,
            backgroundColor: el.getAttribute("data-background-color") || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle",
        "data-summary": HTMLAttributes.summary,
        "data-open": HTMLAttributes.open ? "true" : "false",
        "data-text-color": HTMLAttributes.textColor || undefined,
        "data-background-color": HTMLAttributes.backgroundColor || undefined,
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        const { $from } = selection;

        let insideToggle = false;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            insideToggle = true;
            break;
          }
        }

        if (!insideToggle) return false;

        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem")) {
          return false;
        }

        return this.editor.commands.splitBlock();
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
