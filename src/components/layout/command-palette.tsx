"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { toast } from "sonner";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/data/provider";
import { useTheme } from "@/components/theme-provider";
import { useUiStore } from "@/lib/store/ui-store";
import { useStudy } from "@/lib/study/provider";
import { useStudyT } from "@/lib/study/i18n";
import { openBlankTimer, useStudyUi } from "@/lib/study/ui-store";
import { searchWorkspace } from "@/lib/search";
import { Kbd } from "@/components/ui/primitives";
import { cn, isMac } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useTranslation } from "@/lib/i18n/translations";
import { resolveNoteCreationTarget, expandContainerInSession } from "@/lib/data/page-tree";
import { isNestedNotebook } from "@/lib/data/notebook-tree";
import type { Notebook } from "@/types/models";
import { OPEN_GATE, useGoalGates, usePlanGates } from "@/lib/plans/gates";
import { notifyPlanError } from "@/lib/plans/client";
import { PlanLockBadge } from "@/components/plans/plan-lock";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { livePages, databases, notebooks, adapter } = useWorkspace();
  const currentPageId = pathname.startsWith("/home/p/") ? pathname.slice("/home/p/".length) : null;
  const currentNotebookId = pathname.startsWith("/home/n/") ? pathname.slice("/home/n/".length) : null;
  const currentNotebook = currentNotebookId
    ? notebooks.find((notebook) => notebook.id === currentNotebookId)
    : null;
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onOpenChange]);

  const { st } = useStudyT();
  const { focusPlan, planReadOnly } = useStudy();
  const gates = usePlanGates();
  const goalGates = useGoalGates();
  const browsingArchived = planReadOnly && !gates.readOnly;
  const noteTarget = gates.noteTarget(resolveNoteCreationTarget(pathname, livePages, databases));
  const newNoteGate = gates.newPage(noteTarget);
  const newRootGate = gates.newNotebook(null);
  const duplicatePageGate = open && currentPageId ? gates.duplicatePage(currentPageId) : OPEN_GATE;
  const duplicateNotebookGate = open && currentNotebookId ? gates.duplicateNotebook(currentNotebookId) : OPEN_GATE;
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const hits = useMemo(
    () => searchWorkspace(query, livePages, notebooks, 16),
    [livePages, notebooks, query]
  );

  const notebookHits = useMemo(
    () => hits.filter((h) => h.kind === "notebook"),
    [hits]
  );

  const pageHits = useMemo(
    () => hits.filter((h) => h.kind === "page"),
    [hits]
  );

  const notebookMap = useMemo(
    () => new Map(notebooks.map((n) => [n.id, n])),
    [notebooks]
  );

  const pageMap = useMemo(
    () => new Map(livePages.map((p) => [p.id, p])),
    [livePages]
  );

  const [recentNotebookIds, setRecentNotebookIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem("synapsys.recent_notebooks");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentNotebookIds(parsed);
        }
      }
    } catch {}
  }, [open]);

  const recordRecentNotebook = (id: string) => {
    try {
      const stored = localStorage.getItem("synapsys.recent_notebooks");
      const currentList: string[] = stored ? JSON.parse(stored) : [];
      const updated = [id, ...currentList.filter((item) => item !== id)].slice(0, 10);
      setRecentNotebookIds(updated);
      localStorage.setItem("synapsys.recent_notebooks", JSON.stringify(updated));
    } catch {}
  };

  useEffect(() => {
    if (currentNotebookId) {
      recordRecentNotebook(currentNotebookId);
    }
  }, [currentNotebookId]);

  const recentNotebooks = useMemo(() => {
    const fromRecentIds = recentNotebookIds
      .map((id) => notebookMap.get(id))
      .filter((nb): nb is Notebook => Boolean(nb));
    const recentSet = new Set(fromRecentIds.map((nb) => nb.id));
    const remaining = [...notebooks]
      .filter((nb) => !recentSet.has(nb.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return [...fromRecentIds, ...remaining].slice(0, 6);
  }, [notebooks, notebookMap, recentNotebookIds]);

  const recents = useMemo(
    () => [...livePages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [livePages]
  );

  const go = (href: string) => {
    onOpenChange(false);
    if (href.startsWith("/home/n/")) {
      const id = href.slice("/home/n/".length);
      recordRecentNotebook(id);
    }
    if (href.startsWith("/home/p/")) {
      useUiStore.getState().closeMenu();
    }
    router.push(href);
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
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenChange(false);
                }
              }}
              className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]"
            >
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenChange(false);
                    }
                  }}
                  placeholder={t("search_placeholder")}
                  className="h-12 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label={t("close")}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                >
                  <Kbd>esc</Kbd>
                </button>
              </div>

              <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-[12.5px] text-muted">
                  {t("nothing_found")} “{query}”.
                </Command.Empty>

                {query && notebookHits.length ? (
                  <Command.Group heading={<GroupLabel>{t("pages_and_notebooks")}</GroupLabel>}>
                    {notebookHits.map((hit) => {
                      const nb = notebookMap.get(hit.id);
                      const isNested = nb ? isNestedNotebook(nb) : false;
                      const typeLabel = isNested ? t("notebook_count_singular") : t("page_singular");
                      const subtitle = hit.snippet || typeLabel;
                      return (
                        <Command.Item
                          key={`hit-notebook-${hit.id}`}
                          value={`hit-notebook-${hit.id}`}
                          onSelect={() => go(`/home/n/${hit.id}`)}
                          className={itemClass}
                        >
                          <WorkspaceIcon icon={hit.icon ?? undefined} fallback={isNested ? "📁" : "📓"} size={14} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">{hit.title}</span>
                            <span className="block truncate text-[11.5px] text-muted capitalize">{subtitle}</span>
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ) : null}

                {query && pageHits.length ? (
                  <Command.Group heading={<GroupLabel>{t("notes")}</GroupLabel>}>
                    {pageHits.map((hit) => {
                      const parentPage = hit.parentPageId ? pageMap.get(hit.parentPageId) : null;
                      const parentNotebook = (hit.notebookId ? notebookMap.get(hit.notebookId) : null) ?? (parentPage?.notebookId ? notebookMap.get(parentPage.notebookId) : null);
                      return (
                        <Command.Item
                          key={`hit-page-${hit.id}`}
                          value={`hit-page-${hit.id}`}
                          onSelect={() => go(`/home/p/${hit.id}`)}
                          className={itemClass}
                        >
                          <WorkspaceIcon icon={hit.icon ?? undefined} fallback="📄" size={14} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] text-ink">{hit.title}</span>
                              {(parentNotebook || parentPage) ? (
                                <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
                                  {parentNotebook ? (
                                    <span className="max-w-[120px] truncate rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                                      {parentNotebook.name}
                                    </span>
                                  ) : null}
                                  {parentNotebook && parentPage ? (
                                    <span className="text-[9px] text-faint">/</span>
                                  ) : null}
                                  {parentPage ? (
                                    <span className="max-w-[130px] truncate rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                                      {parentPage.title || t("untitled")}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {hit.snippet ? (
                              <span className="block truncate text-[11.5px] text-muted">{hit.snippet}</span>
                            ) : null}
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ) : null}

                {!query ? (
                  <>
                    {recentNotebooks.length ? (
                      <Command.Group heading={<GroupLabel>{t("pages_and_notebooks")}</GroupLabel>}>
                        {recentNotebooks.map((notebook) => {
                          const isNested = isNestedNotebook(notebook);
                          const typeLabel = isNested ? t("notebook_count_singular") : t("page_singular");
                          return (
                            <Command.Item
                              key={notebook.id}
                              value={`notebook-${notebook.id}`}
                              onSelect={() => go(`/home/n/${notebook.id}`)}
                              className={itemClass}
                            >
                              <WorkspaceIcon icon={notebook.emoji} fallback={isNested ? "📁" : "📓"} size={14} />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] text-ink">
                                  {notebook.name}
                                </span>
                                <span className="block truncate text-[11.5px] text-muted capitalize">
                                  {notebook.description || typeLabel}
                                </span>
                              </div>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    ) : null}

                    <Command.Group heading={<GroupLabel>{t("recently_edited_notes")}</GroupLabel>}>
                      {recents.map((page) => (
                        <Command.Item
                          key={page.id}
                          value={`recent-${page.id}`}
                          onSelect={() => go(`/home/p/${page.id}`)}
                          className={itemClass}
                        >
                          <WorkspaceIcon icon={page.icon} fallback="📄" size={14} />
                          <span className="flex-1 truncate text-[13px] text-ink">{page.title || t("untitled")}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>

                    <Command.Group heading={<GroupLabel>{t("more_actions")}</GroupLabel>}>
                      {currentPageId ? (
                        <Command.Item
                          value="duplicate-note"
                          className={itemClass}
                          disabled={!duplicatePageGate.allowed}
                          onSelect={async () => {
                            try {
                              const copy = await adapter.duplicatePage(currentPageId);
                              toast.success(t("note_duplicated"));
                              go(`/home/p/${copy.id}`);
                            } catch (error) {
                              if (!notifyPlanError(error)) toast.error(t("could_not_duplicate"));
                            }
                          }}
                        >
                          <span className="flex-1 text-[13px] text-ink">{t("duplicate_note")}</span>
                          <PlanLockBadge gate={duplicatePageGate} className="ml-0" />
                        </Command.Item>
                      ) : null}
                      {currentNotebookId ? (
                        <Command.Item
                          value="duplicate-notebook"
                          className={itemClass}
                          disabled={!duplicateNotebookGate.allowed}
                          onSelect={async () => {
                            try {
                              const copy = await adapter.duplicateNotebook(currentNotebookId);
                              toast.success(t("notebook_duplicated"));
                              go(`/home/n/${copy.id}`);
                            } catch (error) {
                              if (!notifyPlanError(error)) toast.error(t("could_not_duplicate"));
                            }
                          }}
                        >
                          <span className="flex-1 text-[13px] text-ink">
                            {t("duplicate_notebook")}
                          </span>
                          <PlanLockBadge gate={duplicateNotebookGate} className="ml-0" />
                        </Command.Item>
                      ) : null}
                      <Command.Item
                        value="new-page"
                        className={itemClass}
                        disabled={!newNoteGate.allowed}
                        onSelect={async () => {
                          const target = noteTarget;
                          const page = await adapter.createPage({
                            notebookId: target.notebookId,
                            parentPageId: target.parentPageId,
                            title: t("untitled"),
                          });
                          expandContainerInSession(target);
                          go(`/home/p/${page.id}`);
                        }}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("new_note")}</span>
                        <PlanLockBadge gate={newNoteGate} className="ml-0" />
                        <Kbd>{isMac() ? "⌥N" : "Alt N"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="new-notebook"
                        className={itemClass}
                        disabled={!newRootGate.allowed}
                        onSelect={async () => {
                          const notebook = await adapter.createNotebook({ name: t("new_page") });
                          go(`/home/n/${notebook.id}`);
                        }}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("new_page")}</span>
                        <PlanLockBadge gate={newRootGate} className="ml-0" />
                        <Kbd>{isMac() ? "⌥⇧N" : "Alt ⇧ N"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="planning"
                        className={itemClass}
                        onSelect={() => go("/home/study/schedule")}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("planning")}</span>
                      </Command.Item>
                      <Command.Item
                        value="all-notes"
                        className={itemClass}
                        onSelect={() => go("/home/notes")}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("all_notes")}</span>
                      </Command.Item>
                      <Command.Item
                        value="zen-mode"
                        className={itemClass}
                        onSelect={() => run(() => useUiStore.getState().toggleZenMode())}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("focus_mode")}</span>
                        <Kbd>{isMac() ? "⌘⇧F" : "Ctrl ⇧ F"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="integrations"
                        className={itemClass}
                        onSelect={() => run(() => router.push("/home/integrations"))}
                      >
                        <span className="flex-1 text-[13px] text-ink">
                          {t("integrations_nav")}
                        </span>
                      </Command.Item>
                      <Command.Item
                        value="preferences"
                        className={itemClass}
                        onSelect={() => run(() => useUiStore.getState().setPreferencesOpen(true))}
                      >
                        <span className="flex-1 text-[13px] text-ink">{t("preferences")}</span>
                        <Kbd>{isMac() ? "⌘," : "Ctrl ,"}</Kbd>
                      </Command.Item>
                      <Command.Item
                        value="toggle-theme"
                        className={itemClass}
                        onSelect={() => run(toggle)}
                      >
                        <span className="flex-1 text-[13px] text-ink">
                          {t("theme")}: {theme === "dark" ? t("light") : t("dark")}
                        </span>
                      </Command.Item>
                      <Command.Item value="trash" className={itemClass} onSelect={() => go("/home/trash")}>
                        <span className="flex-1 text-[13px] text-ink">{t("trash")}</span>
                      </Command.Item>
                    </Command.Group>
                    <Command.Group heading={<GroupLabel>{st("cmd_group")}</GroupLabel>}>
                      {focusPlan && !browsingArchived ? (
                        <Command.Item
                          value="study-log-session"
                          className={itemClass}
                          disabled={!gates.write.allowed}
                          onSelect={() => run(() => useStudyUi.getState().openLog())}
                        >
                          <span className="flex-1 text-[13px] text-ink">{st("cmd_log_session")}</span>
                          <PlanLockBadge gate={gates.write} className="ml-0" />
                        </Command.Item>
                      ) : null}
                      {browsingArchived ? null : (
                        <Command.Item
                          value="study-focus"
                          className={itemClass}
                          disabled={!gates.write.allowed}
                          onSelect={() => run(openBlankTimer)}
                        >
                          <span className="flex-1 text-[13px] text-ink">{st("cmd_start_focus")}</span>
                          <PlanLockBadge gate={gates.write} className="ml-0" />
                        </Command.Item>
                      )}
                      <Command.Item value="study-overview" className={itemClass} onSelect={() => go("/home/study")}>
                        <span className="flex-1 text-[13px] text-ink">{st("cmd_open_study")}</span>
                      </Command.Item>
                      <Command.Item value="study-reviews" className={itemClass} onSelect={() => go("/home/study/reviews")}>
                        <span className="flex-1 text-[13px] text-ink">{st("cmd_reviews")}</span>
                      </Command.Item>
                      <Command.Item
                        value="study-new-goal"
                        className={itemClass}
                        disabled={!goalGates.newGoal.allowed}
                        onSelect={() => go("/home/study/goals/new")}
                      >
                        <span className="flex-1 text-[13px] text-ink">{st("cmd_new_goal")}</span>
                        <PlanLockBadge gate={goalGates.newGoal} className="ml-0" />
                      </Command.Item>
                      <Command.Item
                        value="study-scratchpad"
                        className={itemClass}
                        onSelect={() => run(() => useStudyUi.getState().setPadOpen(true))}
                      >
                        <span className="flex-1 text-[13px] text-ink">{st("cmd_scratchpad")}</span>
                      </Command.Item>
                    </Command.Group>
                  </>
                ) : null}
              </Command.List>

              <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2 text-[11px] text-faint">
                <span className="flex items-center gap-1.5">
                  {t("search_placeholder")}
                </span>
                <span className="flex items-center gap-2">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <Kbd>↵</Kbd>
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
  "data-[selected=true]:bg-[var(--surface-hover)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
);

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
      {children}
    </span>
  );
}
