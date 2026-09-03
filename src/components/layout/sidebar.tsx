"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, isMac } from "@/lib/utils";
import { useWorkspace, type PageTreeNode } from "@/lib/data/provider";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { SynapsysMark, SynapsysWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Kbd, Tooltip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

/**
 * ETAPA 6 — Collapsible sidebar with the infinite page tree, notebooks,
 * favorites, global tags and workspace-level entry points.
 */
export function Sidebar({
  collapsed,
  onToggle,
  onOpenPalette,
  onOpenImport,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
  onOpenImport: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { notebooks, livePages, databases, tags, trashedPages, treeFor, adapter } = useWorkspace();

  const [openNotebooks, setOpenNotebooks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(notebooks.map((n) => [n.id, true]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const favorites = useMemo(() => livePages.filter((p) => p.favorite), [livePages]);
  const orphanPages = useMemo(
    () => treeFor(null).filter((node) => !node.page.notebookId),
    [treeFor]
  );

  const createPage = async (notebookId: string | null) => {
    const page = await adapter.createPage({ notebookId, title: "Sem título" });
    router.push(`/app/p/${page.id}`);
  };

  const createNotebook = async () => {
    const notebook = await adapter.createNotebook({ name: "Novo caderno" });
    setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: true }));
    toast.success("Caderno criado");
  };

  const renderTree = (nodes: PageTreeNode[]) =>
    nodes.map((node) => {
      const isOpen = expanded[node.page.id] ?? node.depth < 1;
      const active = pathname === `/app/p/${node.page.id}`;
      return (
        <div key={node.page.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 transition-colors",
              active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
            )}
            style={{ paddingLeft: `${node.depth * 12}px` }}
          >
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [node.page.id]: !isOpen }))}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded text-faint transition hover:text-ink",
                !node.children.length && "invisible"
              )}
            >
              <ChevronRight className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
            </button>
            <Link
              href={`/app/p/${node.page.id}`}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[12.5px]",
                active ? "font-medium text-ink" : "text-muted group-hover:text-ink"
              )}
            >
              <span className="w-4 shrink-0 text-center text-[12px]">{node.page.icon ?? "📄"}</span>
              <span className="truncate">{node.page.title || "Sem título"}</span>
            </Link>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
                  aria-label="Ações da página"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem
                  onSelect={async () => {
                    const child = await adapter.createPage({
                      parentPageId: node.page.id,
                      notebookId: node.page.notebookId,
                      title: "Sem título",
                    });
                    setExpanded((prev) => ({ ...prev, [node.page.id]: true }));
                    router.push(`/app/p/${child.id}`);
                  }}
                >
                  <Plus /> Nova subpágina
                </MenuItem>
                <MenuItem
                  onSelect={() => adapter.updatePage(node.page.id, { favorite: !node.page.favorite })}
                >
                  <Star /> {node.page.favorite ? "Remover dos favoritos" : "Favoritar"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onSelect={async () => {
                    await adapter.trashPage(node.page.id);
                    toast.success("Movida para a lixeira", {
                      action: {
                        label: "Desfazer",
                        onClick: () => adapter.restorePage(node.page.id),
                      },
                    });
                    if (active) router.push("/app");
                  }}
                >
                  <Trash2 /> Mover para lixeira
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
          <AnimatePresence initial={false}>
            {isOpen && node.children.length ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {renderTree(node.children)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      );
    });

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface)] py-3">
        <button onClick={onToggle} className="rounded-lg p-1.5 hover:bg-[var(--surface-hover)]" aria-label="Expandir">
          <SynapsysMark size={26} />
        </button>
        <Tooltip label="Buscar" shortcut={isMac() ? "⌘K" : "Ctrl K"} side="right">
          <Button variant="ghost" size="icon" onClick={onOpenPalette}>
            <span className="text-[13px] font-medium">K</span>
          </Button>
        </Tooltip>
        <Tooltip label="Nova página" side="right">
          <Button variant="ghost" size="icon" onClick={() => createPage(null)}>
            <Plus />
          </Button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Workspace switcher */}
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Menu>
          <MenuTrigger asChild>
            <button className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 transition hover:bg-[var(--surface-hover)]">
              <SynapsysWordmark size={34} />
              <ChevronDown className="size-3.5 shrink-0 text-faint" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="min-w-[230px]">
            <div className="px-2 py-1.5">
              <p className="truncate text-[12.5px] font-medium text-ink">{user?.displayName}</p>
              <p className="truncate text-[11px] text-muted">{user?.email}</p>
            </div>
            <MenuSeparator />
            <MenuItem onSelect={() => router.push("/app/integrations")}>
              Integrações
            </MenuItem>
            <MenuItem onSelect={toggle}>
              Tema {theme === "dark" ? "claro" : "escuro"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                await signOut();
                router.push("/");
              }}
            >
              Sair
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip label="Recolher barra lateral" side="right">
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Recolher">
            <ChevronRight className="rotate-180" />
          </Button>
        </Tooltip>
      </div>

      {/* Primary actions */}
      <div className="space-y-0.5 px-2">
        <button
          onClick={onOpenPalette}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          Buscar
          <Kbd className="ml-auto">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <Link
          href="/app"
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
            pathname === "/app" ? "font-medium text-ink" : "text-muted hover:text-ink"
          )}
        >
          Início
        </Link>
        <button
          onClick={onOpenImport}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          Importar do Notion
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {favorites.length ? (
          <Section title="Favoritos">
            {favorites.map((page) => (
              <Link
                key={page.id}
                href={`/app/p/${page.id}`}
                className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1 text-[12.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                <span className="w-4 text-center text-[12px]">{page.icon ?? "⭐"}</span>
                <span className="truncate">{page.title}</span>
              </Link>
            ))}
          </Section>
        ) : null}

        <Section
          title="Cadernos"
          action={
            <Tooltip label="Novo caderno">
              <button
                onClick={createNotebook}
                className="rounded p-0.5 text-faint transition hover:text-ink"
                aria-label="Novo caderno"
              >
                <Plus className="size-3.5" />
              </button>
            </Tooltip>
          }
        >
          {notebooks.map((notebook) => {
            const open = openNotebooks[notebook.id] ?? true;
            const tree = treeFor(notebook.id);
            const dbs = databases.filter((d) => d.notebookId === notebook.id && !d.deletedAt);
            return (
              <div key={notebook.id}>
                <div className="group flex items-center gap-1 rounded-[var(--radius-xs)] pr-1 hover:bg-[var(--surface-hover)]">
                  <button
                    onClick={() =>
                      setOpenNotebooks((prev) => ({ ...prev, [notebook.id]: !open }))
                    }
                    className="flex flex-1 items-center gap-1.5 py-1 pl-1 text-left"
                  >
                    <ChevronRight
                      className={cn("size-3 shrink-0 text-faint transition-transform", open && "rotate-90")}
                    />
                    <span className="text-[12px]">{notebook.emoji ?? "📓"}</span>
                    <span className="truncate text-[12.5px] font-medium text-ink">{notebook.name}</span>
                    <span className="ml-auto text-[10.5px] text-faint">{tree.length + dbs.length}</span>
                  </button>
                  <Tooltip label="Nova página">
                    <button
                      onClick={() => createPage(notebook.id)}
                      className="rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
                      aria-label="Nova página"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </Tooltip>
                </div>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden pl-2"
                    >
                      {renderTree(tree)}
                      {dbs.map((database) => (
                        <Link
                          key={database.id}
                          href={`/app/db/${database.id}`}
                          className={cn(
                            "flex items-center gap-1.5 rounded-[var(--radius-xs)] py-1 pl-5 pr-2 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
                            pathname === `/app/db/${database.id}`
                              ? "font-medium text-ink"
                              : "text-muted hover:text-ink"
                          )}
                        >
                          <span className="truncate">{database.name}</span>
                        </Link>
                      ))}
                      {!tree.length && !dbs.length ? (
                        <p className="px-6 py-1 text-[11.5px] text-faint">Vazio</p>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </Section>

        {orphanPages.length ? (
          <Section title="Sem caderno">{renderTree(orphanPages)}</Section>
        ) : null}

        {tags.length ? (
          <Section title="Tags">
            <div className="flex flex-wrap gap-1 px-1.5 pt-1">
              {tags.slice(0, 12).map((tag) => (
                <Link
                  key={tag.name}
                  href={`/app/tag/${encodeURIComponent(tag.name)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted transition hover:border-[var(--accent)] hover:text-ink"
                >
                  {tag.name}
                  <span className="text-faint">{tag.count}</span>
                </Link>
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      <div className="border-t border-[var(--border)] px-2 py-2">
        <Link
          href="/app/trash"
          className={cn(
            "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
            pathname === "/app/trash" ? "font-medium text-ink" : "text-muted hover:text-ink"
          )}
        >
          Lixeira
          {trashedPages.length ? (
            <span className="ml-auto text-[10.5px] text-faint">{trashedPages.length}</span>
          ) : null}
        </Link>
        <Link
          href="/app/integrations"
          className={cn(
            "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--surface-hover)]",
            pathname === "/app/integrations" ? "font-medium text-ink" : "text-muted hover:text-ink"
          )}
        >
          Integrações
        </Link>
      </div>
    </aside>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">{title}</p>
        {action}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}
