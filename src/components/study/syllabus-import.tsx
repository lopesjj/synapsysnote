"use client";

import { useState, type ClipboardEvent } from "react";
import { ChevronRight, Link2, ListTree, Loader2, Plus, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { useWorkspace } from "@/lib/data/provider";
import { useStudyT } from "@/lib/study/i18n";
import { MAX_TOPIC_LENGTH } from "@/lib/study/defaults";
import { SubjectDot } from "@/components/study/ui";
import { linesFromText, mergeDrafts, parseSyllabus } from "@/lib/study/syllabus";
import type { SubjectDraft } from "@/lib/study/provider";

export function draftsFromParsed(parsed: { name: string; topics: string[] }[], fallbackName: string): SubjectDraft[] {
  return parsed.map((entry, index) => ({
    name: entry.name || (parsed.length > 1 ? `${fallbackName} ${index + 1}` : fallbackName),
    topics: entry.topics.map((name) => ({ name })),
  }));
}

export function useDraftMerge(drafts: SubjectDraft[], onChange: (drafts: SubjectDraft[]) => void) {
  const { st } = useStudyT();
  return (incoming: SubjectDraft[]) => {
    const merged = mergeDrafts(drafts, incoming);
    if (!merged.subjects && !merged.topics) {
      toast.info(st("import_nothing_new"));
      return false;
    }
    onChange(merged.drafts);
    toast.success(st("import_added", { subjects: merged.subjects, topics: merged.topics }));
    return true;
  };
}

function AddLine({
  placeholder,
  onAdd,
  limit,
  size = "md",
}: {
  placeholder: string;
  onAdd: (values: string[]) => void;
  limit?: number;
  size?: "md" | "sm";
}) {
  const { textDir } = useStudyT();
  const [value, setValue] = useState("");
  const commit = (text: string) => {
    const values = linesFromText(text, limit);
    if (values.length) onAdd(values);
    setValue("");
  };
  return (
    <label className={cn("flex items-center gap-2.5 text-muted transition focus-within:text-ink", size === "md" ? "px-4 py-2.5" : "py-1")}>
      <Plus className={cn("shrink-0", size === "md" ? "size-4" : "size-3.5")} />
      <input
        value={value}
        dir={textDir}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit(value);
          }
        }}
        onBlur={() => {
          if (value.trim()) commit(value);
        }}
        onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
          const text = event.clipboardData.getData("text");
          if (!/\r?\n/.test(text.trim())) return;
          event.preventDefault();
          commit(`${value}${text}`);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint",
          size === "md" ? "text-[13.5px]" : "text-[13px]"
        )}
      />
    </label>
  );
}

export function DraftEditor({ drafts, onChange }: { drafts: SubjectDraft[]; onChange: (drafts: SubjectDraft[]) => void }) {
  const { st, textDir } = useStudyT();
  const [open, setOpen] = useState<Set<number>>(() => new Set(drafts.length <= 4 ? drafts.map((_, index) => index) : []));
  const update = (index: number, patch: Partial<SubjectDraft>) =>
    onChange(drafts.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)));
  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const removeSubject = (index: number) => {
    onChange(drafts.filter((_, position) => position !== index));
    setOpen((current) => new Set([...current].filter((value) => value !== index).map((value) => (value > index ? value - 1 : value))));
  };
  const addSubjects = (names: string[]) => {
    const merged = mergeDrafts(
      drafts,
      names.map((name) => ({ name, topics: [] }))
    );
    onChange(merged.drafts);
    if (names.length === 1) {
      const index = merged.drafts.findIndex((draft) => draft.name === names[0]);
      if (index >= 0) setOpen((current) => new Set(current).add(index));
    }
  };

  return (
    <div>
      <div className="overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,44,76,0.04)]">
        {drafts.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {drafts.map((draft, index) => {
              const expanded = open.has(index);
              return (
                <li key={index}>
                  <div className="group flex min-w-0 items-center gap-1.5 py-1.5 ps-1.5 pe-2 sm:gap-2 sm:ps-2 sm:pe-3">
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={expanded}
                      aria-label={draft.name || st("untitled_subject")}
                      className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-90")} />
                    </button>
                    <SubjectDot color={draft.color} />
                    <input
                      value={draft.name}
                      dir={textDir}
                      maxLength={160}
                      aria-label={st("preview_subject_name")}
                      placeholder={st("untitled_subject")}
                      onChange={(event) => update(index, { name: event.target.value })}
                      className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[14px] font-semibold tracking-[-0.01em] text-ink outline-none placeholder:font-normal placeholder:text-faint"
                    />
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      className="max-w-[38%] shrink truncate text-[12px] tabular-nums text-faint transition hover:text-ink sm:max-w-[9rem]"
                    >
                      {st("topics_count", { count: draft.topics.length })}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSubject(index)}
                      aria-label={st("remove")}
                      className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-faint opacity-60 transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="pb-2.5 pe-2 ps-8 sm:pe-3 sm:ps-[3.35rem]">
                      {draft.topics.length ? (
                        <ul className="border-s border-[var(--border)] ps-3">
                          {draft.topics.map((topic, topicIndex) => (
                            <li key={topicIndex} className="group/topic flex items-center gap-2">
                              <input
                                value={topic.name}
                                dir={textDir}
                                maxLength={MAX_TOPIC_LENGTH}
                                aria-label={st("editor_add_topic")}
                                onChange={(event) =>
                                  update(index, {
                                    topics: draft.topics.map((item, position) => (position === topicIndex ? { ...item, name: event.target.value } : item)),
                                  })
                                }
                                onBlur={() => {
                                  if (!topic.name.trim()) update(index, { topics: draft.topics.filter((_, position) => position !== topicIndex) });
                                }}
                                className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                              />
                              {topic.pageId ? (
                                <span title={st("editor_topic_linked")} className="shrink-0 text-[var(--accent)]">
                                  <Link2 className="size-3.5" />
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => update(index, { topics: draft.topics.filter((_, position) => position !== topicIndex) })}
                                aria-label={st("remove")}
                                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-faint opacity-0 transition hover:text-[var(--danger)] focus:opacity-100 group-hover/topic:opacity-100"
                              >
                                <X className="size-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className={cn(draft.topics.length && "ps-3")}>
                        <AddLine
                          size="sm"
                          limit={MAX_TOPIC_LENGTH}
                          placeholder={st("editor_add_topic")}
                          onAdd={(names) => {
                            const known = new Set(draft.topics.map((topic) => topic.name.trim().toLowerCase()));
                            const fresh = names.filter((name) => !known.has(name.toLowerCase())).map((name) => ({ name }));
                            if (fresh.length) update(index, { topics: [...draft.topics, ...fresh] });
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 pb-1 pt-4 text-[13px] leading-relaxed text-muted">{st("editor_empty")}</p>
        )}
        <div className={cn(drafts.length && "border-t border-[var(--border)]")}>
          <AddLine placeholder={st("editor_add_subject")} onAdd={addSubjects} />
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">{st("editor_hint")}</p>
    </div>
  );
}

interface AiResponse {
  subjects?: { name?: string; topics?: string[] }[];
}

export function PasteImporter({ onParsed }: { onParsed: (drafts: SubjectDraft[]) => boolean }) {
  const { st, language, textDir } = useStudyT();
  const { mode } = useWorkspace();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const deliver = (drafts: SubjectDraft[]) => {
    if (!drafts.length) {
      toast.error(st("preview_empty"));
      return;
    }
    if (onParsed(drafts)) setText("");
  };

  const analyze = () => deliver(draftsFromParsed(parseSyllabus(text), st("nav_subjects")));

  const organizeWithAi = async () => {
    if (mode === "local") {
      toast.info(st("paste_ai_local"));
      analyze();
      return;
    }
    setBusy(true);
    try {
      const response = await firebaseJson<AiResponse>("/api/ai/study/syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 60_000), language }),
      });
      const parsed = (response.subjects ?? [])
        .map((entry) => ({
          name: String(entry.name ?? "").trim(),
          topics: Array.isArray(entry.topics) ? entry.topics.map((topic) => String(topic).trim()).filter(Boolean) : [],
        }))
        .filter((entry) => entry.name || entry.topics.length);
      if (!parsed.length) throw new Error("empty");
      deliver(draftsFromParsed(parsed, st("nav_subjects")));
    } catch {
      toast.error(st("paste_ai_failed"));
      analyze();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        rows={7}
        dir={textDir}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        placeholder={st("paste_placeholder")}
        className="bg-[var(--surface)] text-[13px] leading-relaxed placeholder:italic placeholder:text-faint"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" size="sm" disabled={!text.trim() || busy} onClick={analyze}>
          <ListTree />
          {st("paste_analyze")}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!text.trim() || busy} onClick={() => void organizeWithAi()}>
          {busy ? <Loader2 className="animate-spin" /> : <ScanText />}
          {busy ? st("paste_ai_working") : st("paste_ai")}
        </Button>
        <span className="text-[11.5px] text-faint">{st("paste_ai_hint")}</span>
      </div>
    </div>
  );
}
