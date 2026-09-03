"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Menu as MenuIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/lib/data/provider";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { ImportWizard } from "@/components/notion/import-wizard";
import { Button } from "@/components/ui/button";
import { SynapsysWordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Application chrome: sidebar, palette, import wizard and global shortcuts.
 * Mobile gets an overlay sidebar; desktop keeps it docked and collapsible.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { mode, activeImportJob, adapter } = useWorkspace();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, router, user]);

  const onKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (meta && event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        const page = await adapter.createPage({ title: "Sem título" });
        router.push(`/app/p/${page.id}`);
      }
      if (meta && event.key === "\\") {
        event.preventDefault();
        setCollapsed((prev) => !prev);
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

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--canvas)]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenImport={() => setImportOpen(true)}
        />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-60 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[268px]" onClick={() => setMobileOpen(false)}>
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onOpenPalette={() => {
                setMobileOpen(false);
                setPaletteOpen(true);
              }}
              onOpenImport={() => {
                setMobileOpen(false);
                setImportOpen(true);
              }}
            />
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <MenuIcon />
          </Button>
          <SynapsysWordmark size={28} />
        </div>

        {mode === "local" ? <DemoBanner /> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {activeImportJob ? (
          <button
            onClick={() => setImportOpen(true)}
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenImport={() => setImportOpen(true)}
      />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-1.5 text-[11.5px] text-[var(--accent)]">
      Modo demonstração local: os dados ficam no seu navegador. Configure
      <code className="mx-1 font-mono">NEXT_PUBLIC_FIREBASE_*</code>
      e o Firebase Admin para Auth, Firestore, Storage e a importação real do Notion.
    </div>
  );
}
