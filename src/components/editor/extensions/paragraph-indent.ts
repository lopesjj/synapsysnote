import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphIndent: {
      toggleIndentFirst: () => ReturnType;
    };
  }
}

/** First-line indent only applies to top-level paragraphs, not lists or quotes. */
function isIndentableParagraph(node: ProseMirrorNode, parent: ProseMirrorNode | null): boolean {
  return node.type.name === "paragraph" && parent?.type.name === "doc";
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

/**
 * Word-style first-line indent on paragraphs (`text-indent`).
 * Toggles every top-level paragraph that intersects the current selection.
 */
export const ParagraphIndent = Extension.create({
  name: "paragraphIndent",

  addGlobalAttributes() {
    return [
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
});
