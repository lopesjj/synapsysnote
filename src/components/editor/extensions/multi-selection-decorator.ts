"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const multiSelectionPluginKey = new PluginKey("multiSelectionDecorator");

export const MultiSelectionDecorator = Extension.create({
  name: "multiSelectionDecorator",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: multiSelectionPluginKey,
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            if (from === to) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.isAtom) {
                const end = pos + node.nodeSize;
                if (pos < to && end > from) {
                  decorations.push(
                    Decoration.node(pos, end, {
                      class: "ProseMirror-selectednode",
                    })
                  );
                }
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
