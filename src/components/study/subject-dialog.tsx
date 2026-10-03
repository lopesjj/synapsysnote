"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownAZ, ChevronDown, ClipboardList, GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Textarea } from "@/components/ui/primitives";
import { cn, compareNatural } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { childrenOf } from "@/lib/data/notebook-tree";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { SUBJECT_COLORS, MAX_TOPICS_PER_SUBJECT, subjectTone } from "@/lib/study/defaults";
import { topicListFromText } from "@/lib/study/syllabus";
import type { StudySubject, StudyTopic } from "@/types/study";
import type { Notebook } from "@/types/models";
import { Field } from "./dialogs";
import { StudySelect } from "./ui";

export function SubjectDialog({
  open,
  onOpenChange,
  planId,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  subject?: StudySubject | null;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-xl">
      {open ? <SubjectForm planId={planId} subject={subject ?? null} onClose={() => onOpenChange(false)} /> : null}
    </DialogShell>
  );
}

function notebookOptions(notebooks: Notebook[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = [...childrenOf(notebooks, parentId)].sort((a, b) => a.order - b.order || compareNatural(a.name, b.name));
    for (const notebook of list) {
      out.push({ id: notebook.id, label: `${String.fromCharCode(0x2003).repeat(depth)}${notebook.name || "—"}` });
      walk(notebook.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function TopicRow({
  topic,
  onRename,
  onToggle,
  onDelete,
  dragLabel,
}: {
  topic: StudyTopic;
  onRename: (name: string) => void;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
  dragLabel: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-1.5 py-1",
        isDragging && "relative z-10 shadow-[var(--shadow-float)]"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={dragLabel}
        className="cursor-grab rounded p-0.5 text-faint opacity-60 hover:text-ink group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <Checkbox checked={topic.done} onCheckedChange={(value) => onToggle(value === true)} aria-label={topic.name} />
      <input
        value={topic.name}
        onChange={(event) => onRename(event.target.value)}
        className={cn(
          "h-7 min-w-0 flex-1 rounded-[6px] bg-transparent px-1.5 text-[13px] outline-none focus:bg-[var(--surface-2)]",
          topic.done ? "text-muted" : "text-ink"
        )}
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-faint opacity-0 transition hover:text-[var(--danger)] group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={topic.name}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function SubjectForm({ planId, subject, onClose }: { planId: string; subject: StudySubject | null; onClose: () => void }) {
  const { st, textDir } = useStudyT();
  const { notebooks } = useWorkspace();
  const { actions, sessions, planSubjects, plans } = useStudy();
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[planSubjects.length % SUBJECT_COLORS.length]);
  const [notebookId, setNotebookId] = useState<string | null>(subject?.notebookId ?? null);
  const [topics, setTopics] = useState<StudyTopic[]>(subject?.topics ?? []);
  const [draft, setDraft] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const options = useMemo(() => notebookOptions(notebooks), [notebooks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addTopics = (names: string[]) => {
    setTopics((list) => {
      const seen = new Set(list.map((topic) => topic.name.toLowerCase()));
      const next = [...list];
      for (const entry of names) {
        const clean = entry.replace(/\s+/g, " ").trim();
        if (!clean || seen.has(clean.toLowerCase()) || next.length >= MAX_TOPICS_PER_SUBJECT) continue;
        seen.add(clean.toLowerCase());
        next.push({ id: nanoid(12), name: clean, done: false, doneAt: null, pageId: null, url: null });
      }
      return next;
    });
    window.setTimeout(() => listEnd.current?.scrollIntoView({ block: "nearest" }), 30);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTopics((list) => {
      const from = list.findIndex((topic) => topic.id === active.id);
      const to = list.findIndex((topic) => topic.id === over.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  };

  const removeTopic = (topic: StudyTopic) => {
    const used = subject ? sessions.some((session) => session.subjectId === subject.id && session.topicId === topic.id) : false;
    if (used && !window.confirm(st("topic_delete_confirm", { name: topic.name }))) return;
    setTopics((list) => list.filter((entry) => entry.id !== topic.id));
  };

  const submit = async () => {
    if (plans.some((entry) => entry.id === planId && entry.archived)) {
      toast.error(st("goal_readonly_toast"));
      onClose();
      return;
    }
    if (!name.trim()) {
      setError(st("subject_name_required"));
      return;
    }
    setSaving(true);
    try {
      await actions.saveSubject(planId, {
        id: subject?.id,
        name: name.trim(),
        color,
        notebookId,
        topics: topics.filter((topic) => topic.name.trim()),
      });
      toast.success(subject ? st("subject_saved") : st("subject_created"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!subject) return;
    if (!window.confirm(st("subject_delete_confirm", { name: subject.name }))) return;
    try {
      await actions.deleteSubject(subject.id);
      toast.success(st("subject_deleted"));
      onClose();
    } catch {
      toast.error(st("error_generic"));
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-3.5 pt-4 pr-12">
        <h2 dir={textDir} className="text-[16px] font-semibold tracking-[-0.015em] text-ink">
          {subject ? st("subject_edit") : st("subject_new")}
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={st("subject_name")} htmlFor="subject-name">
            <Input
              id="subject-name"
              autoFocus={!subject}
              dir={textDir}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={st("subject_name_placeholder")}
              maxLength={160}
            />
          </Field>
          <Field label={st("subject_color")}>
            <div className="flex h-9 flex-wrap items-center gap-1.5">
              {SUBJECT_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={swatch}
                  aria-pressed={color === swatch}
                  className={cn(
                    "size-5 rounded-full transition",
                    color === swatch ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]" : "hover:scale-110"
                  )}
                  style={{ backgroundColor: subjectTone(swatch) }}
                />
              ))}
            </div>
          </Field>
        </div>

        <Field label={st("subject_notebook")} hint={st("subject_notebook_hint")} htmlFor="subject-notebook">
          <StudySelect
            ariaLabel={st("subject_notebook")}
            value={notebookId ?? ""}
            onChange={(val) => setNotebookId(val ? String(val) : null)}
            placeholder={st("subject_notebook_none")}
            options={[
              { value: "", label: st("subject_notebook_none") },
              ...options.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-muted">
              {st("subject_topics")} <span className="tabular-nums text-faint">· {topics.length}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTopics((list) => [...list].sort((a, b) => compareNatural(a.name, b.name)))}
                disabled={topics.length < 2}
              >
                <ArrowDownAZ />
                {st("subject_topics_sort")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen((value) => !value)}>
                <ClipboardList />
                {st("subject_topics_paste")}
              </Button>
            </div>
          </div>
          {pasteOpen ? (
            <div className="mb-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]/50 p-2.5">
              <Textarea
                rows={4}
                autoFocus
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={st("subject_topics_paste_hint")}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    addTopics(topicListFromText(pasteText));
                    setPasteText("");
                    setPasteOpen(false);
                  }}
                >
                  {st("subject_topics_paste_apply")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="max-h-[18rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-1">
            {topics.length ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
                <SortableContext items={topics.map((topic) => topic.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-px">
                    {topics.map((topic) => (
                      <TopicRow
                        key={topic.id}
                        topic={topic}
                        dragLabel={st("drag_to_reorder")}
                        onRename={(value) => setTopics((list) => list.map((entry) => (entry.id === topic.id ? { ...entry, name: value.slice(0, 300) } : entry)))}
                        onToggle={(done) =>
                          setTopics((list) =>
                            list.map((entry) => (entry.id === topic.id ? { ...entry, done, doneAt: done ? (entry.doneAt ?? Date.now()) : null } : entry))
                          )
                        }
                        onDelete={() => removeTopic(topic)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="px-2 py-3 text-[12px] text-faint">{st("subject_topics_empty")}</p>
            )}
            <div ref={listEnd} />
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={st("subject_topic_placeholder")}
              dir={textDir}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (draft.trim()) {
                    addTopics([draft]);
                    setDraft("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!draft.trim()) return;
                addTopics([draft]);
                setDraft("");
              }}
              aria-label={st("subject_topic_add")}
            >
              <Plus />
            </Button>
          </div>
        </div>
        {error ? <p className="text-[12.5px] font-medium text-[var(--danger)]">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
        {subject ? (
          <Button type="button" variant="ghost" className="text-[var(--danger)] hover:text-[var(--danger)]" onClick={() => void remove()}>
            <Trash2 />
            {st("subject_delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {st("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {st("save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
