"use client";

import { Extension, InputRule, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { Heading1, Heading2, Heading3 } from "lucide-react";
import type { ReactNode } from "react";
import type { Instance as TippyInstance } from "tippy.js";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-popup";
import { ensureSuggestionPopup } from "./suggestion-tippy";


const headingSuggestionKey = new PluginKey("headingShortcut");

function applyHeading(editor: Editor, range: Range, level: 1 | 2 | 3) {
  editor.chain().focus().deleteRange(range).setHeading({ level }).run();
}

function caretRect(editor: Editor): () => DOMRect {
  return () => {
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    return new DOMRect(coords.left, coords.top, 0, Math.max(1, coords.bottom - coords.top));
  };
}

const HEADINGS: {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  subtitle: string;
  keywords: string[];
  icon: ReactNode;
}[] = [
  {
    id: "h1",
    level: 1,
    title: "Título 1",
    subtitle: "# e espaço",
    keywords: ["h1", "titulo", "1"],
    icon: <Heading1 />,
  },
  {
    id: "h2",
    level: 2,
    title: "Título 2",
    subtitle: "## e espaço",
    keywords: ["h2", "subtitulo", "2"],
    icon: <Heading2 />,
  },
  {
    id: "h3",
    level: 3,
    title: "Título 3",
    subtitle: "### e espaço",
    keywords: ["h3", "3"],
    icon: <Heading3 />,
  },
];

function headingFromQuery(query: string): 1 | 2 | 3 {
  const hashes = 1 + (query.match(/^#*/)?.[0].length ?? 0);
  return Math.min(3, Math.max(1, hashes)) as 1 | 2 | 3;
}

function headingInputRules() {
  return ([1, 2, 3] as const).map(
    (level) =>
      new InputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setHeading({ level }).run();
        },
      })
  );
}

function buildSuggestion(): Omit<SuggestionOptions, "editor"> {
  return {
    char: "#",
    startOfLine: true,
    allowSpaces: false,
    items: ({ query }) => {
      const extraHashes = query.match(/^#*/)?.[0].length ?? 0;
      if (extraHashes >= 1 && extraHashes <= 2 && query.replace(/#/g, "") === "") {
        return HEADINGS.filter((item) => item.level === extraHashes + 1);
      }
      const q = query.toLowerCase().trim();
      if (!q) return HEADINGS;
      return HEADINGS.filter(
        (item) =>
          item.title.toLowerCase().includes(q) || item.keywords.some((keyword) => keyword.includes(q))
      );
    },
    render: () => {
      let component: ReactRenderer<SuggestionListHandle> | null = null;
      let popup: TippyInstance | null = null;
      let query = "";
      let editor: Editor | null = null;
      let range: Range | null = null;

      const toItems = (items: typeof HEADINGS, nextEditor: Editor, nextRange: Range): SuggestionItem[] =>
        items.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          group: "Títulos",
          icon: item.icon,
          run: () => applyHeading(nextEditor, nextRange, item.level),
        }));

      return {
        onStart: (props) => {
          query = props.query;
          editor = props.editor;
          range = props.range;
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: toItems(props.items as typeof HEADINGS, props.editor, props.range),
              emptyLabel: "Nenhum título corresponde",
            },
            editor: props.editor,
          });
          popup = ensureSuggestionPopup(
            popup,
            (props.clientRect as (() => DOMRect) | null) ?? caretRect(props.editor),
            component.element
          );
        },
        onUpdate: (props) => {
          query = props.query;
          editor = props.editor;
          range = props.range;
          component?.updateProps({
            items: toItems(props.items as typeof HEADINGS, props.editor, props.range),
          });
          if (component) {
            popup = ensureSuggestionPopup(
              popup,
              (props.clientRect as (() => DOMRect) | null) ?? caretRect(props.editor),
              component.element
            );
          }
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          if (props.event.key === " " && editor && range) {
            props.event.preventDefault();
            applyHeading(editor, range, headingFromQuery(query));
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
          editor = null;
          range = null;
        },
      };
    },
  };
}

export const HeadingShortcut = Extension.create({
  name: "headingShortcut",
  priority: 1000,

  addInputRules() {
    return headingInputRules();
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: headingSuggestionKey,
        ...buildSuggestion(),
      }),
    ];
  },
});
