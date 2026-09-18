"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Accessibility,
  Bold,
  Hand,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import { useLibrasStore } from "@/lib/store/libras-store";
import { speakText, stopSpeaking } from "@/components/accessibility/screen-reader";
import { HIGHLIGHT_COLORS, TEXT_COLORS, type PaletteColor } from "./editor-colors";

type Panel = "turn" | "color" | "highlight" | "link" | null;

function keepSelection(event: React.SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
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

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const { t, language } = useTranslation();
  const screenReader = useUiStore((state) => state.screenReader);
  const speechRate = useUiStore((state) => state.speechRate);
  const libras = useUiStore((state) => state.libras);
  const [panel, setPanel] = useState<Panel>(null);
  const [linkValue, setLinkValue] = useState("");

  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));

  const actions: Array<{
    id: string;
    label: string;
    run: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "bold", icon: Bold, label: t("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { id: "italic", icon: Italic, label: t("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    {
      id: "underline",
      icon: UnderlineIcon,
      label: t("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      id: "strike",
      icon: Strikethrough,
      label: t("strikethrough"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      id: "codeBlock",
      label: t("code_inline"),
      run: () => {
        if (editor.isActive("code")) {
          editor.chain().focus().unsetCode().toggleCodeBlock().run();
        } else {
          editor.chain().focus().toggleCodeBlock().run();
        }
      },
    },
  ];

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
      className="vlibras-ignore z-[80] flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]"
      data-vlibras-ignore="true"
    >
      <div
        className="flex items-center gap-0.5"
        onMouseDown={keepSelection}
        onPointerDown={keepSelection}
      >
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
            {action.id === "codeBlock" || action.id === "code" ? (
              <span className="inline-flex items-center justify-center font-mono text-[14px] font-bold leading-none tracking-tight select-none">
                {"</>"}
              </span>
            ) : action.icon ? (
              <action.icon className="size-3.5" />
            ) : null}
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
        {libras ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
            <button
              type="button"
              title={t("interpret_in_libras")}
              aria-label={t("interpret_in_libras")}
              onPointerDown={keepSelection}
              onMouseDown={keepSelection}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, " ");
                if (!text.trim()) return;
                useLibrasStore.getState().openWithText(text, {
                  title: text.length > 25 ? `${text.slice(0, 25)}...` : text,
                });
              }}
              className="rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <Hand className="size-3.5" />
            </button>
          </>
        ) : null}
        {screenReader ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
            <button
              type="button"
              title={t("read_selection_aloud")}
              aria-label={t("read_selection_aloud")}
              onPointerDown={keepSelection}
              onMouseDown={keepSelection}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, " ");
                if (!text.trim()) return;
                editor.chain().focus().setTextSelection({ from, to }).run();
                speakText(text, { rate: speechRate, lang: language });
                editor.chain().focus().setTextSelection({ from, to }).run();
              }}
              className="rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <Volume2 className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>

      {panel === "turn" ? (
        <div className="mt-1 flex flex-col border-t border-[var(--border)] pt-1">
          {(
            [
              ["Texto", () => editor.chain().focus().setParagraph().run()],
              ["Título 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
              ["Título 2", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
              ["Título 3", () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
              [
                "Código",
                () => {
                  if (editor.isActive("code")) {
                    editor.chain().focus().unsetCode().toggleCodeBlock().run();
                  } else {
                    editor.chain().focus().toggleCodeBlock().run();
                  }
                },
              ],
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
