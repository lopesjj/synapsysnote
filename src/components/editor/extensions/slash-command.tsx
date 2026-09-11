"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import {
  AudioLines,
  CheckSquare,
  ChevronRight,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Sigma,
  Table2,
  Type,
} from "lucide-react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-popup";
import { ensureSuggestionPopup } from "./suggestion-tippy";
import { emptyTableGrid } from "./table-block";
import type { Instance as TippyInstance } from "tippy.js";
import { useUiStore } from "@/lib/store/ui-store";
import { TRANSLATIONS, type TranslationKey } from "@/lib/i18n/translations";

export interface SlashCommandHandlers {
  onRequestUpload: () => void;
  onRequestAudio: () => void;
}

interface CommandDescriptor {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  icon: React.ReactNode;
  keywords: string[];
  action: (args: { editor: Editor; range: Range; handlers: SlashCommandHandlers }) => void;
}

function getTranslator() {
  const language = useUiStore.getState().language || "pt";
  const dict = TRANSLATIONS[language] || TRANSLATIONS.pt;
  return (key: TranslationKey) => dict[key] || TRANSLATIONS.pt[key] || key;
}

function getCommands(t: (key: TranslationKey) => string): CommandDescriptor[] {
  return [
    {
      id: "text",
      title: t("slash_text_title"),
      subtitle: t("slash_text_desc"),
      group: t("slash_group_basic"),
      icon: <Type />,
      keywords: ["texto", "paragrafo", "p", "text", "paragraph"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: "h1",
      title: t("slash_h1_title"),
      subtitle: t("slash_h1_desc"),
      group: t("slash_group_basic"),
      icon: <Heading1 />,
      keywords: ["h1", "titulo", "heading", "title"],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      id: "h2",
      title: t("slash_h2_title"),
      subtitle: t("slash_h2_desc"),
      group: t("slash_group_basic"),
      icon: <Heading2 />,
      keywords: ["h2", "subtitulo", "subtitle", "heading"],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      id: "h3",
      title: t("slash_h3_title"),
      subtitle: t("slash_h3_desc"),
      group: t("slash_group_basic"),
      icon: <Heading3 />,
      keywords: ["h3", "heading"],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      id: "bullet",
      title: t("slash_bullet_title"),
      subtitle: t("slash_bullet_desc"),
      group: t("slash_group_lists"),
      icon: <List />,
      keywords: ["lista", "bullet", "ul", "list"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "ordered",
      title: t("slash_ordered_title"),
      subtitle: t("slash_ordered_desc"),
      group: t("slash_group_lists"),
      icon: <ListOrdered />,
      keywords: ["numerada", "ol", "ordem", "ordered", "number"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "todo",
      title: t("slash_todo_title"),
      subtitle: t("slash_todo_desc"),
      group: t("slash_group_lists"),
      icon: <CheckSquare />,
      keywords: ["todo", "tarefa", "checkbox", "task", "check"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      id: "toggle",
      title: t("slash_toggle_title"),
      subtitle: t("slash_toggle_desc"),
      group: t("slash_group_lists"),
      icon: <ChevronRight />,
      keywords: ["toggle", "recolher", "detalhes", "collapse"],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "toggleBlock",
            attrs: { open: true },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      id: "callout",
      title: t("slash_callout_title"),
      subtitle: t("slash_callout_desc"),
      group: t("slash_group_blocks"),
      icon: <Lightbulb />,
      keywords: ["callout", "destaque", "aviso", "box", "alert"],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "callout", attrs: { emoji: "💡" }, content: [{ type: "paragraph" }] })
          .run(),
    },
    {
      id: "quote",
      title: t("slash_quote_title"),
      subtitle: t("slash_quote_desc"),
      group: t("slash_group_blocks"),
      icon: <Quote />,
      keywords: ["citacao", "quote", "cit"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: "code",
      title: t("slash_code_title"),
      subtitle: t("slash_code_desc"),
      group: t("slash_group_blocks"),
      icon: <Code2 />,
      keywords: ["codigo", "code", "snippet"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: "equation",
      title: t("slash_equation_title"),
      subtitle: t("slash_equation_desc"),
      group: t("slash_group_blocks"),
      icon: <Sigma />,
      keywords: ["equacao", "latex", "katex", "formula", "matematica", "math", "equation"],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "equationBlock", attrs: { expression: "" } })
          .run(),
    },
    {
      id: "divider",
      title: t("slash_divider_title"),
      subtitle: t("slash_divider_desc"),
      group: t("slash_group_blocks"),
      icon: <Minus />,
      keywords: ["divisor", "linha", "hr", "divider", "line"],
      action: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: "table",
      title: t("slash_table_title"),
      subtitle: t("slash_table_desc"),
      group: t("slash_group_blocks"),
      icon: <Table2 />,
      keywords: ["tabela", "table", "grade", "planilha", "grid"],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "tableBlock",
            attrs: { rows: emptyTableGrid(3, 3), hasColumnHeader: true },
          })
          .run(),
    },
    {
      id: "audio",
      title: t("slash_audio_title"),
      subtitle: t("slash_audio_desc"),
      group: t("slash_group_media"),
      icon: <AudioLines />,
      keywords: ["audio", "voz", "gravar", "voice", "record"],
      action: ({ editor, range, handlers }) => {
        editor.chain().focus().deleteRange(range).run();
        setTimeout(() => handlers.onRequestAudio(), 60);
      },
    },
    {
      id: "attachment",
      title: t("slash_attachment_title"),
      subtitle: t("slash_attachment_desc"),
      group: t("slash_group_media"),
      icon: <Paperclip />,
      keywords: [
        "anexo",
        "pdf",
        "imagem",
        "imagens",
        "arquivo",
        "upload",
        "computador",
        "attach",
        "file",
        "image",
      ],
      action: ({ editor, range, handlers }) => {
        editor.chain().focus().deleteRange(range).run();
        handlers.onRequestUpload();
      },
    },
  ];
}

function buildSuggestion(handlers: SlashCommandHandlers): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      const t = getTranslator();
      const commands = getCommands(t);
      const q = query.toLowerCase().trim();
      if (!q) return commands;
      return commands.filter(
        (command) =>
          command.title.toLowerCase().includes(q) ||
          command.keywords.some((keyword) => keyword.includes(q))
      );
    },

    render: () => {
      let component: ReactRenderer<SuggestionListHandle> | null = null;
      let popup: TippyInstance | null = null;

      const toItems = (
        commands: CommandDescriptor[],
        editor: Editor,
        range: Range
      ): SuggestionItem[] =>
        commands.map((command) => ({
          id: command.id,
          title: command.title,
          subtitle: command.subtitle,
          group: command.group,
          icon: command.icon,
          run: () => command.action({ editor, range, handlers }),
        }));

      return {
        onStart: (props) => {
          const t = getTranslator();
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: toItems(props.items as CommandDescriptor[], props.editor, props.range),
              emptyLabel: t("slash_empty"),
            },
            editor: props.editor,
          });
          popup = ensureSuggestionPopup(
            popup,
            props.clientRect as (() => DOMRect) | null,
            component.element
          );
        },

        onUpdate: (props) => {
          component?.updateProps({
            items: toItems(props.items as CommandDescriptor[], props.editor, props.range),
          });
          if (component) {
            popup = ensureSuggestionPopup(
              popup,
              props.clientRect as (() => DOMRect) | null,
              component.element
            );
          }
        },

        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}

export const SlashCommand = Extension.create<{ handlers: SlashCommandHandlers }>({
  name: "slashCommand",

  addOptions() {
    return {
      handlers: { onRequestUpload: () => {}, onRequestAudio: () => {} },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...buildSuggestion(this.options.handlers),
      }),
    ];
  },
});
