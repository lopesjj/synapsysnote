"use client";

import type { Editor } from "@tiptap/react";
import { ListTree } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { useEditorTick } from "./editor-toolbar";
import { cn } from "@/lib/utils";

interface HeadingItem {
  pos: number;
  level: number;
  text: string;
}

function collectHeadings(editor: Editor): HeadingItem[] {
  const items: HeadingItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      items.push({
        pos,
        level: Number(node.attrs.level ?? 1),
        text: node.textContent.trim() || "Sem título",
      });
    }
  });
  return items;
}

function activeHeadingPos(editor: Editor, headings: HeadingItem[]): number | null {
  const from = editor.state.selection.from;
  let current: number | null = null;
  for (const heading of headings) {
    if (heading.pos <= from) current = heading.pos;
    else break;
  }
  return current;
}

export function NoteOutline({ editor }: { editor: Editor }) {
  useEditorTick(editor);
  const headings = collectHeadings(editor);
  if (headings.length < 2) return null;

  const current = activeHeadingPos(editor, headings);

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          title="Índice da nota"
          onMouseDown={(event) => event.preventDefault()}
          className="rounded-[var(--radius-xs)] p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <ListTree className="size-3.5" />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-80 min-w-56 overflow-y-auto">
        <MenuLabel>Nesta nota</MenuLabel>
        {headings.map((heading, index) => (
          <MenuItem
            key={`${heading.pos}-${index}`}
            onSelect={() => {
              editor.chain().focus().setTextSelection(heading.pos + 1).scrollIntoView().run();
            }}
            className={cn(
              heading.level === 2 && "pl-5",
              heading.level === 3 && "pl-8 text-[12px]",
              current === heading.pos && "bg-[var(--accent-soft)] text-[var(--accent)]"
            )}
          >
            <span className="min-w-0 truncate">{heading.text}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
