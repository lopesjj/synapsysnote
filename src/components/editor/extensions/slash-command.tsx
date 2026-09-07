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
  Image as ImageIcon,
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

const COMMANDS: CommandDescriptor[] = [
  {
    id: "text",
    title: "Texto",
    subtitle: "Parágrafo simples",
    group: "Básico",
    icon: <Type />,
    keywords: ["texto", "paragrafo", "p"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: "h1",
    title: "Título 1",
    subtitle: "Seção principal",
    group: "Básico",
    icon: <Heading1 />,
    keywords: ["h1", "titulo", "heading"],
    action: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    id: "h2",
    title: "Título 2",
    subtitle: "Subseção",
    group: "Básico",
    icon: <Heading2 />,
    keywords: ["h2", "subtitulo"],
    action: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "h3",
    title: "Título 3",
    subtitle: "Agrupamento menor",
    group: "Básico",
    icon: <Heading3 />,
    keywords: ["h3"],
    action: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bullet",
    title: "Lista com marcadores",
    subtitle: "Itens sem ordem",
    group: "Listas",
    icon: <List />,
    keywords: ["lista", "bullet", "ul"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "ordered",
    title: "Lista numerada",
    subtitle: "Passo a passo",
    group: "Listas",
    icon: <ListOrdered />,
    keywords: ["numerada", "ol", "ordem"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "todo",
    title: "Lista de tarefas",
    subtitle: "Checkbox marcável",
    group: "Listas",
    icon: <CheckSquare />,
    keywords: ["todo", "tarefa", "checkbox"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "toggle",
    title: "Toggle",
    subtitle: "Conteúdo recolhível",
    group: "Listas",
    icon: <ChevronRight />,
    keywords: ["toggle", "recolher", "detalhes"],
    action: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "toggleBlock",
          attrs: { summary: "", open: true },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    id: "callout",
    title: "Callout",
    subtitle: "Destaque com emoji",
    group: "Blocos",
    icon: <Lightbulb />,
    keywords: ["callout", "destaque", "aviso"],
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
    title: "Citação",
    subtitle: "Trecho destacado",
    group: "Blocos",
    icon: <Quote />,
    keywords: ["citacao", "quote"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "code",
    title: "Bloco de código",
    subtitle: "Linguagem automática e realce de sintaxe",
    group: "Blocos",
    icon: <Code2 />,
    keywords: ["codigo", "code", "snippet"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "equation",
    title: "Equação (LaTeX)",
    subtitle: "Renderizada com KaTeX",
    group: "Blocos",
    icon: <Sigma />,
    keywords: ["equacao", "latex", "katex", "formula", "matematica"],
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
    title: "Divisor",
    subtitle: "Separa seções",
    group: "Blocos",
    icon: <Minus />,
    keywords: ["divisor", "linha", "hr"],
    action: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "table",
    title: "Tabela",
    subtitle: "Grade editável com cabeçalho",
    group: "Blocos",
    icon: <Table2 />,
    keywords: ["tabela", "table", "grade", "planilha"],
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
    id: "image",
    title: "Imagem ou arquivo",
    subtitle: "OCR automático em imagens e PDFs",
    group: "Mídia",
    icon: <ImageIcon />,
    keywords: ["imagem", "arquivo", "upload", "anexo", "ocr"],
    action: ({ editor, range, handlers }) => {
      editor.chain().focus().deleteRange(range).run();
      handlers.onRequestUpload();
    },
  },
  {
    id: "audio",
    title: "Gravar nota de voz",
    subtitle: "Transcrição e resumo com Gemini",
    group: "Mídia",
    icon: <AudioLines />,
    keywords: ["audio", "voz", "gravar", "transcricao"],
    action: ({ editor, range, handlers }) => {
      editor.chain().focus().deleteRange(range).run();
      handlers.onRequestAudio();
    },
  },
  {
    id: "attachment",
    title: "Anexar do computador",
    subtitle: "PDF, planilhas, documentos",
    group: "Mídia",
    icon: <Paperclip />,
    keywords: ["anexo", "pdf", "documento"],
    action: ({ editor, range, handlers }) => {
      editor.chain().focus().deleteRange(range).run();
      handlers.onRequestUpload();
    },
  },
];

function buildSuggestion(handlers: SlashCommandHandlers): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      const q = query.toLowerCase().trim();
      if (!q) return COMMANDS;
      return COMMANDS.filter(
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
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: toItems(props.items as CommandDescriptor[], props.editor, props.range),
              emptyLabel: "Nenhum bloco corresponde",
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
