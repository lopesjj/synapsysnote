"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  FileOutput,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { notifyPlanError } from "@/lib/plans/client";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { useStudyUi } from "@/lib/study/ui-store";
import { dismissPriority, useDismissLayer } from "@/lib/dismiss-layer";
import { STICKY_COLORS } from "@/lib/study/defaults";
import { formatDay } from "@/lib/study/dates";
import { parseMarkup } from "@/lib/import/dom";
import { htmlToBlocks } from "@/lib/import/html-blocks";
import type { StickyColor, StudySticky } from "@/types/study";

const COLOR_KEY: Record<StickyColor, StudyKey> = {
  sun: "color_sun",
  mint: "color_mint",
  sky: "color_sky",
  rose: "color_rose",
  lilac: "color_lilac",
};

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex size-7 items-center justify-center rounded-[6px] text-[var(--sticky-ink)] opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
        active && "bg-black/[0.07] opacity-100 dark:bg-white/15"
      )}
    >
      {children}
    </button>
  );
}

function SheetEditor({ sticky, onEditor }: { sticky: StudySticky; onEditor: (editor: Editor | null) => void }) {
  const { st } = useStudyT();
  const { actions } = useStudy();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(sticky.html);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false, link: false }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: st("pad_placeholder") }),
    ],
    content: sticky.html || "",
    editorProps: {
      attributes: {
        class: "synapsys-pad min-h-[16rem] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--sticky-ink)] outline-none",
      },
    },
    onUpdate: ({ editor: instance }) => {
      latest.current = instance.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void actions.updateSticky(sticky.id, { html: latest.current });
      }, 700);
    },
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void actions.updateSticky(sticky.id, { html: latest.current });
      }
    },
    [actions, sticky.id]
  );

  return <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />;
}

export function Scratchpad() {
  const { st, locale } = useStudyT();
  const router = useRouter();
  const open = useStudyUi((state) => state.padOpen);
  useDismissLayer(open, dismissPriority.scratchpad, () => {
    useStudyUi.getState().setPadOpen(false);
  });
  const { stickies, actions, today } = useStudy();
  const { adapter } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, force] = useState(0);

  const selected = useMemo(
    () => stickies.find((sticky) => sticky.id === selectedId) ?? stickies[stickies.length - 1] ?? null,
    [selectedId, stickies]
  );

  useEffect(() => {
    if (!editor) return;
    const update = () => force((value) => value + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const create = async () => {
    const color = STICKY_COLORS[stickies.length % STICKY_COLORS.length];
    const id = await actions.createSticky(color);
    setSelectedId(id);
  };

  const convert = async () => {
    if (!selected) return;
    const html = editor?.getHTML() ?? selected.html;
    const blocks = htmlToBlocks(parseMarkup(html));
    const title = st("pad_note_title", { date: formatDay(today, locale, { day: "numeric", month: "long", year: "numeric" }) });
    try {
      const page = await adapter.createPage({ title, blocks: blocks.length ? blocks : undefined });
      await actions.deleteSticky(selected.id);
      toast.success(st("pad_to_note_done"));
      useStudyUi.getState().setPadOpen(false);
      router.push(`/home/p/${page.id}`);
    } catch (error) {
      if (!notifyPlanError(error)) toast.error(st("error_generic"));
    }
  };

  const remove = async () => {
    if (!selected) return;
    const empty = !(editor?.getText().trim() ?? selected.html.replace(/<[^>]+>/g, "").trim());
    if (!empty && !window.confirm(st("pad_delete_confirm"))) return;
    await actions.deleteSticky(selected.id);
    setSelectedId(null);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="scratchpad"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 z-[90] flex h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-float)] md:bottom-5 md:right-5"
          style={{ backgroundColor: selected ? `var(--sticky-${selected.color})` : "var(--surface)" }}
          aria-label={st("nav_scratchpad")}
        >
          <div className="flex items-center gap-1 border-b border-black/[0.06] px-2 py-1.5 dark:border-white/10">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              {stickies.map((sticky, index) => (
                <button
                  key={sticky.id}
                  type="button"
                  onClick={() => setSelectedId(sticky.id)}
                  aria-label={`${st("nav_scratchpad")} ${index + 1}`}
                  className={cn(
                    "h-6 min-w-6 shrink-0 rounded-[6px] border px-1.5 text-[11px] font-semibold tabular-nums text-[var(--sticky-ink)] transition",
                    selected?.id === sticky.id ? "border-black/25 dark:border-white/40" : "border-transparent opacity-70 hover:opacity-100"
                  )}
                  style={{ backgroundColor: `var(--sticky-${sticky.color})` }}
                >
                  {index + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void create()}
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--sticky-ink)] opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                aria-label={st("pad_new")}
                title={st("pad_new")}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => useStudyUi.getState().setPadOpen(false)}
              className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--sticky-ink)] opacity-60 transition hover:opacity-100"
              aria-label={st("close")}
            >
              <X className="size-4" />
            </button>
          </div>

          {selected ? (
            <>
              <SheetEditor key={selected.id} sticky={selected} onEditor={setEditor} />
              <div className="flex items-center gap-0.5 border-t border-black/[0.06] px-2 py-1.5 dark:border-white/10">
                <ToolbarButton label={st("pad_bold")} active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
                  <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton label={st("pad_italic")} active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                  <Italic className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton label={st("pad_underline")} active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                  <UnderlineIcon className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton label={st("pad_highlight")} active={editor?.isActive("highlight")} onClick={() => editor?.chain().focus().toggleHighlight().run()}>
                  <Highlighter className="size-3.5" />
                </ToolbarButton>
                <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/15" />
                <ToolbarButton label={st("pad_bullets")} active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                  <List className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton label={st("pad_numbers")} active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                  <ListOrdered className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton label={st("pad_checklist")} active={editor?.isActive("taskList")} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
                  <ListChecks className="size-3.5" />
                </ToolbarButton>
                <div className="ml-auto flex items-center gap-0.5">
                  <div className="mr-1 flex items-center gap-1">
                    {STICKY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => void actions.updateSticky(selected.id, { color })}
                        aria-label={st(COLOR_KEY[color])}
                        title={st(COLOR_KEY[color])}
                        className={cn(
                          "size-3.5 rounded-full border border-black/15 transition dark:border-white/25",
                          selected.color === color && "ring-2 ring-black/30 ring-offset-1 ring-offset-transparent dark:ring-white/50"
                        )}
                        style={{ backgroundColor: `var(--sticky-${color})` }}
                      />
                    ))}
                  </div>
                  <ToolbarButton label={st("pad_to_note")} onClick={() => void convert()}>
                    <FileOutput className="size-3.5" />
                  </ToolbarButton>
                  <ToolbarButton label={st("pad_delete")} onClick={() => void remove()}>
                    <Trash2 className="size-3.5" />
                  </ToolbarButton>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13px] text-muted">{st("pad_desc")}</p>
              <button
                type="button"
                onClick={() => void create()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--accent-contrast)] transition hover:brightness-110"
              >
                <Plus className="size-3.5" />
                {st("pad_new")}
              </button>
            </div>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
