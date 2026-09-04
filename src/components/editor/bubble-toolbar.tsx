"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/primitives";
import { HIGHLIGHT_COLORS, TEXT_COLORS, type PaletteColor } from "./editor-colors";

type Panel = "turn" | "color" | "highlight" | "link" | null;

/**
 * Keep the editor selection when interacting with the floating toolbar.
 * Without this, the click collapses the range and TipTap hides the menu
 * before the color/format command can run.
 */
function keepSelection(event: React.MouseEvent) {
  event.preventDefault();
}

function SwatchGrid({
  colors,
  onPick,
  round,
}: {
  colors: readonly PaletteColor[];
  onPick: (value: string | null) => void;
  round?: boolean;
}) {
  return (
    <div className="grid grid-cols-6 gap-1 p-1">
      {colors.map((color) => (
        <button
          key={color.label}
          type="button"
          title={color.label}
          onMouseDown={keepSelection}
          onClick={() => onPick(color.value)}
          className={cn(
            "size-6 border border-[var(--border)] transition hover:scale-110",
            round ? "rounded-full" : "rounded-[4px]"
          )}
          style={{ background: color.value ?? (round ? "var(--text)" : "var(--surface)") }}
        />
      ))}
    </div>
  );
}

/**
 * Floating format toolbar over a text selection. Color and highlight live in
 * inline panels (not portaled menus) so the selection stays intact.
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [linkValue, setLinkValue] = useState("");

  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));

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
  ] as const;

  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  return (
    <BubbleMenu
      editor={editor}
      appendTo={() => document.body}
      options={{ placement: "top", offset: 10 }}
      shouldShow={({ editor: instance, from, to }) => {
        if (!instance.isEditable || from === to) return false;
        if (instance.isActive("codeBlock") || instance.isActive("mediaBlock")) return false;
        if (instance.state.selection instanceof NodeSelection) return false;
        return true;
      }}
      style={{ zIndex: 80 }}
      className="z-[80] flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Estilo"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("turn")}
          className={cn(
            "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
            panel === "turn" && "bg-[var(--accent-soft)] text-[var(--accent)]"
          )}
        >
          <Type className="size-3.5" />
        </button>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            title={action.label}
            onMouseDown={keepSelection}
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
          title="Cor do texto"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("color")}
          className={cn(
            "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
            (panel === "color" || Boolean(currentColor)) && "bg-[var(--accent-soft)] text-[var(--accent)]"
          )}
        >
          <span className="relative inline-flex min-w-[14px] justify-center text-[12px] font-bold leading-none">
            A
            <span
              className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full"
              style={{ background: currentColor || "currentColor" }}
            />
          </span>
        </button>
        <button
          type="button"
          title="Destacar"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("highlight")}
          className={cn(
            "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
            (panel === "highlight" || editor.isActive("highlight")) &&
              "bg-[var(--accent-soft)] text-[var(--accent)]"
          )}
        >
          <Highlighter className="size-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
        <button
          type="button"
          title="Link"
          onMouseDown={keepSelection}
          onClick={() => {
            setLinkValue(editor.getAttributes("link").href ?? "");
            togglePanel("link");
          }}
          className={cn(
            "rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink",
            (panel === "link" || editor.isActive("link")) && "bg-[var(--accent-soft)] text-[var(--accent)]"
          )}
        >
          <LinkIcon className="size-3.5" />
        </button>
      </div>

      {panel === "turn" ? (
        <div className="mt-1 flex flex-col border-t border-[var(--border)] pt-1">
          {(
            [
              ["Texto", () => editor.chain().focus().setParagraph().run()],
              ["Título 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
              ["Título 2", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
              ["Título 3", () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
            ] as const
          ).map(([label, run]) => (
            <button
              key={label}
              type="button"
              onMouseDown={keepSelection}
              onClick={() => {
                run();
                setPanel(null);
              }}
              className="rounded-[var(--radius-xs)] px-2 py-1 text-left text-[12px] text-ink hover:bg-[var(--surface-hover)]"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {panel === "color" ? (
        <div className="mt-1 border-t border-[var(--border)] pt-1">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            Cor do texto
          </p>
          <SwatchGrid
            colors={TEXT_COLORS}
            round
            onPick={(value) => {
              if (value) editor.chain().focus().setColor(value).run();
              else editor.chain().focus().unsetColor().run();
            }}
          />
        </div>
      ) : null}

      {panel === "highlight" ? (
        <div className="mt-1 border-t border-[var(--border)] pt-1">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            Destaque
          </p>
          <SwatchGrid
            colors={HIGHLIGHT_COLORS}
            onPick={(value) => {
              if (value) editor.chain().focus().toggleHighlight({ color: value }).run();
              else editor.chain().focus().unsetHighlight().run();
            }}
          />
        </div>
      ) : null}

      {panel === "link" ? (
        <form
          className="mt-1 flex items-center gap-1.5 border-t border-[var(--border)] px-1 pt-1.5"
          onMouseDown={keepSelection}
          onSubmit={(event) => {
            event.preventDefault();
            const href = linkValue.trim();
            if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            else editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setPanel(null);
            setLinkValue("");
          }}
        >
          <Input
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://…"
            className="h-7 w-52 text-[12px]"
            onKeyDown={(event) => {
              if (event.key === "Escape") setPanel(null);
            }}
          />
          <button
            type="submit"
            className="rounded-[var(--radius-xs)] bg-[var(--accent)] px-2 py-1 text-[11.5px] font-medium text-white"
          >
            Aplicar
          </button>
        </form>
      ) : null}
    </BubbleMenu>
  );
}
