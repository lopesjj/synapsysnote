"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/primitives";

/**
 * ETAPA 5 — Floating format toolbar shown over any non-empty text selection.
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const actions = [
    { id: "bold", icon: Bold, label: "Negrito", run: () => editor.chain().focus().toggleBold().run() },
    { id: "italic", icon: Italic, label: "Itálico", run: () => editor.chain().focus().toggleItalic().run() },
    {
      id: "underline",
      icon: UnderlineIcon,
      label: "Sublinhado",
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      id: "strike",
      icon: Strikethrough,
      label: "Tachado",
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    { id: "code", icon: Code, label: "Código", run: () => editor.chain().focus().toggleCode().run() },
    {
      id: "highlight",
      icon: Highlighter,
      label: "Marcar",
      run: () => editor.chain().focus().toggleHighlight().run(),
    },
  ] as const;

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: instance, from, to }) =>
        instance.isEditable && from !== to && !instance.isActive("codeBlock")
      }
      className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]"
    >
      {linkOpen ? (
        <form
          className="flex items-center gap-1.5 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            const href = linkValue.trim();
            if (href) {
              editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            } else {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
            }
            setLinkOpen(false);
            setLinkValue("");
          }}
        >
          <Input
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://…"
            className="h-7 w-56 text-[12px]"
            onKeyDown={(event) => {
              if (event.key === "Escape") setLinkOpen(false);
            }}
          />
          <button
            type="submit"
            className="rounded-[var(--radius-xs)] bg-[var(--accent)] px-2 py-1 text-[11.5px] font-medium text-white"
          >
            Aplicar
          </button>
        </form>
      ) : (
        <>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.label}
              onClick={action.run}
              className={cn(
                "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
                editor.isActive(action.id) && "bg-[var(--accent-soft)] text-[var(--accent)]"
              )}
            >
              <action.icon className="size-3.5" />
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <button
            type="button"
            title="Link"
            onClick={() => {
              setLinkValue(editor.getAttributes("link").href ?? "");
              setLinkOpen(true);
            }}
            className={cn(
              "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
              editor.isActive("link") && "bg-[var(--accent-soft)] text-[var(--accent)]"
            )}
          >
            <LinkIcon className="size-3.5" />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}
