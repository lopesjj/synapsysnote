"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ClipboardPaste, FileSpreadsheet, ImagePlus, Loader2, NotebookTabs, X } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { IconPickerMenu } from "@/components/ui/icon-picker";
import { WORKSPACE_ICONS } from "@/lib/icons/catalog";
import { cn, compareNatural } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { childrenOf, notebookSubtreeIds } from "@/lib/data/notebook-tree";
import { useStudy, type SubjectDraft } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { useIconUploads } from "@/lib/study/hooks";
import { useStudyUi } from "@/lib/study/ui-store";
import { subjectsFromCsv } from "@/lib/study/syllabus";
import type { Notebook, Page } from "@/types/models";
import { DraftEditor, PasteImporter, draftsFromParsed, useDraftMerge } from "../syllabus-import";
import { DateField } from "@/components/ui/pickers";
import { GoalMark, StudyPage, StudySelect } from "../ui";

type Panel = "paste" | "notebook" | "csv";

function notesUnder(pages: Page[], notebookIds: string[]): Page[] {
  const set = new Set(notebookIds);
  return pages
    .filter((page) => page.notebookId && set.has(page.notebookId))
    .sort((a, b) => a.order - b.order || compareNatural(a.title, b.title));
}

export function draftsFromNotebook(root: Notebook, notebooks: Notebook[], pages: Page[], looseLabel: string, untitled: string): SubjectDraft[] {
  const children = childrenOf(notebooks, root.id);
  const drafts: SubjectDraft[] = [];
  const topicOf = (page: Page) => ({ name: page.title || untitled, pageId: page.id });
  for (const child of children) {
    const ids = notebookSubtreeIds(notebooks, child.id);
    drafts.push({ name: child.name || untitled, notebookId: child.id, topics: notesUnder(pages, ids).map(topicOf) });
  }
  const loose = notesUnder(pages, [root.id]);
  if (loose.length) {
    drafts.push({ name: children.length ? looseLabel : root.name || untitled, notebookId: root.id, topics: loose.map(topicOf) });
  }
  return drafts;
}

const FIELD =
  "h-10 w-full min-w-0 rounded-[8px] bg-transparent px-2 text-[13.5px] text-ink outline-none transition placeholder:text-faint hover:bg-[var(--surface-hover)] focus:bg-[var(--surface)] focus:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--accent-soft)] sm:h-9";

function Property({ label, htmlFor, children, top }: { label: string; htmlFor: string; children: ReactNode; top?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-1 py-2.5 sm:grid-cols-[minmax(7.5rem,11.5rem)_minmax(0,1fr)] sm:gap-x-4 lg:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)]",
        top ? "sm:items-start" : "sm:items-center"
      )}
    >
      <label htmlFor={htmlFor} className={cn("text-[12.5px] leading-snug text-muted", top && "sm:pt-2")}>
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function NewGoalPage() {
  const { st, textDir } = useStudyT();
  const router = useRouter();
  const { rootNotebooks, notebooks, livePages } = useWorkspace();
  const { actions } = useStudy();
  const [drafts, setDrafts] = useState<SubjectDraft[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [rootId, setRootId] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  // Nome digitado no estado vazio da lista de objetivos.
  const [name, setName] = useState(() => useStudyUi.getState().newGoalDraft);
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState("");
  const [examDate, setExamDate] = useState("");
  const [hours, setHours] = useState("");
  const [questions, setQuestions] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const absorb = useDraftMerge(drafts, setDrafts);
  const icons = useIconUploads();

  useEffect(() => {
    useStudyUi.getState().setNewGoalDraft("");
  }, []);

  const sortedRoots = useMemo(() => [...rootNotebooks].sort((a, b) => a.order - b.order || compareNatural(a.name, b.name)), [rootNotebooks]);
  const topicsTotal = drafts.reduce((sum, draft) => sum + draft.topics.filter((topic) => topic.name.trim()).length, 0);
  const subjectsTotal = drafts.filter((draft) => draft.name.trim()).length;

  const sources: { id: Panel; icon: ReactNode; label: string }[] = [
    { id: "paste", icon: <ClipboardPaste className="size-3.5" />, label: st("source_paste_short") },
    { id: "notebook", icon: <NotebookTabs className="size-3.5" />, label: st("source_notebook_short") },
    { id: "csv", icon: <FileSpreadsheet className="size-3.5" />, label: st("source_csv_short") },
  ];

  const importNotebook = (id: string) => {
    setRootId(id);
    const root = notebooks.find((notebook) => notebook.id === id);
    if (!root) return;
    const incoming = draftsFromNotebook(root, notebooks, livePages, st("notebook_loose_notes"), st("untitled_subject"));
    if (!incoming.length) {
      toast.error(st("preview_empty"));
      return;
    }
    if (absorb(incoming)) {
      if (!name.trim()) setName(root.name);
      if (!icon && root.emoji) setIcon(root.emoji);
      setPanel(null);
      setRootId("");
    }
  };

  const importCsv = async (file: File) => {
    const parsed = subjectsFromCsv(await file.text());
    if (!parsed.length) {
      toast.error(st("csv_invalid"));
      return;
    }
    if (absorb(draftsFromParsed(parsed, st("nav_subjects")))) setPanel(null);
  };

  const create = async () => {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      const cleaned = drafts
        .map((draft) => ({ ...draft, name: draft.name.trim(), topics: draft.topics.filter((topic) => topic.name.trim()) }))
        .filter((draft) => draft.name);
      const staged = icon?.startsWith("blob:") ?? false;
      const storedIcon = await icons.materialize(icon);
      try {
        const id = await actions.createPlanWithSubjects(
          {
            name: name.trim(),
            institution: institution.trim(),
            role: role.trim(),
            examDate: examDate || null,
            icon: storedIcon,
            notes,
            weeklyGoalMinutes: Math.round(Math.max(0, Number(hours.replace(",", ".")) || 0) * 60),
            weeklyGoalQuestions: Math.max(0, Math.round(Number(questions) || 0)),
          },
          cleaned
        );
        icons.discard();
        toast.success(st("goal_created"));
        router.push(`/home/study/goals/${id}`);
      } catch (error) {
        if (staged) await icons.releaseStored(storedIcon);
        throw error;
      }
    } catch {
      toast.error(st("error_generic"));
      setSaving(false);
    }
  };

  return (
    <StudyPage className="flex min-h-0 min-w-0 max-w-3xl flex-col px-4 pb-0 pt-5 sm:px-5 sm:pt-7 md:min-h-full md:px-8 lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
      <div className="md:flex-1">
      <nav className="mb-6 flex min-w-0 items-center gap-1 text-[12.5px] text-muted sm:mb-8">
        <Link href="/home/study/goals" prefetch className="shrink-0 transition hover:text-ink">
          {st("nav_goals")}
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-faint rtl:rotate-180" />
        <span className="min-w-0 truncate text-ink">{st("goal_form_new")}</span>
      </nav>

      <IconPickerMenu
        icons={WORKSPACE_ICONS}
        current={icon}
        fallback=""
        onSelect={(value) => setIcon(value || null)}
        onUploadImage={icons.upload}
        onRemoveUpload={icons.releaseStored}
        trigger={
          <button
            type="button"
            aria-label={st("goal_icon")}
            className="rounded-[18px] transition hover:scale-[1.03] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
          >
            {icon || name.trim() ? (
              <GoalMark icon={icon} name={name || st("untitled_goal")} seed={name || "goal"} size={64} />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-[18px] border border-dashed border-[var(--border-strong)] text-faint transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <ImagePlus className="size-5" />
              </span>
            )}
          </button>
        }
      />

      <label htmlFor="new-goal-name" className="sr-only">
        {st("goal_name")}
      </label>
      <textarea
        ref={nameRef}
        id="new-goal-name"
        autoFocus
        rows={1}
        dir={textDir}
        value={name}
        maxLength={160}
        onChange={(event) => {
          setName(event.target.value.replace(/\n/g, " "));
          setNameError(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder={st("goal_name_placeholder")}
        aria-invalid={nameError || undefined}
        className="mt-4 block w-full min-w-0 resize-none break-words bg-transparent text-[1.65rem] font-semibold leading-[1.2] tracking-[-0.03em] text-ink outline-none [field-sizing:content] placeholder:text-[var(--text-faint)] placeholder:opacity-60 min-[480px]:text-[2rem] lg:text-[2.35rem] xl:text-[2.5rem]"
      />
      {nameError ? <p className="mt-1 text-[12.5px] font-medium text-[var(--danger)]">{st("goal_name_required")}</p> : null}

      <div className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        <Property label={st("goal_institution")} htmlFor="new-goal-institution">
          <input
            id="new-goal-institution"
            dir={textDir}
            value={institution}
            maxLength={160}
            onChange={(event) => setInstitution(event.target.value)}
            placeholder={st("goal_institution_placeholder")}
            className={FIELD}
          />
        </Property>
        <Property label={st("goal_role")} htmlFor="new-goal-role">
          <input
            id="new-goal-role"
            dir={textDir}
            value={role}
            maxLength={160}
            onChange={(event) => setRole(event.target.value)}
            placeholder={st("goal_role_placeholder")}
            className={FIELD}
          />
        </Property>
        <Property label={st("goal_exam_date")} htmlFor="new-goal-exam">
          <DateField
            id="new-goal-exam"
            variant="ghost"
            clearable
            value={examDate}
            onChange={setExamDate}
            className="h-10 w-full max-w-full justify-start sm:h-9 sm:w-auto sm:max-w-56"
          />
        </Property>
        <Property label={st("goal_weekly_hours")} htmlFor="new-goal-hours">
          <input
            id="new-goal-hours"
            inputMode="decimal"
            value={hours}
            onChange={(event) => setHours(event.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
            placeholder="0"
            className={cn(FIELD, "tabular-nums sm:max-w-32")}
          />
        </Property>
        <Property label={st("goal_weekly_questions")} htmlFor="new-goal-questions">
          <input
            id="new-goal-questions"
            inputMode="numeric"
            value={questions}
            onChange={(event) => setQuestions(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            placeholder="0"
            className={cn(FIELD, "tabular-nums sm:max-w-32")}
          />
        </Property>
        <Property label={st("goal_notes")} htmlFor="new-goal-notes" top>
          <textarea
            id="new-goal-notes"
            dir={textDir}
            rows={2}
            value={notes}
            maxLength={4000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={st("goal_notes_placeholder")}
            className={cn(FIELD, "h-auto min-h-10 resize-none py-2 leading-relaxed [field-sizing:content] sm:min-h-9")}
          />
        </Property>
      </div>

      <section className="mt-10 sm:mt-12" aria-labelledby="new-goal-structure">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <h2 id="new-goal-structure" className="text-[17px] font-semibold tracking-[-0.02em] text-ink sm:text-[19px]">
            {st("newgoal_structure")}
          </h2>
          {subjectsTotal ? (
            <span className="text-[12.5px] tabular-nums text-muted">{st("preview_summary", { subjects: subjectsTotal, topics: topicsTotal })}</span>
          ) : null}
        </div>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-[12.5px] text-muted">{st("newgoal_fill_from")}</span>
          <div className="flex flex-wrap gap-1.5">
          {sources.map((source) => {
            const active = panel === source.id;
            return (
              <button
                key={source.id}
                type="button"
                aria-expanded={active}
                onClick={() => setPanel(active ? null : source.id)}
                className={cn(
                  "inline-flex h-10 max-w-full items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition sm:h-8",
                  active
                    ? "bg-[var(--text)] text-[var(--surface)]"
                    : "bg-[var(--surface)] text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
                )}
              >
                {source.icon}
                <span className="truncate">{source.label}</span>
              </button>
            );
          })}
          </div>
        </div>

        {panel ? (
          <div className="relative mb-4 rounded-[18px] bg-[var(--surface-2)] p-3 pe-12 shadow-[inset_0_0_0_1px_var(--border)] sm:p-4 sm:pe-12">
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={st("close")}
              className="absolute end-3 top-3 flex size-8 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink sm:size-7"
            >
              <X className="size-4" />
            </button>
            {panel === "paste" ? (
              <PasteImporter
                onParsed={(incoming) => {
                  const done = absorb(incoming);
                  if (done) setPanel(null);
                  return done;
                }}
              />
            ) : null}
            {panel === "notebook" ? (
              sortedRoots.length ? (
                <div>
                  <label htmlFor="new-goal-root" className="mb-1.5 block text-[12.5px] font-medium text-ink">
                    {st("notebook_pick")}
                  </label>
                  <div className="w-full max-w-sm">
                    <StudySelect
                      ariaLabel={st("notebook_pick")}
                      value={rootId}
                      onChange={(val) => importNotebook(String(val))}
                      placeholder="—"
                      options={[
                        { value: "", label: "—" },
                        ...sortedRoots.map((notebook) => ({ value: notebook.id, label: notebook.name || "—" })),
                      ]}
                    />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{st("notebook_mode_hint")}</p>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted">{st("notebook_pick_empty")}</p>
              )
            ) : null}
            {panel === "csv" ? (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importCsv(file);
                    event.target.value = "";
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet />
                  {st("csv_pick")}
                </Button>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{st("csv_hint")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DraftEditor drafts={drafts} onChange={setDrafts} />
      </section>
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-10 -mx-4 mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--canvas)]/90 px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5 md:bottom-0 md:-mx-8 md:mt-auto md:px-8 md:py-3.5">
        <span className="me-auto hidden min-w-0 truncate text-[12.5px] tabular-nums text-muted sm:block">
          {subjectsTotal ? st("preview_summary", { subjects: subjectsTotal, topics: topicsTotal }) : null}
        </span>
        <Button variant="ghost" className="max-md:min-h-11" onClick={() => router.push("/home/study/goals")}>
          {st("cancel")}
        </Button>
        <Button variant="primary" className="max-md:min-h-11" disabled={saving} onClick={() => void create()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? st("creating") : st("create_goal_cta")}
        </Button>
      </div>
    </StudyPage>
  );
}
