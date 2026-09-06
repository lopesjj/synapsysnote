"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FilePlus, Home, Loader2, Menu as MenuIcon, Minimize2, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { loginHref, navigateTo } from "@/lib/domains";
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
import { ImportWizard } from "@/components/notion/import-wizard";
import { SynapsysWordmark } from "@/components/brand/logo";
import { useDocumentTitle } from "./document-title";
import { useWorkspaceNavHistory } from "@/hooks/use-workspace-nav-history";
import { Tooltip } from "@/components/ui/primitives";
import { cn, isMac } from "@/lib/utils";

/**
 * Application chrome: sidebar, palette, dialogs and global shortcuts.
 *
 * Mobile gets an overlay sidebar; desktop keeps it docked, collapsible and
 * resizable. Zen mode hides every piece of chrome so only the page remains.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { mode, activeImportJob, adapter } = useWorkspace();
  useDocumentTitle();
  useWorkspaceNavHistory();

  useRehydrateUiStore();
  useUserPreferencesSync();

  const zenMode = useUiStore((state) => state.zenMode);
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const importOpen = useUiStore((state) => state.importOpen);
  const preferencesOpen = useUiStore((state) => state.preferencesOpen);
  const editorFontId = useUiStore((state) => state.editorFontId);
  const editorFontSize = useUiStore((state) => state.editorFontSize);
  const editorWidth = useUiStore((state) => state.editorWidth);
  const notesDensity = useUiStore((state) => state.notesDensity);

  const pathname = usePathname();
  const isDocView = pathname?.startsWith("/home/p/") || pathname?.startsWith("/home/n/");

  useEffect(() => {
    if (!loading && !user) navigateTo(loginHref("/?session=sync_failed"), router, "replace");
  }, [loading, router, user]);

  const onKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const store = useUiStore.getState();

      if (event.key === "Escape" && store.zenMode) {
        store.setZenMode(false);
        return;
      }
      if (!meta) return;

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        store.setPaletteOpen(!store.paletteOpen);
        return;
      }

      if (key === "n") {
        event.preventDefault();
        if (event.shiftKey) {
          const notebook = await adapter.createNotebook({ name: "Nova página" });
          toast.success("Página criada");
          router.push(`/home/n/${notebook.id}`);
          return;
        }
        const page = await adapter.createPage({ title: "Sem título" });
        router.push(`/home/p/${page.id}`);
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

      // ⌘B is the spec'd sidebar shortcut but it is also "bold" inside the
      // editor, so it only reaches the sidebar when nothing editable has focus.
      // ⌘\ always works, for people typing with the editor focused.
      if (key === "b" && !isEditingText(event.target)) {
        event.preventDefault();
        store.toggleSidebar();
        return;
      }
      if (event.key === "\\") {
        event.preventDefault();
        store.toggleSidebar();
      }
    },
    [adapter, router]
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
      {chromeHidden ? null : <DesktopSidebar />}

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <motion.div
            className="fixed inset-0 z-60 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => useUiStore.getState().setMobileSidebarOpen(false)}
            />
            <motion.div
              className="absolute inset-y-0 left-0"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sidebar collapsed={false} width={320} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col">
        {chromeHidden || isDocView ? null : (
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/90 px-3 py-2 backdrop-blur-xl md:hidden">
            <button
              type="button"
              onClick={() => useUiStore.getState().setMobileSidebarOpen(true)}
              aria-label="Menu"
              className="flex size-8 items-center justify-center rounded-lg text-ink transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            >
              <MenuIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => useUiStore.getState().setPaletteOpen(true)}
              aria-label="Buscar"
              className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            >
              <Search className="size-4" />
            </button>
          </div>
        )}

        {mode === "local" && !chromeHidden ? <DemoBanner /> : null}

        <div className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</div>

        {zenMode ? (
          <Tooltip
            label="Sair do modo foco"
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
              Modo foco
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
              Importando {activeImportJob.processedPages}/{activeImportJob.totalPages}
            </span>
          </button>
        ) : null}
      </main>

      {/* Bottom Navigation — mobile only */}
      {!chromeHidden ? <BottomNav /> : null}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={(open) => useUiStore.getState().setPaletteOpen(open)}
      />
      <ImportWizard
        open={importOpen}
        onOpenChange={(open) => useUiStore.getState().setImportOpen(open)}
      />
      <PreferencesDialog
        open={preferencesOpen}
        onOpenChange={(open) => useUiStore.getState().setPreferencesOpen(open)}
      />
    </div>
  );
}

const COLLAPSED_SIDEBAR_WIDTH = 56;
const SIDEBAR_SLIDE = { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const };

/** Docked desktop sidebar: width slides while the two faces crossfade. */
function DesktopSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const width = useUiStore((state) => state.sidebarWidth);

  return (
    <div className="hidden h-full md:flex">
      <motion.div
        initial={false}
        animate={{ width: collapsed ? COLLAPSED_SIDEBAR_WIDTH : width }}
        transition={SIDEBAR_SLIDE}
        className="relative h-full shrink-0 overflow-hidden"
      >
        <motion.div
          initial={false}
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          className="h-full"
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
          transition={{ duration: 0.45, ease: "easeOut", delay: collapsed ? 0.18 : 0 }}
          className="absolute inset-y-0 left-0 w-14"
          style={{ pointerEvents: collapsed ? "auto" : "none" }}
        >
          <SidebarRail />
        </motion.div>
      </motion.div>
      {collapsed ? null : <SidebarResizer />}
    </div>
  );
}

/** True when the shortcut would collide with typing (editor, input, textarea). */
function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Bottom navigation bar — mobile only (md:hidden).
 * Gives one-thumb access to the most common actions.
 */
function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { adapter } = useWorkspace();

  const createNote = async () => {
    const page = await adapter.createPage({ title: "Sem título" });
    useUiStore.getState().setMobileSidebarOpen(false);
    router.push(`/home/p/${page.id}`);
  };

  const NavItem = ({
    icon,
    label,
    active,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-[var(--accent)]" : "text-muted hover:text-ink"
      )}
      aria-label={label}
    >
      <span className={cn("flex size-6 items-center justify-center rounded-lg transition-colors", active && "bg-[var(--accent-soft)]")}
      >
        {icon}
      </span>
      {label}
    </button>
  );

  return (
    <nav
      className="bottom-nav-safe fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      aria-label="Navegação principal"
    >
      <NavItem
        icon={<Home className="size-[18px]" />}
        label="Início"
        active={pathname === "/home"}
        onClick={() => router.push("/home")}
      />
      <NavItem
        icon={<Search className="size-[18px]" />}
        label="Buscar"
        active={false}
        onClick={() => useUiStore.getState().setPaletteOpen(true)}
      />
      <NavItem
        icon={<FilePlus className="size-[18px]" />}
        label="Nova nota"
        active={false}
        onClick={() => void createNote()}
      />
    </nav>
  );
}

/** Drag handle that lets the sidebar be sized to taste. */
function SidebarResizer() {
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      // Coalesce to one update per frame: the store drives a layout-affecting
      // width and pointermove can fire far more often than that.
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
      aria-label="Redimensionar barra lateral"
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
      {/* Widened hit area without widening the visible hairline. */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5 block" />
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-1.5 text-[11.5px] text-[var(--accent)]">
      Modo convidado: os dados desta sessão ficam no navegador. Entre com uma
      conta para sincronizar no Firebase (projeto <code className="font-mono">synapsysnote</code>).
      <span className="ml-1 text-faint">{isMac() ? "⌘," : "Ctrl ,"} abre as preferências.</span>
    </div>
  );
}
