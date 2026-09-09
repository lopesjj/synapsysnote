"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, FilePlus, FolderPlus, Star } from "lucide-react";
import { useWorkspace } from "@/lib/data/provider";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { cn, formatRelative, truncate } from "@/lib/utils";
import { WorkspaceIcon, isIconUrl } from "@/lib/icons/workspace-icon";
import { coverPresetById } from "@/lib/covers/presets";
import { notebookSubtreeIds } from "@/lib/data/notebook-tree";
import { NOTEBOOK_COPY } from "@/lib/data/notebook-copy";
import { useUiStore } from "@/lib/store/ui-store";
import type { Notebook, Page } from "@/types/models";

function greetingForHour(hour: number) {
  if (hour < 5) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function titleWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHomeDate(date: Date) {
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = date.toLocaleDateString("pt-BR", { day: "numeric" });
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${titleWord(weekday)}, ${day} de ${titleWord(month)}`;
}

function noteCountLabel(count: number) {
  return count === 1 ? "1 nota" : `${count} notas`;
}

function pageCountLabel(count: number) {
  return count === 1 ? "1 página" : `${count} páginas`;
}

function CoverStrip({
  coverUrl,
  className,
}: {
  coverUrl?: string | null;
  className?: string;
}) {
  const preset = coverPresetById(coverUrl);
  if (!coverUrl) {
    return (
      <div
        className={cn(
          "bg-[var(--surface-2)] bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface-2)]",
          className
        )}
      />
    );
  }
  if (preset) {
    return <div className={cn(className, preset.className)} style={preset.style} />;
  }
  return (
    <img src={coverUrl} alt="" className={cn("object-cover", className)} />
  );
}

export default function WorkspaceHome() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    livePages,
    databases,
    adapter,
    notebooks,
    notebookById,
    rootNotebooks,
    ready,
  } = useWorkspace();

  const recent = useMemo(
    () => [...livePages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [livePages]
  );

  const favorites = useMemo(
    () => livePages.filter((page) => page.favorite).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [livePages]
  );

  const importedCount = useMemo(
    () => livePages.filter((page) => page.notionPageId || page.importSource).length,
    [livePages]
  );

  const firstName = user?.displayName?.split(" ")[0] ?? "você";
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const today = formatHomeDate(new Date());

  const createNote = async () => {
    const page = await adapter.createPage({ title: "Sem título" });
    useUiStore.getState().closeMenu();
    router.push(`/home/p/${page.id}`);
  };

  const createRootPage = async () => {
    const notebook = await adapter.createNotebook({ name: NOTEBOOK_COPY.newRootName });
    router.push(`/home/n/${notebook.id}`);
  };

  const openPlanning = async () => {
    const existing = databases.find(
      (database) => !database.deletedAt && database.name === "Planejamento"
    );
    if (existing) {
      router.push(`/home/db/${existing.id}`);
      return;
    }
    const database = await adapter.createDatabase({ name: "Planejamento" });
    router.push(`/home/db/${database.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="lux-gradient panel relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[var(--accent-soft)] blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">{today}</p>
            <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.03em] text-ink sm:text-[34px]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
              <span>{noteCountLabel(livePages.length)}</span>
              <span className="text-faint">·</span>
              <span>{pageCountLabel(rootNotebooks.length)}</span>
              {importedCount ? (
                <>
                  <span className="text-faint">·</span>
                  <span>{importedCount} do Notion</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="secondary" size="sm" className="sm:w-auto" onClick={() => void openPlanning()}>
              Planejamento
            </Button>
            <Button variant="secondary" size="sm" className="sm:w-auto" onClick={() => void createRootPage()}>
              <FolderPlus />
              Nova página
            </Button>
            <Button variant="primary" size="sm" className="sm:w-auto" onClick={() => void createNote()}>
              <FilePlus />
              Nova nota
            </Button>
          </div>
        </div>
      </motion.section>

      {rootNotebooks.length ? (
        <section className="mt-9">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">Páginas</h2>
              <p className="mt-0.5 text-[12px] text-muted">Seus espaços de trabalho</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rootNotebooks.map((notebook, index) => (
              <motion.div
                key={notebook.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.04 + index * 0.03 }}
              >
                <PageCard notebook={notebook} notebooks={notebooks} livePages={livePages} />
              </motion.div>
            ))}
          </div>
        </section>
      ) : !ready ? (
        <section className="mt-9">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="space-y-1.5">
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-3 w-36 animate-pulse rounded bg-[var(--surface-2)]" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="h-28 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" />
            <div className="h-28 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" />
            <div className="h-28 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" />
          </div>
        </section>
      ) : null}

      <div
        className={cn(
          "mt-10 grid grid-cols-1 gap-8",
          favorites.length && "lg:grid-cols-[minmax(0,1fr)_17.5rem]"
        )}
      >
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Continue de onde parou
              </h2>
              <p className="mt-0.5 text-[12px] text-muted">Notas editadas recentemente</p>
            </div>
            {recent.length ? (
              <Link
                href="/home/notes"
                prefetch={true}
                className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[var(--accent)] hover:underline"
              >
                Ver todas
                <ArrowUpRight className="size-3.5" />
              </Link>
            ) : null}
          </div>

          {recent.length ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {recent.map((page) => (
                <NoteCard key={page.id} page={page} notebook={notebookById(page.notebookId ?? "")} />
              ))}
            </div>
          ) : !ready ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" />
              <div className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" />
            </div>
          ) : (
            <EmptyState
              title="Seu workspace está vazio"
              description="Crie a primeira nota ou uma página para organizar o que vem do Notion."
              action={
                <Button variant="primary" onClick={() => void createNote()}>
                  <FilePlus />
                  Criar nota
                </Button>
              }
            />
          )}
        </section>

        {favorites.length ? (
          <aside className="border-t border-[var(--border)] pt-6 lg:border-t-0 lg:pt-0">
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Favoritos</h2>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
              {favorites.map((page) => (
                <Link
                  key={page.id}
                  href={`/home/p/${page.id}`}
                  prefetch={true}
                  onClick={() => useUiStore.getState().closeMenu()}
                  className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 transition hover:bg-[var(--surface-hover)]"
                >
                  <WorkspaceIcon icon={page.icon} fallback="📄" size={16} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {page.title || "Sem título"}
                  </span>
                  <Star className="size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                </Link>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PageCard({
  notebook,
  notebooks,
  livePages,
}: {
  notebook: Notebook;
  notebooks: Notebook[];
  livePages: Page[];
}) {
  const router = useRouter();
  const uploaded = isIconUrl(notebook.emoji ?? "");
  const subtree = notebookSubtreeIds(notebooks, notebook.id);
  const count = livePages.filter(
    (page) => page.notebookId && subtree.includes(page.notebookId)
  ).length;

  return (
    <Link
      href={`/home/n/${notebook.id}`}
      prefetch={true}
      onMouseEnter={() => router.prefetch(`/home/n/${notebook.id}`)}
      className="group block overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]/45 hover:shadow-[var(--shadow-float)]"
    >
      <CoverStrip coverUrl={notebook.coverUrl} className="h-[4.5rem] w-full" />
      <div className="px-4 pb-4">
        <div
          className={cn(
            "-mt-5 inline-flex items-center justify-center rounded-[12px] ring-[3px] ring-[var(--surface)]",
            uploaded ? "bg-white shadow-sm" : "bg-[var(--surface)]"
          )}
        >
          <WorkspaceIcon
            icon={notebook.emoji}
            fallback="📓"
            size={uploaded ? 36 : 28}
            className={uploaded ? "bg-white" : undefined}
          />
        </div>
        <p className="mt-2.5 truncate text-[14px] font-semibold tracking-[-0.015em] text-ink">
          {notebook.name}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{noteCountLabel(count)}</p>
      </div>
    </Link>
  );
}

function NoteCard({ page, notebook }: { page: Page; notebook?: Notebook }) {
  const router = useRouter();
  return (
    <Link
      href={`/home/p/${page.id}`}
      prefetch={true}
      onMouseEnter={() => router.prefetch(`/home/p/${page.id}`)}
      onClick={() => useUiStore.getState().closeMenu()}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]/45 hover:shadow-[var(--shadow-panel)]"
    >
      {page.coverUrl ? (
        <CoverStrip coverUrl={page.coverUrl} className="h-14 w-full" />
      ) : null}
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start gap-2">
          <WorkspaceIcon icon={page.icon} fallback="📄" size={16} />
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
            {page.title || "Sem título"}
          </p>
          {page.favorite ? (
            <Star className="mt-0.5 size-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
          ) : null}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
          {truncate(page.plainText.replace(/\n/g, " "), 120) || "Nota vazia"}
        </p>
        <div className="mt-auto flex items-center gap-1.5 pt-2.5">
          {notebook ? (
            <>
              <span className="min-w-0 truncate text-[11px] text-faint">{notebook.name}</span>
              <span className="text-[11px] text-faint">·</span>
            </>
          ) : null}
          <span className="shrink-0 text-[11px] text-faint">{formatRelative(page.updatedAt)}</span>
          {page.notionPageId || page.importSource ? <Badge tone="accent">Notion</Badge> : null}
        </div>
      </div>
    </Link>
  );
}
