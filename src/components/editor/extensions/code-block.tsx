"use client";

import { useEffect, useMemo, useState } from "react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import {
  CODE_LANGUAGES,
  detectCodeLanguage,
  languageLabel,
  normalizeLanguage,
} from "@/lib/code/languages";
import { editorLowlight } from "@/lib/code/lowlight";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";

function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = normalizeLanguage(node.attrs.language as string | null);
  const autoDetect = node.attrs.autoDetect !== false;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoDetect) return;
    const text = node.textContent;
    const timer = window.setTimeout(() => {
      const { language: next, confidence } = detectCodeLanguage(text);
      if (confidence >= 3 && next !== language) {
        updateAttributes({ language: next });
      }
    }, 380);
    return () => window.clearTimeout(timer);
  }, [autoDetect, language, node.textContent, updateAttributes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CODE_LANGUAGES;
    return CODE_LANGUAGES.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.id.includes(needle) ||
        item.aliases?.some((alias) => alias.includes(needle))
    );
  }, [query]);

  const pick = (id: string, detect: boolean) => {
    updateAttributes({
      language: detect ? detectCodeLanguage(node.textContent).language : normalizeLanguage(id),
      autoDetect: detect,
    });
    setOpen(false);
    setQuery("");
  };

  return (
    <NodeViewWrapper className="synapsys-code-block group/code my-2" data-language={language}>
      <div
        contentEditable={false}
        className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-1.5"
      >
        {editor.isEditable ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px] font-medium text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                {languageLabel(language === "xml" && /<\/?[a-z]/i.test(node.textContent) ? "html" : language)}
                {autoDetect ? <Sparkles className="size-3 text-[var(--accent)]" /> : null}
                <ChevronDown className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-56 p-1"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar linguagem…"
                className="mb-1 h-7 w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-ink outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick("auto", true)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--surface-hover)]",
                  autoDetect && "bg-[var(--accent-soft)] text-[var(--accent)]"
                )}
              >
                <Sparkles className="size-3.5" />
                Detectar automaticamente
              </button>
              <div className="mt-1 max-h-56 overflow-y-auto">
                {filtered.map((item) => {
                  const active = !autoDetect && normalizeLanguage(item.id) === language;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(item.id, false)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2 py-1 text-left text-[12.5px] text-ink transition hover:bg-[var(--surface-hover)]",
                        active && "bg-[var(--accent-soft)] text-[var(--accent)]"
                      )}
                    >
                      {item.label}
                      {active ? <Check className="size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="px-1.5 text-[11px] font-medium text-faint">{languageLabel(language)}</span>
        )}
      </div>
      <pre className="synapsys-code-block__pre">
        <NodeViewContent as="code" className={`language-${language}`} />
      </pre>
    </NodeViewWrapper>
  );
}

export const SynapsysCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      autoDetect: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-auto-detect") !== "false",
        renderHTML: (attributes) =>
          attributes.autoDetect === false ? { "data-auto-detect": "false" } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight: editorLowlight,
  defaultLanguage: "plaintext",
  enableTabIndentation: true,
  tabSize: 2,
});
