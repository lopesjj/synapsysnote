import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export const MAX_INDENT = 8;
export const MIN_INDENT = 0;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphIndent: {
      toggleIndentFirst: () => ReturnType;
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setIndent: (level: number) => ReturnType;
    };
  }
}

function isIndentable(node: ProseMirrorNode, parent?: ProseMirrorNode | null): boolean {
  if (parent?.type.name === "listItem" || parent?.type.name === "taskItem") return false;
  if (node.type.name === "listItem" || node.type.name === "taskItem") return false;
  if (node.type.name === "table" || node.type.name === "tableRow" || node.type.name === "tableCell" || node.type.name === "tableHeader") {
    return false;
  }
  if (node.type.name === "codeBlock") return false;
  if (parent?.type.name === "toggleBlock" && parent.child(0) === node) {
    return false;
  }
  return (
    node.type.name === "paragraph" ||
    node.type.name === "heading" ||
    node.type.name === "blockquote" ||
    node.type.name === "toggleBlock"
  );
}

function isIndentableParagraph(node: ProseMirrorNode, parent?: ProseMirrorNode | null): boolean {
  if (parent?.type.name === "listItem" || parent?.type.name === "taskItem") return false;
  if (parent?.type.name === "toggleBlock" && parent.child(0) === node) return false;
  return node.type.name === "paragraph";
}

function applyIndent(tr: Transaction, delta: number): boolean {
  const { from, to } = tr.selection;
  let changed = false;

  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.type.name === "toggleBlock") {
      const headerEnd = pos + 1 + node.child(0).nodeSize;
      if (from >= headerEnd) {
        return;
      }
      if (from <= pos && to >= pos + node.nodeSize) {
        const current = typeof node.attrs.indent === "number" ? node.attrs.indent : 0;
        const next = Math.min(MAX_INDENT, Math.max(MIN_INDENT, current + delta));
        if (current !== next) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
        return false;
      }
      if (to <= headerEnd) {
        const current = typeof node.attrs.indent === "number" ? node.attrs.indent : 0;
        const next = Math.min(MAX_INDENT, Math.max(MIN_INDENT, current + delta));
        if (current !== next) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
        return;
      }
    }

    if (!isIndentable(node, parent)) return;
    const current = typeof node.attrs.indent === "number" ? node.attrs.indent : 0;
    const next = Math.min(MAX_INDENT, Math.max(MIN_INDENT, current + delta));
    if (current !== next) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
      changed = true;
    } else if (delta < 0 && current === 0 && node.attrs.indentFirst) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentFirst: false });
      changed = true;
    }
  });

  return changed;
}

function applySetIndent(tr: Transaction, level: number): boolean {
  const { from, to } = tr.selection;
  let changed = false;
  const target = Math.min(MAX_INDENT, Math.max(MIN_INDENT, level));

  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.type.name === "toggleBlock") {
      const headerEnd = pos + 1 + node.child(0).nodeSize;
      if (from >= headerEnd) {
        return;
      }
      if (from <= pos && to >= pos + node.nodeSize) {
        if (node.attrs.indent !== target) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: target });
          changed = true;
        }
        return false;
      }
      if (to <= headerEnd) {
        if (node.attrs.indent !== target) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: target });
          changed = true;
        }
        return;
      }
    }

    if (!isIndentable(node, parent)) return;
    if (node.attrs.indent === target) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: target });
    changed = true;
  });

  return changed;
}

function applyIndentFirst(tr: Transaction, value: boolean): boolean {
  const { from, to } = tr.selection;
  let changed = false;

  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!isIndentableParagraph(node, parent)) return;
    if (Boolean(node.attrs.indentFirst) === value) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentFirst: value });
    changed = true;
  });

  return changed;
}

export const ParagraphIndent = Extension.create({
  name: "paragraphIndent",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "toggleBlock",
          "bulletList",
          "orderedList",
          "taskList",
        ],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const val = parseInt(element.getAttribute("data-indent") || "0", 10);
              return isNaN(val) ? 0 : Math.min(MAX_INDENT, Math.max(MIN_INDENT, val));
            },
            renderHTML: (attributes) => {
              const indent = Number(attributes.indent ?? 0);
              if (!indent || indent <= 0) return {};
              return { "data-indent": String(Math.min(MAX_INDENT, indent)) };
            },
          },
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          indentFirst: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-indent-first") === "true",
            renderHTML: (attributes) =>
              attributes.indentFirst ? { "data-indent-first": "true" } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr }) => {
          let any = false;
          const { from, to } = tr.selection;
          tr.doc.nodesBetween(from, to, (node, pos, parent) => {
            if (node.type.name === "toggleBlock") {
              const headerEnd = pos + 1 + node.child(0).nodeSize;
              if (from < headerEnd) {
                any = true;
                return;
              }
            }
            if (isIndentable(node, parent)) any = true;
          });
          if (!any) return false;
          return applyIndent(tr, 1);
        },

      outdent:
        () =>
        ({ tr }) => {
          let any = false;
          const { from, to } = tr.selection;
          tr.doc.nodesBetween(from, to, (node, pos, parent) => {
            if (node.type.name === "toggleBlock") {
              const headerEnd = pos + 1 + node.child(0).nodeSize;
              if (from < headerEnd) {
                any = true;
                return;
              }
            }
            if (isIndentable(node, parent)) any = true;
          });
          if (!any) return false;
          return applyIndent(tr, -1);
        },

      setIndent:
        (level: number) =>
        ({ tr }) => {
          let any = false;
          const { from, to } = tr.selection;
          tr.doc.nodesBetween(from, to, (node, pos, parent) => {
            if (node.type.name === "toggleBlock") {
              const headerEnd = pos + 1 + node.child(0).nodeSize;
              if (from < headerEnd) {
                any = true;
                return;
              }
            }
            if (isIndentable(node, parent)) any = true;
          });
          if (!any) return false;
          return applySetIndent(tr, level);
        },

      toggleIndentFirst:
        () =>
        ({ tr }) => {
          let any = false;
          let allIndented = true;
          const { from, to } = tr.selection;

          tr.doc.nodesBetween(from, to, (node, _pos, parent) => {
            if (!isIndentableParagraph(node, parent)) return;
            any = true;
            if (!node.attrs.indentFirst) allIndented = false;
          });

          if (!any) return false;
          return applyIndentFirst(tr, !allIndented);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem")) {
          const itemType = this.editor.isActive("listItem") ? "listItem" : "taskItem";
          if (this.editor.commands.sinkListItem(itemType)) {
            return true;
          }

          const { state, view } = this.editor;
          const { selection } = state;
          const { $from } = selection;

          let topmostListDepth = -1;
          for (let d = 1; d <= $from.depth; d++) {
            const nodeName = $from.node(d).type.name;
            if (nodeName === "bulletList" || nodeName === "orderedList" || nodeName === "taskList") {
              topmostListDepth = d;
              break;
            }
          }

          if (topmostListDepth !== -1) {
            const listPos = $from.before(topmostListDepth);
            const listNode = $from.node(topmostListDepth);
            const currentIndent = typeof listNode.attrs.indent === "number" ? listNode.attrs.indent : 0;
            const nextIndent = Math.min(MAX_INDENT, currentIndent + 1);
            if (currentIndent !== nextIndent) {
              const tr = state.tr.setNodeMarkup(listPos, undefined, { ...listNode.attrs, indent: nextIndent });
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }

          return true;
        }

        if (this.editor.isActive("table")) {
          return false;
        }
        if (this.editor.isActive("codeBlock")) {
          return false;
        }

        return this.editor.commands.indent();
      },

      "Shift-Tab": () => {
        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem")) {
          const itemType = this.editor.isActive("listItem") ? "listItem" : "taskItem";
          if (this.editor.commands.liftListItem(itemType)) {
            return true;
          }

          const { state, view } = this.editor;
          const { selection } = state;
          const { $from } = selection;

          let topmostListDepth = -1;
          for (let d = 1; d <= $from.depth; d++) {
            const nodeName = $from.node(d).type.name;
            if (nodeName === "bulletList" || nodeName === "orderedList" || nodeName === "taskList") {
              topmostListDepth = d;
              break;
            }
          }

          if (topmostListDepth !== -1) {
            const listPos = $from.before(topmostListDepth);
            const listNode = $from.node(topmostListDepth);
            const currentIndent = typeof listNode.attrs.indent === "number" ? listNode.attrs.indent : 0;
            if (currentIndent > 0) {
              const nextIndent = Math.max(MIN_INDENT, currentIndent - 1);
              const tr = state.tr.setNodeMarkup(listPos, undefined, { ...listNode.attrs, indent: nextIndent });
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }

          return true;
        }

        if (this.editor.isActive("table")) {
          return false;
        }
        if (this.editor.isActive("codeBlock")) {
          return false;
        }

        return this.editor.commands.outdent();
      },

      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty || selection.$from.parentOffset !== 0) {
          return false;
        }

        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem")) {
          const { $from } = selection;
          let count = 0;
          for (let d = $from.depth; d > 0; d--) {
            const name = $from.node(d).type.name;
            if (name === "listItem" || name === "taskItem") {
              count++;
            }
          }

          if (count > 1) {
            const itemType = this.editor.isActive("listItem") ? "listItem" : "taskItem";
            return this.editor.commands.liftListItem(itemType);
          }

          if (count === 1) {
            let topmostListDepth = -1;
            for (let d = 1; d <= $from.depth; d++) {
              const nodeName = $from.node(d).type.name;
              if (nodeName === "bulletList" || nodeName === "orderedList" || nodeName === "taskList") {
                topmostListDepth = d;
                break;
              }
            }

            if (topmostListDepth !== -1 && $from.index(topmostListDepth) === 0) {
              const listPos = $from.before(topmostListDepth);
              const listNode = $from.node(topmostListDepth);
              const currentIndent = typeof listNode.attrs.indent === "number" ? listNode.attrs.indent : 0;
              if (currentIndent > 0) {
                const nextIndent = Math.max(MIN_INDENT, currentIndent - 1);
                const tr = this.editor.state.tr.setNodeMarkup(listPos, undefined, {
                  ...listNode.attrs,
                  indent: nextIndent,
                });
                this.editor.view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
          }

          return false;
        }

        const node = selection.$from.parent;
        const parent =
          selection.$from.depth > 0 ? selection.$from.node(selection.$from.depth - 1) : null;

        if (parent?.type.name === "toggleBlock" && selection.$from.index(selection.$from.depth - 1) === 0) {
          const toggleIndent = typeof parent.attrs.indent === "number" ? parent.attrs.indent : 0;
          if (toggleIndent > 0) {
            return this.editor.commands.outdent();
          }
          return false;
        }

        if (!isIndentable(node, parent)) {
          return false;
        }

        const currentIndent = typeof node.attrs.indent === "number" ? node.attrs.indent : 0;
        if (currentIndent > 0) {
          return this.editor.commands.outdent();
        }

        if (node.attrs.indentFirst) {
          return this.editor.commands.toggleIndentFirst();
        }

        return false;
      },
    };
  },
});
