"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/lib/data/provider";
import { notebookAncestors } from "@/lib/data/notebook-tree";
import { useNavArrows } from "@/hooks/use-workspace-nav-history";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Notebook, Page } from "@/types/models";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useUiStore } from "@/lib/store/ui-store";

/**
 * Clickable trail for a notebook or a note: every ancestor caderno and
 * ancestor page is a link so the header can walk the hierarchy.
 */
export function WorkspaceCrumbs({
  notebook,
  page,
  inverted,
}: {
  notebook?: Notebook | null;
  page?: Page | null;
  inverted?: boolean;
}) {
  const { notebooks, pages } = useWorkspace();
  const { canBack, canForward, goBack, goForward } = useNavArrows();

  const notebookTrail = notebook ? notebookAncestors(notebooks, notebook.id) : [];
  // On a notebook page the last ancestor is the current caderno — it is shown
  // as `currentLabel`, not as a second crumb. On a note every caderno is a link.
  const linkedNotebooks = page ? notebookTrail : notebookTrail.slice(0, -1);
  const pageTrail = page
    ? page.path
        .map((ancestorId) => pages.find((candidate) => candidate.id === ancestorId))
        .filter(Boolean) as Page[]
    : [];

  const muted = inverted ? "text-white/85" : "text-muted";
  const hover = inverted ? "hover:text-white" : "hover:text-ink";
  const current = inverted ? "text-white" : "text-ink";
  const slash = inverted ? "text-white/50" : "text-faint";

  type Crumb =
    | { kind: "notebook"; item: Notebook; href: string }
    | { kind: "page"; item: Page; href: string };

  const crumbs: Crumb[] = [
    ...linkedNotebooks.map((item) => ({
      kind: "notebook" as const,
      item,
      href: `/home/n/${item.id}`,
    })),
    ...pageTrail.map((item) => ({
      kind: "page" as const,
      item,
      href: `/home/p/${item.id}`,
    })),
  ];

  const currentLabel = page
    ? page.title || "Sem título"
    : notebook
      ? notebook.name
      : null;

  if (!crumbs.length && !currentLabel) return null;

  const arrowClass = inverted
    ? "text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30"
    : undefined;

  return (
    <nav
      aria-label="Caminho"
      className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-[12px]", muted)}
    >
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label="Abrir menu"
          className={cn(
            "group mr-1.5 flex size-7.5 items-center justify-center rounded-lg border border-[var(--border)]/80 bg-[var(--surface-2)]/80 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:bg-[var(--surface-3)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 md:hidden",
            arrowClass,
            inverted && "border-white/20 bg-white/10 text-white shadow-none hover:bg-white/20"
          )}
          onClick={() => useUiStore.getState().setMobileSidebarOpen(true)}
        >
          <span className="flex flex-col items-start justify-center gap-[3px]">
            <span className="h-[1.5px] w-3.5 rounded-full bg-current transition-all duration-200 group-hover:w-4" />
            <span className="h-[1.5px] w-2 rounded-full bg-current transition-all duration-200 group-hover:w-3" />
            <span className="h-[1.5px] w-3 rounded-full bg-current transition-all duration-200 group-hover:w-3.5" />
          </span>
        </button>
        <Tooltip label="Voltar">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canBack}
            aria-label="Voltar"
            className={arrowClass}
            onClick={goBack}
          >
            <ChevronLeft />
          </Button>
        </Tooltip>
        <Tooltip label="Avançar">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canForward}
            aria-label="Avançar"
            className={arrowClass}
            onClick={goForward}
          >
            <ChevronRight />
          </Button>
        </Tooltip>
      </div>

      {/* Em telas sm+ exibe o trail completo de crumbs */}
      {crumbs.map((crumb, index) => {
        const label = crumb.kind === "notebook" ? crumb.item.name : crumb.item.title || "Sem título";
        const icon =
          crumb.kind === "notebook"
            ? crumb.item.emoji
            : crumb.item.icon;
        const fallback = crumb.kind === "notebook" ? "📓" : "📄";
        return (
          <span
            key={`${crumb.kind}-${crumb.item.id}`}
            className="hidden min-w-0 items-center gap-1.5 sm:flex"
          >
            {index > 0 ? <span className={slash}>/</span> : null}
            <Link
              href={crumb.href}
              className={cn("flex min-w-0 items-center gap-1 truncate", hover)}
            >
              {index === 0 ? <WorkspaceIcon icon={icon} fallback={fallback} size={13} /> : null}
              <span className="truncate">{label}</span>
            </Link>
          </span>
        );
      })}

      {currentLabel ? (
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Separador só aparece no sm+ junto com os crumbs intermediários */}
          {crumbs.length ? <span className={cn(slash, "hidden sm:inline")}>/</span> : null}
          {notebook && !page ? (
            <WorkspaceIcon icon={notebook.emoji} fallback="📓" size={13} />
          ) : null}
          {page ? <WorkspaceIcon icon={page.icon} fallback="📄" size={13} /> : null}
          <span className={cn("truncate", current)}>{currentLabel}</span>
        </span>
      ) : null}
    </nav>
  );
}
