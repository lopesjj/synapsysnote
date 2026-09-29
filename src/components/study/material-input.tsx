"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useLiveNote } from "@/lib/study/hooks";
import { buildNoteDirectory, searchNotes } from "@/lib/study/material";

interface Mention {
  start: number;
  end: number;
  query: string;
}

function mentionAt(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 60 || /[\n@]/.test(query)) return null;
  return { start: at, end: caret, query };
}

export function MaterialInput({
  id,
  text,
  pageId,
  onTextChange,
  onPageIdChange,
  placeholder,
}: {
  id?: string;
  text: string;
  pageId: string | null;
  onTextChange: (value: string) => void;
  onPageIdChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const { st } = useStudyT();
  const listId = useId();
  const { livePages, notebooks } = useWorkspace();
  const liveNote = useLiveNote();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [cursor, setCursor] = useState(0);
  const linked = liveNote(pageId);

  const searching = Boolean(mention);
  const directory = useMemo(
    () => (searching || pageId ? buildNoteDirectory(livePages, notebooks, st("material_note_badge")) : []),
    [livePages, notebooks, pageId, searching, st]
  );
  const matches = useMemo(() => (mention ? searchNotes(directory, mention.query, 12) : []), [directory, mention]);
  const linkedTrail = linked ? directory.find((entry) => entry.id === linked.id)?.trail ?? [] : [];

  useEffect(() => {
    if (!mention) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMention(null);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [mention]);

  const refresh = (value: string, caret: number | null) => {
    const next = caret === null ? null : mentionAt(value, caret);
    setMention(next);
    setCursor(0);
  };

  const choose = (index: number) => {
    const page = matches[index];
    if (!page || !mention) return;
    const before = text.slice(0, mention.start).replace(/\s+$/, "");
    const after = text.slice(mention.end).replace(/^\s+/, "");
    const next = before && after ? `${before} ${after}` : before || after;
    onPageIdChange(page.id);
    onTextChange(next.slice(0, 200));
    setMention(null);
    const caret = before.length + (before && after ? 1 : 0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]"
        onClick={() => inputRef.current?.focus()}
      >
        {linked ? (
          <span
            title={[...linkedTrail, linked.title || st("material_note_badge")].join(" › ")}
            className="inline-flex min-w-0 max-w-[60%] shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent-soft)] py-0.5 pl-1.5 pr-0.5 text-[12px] font-medium text-[var(--accent)]"
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="truncate">{linked.title || st("material_note_badge")}</span>
            <button
              type="button"
              aria-label={st("topic_unlink_note")}
              onClick={(event) => {
                event.stopPropagation();
                onPageIdChange(null);
                inputRef.current?.focus();
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-[4px] hover:bg-[var(--accent)]/15"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={st("logform_material")}
          aria-expanded={Boolean(mention)}
          aria-controls={listId}
          aria-autocomplete="list"
          value={text}
          placeholder={linked ? undefined : placeholder}
          onChange={(event) => {
            const value = event.target.value.slice(0, 200);
            onTextChange(value);
            refresh(value, event.target.selectionStart);
          }}
          onSelect={(event) => {
            const target = event.currentTarget;
            if (mention) refresh(target.value, target.selectionStart);
          }}
          onBlur={() => window.setTimeout(() => setMention(null), 120)}
          onKeyDown={(event) => {
            if (mention) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((current) => Math.min(Math.max(0, matches.length - 1), current + 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((current) => Math.max(0, current - 1));
                return;
              }
              if ((event.key === "Enter" || event.key === "Tab") && matches.length) {
                event.preventDefault();
                choose(Math.min(cursor, matches.length - 1));
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setMention(null);
                return;
              }
            }
            if (event.key === "Backspace" && linked) {
              const target = event.currentTarget;
              if (target.selectionStart === 0 && target.selectionEnd === 0) {
                event.preventDefault();
                onPageIdChange(null);
              }
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
        />
      </div>
      {mention ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[120] max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]"
        >
          {matches.length ? (
            matches.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={cursor === index}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                onPointerEnter={() => setCursor(index)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left",
                  cursor === index && "bg-[var(--surface-hover)]"
                )}
              >
                <FileText className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">{entry.title}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {entry.trail.length ? entry.trail.join(" › ") : st("material_no_notebook")}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-2 py-2 text-[12px] text-faint">{st("material_no_notes")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
