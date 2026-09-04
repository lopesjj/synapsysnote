"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function collectMatches(editor: Editor, query: string): { from: number; to: number }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = node.text.toLowerCase();
    let cursor = 0;
    while (cursor < hay.length) {
      const at = hay.indexOf(needle, cursor);
      if (at < 0) break;
      hits.push({ from: pos + at, to: pos + at + needle.length });
      cursor = at + Math.max(1, needle.length);
    }
  });
  return hits;
}

export function FindBar({
  editor,
  open,
  onClose,
}: {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => collectMatches(editor, query), [editor, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || !matches.length) return;
    const safe = ((index % matches.length) + matches.length) % matches.length;
    const hit = matches[safe];
    editor.chain().setTextSelection({ from: hit.from, to: hit.to }).scrollIntoView().run();
  }, [editor, index, matches, query]);

  if (!open) return null;

  const jump = (delta: number) => {
    if (!matches.length) return;
    setIndex((current) => (current + delta + matches.length) % matches.length);
  };

  return (
    <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-[var(--shadow-panel)]">
      <Input
        ref={inputRef}
        value={query}
        placeholder="Localizar na nota"
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            jump(event.shiftKey ? -1 : 1);
          }
          if (event.key === "Escape") onClose();
        }}
        className="h-7 w-44 text-[12px]"
      />
      <span className={cn("min-w-12 text-center text-[11px] tabular-nums", matches.length ? "text-muted" : "text-faint")}>
        {query.trim() ? `${matches.length ? index + 1 : 0}/${matches.length}` : "-"}
      </span>
      <button
        type="button"
        title="Anterior"
        disabled={!matches.length}
        onClick={() => jump(-1)}
        className="rounded p-1 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink disabled:opacity-40"
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        title="Próximo"
        disabled={!matches.length}
        onClick={() => jump(1)}
        className="rounded p-1 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink disabled:opacity-40"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        type="button"
        title="Fechar"
        onClick={onClose}
        className="rounded p-1 text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
