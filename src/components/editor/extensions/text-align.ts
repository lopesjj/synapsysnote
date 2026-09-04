import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
export type TextAlignValue = (typeof TEXT_ALIGNS)[number];

const ALIGNABLE = new Set(["paragraph", "heading"]);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textAlign: {
      setTextAlign: (alignment: TextAlignValue) => ReturnType;
    };
  }
}

function isAlignable(node: ProseMirrorNode): boolean {
  return ALIGNABLE.has(node.type.name);
}

function parseAlign(value: string | null | undefined, fallback: TextAlignValue): TextAlignValue {
  return TEXT_ALIGNS.includes(value as TextAlignValue) ? (value as TextAlignValue) : fallback;
}

function applyTextAlign(tr: Transaction, alignment: TextAlignValue): boolean {
  const { from, to } = tr.selection;
  let changed = false;

  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!isAlignable(node)) return;
    if (node.attrs.textAlign === alignment) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: alignment });
    changed = true;
  });

  return changed;
}

/**
 * Block alignment. Body text defaults to justify; headings stay left until
 * the user picks something else.
 */
export const TextAlign = Extension.create({
  name: "textAlign",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          textAlign: {
            default: "justify",
            parseHTML: (element) =>
              parseAlign(element.style.textAlign || element.getAttribute("data-text-align"), "justify"),
            renderHTML: (attributes) => {
              const align = parseAlign(attributes.textAlign, "justify");
              return { style: `text-align: ${align}` };
            },
          },
        },
      },
      {
        types: ["heading"],
        attributes: {
          textAlign: {
            default: "left",
            parseHTML: (element) =>
              parseAlign(element.style.textAlign || element.getAttribute("data-text-align"), "left"),
            renderHTML: (attributes) => {
              const align = parseAlign(attributes.textAlign, "left");
              return align === "left" ? {} : { style: `text-align: ${align}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (alignment) =>
        ({ tr }) => {
          let any = false;
          const { from, to } = tr.selection;
          tr.doc.nodesBetween(from, to, (node) => {
            if (isAlignable(node)) any = true;
          });
          if (!any) return false;
          return applyTextAlign(tr, alignment);
        },
    };
  },
});

export function currentTextAlign(editor: {
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
  getAttributes: (name: string) => Record<string, unknown>;
}): TextAlignValue {
  if (editor.isActive("heading")) {
    return parseAlign(editor.getAttributes("heading").textAlign as string | undefined, "left");
  }
  return parseAlign(editor.getAttributes("paragraph").textAlign as string | undefined, "justify");
}
