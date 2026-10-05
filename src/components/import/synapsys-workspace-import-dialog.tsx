"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  Database,
  FileText,
  FolderArchive,
  FolderTree,
  HardDrive,
  Layers,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { WizardFooter } from "./wizard-footer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import {
  executeWorkspaceRestore,
  getPersistedRestoreJob,
  cancelRestoreJob,
  isRestoreRunning,
  WORKSPACE_RESTORE_KEY,
} from "@/lib/import/workspace-restore-manager";
import {
  isRestorableBackup,
  readWorkspaceBackup,
  summarizeWorkspaceBackup,
  type RestoreSummary,
  type WorkspaceBackup,
} from "@/lib/import/workspace-backup";
import { useBackgroundImportStore } from "@/lib/import/background-import-store";
import { cn } from "@/lib/utils";

export function SynapsysWorkspaceImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { adapter } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backgroundRuns = useBackgroundImportStore((state) => state.runs);
  const currentRun = backgroundRuns[WORKSPACE_RESTORE_KEY];

  const [dragActive, setDragActive] = useState(false);
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [parsedData, setParsedData] = useState<WorkspaceBackup | null>(null);
  const [persistedSummary, setPersistedSummary] = useState<RestoreSummary | null>(null);
  const activeFileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "clean">("merge");
  const [errorMsg, setErrorMsg] = useState("");

  const isCurrentRunActive = currentRun?.status === "running";
  const effectiveRestoring = restoring || isCurrentRunActive;

  const displayProgressText = (() => {
    if (isCurrentRunActive && currentRun) {
      if (currentRun.totalFiles > 0 && currentRun.processedFiles < currentRun.totalFiles) {
        return t("synapsys_import_progress_media", {
          current: String(currentRun.processedFiles),
          total: String(currentRun.totalFiles),
        });
      }
      return t("synapsys_import_progress_pages");
    }
    return progressText;
  })();

  const displayProgressPercent = (() => {
    if (isCurrentRunActive && currentRun) {
      if (currentRun.totalFiles > 0 && currentRun.processedFiles < currentRun.totalFiles) {
        return Math.min(75, Math.round((currentRun.processedFiles / (currentRun.totalFiles || 1)) * 75));
      }
      return Math.min(99, 78 + Math.round((currentRun.processedNotes / (currentRun.totalNotes || 1)) * 21));
    }
    return progressPercent;
  })();

  const reset = () => {
    setParsedData(null);
    setPersistedSummary(null);
    activeFileRef.current = null;
    setFileName("");
    setProgressText("");
    setProgressPercent(0);
    setErrorMsg("");
    setRestoring(false);
    setReading(false);
    if (typeof window !== "undefined" && adapter?.workspaceId) {
      try {
        localStorage.removeItem(`synapsys_restore_summary_${adapter.workspaceId}`);
      } catch {}
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (!effectiveRestoring) reset();
      onOpenChange(false);
    }
  };

  useEffect(() => {
    if (!open || !adapter?.workspaceId) return;

    const running = isRestoreRunning(adapter.workspaceId);
    void getPersistedRestoreJob(adapter.workspaceId).then(async (persisted) => {
      try {
        const cached = localStorage.getItem(`synapsys_restore_summary_${adapter.workspaceId}`);
        const parsed = cached ? (JSON.parse(cached) as RestoreSummary | null) : null;
        if (parsed && typeof parsed === "object" && typeof parsed.pagesCount === "number") {
          setPersistedSummary(parsed);
        }
      } catch {}
      if (persisted || running) {
        if (persisted) {
          setFileName(persisted.fileName);
          if (persisted.summary) {
            setPersistedSummary(persisted.summary);
            try {
              localStorage.setItem(
                `synapsys_restore_summary_${adapter.workspaceId}`,
                JSON.stringify(persisted.summary)
              );
            } catch {}
          } else if (persisted.fileBlob) {
            try {
              const { data } = await readWorkspaceBackup(persisted.fileBlob);
              if (isRestorableBackup(data)) {
                const derivedSummary = summarizeWorkspaceBackup(data);
                setPersistedSummary(derivedSummary);
                try {
                  localStorage.setItem(
                    `synapsys_restore_summary_${adapter.workspaceId}`,
                    JSON.stringify(derivedSummary)
                  );
                } catch {}
              }
            } catch {}
          }
        }
        setRestoring(true);
      }
    });
  }, [open, adapter?.workspaceId]);

  const ignoreClickUntilRef = useRef(0);
  const lastClickTimeRef = useRef(0);

  const handleContainerClick = () => {
    if (reading || effectiveRestoring) return;
    if (Date.now() < ignoreClickUntilRef.current) return;
    const now = Date.now();
    if (now - lastClickTimeRef.current < 600) return;
    lastClickTimeRef.current = now;
    fileInputRef.current?.click();
  };

  const processFile = async (file: File) => {
    setErrorMsg("");
    setReading(true);
    activeFileRef.current = file;
    try {
      if (!file || file.size === 0) throw new Error("empty_file");

      const { data: parsed } = await readWorkspaceBackup(file);

      if (!isRestorableBackup(parsed)) {
        throw new Error(t("synapsys_import_invalid_file"));
      }

      setParsedData(parsed);
      setFileName(file.name);

      const summary: RestoreSummary = summarizeWorkspaceBackup(parsed);
      setPersistedSummary(summary);
      if (typeof window !== "undefined" && adapter?.workspaceId) {
        try {
          localStorage.setItem(
            `synapsys_restore_summary_${adapter.workspaceId}`,
            JSON.stringify(summary)
          );
        } catch {}
      }
    } catch (err) {
      const isEmpty = err instanceof Error && err.message === "empty_file";
      const isLocked =
        Boolean(err && typeof err === "object" && "name" in err && err.name === "NotReadableError") ||
        (err instanceof Error && /permission|could not be read|read_failed/i.test(err.message));
      const message = isEmpty
        ? t("fimp_error_empty_file")
        : isLocked
          ? t("synapsys_import_read_locked")
          : err instanceof Error && err.message !== "read_failed"
            ? err.message
            : t("synapsys_import_invalid_file");
      setErrorMsg(message);
      toast.error(message);
      setParsedData(null);
      setPersistedSummary(null);
      activeFileRef.current = null;
    } finally {
      setReading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    ignoreClickUntilRef.current = Date.now() + 800;
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const totalRowsCount = (parsedData?.databases || []).reduce(
    (acc, db) => acc + (Array.isArray(db.rows) ? db.rows.length : 0),
    0
  );

  const notebooksCount =
    parsedData?.notebooks?.length ?? persistedSummary?.notebooksCount ?? 0;
  const pagesCount =
    parsedData?.pages?.length ?? persistedSummary?.pagesCount ?? currentRun?.totalNotes ?? 0;
  const databasesCount =
    parsedData?.databases?.length ?? persistedSummary?.databasesCount ?? 0;
  const databaseRowsCount =
    totalRowsCount || persistedSummary?.databaseRowsCount || 0;
  const flashcardsCount =
    parsedData?.flashcards?.length ?? persistedSummary?.flashcardsCount ?? 0;
  const filesCount =
    parsedData?.files?.length ?? persistedSummary?.filesCount ?? currentRun?.totalFiles ?? 0;
  const workspaceOriginName =
    parsedData?.workspace?.name || persistedSummary?.workspaceName || "";

  const startRestore = async () => {
    if (!parsedData || !adapter?.workspaceId) return;
    if (isRestoreRunning(adapter.workspaceId)) return;
    const currentFile = activeFileRef.current;
    if (!currentFile) return;

    setRestoring(true);
    setErrorMsg("");

    try {
      await executeWorkspaceRestore(
        adapter.workspaceId,
        currentFile,
        fileName,
        mode,
        ({ stage, processedFiles, totalFiles, percent }) => {
          if (stage === "media") {
            setProgressText(
              t("synapsys_import_progress_media", {
                current: String(processedFiles),
                total: String(totalFiles),
              })
            );
          } else if (stage === "firestore") {
            setProgressText(t("synapsys_import_progress_pages"));
          } else if (stage === "reading") {
            setProgressText(t("synapsys_import_reading"));
          } else if (stage === "done") {
            setProgressText(t("synapsys_import_success"));
          }
          setProgressPercent(percent);
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("synapsys_import_failed");
      setErrorMsg(message);
      setRestoring(false);
    }
  };

  const hasDataToShow = Boolean(parsedData || persistedSummary || effectiveRestoring);

  return (
    <DialogShell open={open} onOpenChange={handleClose} className="max-w-xl">
      <DialogHeader
        className="px-4 pr-12 sm:px-5 sm:pr-12"
        title={t("synapsys_import_dialog_title")}
        description={t("synapsys_import_dialog_desc")}
        icon={<FolderArchive className="size-4" />}
        iconClassName="bg-indigo-500/10 text-indigo-400"
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20 text-red-400 text-[12.5px]">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {!hasDataToShow ? (
          <div
            onClick={handleContainerClick}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center justify-center p-6 sm:p-8 rounded-[var(--radius-lg)] border-2 border-dashed transition cursor-pointer select-none",
              dragActive
                ? "border-[var(--primary)] bg-[var(--primary)]/5"
                : "border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface-2)]/30 hover:bg-[var(--surface-2)]/50",
              reading && "pointer-events-none opacity-60"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.synapsys,application/zip"
              onChange={handleFileInput}
              className="hidden"
            />

            {reading ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
                <p className="text-[13px] font-medium text-ink">
                  {t("synapsys_import_reading")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                  <Upload className="size-6" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {t("synapsys_import_drop_hint")}
                  </p>
                  <p className="text-[11.5px] text-muted mt-1">
                    .zip
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--surface-2)]/60 border border-[var(--border)]">
              <FileText className="size-4 text-ink shrink-0" />
              <span className="text-[13px] font-medium text-ink truncate flex-1">
                {fileName || workspaceOriginName || "Backup"}
              </span>
              {!effectiveRestoring && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="size-7 p-0 text-muted hover:text-ink"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)]/40 border border-[var(--border)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-muted">
                  {t("synapsys_import_summary_title")}
                </span>
                {workspaceOriginName ? (
                  <span className="inline-block max-w-full truncate px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {workspaceOriginName}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2.5 text-[12.5px] min-[420px]:grid-cols-2">
                <div className="flex items-center gap-2 text-ink">
                  <FolderTree className="size-3.5 text-blue-400 shrink-0" />
                  <span>
                    {t("synapsys_import_notebooks_count", {
                      count: String(notebooksCount),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-ink">
                  <FileText className="size-3.5 text-emerald-400 shrink-0" />
                  <span>
                    {t("synapsys_import_pages_count", {
                      count: String(pagesCount),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-ink">
                  <Database className="size-3.5 text-purple-400 shrink-0" />
                  <span>
                    {t("synapsys_import_databases_count", {
                      count: String(databasesCount),
                      rows: String(databaseRowsCount),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-ink">
                  <Layers className="size-3.5 text-amber-400 shrink-0" />
                  <span>
                    {t("synapsys_import_flashcards_count", {
                      count: String(flashcardsCount),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-ink min-[420px]:col-span-2">
                  <HardDrive className="size-3.5 text-cyan-400 shrink-0" />
                  <span>
                    {t("synapsys_import_files_count", {
                      count: String(filesCount),
                    })}
                  </span>
                </div>
              </div>
            </div>

            {!effectiveRestoring ? (
              <div className="space-y-2">
                <label className="text-[12.5px] font-medium text-ink">
                  {t("synapsys_import_mode_label")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("merge")}
                    className={cn(
                      "flex flex-col text-left p-3 rounded-[var(--radius-md)] border transition",
                      mode === "merge"
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
                    )}
                  >
                    <span className="text-[13px] font-medium text-ink">
                      {t("synapsys_import_mode_merge")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("clean")}
                    className={cn(
                      "flex flex-col text-left p-3 rounded-[var(--radius-md)] border transition",
                      mode === "clean"
                        ? "border-red-500/40 bg-red-500/5"
                        : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
                    )}
                  >
                    <span className="text-[13px] font-medium text-ink">
                      {t("synapsys_import_mode_clean")}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="font-medium text-ink flex min-w-0 items-center gap-2">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--primary)]" />
                    {displayProgressText}
                  </span>
                  <span className="shrink-0 text-muted">{displayProgressPercent}%</span>
                </div>
                <Progress value={displayProgressPercent} className="h-2" />
              </div>
            )}
          </div>
        )}
      </div>

      <WizardFooter>
        {effectiveRestoring ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (adapter?.workspaceId) {
                  cancelRestoreJob(adapter.workspaceId);
                  reset();
                }
              }}
              className="text-red-400 hover:text-red-500 border-red-500/20 hover:border-red-500/40"
            >
              {t("synapsys_import_cancel_restore")}
            </Button>
            <Button
              variant="primary"
              onClick={() => handleClose(false)}
            >
              {t("synapsys_import_run_in_background")}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => handleClose(false)}
              disabled={reading}
            >
              {t("wizard_cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={startRestore}
              disabled={!parsedData || reading}
            >
              {t("synapsys_import_start_button")}
            </Button>
          </>
        )}
      </WizardFooter>
    </DialogShell>
  );
}
