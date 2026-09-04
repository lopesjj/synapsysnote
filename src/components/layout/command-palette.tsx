"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/data/provider";
import { useTheme } from "@/components/theme-provider";
import { useUiStore } from "@/lib/store/ui-store";
import { searchWorkspace } from "@/lib/search";
import { Kbd } from "@/components/ui/primitives";
import { cn, isMac } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { isNestedNotebook } from "@/lib/data/notebook-copy";

/**
 * ETAPA 6 — Command Palette (Cmd/Ctrl + K).
 *
 * Blends actions with hybrid search results. Matches coming from OCR text or
 * from a voice-note transcript are labeled, because "why did this page match?"
 * is the first question users ask of a search that reads inside images.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { livePages, databases, notebooks, adapter } = useWorkspace();
  const currentPageId = pathname.startsWith("/app/p/") ? pathname.slice("/app/p/".length) : null;
  const currentNotebookId = pathname.startsWith("/app/n/") ? pathname.slice("/app/n/".length) : null;
  const currentNotebook = currentNotebookId
    ? notebooks.find((notebook) => notebook.id === currentNotebookId)
    : null;
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");

  /** Runs a chrome action and dismisses the palette. */
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const hits = useMemo(
    () => searchWorkspace(query, livePages, databases, 8),
    [databases, livePages, query]
  );

  const recents = useMemo(
    () => [...livePages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [livePages]
  );

  const notebookHits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return notebooks
      .filter((notebook) => notebook.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [notebooks, query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const matchLabel: Record<string, string> = {
    ocr: "OCR",
    transcript: "transcrição",
    tag: "tag",
    title: "título",
    body: "conteúdo",
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-90 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.6 }}
            className="fixed left-1/2 top-[14vh] z-100 w-[calc(100vw-2rem)] max-w-[620px] -translate-x-1/2"
          >
            <Command
              loop
              shouldFilter={false}
              className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]"
            >
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscar páginas, texto de imagens, transcrições ou executar um comando…"
                  className="h-12 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
                />
                <Kbd>esc</Kbd>
              </div>

              <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-[12.5px] text-muted">
                  Nada encontrado para “{query}”.
                </Command.Empty>

                {query && notebookHits.length ? (
                  <Command.Group heading={<GroupLabel>Páginas</GroupLabel>}>
                    {notebookHits.map((notebook) => (
                      <Command.Item
                        key={notebook.id}
                        value={`hit-notebook-${notebook.id}`}
                        onSelect={() => go(`/app/n/${notebook.id}`)}
                        className={itemClass}
                      >
                        <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={14} />
                        <span className="flex-1 truncate text-[13px] text-ink">{notebook.name}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {query && hits.length ? (
                  <Command.Group heading={<GroupLabel>Resultados</GroupLabel>}>
                    {hits.map((hit) => (
                      <Command.Item
                        key={`${hit.kind}-${hit.id}`}
                        value={`${hit.kind}-${hit.id}`}
                        onSelect={() =>
                          go(hit.kind === "page" ? `/app/p/${hit.id}` : `/app/db/${hit.id}`)
                        }
                        className={itemClass}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{hit.title}</span>
                          {hit.snippet ? (
                            <span className="block truncate text-[11.5px] text-muted">{hit.snippet}</span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {hit.matchedIn
                            .filter((m) => m === "ocr" || m === "transcript")
                            .map((m) => (
                              <span
                                key={m}
                                className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                              >
                                {matchLabel[m]}
                              </span>
                            ))}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {!query ? (
                  <>
                    {notebooks.length ? (
                      <Command.Group heading={<GroupLabel>Páginas</GroupLabel>}>
                        {notebooks.slice(0, 6).map((notebook) => (
                          <Command.Item
                            key={notebook.id}
                            value={`notebook-${notebook.id}`}
                            onSelect={() => go(`/app/n/${notebook.id}`)}
                            className={itemClass}
                          >
                            <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={14} />
                            <span className="flex-1 truncate text-[13px] text-ink">
                              {notebook.name}
                            </span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ) : null}

                    <Command.Group heading={<GroupLabel>Recentes</GroupLabel>}>
                      {recents.map((page) => (
                        <Command.Item
                          key={page.id}
                          value={`recent-${page.id}`}
                          onSelect={() => go(`/app/p/${page.id}`)}
                          className={itemClass}
                        >
                          <WorkspaceIcon icon={page.icon} fallback="📄" size={14} />
                          <span className="flex-1 truncate text-[13px] text-ink">{page.title}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>

                    <Command.Group heading={<GroupLabel>Ações</GroupLabel>}>
                      {currentPageId ? (
                        <Command.Item
                          value="duplicate-note"
                          className={itemClass}
                          onSelect={async () => {
                            try {
                              const copy = await adapter.duplicatePage(currentPageId);
                              toast.success("Nota duplicada");
                              go(`/app/p/${copy.id}`);
                            } catch {
                              toast.error("Não foi possível duplicar a nota.");
                            }
                          }}
                        >
                          <span className="flex-1 text-[13px] text-ink">Duplicar esta nota</span>
                        </Command.Item>
                      ) : null}
                      {currentNotebookId ? (
                        <Command.Item
                          value="duplicate-notebook"
                          className={itemClass}
                          onSelect={async () => {
                            try {
                              const copy = await adapter.duplicateNotebook(currentNotebookId);
                              toast.success("Duplicado");
                              go(`/app/n/${copy.id}`);
                            } catch {
                              toast.error("Não foi possível duplicar.");
                            }
                          }}
                        >
                          <span className="flex-1 text-[13px] text-ink">
                            {currentNotebook && isNestedNotebook(currentNotebook)
                              ? "Duplicar este caderno"
                              : "Duplicar esta página"}
                          </span>
                        </Command.Item>
                      ) : null}
                      <Command.Item
                        value="new-page"
                        className={itemClass}
                        onSelect={async () => {
                          const page = await adapter.createPage({ title: "Sem título" });
                          go(`/app/p/${page.id}`);
                        }}
                      >
                        <span className="flex-1 text-[13px] text-ink">Nova nota</span>
                        <Kbd>{isMac() ? "⌘N" : "Ctrl N"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="new-notebook"
                        className={itemClass}
                        onSelect={async () => {
                          const notebook = await adapter.createNotebook({ name: "Nova página" });
                          go(`/app/n/${notebook.id}`);
                        }}
                      >
                        <span className="flex-1 text-[13px] text-ink">Nova página</span>
                        <Kbd>{isMac() ? "⌘⇧N" : "Ctrl ⇧ N"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="new-database"
                        className={itemClass}
                        onSelect={async () => {
                          const database = await adapter.createDatabase({ name: "Nova base" });
                          go(`/app/db/${database.id}`);
                        }}
                      >
                        <span className="flex-1 text-[13px] text-ink">Nova base de dados</span>
                      </Command.Item>
                      <Command.Item
                        value="all-notes"
                        className={itemClass}
                        onSelect={() => go("/app/notes")}
                      >
                        <span className="flex-1 text-[13px] text-ink">Todas as notas</span>
                      </Command.Item>
                      <Command.Item
                        value="zen-mode"
                        className={itemClass}
                        onSelect={() => run(() => useUiStore.getState().toggleZenMode())}
                      >
                        <span className="flex-1 text-[13px] text-ink">Modo foco</span>
                        <Kbd>{isMac() ? "⌘⇧F" : "Ctrl ⇧ F"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="import-notion-api"
                        className={itemClass}
                        onSelect={() => run(() => useUiStore.getState().setImportOpen(true))}
                      >
                        <span className="flex-1 text-[13px] text-ink">
                          Importar do Notion (conta conectada)
                        </span>
                      </Command.Item>
                      <Command.Item
                        value="preferences"
                        className={itemClass}
                        onSelect={() => run(() => useUiStore.getState().setPreferencesOpen(true))}
                      >
                        <span className="flex-1 text-[13px] text-ink">Preferências</span>
                        <Kbd>{isMac() ? "⌘," : "Ctrl ,"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="toggle-theme"
                        className={itemClass}
                        onSelect={() => run(toggle)}
                      >
                        <span className="flex-1 text-[13px] text-ink">
                          Alternar para tema {theme === "dark" ? "claro" : "escuro"}
                        </span>
                      </Command.Item>
                      <Command.Item value="trash" className={itemClass} onSelect={() => go("/app/trash")}>
                        <span className="flex-1 text-[13px] text-ink">Abrir lixeira</span>
                      </Command.Item>
                    </Command.Group>
                  </>
                ) : null}
              </Command.List>

              <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2 text-[11px] text-faint">
                <span className="flex items-center gap-1.5">
                  Busca híbrida: texto completo + vetores
                </span>
                <span className="flex items-center gap-2">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  navegar
                  <Kbd>↵</Kbd>
                  abrir
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

const itemClass = cn(
  "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors",
  "data-[selected=true]:bg-[var(--surface-hover)]"
);

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
      {children}
    </span>
  );
}
