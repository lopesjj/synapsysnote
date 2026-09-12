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
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Input } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/translations";
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "./editor-colors";
import { currentTextAlign, type TextAlignValue } from "./extensions/text-align";
import { dispatchTableMultiAction } from "./extensions/table-block";

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
}: {
  editor: Editor;
  onRequestUpload: () => void;
}) {
  const { t } = useTranslation();
  useEditorTick(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const alignTools: { value: TextAlignValue; label: string; icon: typeof AlignLeft }[] = [
    { value: "left", label: t("align_left"), icon: AlignLeft },
    { value: "center", label: t("align_center"), icon: AlignCenter },
    { value: "right", label: t("align_right"), icon: AlignRight },
    { value: "justify", label: t("align_justify"), icon: AlignJustify },
  ];

  const align = currentTextAlign(editor);
  const headingLabel = editor.isActive("heading", { level: 1 })
    ? t("heading_1")
    : editor.isActive("heading", { level: 2 })
      ? t("heading_2")
      : editor.isActive("heading", { level: 3 })
        ? t("heading_3")
        : t("text_paragraph");

  return (
    <>
      <ToolButton
        label={t("undo")}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("redo")}
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
          <MenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
            {t("text_paragraph")}
          </MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            {t("heading_1")}
          </MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            {t("heading_2")}
          </MenuItem>
          <MenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            {t("heading_3")}
          </MenuItem>
        </MenuContent>
      </Menu>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <ToolButton
        label={t("bold")}
        active={editor.isActive("bold")}
        onClick={() => {
          if (dispatchTableMultiAction({ type: "annotation", key: "bold" })) return;
          editor.chain().focus().toggleBold().run();
        }}
      >
        <Bold className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("italic")}
        active={editor.isActive("italic")}
        onClick={() => {
          if (dispatchTableMultiAction({ type: "annotation", key: "italic" })) return;
          editor.chain().focus().toggleItalic().run();
        }}
      >
        <Italic className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("underline")}
        active={editor.isActive("underline")}
        onClick={() => {
          if (dispatchTableMultiAction({ type: "annotation", key: "underline" })) return;
          editor.chain().focus().toggleUnderline().run();
        }}
      >
        <UnderlineIcon className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("strikethrough")}
        active={editor.isActive("strike")}
        onClick={() => {
          if (dispatchTableMultiAction({ type: "annotation", key: "strikethrough" })) return;
          editor.chain().focus().toggleStrike().run();
        }}
      >
        <Strikethrough className="size-3.5" />
      </ToolButton>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            title={t("text_color")}
            onMouseDown={(event) => event.preventDefault()}
            className="rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <span className="block size-3.5 rounded-sm border border-[var(--border)]" style={{ background: editor.getAttributes("textStyle").color || "var(--text)" }} />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="min-w-0 p-1.5" onCloseAutoFocus={(event) => event.preventDefault()}>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            {t("text_color")}
          </p>
          <div className="grid grid-cols-6 gap-1">
            {TEXT_COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (dispatchTableMultiAction({ type: "color", color: color.value })) return;
                  color.value
                    ? editor.chain().focus().setColor(color.value).run()
                    : editor.chain().focus().unsetColor().run();
                }}
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
            title={t("highlight")}
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
            {t("highlight")}
          </p>
          <div className="grid grid-cols-6 gap-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (dispatchTableMultiAction({ type: "highlight", highlight: color.value })) return;
                  color.value
                    ? editor.chain().focus().toggleHighlight({ color: color.value }).run()
                    : editor.chain().focus().unsetHighlight().run();
                }}
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
          label={t("link")}
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
        label={t("bullet_list")}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("numbered_list")}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("task_list")}
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("quote")}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={`${t("outdent")} (⇧Tab)`}
        disabled={
          editor.isActive("table") ||
          editor.isActive("codeBlock")
        }
        onClick={() => {
          if (editor.isActive("listItem")) {
            editor.chain().focus().liftListItem("listItem").run();
          } else if (editor.isActive("taskItem")) {
            editor.chain().focus().liftListItem("taskItem").run();
          } else {
            void editor.chain().focus().outdent().run();
          }
        }}
      >
        <IndentDecrease className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={`${t("indent")} (Tab)`}
        disabled={
          editor.isActive("table") ||
          editor.isActive("codeBlock")
        }
        onClick={() => {
          if (editor.isActive("listItem")) {
            editor.chain().focus().sinkListItem("listItem").run();
          } else if (editor.isActive("taskItem")) {
            editor.chain().focus().sinkListItem("taskItem").run();
          } else {
            void editor.chain().focus().indent().run();
          }
        }}
      >
        <IndentIncrease className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={t("first_line_indent")}
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

      {alignTools.map((item) => (
        <ToolButton
          key={item.value}
          label={item.label}
          active={align === item.value}
          onClick={() => {
            if (item.value !== "justify" && dispatchTableMultiAction({ type: "align-horizontal", align: item.value })) {
              return;
            }
            editor.chain().focus().setTextAlign(item.value).run();
          }}
        >
          <item.icon className="size-3.5" />
        </ToolButton>
      ))}

      <ToolButton
        label={t("code_inline")}
        active={editor.isActive("codeBlock")}
        onClick={() => {
          if (editor.isActive("code")) {
            editor.chain().focus().unsetCode().toggleCodeBlock().run();
          } else {
            editor.chain().focus().toggleCodeBlock().run();
          }
        }}
      >
        <span className="inline-flex items-center justify-center font-mono text-[14px] font-bold leading-none tracking-tight select-none">
          {"</>"}
        </span>
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      <ToolButton label={t("attach")} onClick={onRequestUpload}>
        <Paperclip className="size-3.5" />
      </ToolButton>
    </>
  );
}
