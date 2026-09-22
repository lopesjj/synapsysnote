"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  FileText,
  FolderTree,
  Link2,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Input, Progress, Switch } from "@/components/ui/primitives";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { cn } from "@/lib/utils";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { useFileImport } from "@/hooks/use-file-import";
import { PROVIDER_ACCEPT, type ImportProvider } from "@/lib/import/parse-file";
import type { ImportWarningCode } from "@/lib/import/types";

type Step = "select" | "review" | "progress";

const PROVIDER_LABEL: Record<ImportProvider, string> = {
  evernote: "Evernote",
  word: "Microsoft Word",
  "google-docs": "Google Docs",
};

const SUBTITLE_KEY: Record<ImportProvider, TranslationKey> = {
  evernote: "fimp_subtitle_evernote",
  word: "fimp_subtitle_word",
  "google-docs": "fimp_subtitle_google",
};

const HINT_KEY: Record<ImportProvider, TranslationKey> = {
  evernote: "fimp_drop_hint_evernote",
  word: "fimp_drop_hint_word",
  "google-docs": "fimp_drop_hint_google",
};

const WARNING_KEY: Record<ImportWarningCode, TranslationKey> = {
  encrypted_content: "fimp_warning_encrypted_content",
  missing_asset: "fimp_warning_missing_asset",
  remote_asset: "fimp_warning_remote_asset",
  nested_table: "fimp_warning_nested_table",
  unsupported_content: "fimp_warning_unsupported_content",
};

const ISSUE_KEY: Record<string, TranslationKey> = {
  unsupported_file: "fimp_error_unsupported_file",
  corrupted_file: "fimp_error_corrupted_file",
  empty_file: "fimp_error_empty_file",
  file_too_large: "fimp_error_file_too_large",
  invalid_google_doc_url: "fimp_error_invalid_google_doc_url",
  google_doc_unavailable: "fimp_error_google_doc_unavailable",
  google_doc_not_public: "fimp_error_google_doc_not_public",
  generic: "fimp_error_generic",
};

export function FileImportWizard({
  provider,
  open,
  onOpenChange,
}: {
  provider: ImportProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const importer = useFileImport(provider, t("fimp_untitled"));

  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const [targetNotebookId, setTargetNotebookId] = useState<string | null>(null);
  const [options, setOptions] = useState({ uploadMedia: true, keepTags: true, preserveStructure: true });
  const [dragging, setDragging] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const step: Step = importer.running || importer.results ? "progress" : (stepOverride ?? "select");
  const hasStructure = importer.notes.some((note) => note.containerPath?.length);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      void importer.addFiles(Array.from(list));
    },
    [importer]
  );

  const handleStart = async () => {
    if (!importer.notes.length) {
      toast.error(t("fimp_nothing_to_import"));
      return;
    }
    const finished = await importer.start({ targetNotebookId, ...options });
    if (!finished) return;
    const imported = finished.filter((result) => result.status === "done").length;
    if (imported) toast.success(t("fimp_done_summary", { count: imported }));
  };

  const close = (next: boolean) => {
    if (!next && importer.running) {
      toast.info(t("fimp_importing"));
      return;
    }
    if (!next) {
      setStepOverride(null);
      setDocUrl("");
      importer.reset();
    }
    onOpenChange(next);
  };

  const firstPageId = useMemo(
    () => importer.results?.find((result) => result.status === "done" && result.pageId)?.pageId ?? null,
    [importer.results]
  );

  return (
    <DialogShell open={open} onOpenChange={close} className="max-w-2xl" closeAriaLabel={t("close")}>
      <DialogHeader
        title={t("fimp_title")}
        description={`${PROVIDER_LABEL[provider]} · ${t(SUBTITLE_KEY[provider])}`}
        icon={<Upload className="size-4" />}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {step === "select" ? (
          <div className="space-y-4 px-5 py-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFiles(event.dataTransfer.files);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed px-6 py-10 text-center transition",
                dragging
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border-strong)] bg-[var(--surface-2)]"
              )}
            >
              <Upload className="size-5 text-faint" />
              <p className="text-[13px] font-medium text-ink">{t("fimp_drop_title")}</p>
              <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">{t(HINT_KEY[provider])}</p>
              <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={importer.parsing}>
                {importer.parsing ? <Loader2 className="animate-spin" /> : null}
                {importer.parsing ? t("fimp_reading") : t("fimp_choose_files")}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={PROVIDER_ACCEPT[provider]}
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            {provider === "google-docs" ? (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                  {t("fimp_google_url_label")}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={docUrl}
                    onChange={(event) => setDocUrl(event.target.value)}
                    placeholder={t("fimp_google_url_placeholder")}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !docUrl.trim()) return;
                      event.preventDefault();
                      void importer.addGoogleDoc(docUrl.trim()).then((ok) => {
                        if (ok) setDocUrl("");
                      });
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={!docUrl.trim() || importer.parsing}
                    onClick={() =>
                      void importer.addGoogleDoc(docUrl.trim()).then((ok) => {
                        if (ok) setDocUrl("");
                      })
                    }
                  >
                    <Link2 /> {t("fimp_google_url_button")}
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-faint">{t("fimp_google_url_hint")}</p>
              </div>
            ) : null}

            <NoteList
              notes={importer.notes}
              onRemove={importer.removeNote}
              onClear={importer.clear}
              emptyLabel={t("fimp_empty_list")}
              removeLabel={t("fimp_remove")}
              clearLabel={t("fimp_clear_all")}
              countLabel={t("fimp_ready_count", { count: importer.notes.length })}
            />

            {importer.issues.length ? (
              <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3">
                {importer.issues.map((issue) => (
                  <div key={issue.id} className="flex items-start gap-2 text-[11.5px] text-muted">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
                    <span className="min-w-0 flex-1 break-words">
                      {t("fimp_file_error", {
                        name: issue.fileName,
                        reason: t(ISSUE_KEY[issue.code] ?? "fimp_error_generic"),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => importer.dismissIssue(issue.id)}
                      className="shrink-0 text-faint transition hover:text-ink"
                      aria-label={t("fimp_remove")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-5 px-5 py-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                {t("fimp_destination")}
              </p>
              <p className="text-[11.5px] leading-relaxed text-muted">{t("fimp_destination_desc")}</p>
              <div className="flex flex-wrap gap-2">
                {importer.notebooks.map((notebook) => (
                  <button
                    key={notebook.id}
                    type="button"
                    onClick={() => setTargetNotebookId(notebook.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition",
                      targetNotebookId === notebook.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-muted hover:text-ink"
                    )}
                  >
                    <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={14} />
                    {notebook.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTargetNotebookId(null)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] transition",
                    targetNotebookId === null
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] text-muted hover:text-ink"
                  )}
                >
                  {t("fimp_no_notebook")}
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                {t("wizard_conversion")}
              </p>
              {hasStructure ? (
                <OptionRow
                  title={t("preserve_structure")}
                  description={t("preserve_structure_files_desc")}
                  checked={options.preserveStructure}
                  onChange={(checked) =>
                    setOptions((prev) => ({ ...prev, preserveStructure: checked }))
                  }
                />
              ) : null}
              <OptionRow
                title={t("fimp_option_media")}
                description={t("fimp_option_media_desc")}
                checked={options.uploadMedia}
                onChange={(checked) => setOptions((prev) => ({ ...prev, uploadMedia: checked }))}
              />
              <OptionRow
                title={t("fimp_option_tags")}
                description={t("fimp_option_tags_desc")}
                checked={options.keepTags}
                onChange={(checked) => setOptions((prev) => ({ ...prev, keepTags: checked }))}
              />
            </div>

            <NoteList
              notes={importer.notes}
              onRemove={importer.removeNote}
              onClear={importer.clear}
              emptyLabel={t("fimp_empty_list")}
              removeLabel={t("fimp_remove")}
              clearLabel={t("fimp_clear_all")}
              countLabel={t("fimp_ready_count", { count: importer.notes.length })}
              warningLabel={(code) => t(WARNING_KEY[code])}
              warningsTitle={t("fimp_warnings_title")}
              showStructure={hasStructure && options.preserveStructure}
            />
          </div>
        ) : null}

        {step === "progress" ? (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone={importer.results ? "success" : "accent"}>
                  {importer.results ? <Check className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
                  {importer.results ? t("fimp_done_title") : t("fimp_importing")}
                </Badge>
                <span className="truncate text-[12.5px] text-muted">{importer.progress.currentTitle}</span>
              </div>
              <span className="font-mono text-[12.5px] tabular-nums text-ink">{importer.percent}%</span>
            </div>

            <Progress value={importer.percent} />

            <div className="max-h-[260px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              {(importer.results ?? []).map((result) => (
                <div
                  key={result.sourceId}
                  className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0"
                >
                  {result.status === "done" ? (
                    <Check className="size-3.5 shrink-0 text-[var(--success)]" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-[var(--danger)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{result.title}</span>
                  {result.uploadedFiles ? (
                    <span className="shrink-0 text-[11px] text-faint">
                      {result.uploadedFiles} {t("files_unit")}
                    </span>
                  ) : null}
                  {result.status === "done" && result.pageId ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        router.push(`/home/p/${result.pageId}`);
                      }}
                      className="shrink-0 text-[11.5px] text-[var(--accent)] hover:underline"
                    >
                      {t("wizard_open_imported")}
                    </button>
                  ) : null}
                </div>
              ))}
              {!importer.results ? (
                <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-muted">
                  <CircleDashed className="size-3.5 animate-pulse text-faint" />
                  {importer.progress.processedNotes}/{importer.progress.totalNotes}
                </div>
              ) : null}
            </div>

            {importer.results?.some((result) => result.status === "error") ? (
              <p className="text-[12px] text-[var(--danger)]">
                {t("fimp_error_count", {
                  count: importer.results.filter((result) => result.status === "error").length,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          <StepDot active={step === "select"} done={step !== "select"} />
          <StepDot active={step === "review"} done={step === "progress"} />
          <StepDot active={step === "progress"} />
          <span className="ml-1">
            {step === "select" ? t("wizard_step1") : step === "review" ? t("wizard_step2") : t("wizard_step3")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {step === "select" ? (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {t("wizard_cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!importer.notes.length || importer.parsing}
                onClick={() => setStepOverride("review")}
              >
                {t("fimp_import_button")}
                <ArrowRight />
              </Button>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <Button variant="ghost" onClick={() => setStepOverride("select")}>
                <ArrowLeft /> {t("wizard_back")}
              </Button>
              <Button variant="primary" disabled={!importer.notes.length} onClick={handleStart}>
                {t("fimp_import_action", { count: importer.notes.length })}
              </Button>
            </>
          ) : null}

          {step === "progress" ? (
            importer.results ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    importer.reset();
                    setStepOverride("select");
                  }}
                >
                  {t("wizard_new_import")}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    onOpenChange(false);
                    if (firstPageId) router.push(`/home/p/${firstPageId}`);
                  }}
                >
                  <Check /> {t("wizard_finish")}
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={importer.cancel}>
                <X /> {t("wizard_cancel_import")}
              </Button>
            )
          ) : null}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

function StepDot({ active, done }: { active?: boolean; done?: boolean }) {
  return (
    <span
      className={cn(
        "size-1.5 rounded-full transition-colors",
        active || done ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
      )}
    />
  );
}

function OptionRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition hover:border-[var(--border-strong)]">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink">{title}</span>
        <span className="block text-[11.5px] leading-relaxed text-muted">{description}</span>
      </span>
    </label>
  );
}

function NoteList({
  notes,
  onRemove,
  onClear,
  emptyLabel,
  removeLabel,
  clearLabel,
  countLabel,
  warningLabel,
  warningsTitle,
  showStructure,
}: {
  notes: {
    sourceId: string;
    title: string;
    sourceFileName: string;
    containerPath?: string[];
    blocks: unknown[];
    warnings: ImportWarningCode[];
  }[];
  onRemove: (sourceId: string) => void;
  onClear: () => void;
  emptyLabel: string;
  removeLabel: string;
  clearLabel: string;
  countLabel: string;
  warningLabel?: (code: ImportWarningCode) => string;
  warningsTitle?: string;
  showStructure?: boolean;
}) {
  const warnings = useMemo(() => {
    const set = new Set<ImportWarningCode>();
    for (const note of notes) for (const code of note.warnings) set.add(code);
    return [...set];
  }, [notes]);

  if (!notes.length) {
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-4 text-center text-[12px] text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{countLabel}</span>
        <button type="button" onClick={onClear} className="text-[11.5px] text-muted transition hover:text-ink">
          {clearLabel}
        </button>
      </div>

      <div className="max-h-[220px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        {notes.map((note) => (
          <div
            key={note.sourceId}
            className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0"
          >
            <FileText className="size-3.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={note.title}>
              {note.title}
            </span>
            <span
              className="hidden max-w-[12rem] shrink-0 items-center gap-1 truncate text-[11px] text-faint sm:flex"
              title={
                showStructure && note.containerPath?.length
                  ? note.containerPath.join(" / ")
                  : note.sourceFileName
              }
            >
              {showStructure && note.containerPath?.length ? (
                <>
                  <FolderTree className="size-3 shrink-0" />
                  <span className="truncate">{note.containerPath.join(" / ")}</span>
                </>
              ) : (
                note.sourceFileName
              )}
            </span>
            <button
              type="button"
              onClick={() => onRemove(note.sourceId)}
              className="shrink-0 text-faint transition hover:text-[var(--danger)]"
              aria-label={removeLabel}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {warningLabel && warnings.length ? (
        <div className="space-y-1 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">
            {warningsTitle}
          </p>
          {warnings.map((code) => (
            <p key={code} className="text-[11.5px] leading-relaxed text-muted">
              {warningLabel(code)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
