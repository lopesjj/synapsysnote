"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useLocale, usePathname, useRouter } from "@/lib/i18n/navigation";
import { useLocaleUrlSync } from "@/hooks/use-locale-url-sync";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { FilePlus, Home, Loader2, Minimize2, NotebookText, Search, Timer } from "lucide-react";
import { StudyIcon } from "@/lib/icons/study-icons";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { appHref, isLoginHost, isSplitHosts, loginHref, navigateTo } from "@/lib/domains";
import { useUserPreferencesSync } from "@/hooks/use-user-profile";
import { useWorkspace } from "@/lib/data/provider";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useRehydrateUiStore,
  useUiStore,
} from "@/lib/store/ui-store";
import { EDITOR_WIDTHS, fontById } from "@/lib/typography";
import { Sidebar, SidebarRail } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { PreferencesDialog } from "./preferences-dialog";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { ImportWizard } from "@/components/notion/import-wizard";
import {
  EVERNOTE_IMPORT_KEY,
  GOOGLE_DOCS_IMPORT_KEY,
  firstRunningBackgroundImport,
  useBackgroundImportStore,
} from "@/lib/import/background-import-store";
import { ScreenReaderLiveRegion } from "@/components/accessibility/screen-reader";
import { LibrasPlayer } from "@/components/accessibility/libras-player";
import { SynapsysWordmark } from "@/components/brand/logo";
import { useDocumentTitle } from "./document-title";
import { useWorkspaceNavHistory } from "@/hooks/use-workspace-nav-history";
import { useTranslation } from "@/lib/i18n/translations";
import { Tooltip } from "@/components/ui/primitives";
import { cn, isMac } from "@/lib/utils";
import { resolveNoteCreationTarget, expandContainerInSession } from "@/lib/data/page-tree";
import { useStudyT } from "@/lib/study/i18n";
import { openBlankTimer } from "@/lib/study/ui-store";
import { useActiveModule, useSwitchModule } from "@/components/study/study-sidebar";
import { FocusPill, useFocusPillVisible } from "@/components/study/focus-timer";
import { PlanAdminDialog } from "@/components/plans/plan-admin-dialog";
import { PlanBanner } from "@/components/plans/plan-banner";
import { notifyPlanError } from "@/lib/plans/client";
import { planNoteTarget, usePlanGates } from "@/lib/plans/gates";

const EvernoteImportWizard = dynamic(
  () => import("@/components/import/evernote-import-wizard").then((mod) => mod.EvernoteImportWizard),
  { ssr: false }
);

const GoogleDocsImportWizard = dynamic(
  () => import("@/components/import/google-docs-import-wizard").then((mod) => mod.GoogleDocsImportWizard),
  { ssr: false }
);

const FileImportWizard = dynamic(
  () => import("@/components/import/file-import-wizard").then((mod) => mod.FileImportWizard),
  { ssr: false }
);

const SynapsysWorkspaceImportDialog = dynamic(
  () =>
    import("@/components/import/synapsys-workspace-import-dialog").then(
      (mod) => mod.SynapsysWorkspaceImportDialog
    ),
  { ssr: false }
);
import { scheduleRestoreResumptionCheck } from "@/lib/import/workspace-restore-manager";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, loggingOut } = useAuth();
  const { mode, activeImportJob, adapter, pages, databases } = useWorkspace();
  useDocumentTitle();
  useWorkspaceNavHistory();

  useRehydrateUiStore();
  const preferencesReady = useUserPreferencesSync();
  useLocaleUrlSync(preferencesReady);
  const locale = useLocale();

  const zenMode = useUiStore((state) => state.zenMode);
  const focusPillVisible = useFocusPillVisible();
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const importOpen = useUiStore((state) => state.importOpen);
  const evernoteImportOpen = useUiStore((state) => state.evernoteImportOpen);
  const evernoteImportStep = useUiStore((state) => state.evernoteImportStep);
  const googleDocsImportOpen = useUiStore((state) => state.googleDocsImportOpen);
  const fileImportProvider = useUiStore((state) => state.fileImportProvider);
  const workspaceRestoreOpen = useUiStore((state) => state.workspaceRestoreOpen);
  const backgroundRuns = useBackgroundImportStore((state) => state.runs);
  const backgroundImport = firstRunningBackgroundImport(backgroundRuns);
  const preferencesOpen = useUiStore((state) => state.preferencesOpen);
  const changePasswordOpen = useUiStore((state) => state.changePasswordOpen);
  const editorFontId = useUiStore((state) => state.editorFontId);
  const editorFontSize = useUiStore((state) => state.editorFontSize);
  const editorWidth = useUiStore((state) => state.editorWidth);
  const notesDensity = useUiStore((state) => state.notesDensity);
  const uiZoom = useUiStore((state) => state.uiZoom);
  const autoCollapseSidebar = useUiStore((state) => state.autoCollapseSidebar);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const highContrast = useUiStore((state) => state.highContrast);
  const enhancedFocus = useUiStore((state) => state.enhancedFocus);
  const underlineLinks = useUiStore((state) => state.underlineLinks);
  const dyslexicFont = useUiStore((state) => state.dyslexicFont);
  const language = useUiStore((state) => state.language) || "pt";

  const pathname = usePathname();
  const isDocView = pathname?.startsWith("/home/p/") || pathname?.startsWith("/home/n/");

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", language);
    root.setAttribute("dir", "ltr");
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.setAttribute("data-reduced-motion", "true");
    else root.removeAttribute("data-reduced-motion");

    if (highContrast) root.setAttribute("data-high-contrast", "true");
    else root.removeAttribute("data-high-contrast");

    if (enhancedFocus) root.setAttribute("data-enhanced-focus", "true");
    else root.removeAttribute("data-enhanced-focus");

    if (underlineLinks) root.setAttribute("data-underline-links", "true");
    else root.removeAttribute("data-underline-links");

    if (dyslexicFont) root.setAttribute("data-dyslexic-font", "true");
    else root.removeAttribute("data-dyslexic-font");
  }, [reducedMotion, highContrast, enhancedFocus, underlineLinks, dyslexicFont]);

  useEffect(() => {
    if (pathname?.startsWith("/home/p/") && autoCollapseSidebar) {
      useUiStore.getState().closeMenu();
    }
  }, [pathname, autoCollapseSidebar]);

  useEffect(() => {
    if (zenMode) useUiStore.getState().setMobileSidebarOpen(false);
  }, [zenMode]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const closeIfDesktop = () => {
      if (query.matches) useUiStore.getState().setMobileSidebarOpen(false);
    };
    closeIfDesktop();
    query.addEventListener("change", closeIfDesktop);
    return () => query.removeEventListener("change", closeIfDesktop);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-font-scale", String(uiZoom));
  }, [uiZoom]);

  useEffect(() => {
    if (
      preferencesOpen ||
      importOpen ||
      evernoteImportOpen ||
      googleDocsImportOpen ||
      fileImportProvider ||
      paletteOpen ||
      changePasswordOpen
    ) {
      useUiStore.getState().setMobileSidebarOpen(false);
    }
  }, [
    preferencesOpen,
    importOpen,
    evernoteImportOpen,
    googleDocsImportOpen,
    fileImportProvider,
    paletteOpen,
    changePasswordOpen,
  ]);

  const notifiedImportsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const run of Object.values(backgroundRuns)) {
      if (run.status === "running") {
        notifiedImportsRef.current.delete(run.key);
        continue;
      }

      const wizardVisible =
        run.wizard === "evernote"
          ? evernoteImportOpen
          : run.wizard === "google-docs"
            ? googleDocsImportOpen
            : run.wizard === "workspace"
              ? workspaceRestoreOpen
              : fileImportProvider === run.fileProvider;

      if (!notifiedImportsRef.current.has(run.key)) {
        notifiedImportsRef.current.add(run.key);
        if (run.status === "canceled") {
          toast.info(t("import_canceled_toast"));
        } else {
          const imported = run.results?.filter((item) => item.status === "done").length ?? 0;
          if (imported) toast.success(t("fimp_done_summary", { count: imported }));
        }
      }

      if (!wizardVisible) useBackgroundImportStore.getState().clear(run.key);
    }
  }, [backgroundRuns, evernoteImportOpen, googleDocsImportOpen, fileImportProvider, workspaceRestoreOpen, t]);

  const hasBackgroundImport = Boolean(backgroundImport);

  useEffect(() => {
    if (!hasBackgroundImport) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasBackgroundImport]);

  const openBackgroundImportWizard = useCallback(() => {
    const run = firstRunningBackgroundImport(useBackgroundImportStore.getState().runs);
    if (!run) return;
    const store = useUiStore.getState();
    if (run.wizard === "evernote") store.setEvernoteImportOpen(true);
    else if (run.wizard === "google-docs") store.setGoogleDocsImportOpen(true);
    else if (run.wizard === "workspace") store.setWorkspaceRestoreOpen(true);
    else if (run.fileProvider) store.setFileImportProvider(run.fileProvider);
  }, []);

  useEffect(() => {
    if (adapter?.workspaceId) {
      scheduleRestoreResumptionCheck(adapter.workspaceId);
    }
  }, [adapter?.workspaceId]);

  useEffect(() => {
    if (isSplitHosts() && isLoginHost()) {
      if (user) {
        navigateTo(appHref(pathname || "/home", locale), router, "replace");
      } else if (!loading && !loggingOut) {
        navigateTo(loginHref("/"), undefined, "replace");
      }
      return;
    }
    if (!loading && !user && !loggingOut) {
      navigateTo(loginHref("/?session=sync_failed"), undefined, "replace");
    }
  }, [loading, locale, loggingOut, pathname, router, user]);

  const onKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const store = useUiStore.getState();

      if (event.key === "Escape") {
        if (store.paletteOpen) {
          event.preventDefault();
          store.setPaletteOpen(false);
          return;
        }
        if (store.preferencesOpen) {
          event.preventDefault();
          store.setPreferencesOpen(false);
          return;
        }
        if (store.zenMode) {
          event.preventDefault();
          store.setZenMode(false);
          return;
        }
      }
      const key = event.key.toLowerCase();

      const isAltN = event.altKey && key === "n";
      const isModN = meta && key === "n";

      if (isAltN || isModN) {
        if (isEditingText(event.target) && !meta) {
          return;
        }
        event.preventDefault();
        // Os botões de criar já saem desabilitados pelos gates do plano; o
        // atalho não tem como, então o limite chega aqui como rejeição do
        // guard. Sem este catch, vira unhandledRejection.
        try {
          if (event.shiftKey) {
            const notebook = await adapter.createNotebook({ name: t("untitled") });
            toast.success(t("page_created"));
            router.push(`/home/n/${notebook.id}`);
            return;
          }
          const target = planNoteTarget(resolveNoteCreationTarget(pathname, pages, databases));
          const page = await adapter.createPage({
            notebookId: target.notebookId,
            parentPageId: target.parentPageId,
            title: t("untitled"),
          });
          expandContainerInSession(target);
          useUiStore.getState().closeMenu();
          router.push(`/home/p/${page.id}`);
        } catch (error) {
          // planFailure já avisou o usuário; falhas de verdade seguem visíveis.
          if (!notifyPlanError(error)) throw error;
        }
        return;
      }

      if (!meta) return;

      if (key === "k") {
        event.preventDefault();
        store.setPaletteOpen(!store.paletteOpen);
        return;
      }

      if (key === "," ) {
        event.preventDefault();
        store.setPreferencesOpen(true);
        return;
      }

      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        store.toggleZenMode();
        return;
      }

      if ((key === "b" || event.key === "\\") && !isEditingText(event.target)) {
        event.preventDefault();
        if (window.matchMedia("(max-width: 767px)").matches) {
          store.setMobileSidebarOpen(!store.mobileSidebarOpen);
        } else {
          store.toggleSidebar();
        }
      }
    },
    [adapter, databases, pages, pathname, router]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--canvas)]">
        <Loader2 className="size-5 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const chromeHidden = zenMode;

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <div
        className="flex h-dvh overflow-hidden bg-[var(--canvas)]"
      data-density={notesDensity}
      style={
        {
          "--font-editor": fontById(editorFontId).stack,
          "--font-editor-size": `${editorFontSize}px`,
          "--reading-width": EDITOR_WIDTHS[editorWidth],
        } as React.CSSProperties
      }
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-[var(--surface)] focus:text-ink focus:border focus:border-[var(--accent)] focus:shadow-[var(--shadow-float)] focus:text-[13px] focus:font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
      >
        {t("skip_to_content")}
      </a>

      {chromeHidden ? null : <DesktopSidebar />}

      <MobileSidebar />

      <main
        id="main-content"
        tabIndex={-1}
        inert={mobileSidebarOpen ? true : undefined}
        className="relative flex min-w-0 flex-1 flex-col focus:outline-none"
      >
        {chromeHidden || isDocView ? null : (
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/90 px-3.5 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] backdrop-blur-xl md:hidden">
            <button
              type="button"
              onClick={() => useUiStore.getState().setMobileSidebarOpen(true)}
              aria-label={t("open_menu")}
              className="group flex size-11 items-center justify-center rounded-xl border border-[var(--border)]/80 bg-[var(--surface-2)]/80 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--surface-3)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            >
              <span className="flex flex-col items-start justify-center gap-[3.5px]">
                <span className="h-[2px] w-4 rounded-full bg-current transition-all duration-200 group-hover:w-4.5" />
                <span className="h-[2px] w-2.5 rounded-full bg-current transition-all duration-200 group-hover:w-3.5" />
                <span className="h-[2px] w-3.5 rounded-full bg-current transition-all duration-200 group-hover:w-4" />
              </span>
            </button>
          </div>
        )}

        {mode === "local" && !chromeHidden ? <DemoBanner /> : null}
        {chromeHidden ? null : <PlanBanner />}

        {/* Com o relógio do rodapé na tela, o fim da página rola para cima dele em vez de ficar coberto. */}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            mobileSidebarOpen && "max-md:overflow-hidden",
            focusPillVisible ? "pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))] md:pb-[6.75rem]" : "pb-[calc(5.45rem+env(safe-area-inset-bottom,0px))] md:pb-0"
          )}
        >
          {children}
        </div>

        <FocusPill />

        {zenMode ? (
          <Tooltip
            label={t("exit_focus_mode")}
            shortcut={isMac() ? "⌘⇧F · Esc" : "Ctrl ⇧ F · Esc"}
            side="left"
          >
            <button
              onClick={() => useUiStore.getState().setZenMode(false)}
              className={cn(
                "fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[var(--border)]",
                "bg-[var(--surface)] px-3 py-2 text-[12px] text-muted opacity-40 shadow-[var(--shadow-float)]",
                "transition hover:opacity-100 hover:text-ink"
              )}
            >
              <Minimize2 className="size-3.5" />
              {t("focus_mode")}
            </button>
          </Tooltip>
        ) : activeImportJob ? (
          <button
            onClick={() => useUiStore.getState().setImportOpen(true)}
            className={cn(
              "fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-[var(--border)]",
              "bg-[var(--surface)] py-2 pl-3 pr-4 text-[12px] shadow-[var(--shadow-float)] transition hover:border-[var(--accent)]"
            )}
          >
            <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
            <span className="text-ink">
              {t("importing_progress", {
                current: activeImportJob.processedPages,
                total: activeImportJob.totalPages,
              })}
            </span>
          </button>
        ) : backgroundImport ? (
          <button
            onClick={openBackgroundImportWizard}
            className={cn(
              "fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-[var(--border)]",
              "bg-[var(--surface)] py-2 pl-3 pr-4 text-[12px] shadow-[var(--shadow-float)] transition hover:border-[var(--accent)]"
            )}
          >
            <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
            <span className="text-ink">
              {backgroundImport.wizard === "workspace"
                ? backgroundImport.totalFiles > 0 && backgroundImport.processedFiles < backgroundImport.totalFiles
                  ? t("synapsys_import_progress_media", {
                      current: String(backgroundImport.processedFiles),
                      total: String(backgroundImport.totalFiles),
                    })
                  : t("synapsys_import_progress_pages")
                : t("importing_progress", {
                    current: backgroundImport.processedNotes,
                    total: backgroundImport.totalNotes,
                  })}
            </span>
          </button>
        ) : null}
      </main>

      
      {!chromeHidden ? <BottomNav inert={mobileSidebarOpen} /> : null}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={(open) => useUiStore.getState().setPaletteOpen(open)}
      />
      <ImportWizard
        open={importOpen}
        onOpenChange={(open) => useUiStore.getState().setImportOpen(open)}
      />
      {googleDocsImportOpen || backgroundRuns[GOOGLE_DOCS_IMPORT_KEY] ? (
        <GoogleDocsImportWizard
          open={googleDocsImportOpen}
          onOpenChange={(open) => useUiStore.getState().setGoogleDocsImportOpen(open)}
        />
      ) : null}
      {evernoteImportOpen || backgroundRuns[EVERNOTE_IMPORT_KEY] ? (
        <EvernoteImportWizard
          open={evernoteImportOpen}
          initialStep={evernoteImportStep ?? undefined}
          onOpenChange={(open) => useUiStore.getState().setEvernoteImportOpen(open)}
          onSwitchToFileImport={() => useUiStore.getState().setFileImportProvider("evernote")}
        />
      ) : null}
      {fileImportProvider ? (
        <FileImportWizard
          key={fileImportProvider}
          provider={fileImportProvider}
          open
          onOpenChange={(open) => {
            if (!open) useUiStore.getState().setFileImportProvider(null);
          }}
        />
      ) : null}
      <PreferencesDialog
        open={preferencesOpen}
        onOpenChange={(open) => useUiStore.getState().setPreferencesOpen(open)}
      />
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={(open) => useUiStore.getState().setChangePasswordOpen(open)}
      />
      <SynapsysWorkspaceImportDialog
        open={workspaceRestoreOpen}
        onOpenChange={(open) => useUiStore.getState().setWorkspaceRestoreOpen(open)}
      />
      <PlanAdminDialog />
      <ScreenReaderLiveRegion />
      <LibrasPlayer />
    </div>
  </MotionConfig>
);
}

const COLLAPSED_SIDEBAR_WIDTH = 76;
const SIDEBAR_SLIDE = { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const };
let sidebarMotionReady = false;
const sidebarMotionListeners = new Set<() => void>();

function subscribeSidebarMotion(listener: () => void) {
  sidebarMotionListeners.add(listener);
  if (!sidebarMotionReady) {
    requestAnimationFrame(() => {
      if (sidebarMotionReady) return;
      sidebarMotionReady = true;
      sidebarMotionListeners.forEach((entry) => entry());
    });
  }
  return () => {
    sidebarMotionListeners.delete(listener);
  };
}

function useSidebarMotionReady() {
  return useSyncExternalStore(subscribeSidebarMotion, () => sidebarMotionReady, () => false);
}

function DesktopSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const width = useUiStore((state) => state.sidebarWidth);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const motionReady = useSidebarMotionReady();
  const slide = motionReady && !reducedMotion ? SIDEBAR_SLIDE : { duration: 0 };

  return (
    <div className="hidden h-full md:flex">
      <motion.div
        initial={false}
        animate={{ width: collapsed ? COLLAPSED_SIDEBAR_WIDTH : width }}
        transition={slide}
        className="relative h-full shrink-0 overflow-hidden"
      >
        <motion.div
          initial={false}
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={motionReady && !reducedMotion ? { duration: 0.42, ease: "easeOut" } : { duration: 0 }}
          className={cn("h-full", collapsed && "pointer-events-none [&_*]:pointer-events-none")}
          style={{
            width,
            pointerEvents: collapsed ? "none" : "auto",
          }}
        >
          <Sidebar collapsed={false} width={width} />
        </motion.div>
        <motion.div
          initial={false}
          animate={{ opacity: collapsed ? 1 : 0 }}
          transition={motionReady && !reducedMotion ? { duration: 0.45, ease: "easeOut", delay: collapsed ? 0.18 : 0 } : { duration: 0 }}
          className={cn(
            "absolute inset-y-0 left-0 w-[76px]",
            !collapsed && "pointer-events-none [&_*]:pointer-events-none"
          )}
          style={{ pointerEvents: collapsed ? "auto" : "none" }}
        >
          <SidebarRail />
        </motion.div>
      </motion.div>
      {collapsed ? null : <SidebarResizer />}
    </div>
  );
}

function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function MobileSidebar() {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.mobileSidebarOpen);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Element && target.closest("[role='menu']")) return;
      if (isEditingText(event.target)) return;
      event.preventDefault();
      useUiStore.getState().setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-60 h-dvh md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => useUiStore.getState().setMobileSidebarOpen(false)}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("main_navigation")}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 h-full w-[min(var(--drawer),calc(100%-3rem))] overflow-hidden shadow-[8px_0_32px_rgba(0,0,0,0.18)] outline-none"
            style={{ ["--drawer" as string]: `${Math.max(sidebarWidth, 280)}px` }}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <Sidebar collapsed={false} width={320} mobile />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function BottomNav({ inert = false }: { inert?: boolean }) {
  const { t } = useTranslation();
  const { st } = useStudyT();
  const router = useRouter();
  const pathname = usePathname();
  const { adapter, pages, databases } = useWorkspace();
  const activeModule = useActiveModule();
  const switchModule = useSwitchModule();
  const gates = usePlanGates();
  const noteTarget = gates.noteTarget(resolveNoteCreationTarget(pathname, pages, databases));
  const newNoteGate = gates.newPage(noteTarget);

  const createNote = async () => {
    const target = noteTarget;
    const page = await adapter.createPage({
      notebookId: target.notebookId,
      parentPageId: target.parentPageId,
      title: t("untitled"),
    });
    expandContainerInSession(target);
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  return (
    <nav
      inert={inert ? true : undefined}
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border)] bg-[var(--surface)]/95 pt-2 pb-[calc(0.95rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl md:hidden"
      aria-label={t("main_navigation")}
    >
      <MobileNavItem
        icon={<Home className="size-[18px]" />}
        label={t("home")}
        active={pathname === "/home"}
        onClick={() => router.push("/home")}
      />
      <MobileNavItem
        icon={<Search className="size-[18px]" />}
        label={t("search")}
        active={false}
        onClick={() => useUiStore.getState().setPaletteOpen(true)}
      />
      {activeModule === "study" ? (
        <MobileNavItem
          icon={<Timer className="size-[18px]" />}
          label={st("nav_focus")}
          active={false}
          onClick={openBlankTimer}
        />
      ) : (
        <MobileNavItem
          icon={<FilePlus className="size-[18px]" />}
          label={t("new_note")}
          active={false}
          disabledReason={newNoteGate.allowed ? null : newNoteGate.reason}
          onClick={() => void createNote()}
        />
      )}
      <MobileNavItem
        icon={activeModule === "study" ? <NotebookText className="size-[18px]" /> : <StudyIcon className="size-[18px]" />}
        label={activeModule === "study" ? st("module_notes") : st("module_study")}
        active={false}
        onClick={() => {
          const next = activeModule === "study" ? "notes" : "study";
          switchModule(next);
          router.push(next === "study" ? "/home/study" : "/home/notes");
        }}
      />
    </nav>
  );
}

function MobileNavItem({
  icon,
  label,
  active,
  disabledReason,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabledReason?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-[10px] font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-[var(--accent)]" : "text-muted hover:text-ink"
      )}
      aria-label={disabledReason ? `${label}: ${disabledReason}` : label}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-lg transition-colors",
          active && "bg-[var(--accent-soft)]"
        )}
      >
        {icon}
      </span>
      <span className="line-clamp-2 w-full">{label}</span>
    </button>
  );
}

function SidebarResizer() {
  const { t } = useTranslation();
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setSidebarWidth(event.clientX);
      });
    };
    const stop = () => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [dragging, setSidebarWidth]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resize_sidebar")}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8;
        const current = useUiStore.getState().sidebarWidth;
        if (event.key === "ArrowLeft") setSidebarWidth(current - step);
        if (event.key === "ArrowRight") setSidebarWidth(current + step);
      }}
      tabIndex={0}
      className={cn(
        "group relative -ml-px w-px shrink-0 cursor-col-resize bg-[var(--border)] transition-colors",
        dragging ? "bg-[var(--accent)]" : "hover:bg-[var(--accent)]"
      )}
    >
      
      <span className="absolute inset-y-0 -left-1.5 -right-1.5 block" />
    </div>
  );
}

function DemoBanner() {
  const { t, language } = useTranslation();
  return (
    <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-1.5 text-[11.5px] text-[var(--accent)]">
      {t("demo_mode_banner")}
      {language === "pt" && (
        <span className="ml-1 text-faint">{isMac() ? "⌘," : "Ctrl ,"} abre as preferências.</span>
      )}
    </div>
  );
}
