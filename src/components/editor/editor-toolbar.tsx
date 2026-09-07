"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading3,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  Search,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Input } from "@/components/ui/primitives";
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "./editor-colors";
import { currentTextAlign, type TextAlignValue } from "./extensions/text-align";

const ALIGN_TOOLS: { value: TextAlignValue; label: string; icon: typeof AlignLeft }[] = [
  { value: "left", label: "Alinhar à esquerda", icon: AlignLeft },
  { value: "center", label: "Centralizar", icon: AlignCenter },
  { value: "right", label: "Alinhar à direita", icon: AlignRight },
  { value: "justify", label: "Justificar", icon: AlignJustify },
];

export function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => setTick((value) => value + 1);
    editor.on("transaction", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("transaction", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);
}

/** Word-style first-line indent: first line shorter, following lines full width. */
function FirstLineIndentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M9 6h12" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  );
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink disabled:opacity-35",
        active && "bg-[var(--accent-soft)] text-[var(--accent)]"
      )}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({
  editor,
  onRequestUpload,
  onToggleFind,
}: {
  editor: Editor;
  onRequestUpload: () => void;
  onToggleFind: () => void;
}) {
  useEditorTick(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const align = currentTextAlign(editor);
  const headingLabel = editor.isActive("heading", { level: 1 })
    ? "Título 1"
    : editor.isActive("heading", { level: 2 })
      ? "Título 2"
      : editor.isActive("heading", { level: 3 })
        ? "Título 3"
        : "Texto";

  return (
    <>
      <ToolButton
        label="Desfazer"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Refazer"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-3.5" />
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] px-1.5 text-[12px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <Type className="size-3.5" />
            {headingLabel}
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>Texto</MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            Título 1
          </MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            Título 2
          </MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            Título 3
          </MenuItem>
        </MenuContent>
      </Menu>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <ToolButton
        label="Negrito"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Itálico"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Sublinhado"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Tachado"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Código"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-3.5" />
      </ToolButton>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            title="Cor do texto"
            onMouseDown={(event) => event.preventDefault()}
            className="rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <span className="block size-3.5 rounded-sm border border-[var(--border)]" style={{ background: editor.getAttributes("textStyle").color || "var(--text)" }} />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="min-w-0 p-1.5" onCloseAutoFocus={(event) => event.preventDefault()}>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            Cor do texto
          </p>
          <div className="grid grid-cols-6 gap-1">
            {TEXT_COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  color.value
                    ? editor.chain().focus().setColor(color.value).run()
                    : editor.chain().focus().unsetColor().run()
                }
                className="size-6 rounded-full border border-[var(--border)]"
                style={{ background: color.value ?? "var(--text)" }}
              />
            ))}
          </div>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            title="Destacar"
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
              editor.isActive("highlight") && "bg-[var(--accent-soft)] text-[var(--accent)]"
            )}
          >
            <Highlighter className="size-3.5" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="min-w-0 p-1.5" onCloseAutoFocus={(event) => event.preventDefault()}>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            Destaque
          </p>
          <div className="grid grid-cols-6 gap-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  color.value
                    ? editor.chain().focus().toggleHighlight({ color: color.value }).run()
                    : editor.chain().focus().unsetHighlight().run()
                }
                className="size-6 rounded-md border border-[var(--border)]"
                style={{ background: color.value ?? "var(--surface)" }}
              />
            ))}
          </div>
        </MenuContent>
      </Menu>

      {linkOpen ? (
        <form
          className="flex items-center gap-1 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            const href = linkValue.trim();
            if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            else editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setLinkOpen(false);
            setLinkValue("");
          }}
        >
          <Input
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://…"
            className="h-7 w-44 text-[12px]"
            onKeyDown={(event) => {
              if (event.key === "Escape") setLinkOpen(false);
            }}
          />
        </form>
      ) : (
        <ToolButton
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            setLinkValue(editor.getAttributes("link").href ?? "");
            setLinkOpen(true);
          }}
        >
          <LinkIcon className="size-3.5" />
        </ToolButton>
      )}

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <ToolButton
        label="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Tarefas"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Citação"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Diminuir recuo (⇧Tab)"
        disabled={
          editor.isActive("table") ||
          editor.isActive("codeBlock")
        }
        onClick={() => void editor.chain().focus().outdent().run()}
      >
        <IndentDecrease className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Aumentar recuo (Tab)"
        disabled={
          editor.isActive("table") ||
          editor.isActive("codeBlock")
        }
        onClick={() => void editor.chain().focus().indent().run()}
      >
        <IndentIncrease className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Recuo da primeira linha"
        active={
          editor.isActive("paragraph") &&
          !editor.isActive("bulletList") &&
          !editor.isActive("orderedList") &&
          !editor.isActive("taskList") &&
          !editor.isActive("blockquote") &&
          Boolean(editor.getAttributes("paragraph").indentFirst)
        }
        disabled={
          !editor.isActive("paragraph") ||
          editor.isActive("bulletList") ||
          editor.isActive("orderedList") ||
          editor.isActive("taskList") ||
          editor.isActive("blockquote")
        }
        onClick={() => editor.chain().focus().toggleIndentFirst().run()}
      >
        <FirstLineIndentIcon className="size-3.5" />
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      {ALIGN_TOOLS.map((item) => (
        <ToolButton
          key={item.value}
          label={item.label}
          active={align === item.value}
          onClick={() => editor.chain().focus().setTextAlign(item.value).run()}
        >
          <item.icon className="size-3.5" />
        </ToolButton>
      ))}

      <ToolButton
        label="Bloco de código"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="size-3.5" />
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <ToolButton label="Anexar" onClick={onRequestUpload}>
        <Paperclip className="size-3.5" />
      </ToolButton>
      <ToolButton label="Localizar na nota" onClick={onToggleFind}>
        <Search className="size-3.5" />
      </ToolButton>
    </>
  );
}
