"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Flame,
  Folder,
  GraduationCap,
  Layers,
  Play,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Flashcard, FlashcardSettings, Notebook, Page } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { DEFAULT_FLASHCARD_SETTINGS, isCardDueForReview } from "@/lib/flashcards/srs";
import { FlashcardStudySession } from "./flashcard-study-session";
import { FlashcardsSettingsModal } from "./flashcards-settings-modal";

export function FlashcardsHub() {
  const { adapter, notebooks, pages, flashcards, dueFlashcards } = useWorkspace();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"all" | "due">("all");
  const [studyingQueue, setStudyingQueue] = useState<{ title: string; cards: Flashcard[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [userSettings, setUserSettings] = useState<FlashcardSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("synapsys.flashcardSettings");
        if (raw) return JSON.parse(raw) as FlashcardSettings;
      } catch {}
    }
    return DEFAULT_FLASHCARD_SETTINGS;
  });

  const handleSaveSettings = async (next: FlashcardSettings) => {
    setUserSettings(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("synapsys.flashcardSettings", JSON.stringify(next));
    }
  };

  const masteredCount = useMemo(
    () => flashcards.filter((c) => (c.repetition || 0) >= 3).length,
    [flashcards]
  );
  const learningCount = useMemo(
    () => flashcards.filter((c) => (c.repetition || 0) < 3).length,
    [flashcards]
  );

  const masteryPercentage = useMemo(() => {
    if (flashcards.length === 0) return 0;
    return Math.round((masteredCount / flashcards.length) * 100);
  }, [flashcards.length, masteredCount]);

  const livePagesMap = useMemo(() => {
    const map = new Map<string, Page>();
    for (const p of pages) {
      if (!p.deletedAt) map.set(p.id, p);
    }
    return map;
  }, [pages]);

  const cardsByPage = useMemo(() => {
    const map = new Map<string, Flashcard[]>();
    for (const c of flashcards) {
      if (!livePagesMap.has(c.pageId)) continue;
      if (!map.has(c.pageId)) map.set(c.pageId, []);
      map.get(c.pageId)!.push(c);
    }
    return map;
  }, [flashcards, livePagesMap]);

  const notebookGroups = useMemo(() => {
    const filteredQuery = searchQuery.trim().toLowerCase();

    return notebooks
      .map((nb) => {
        const nbPages = pages.filter((p) => p.notebookId === nb.id && !p.deletedAt);
        const pagesWithCards = nbPages
          .map((p) => {
            const cList = cardsByPage.get(p.id) || [];
            const matchesQuery =
              !filteredQuery ||
              p.title.toLowerCase().includes(filteredQuery) ||
              nb.name.toLowerCase().includes(filteredQuery) ||
              cList.some(
                (c) =>
                  c.front.toLowerCase().includes(filteredQuery) ||
                  c.back.toLowerCase().includes(filteredQuery)
              );
            return { page: p, cards: cList, matchesQuery };
          })
          .filter((item) => item.cards.length > 0 && item.matchesQuery);

        const totalCards = pagesWithCards.reduce((acc, curr) => acc + curr.cards.length, 0);
        const dueCards = pagesWithCards.reduce(
          (acc, curr) => acc + curr.cards.filter((c) => isCardDueForReview(c)).length,
          0
        );

        return {
          notebook: nb,
          pages: pagesWithCards,
          totalCards,
          dueCards,
        };
      })
      .filter((group) => {
        if (group.totalCards === 0) return false;
        if (filterMode === "due") return group.dueCards > 0;
        return true;
      });
  }, [notebooks, pages, cardsByPage, searchQuery, filterMode]);

  const unfiledPages = useMemo(() => {
    const filteredQuery = searchQuery.trim().toLowerCase();
    const list = pages.filter((p) => !p.notebookId && !p.deletedAt);
    return list
      .map((p) => {
        const cList = cardsByPage.get(p.id) || [];
        const matchesQuery =
          !filteredQuery ||
          p.title.toLowerCase().includes(filteredQuery) ||
          cList.some(
            (c) =>
              c.front.toLowerCase().includes(filteredQuery) ||
              c.back.toLowerCase().includes(filteredQuery)
          );
        return { page: p, cards: cList, matchesQuery };
      })
      .filter((item) => {
        if (item.cards.length === 0 || !item.matchesQuery) return false;
        if (filterMode === "due") {
          return item.cards.some((c) => isCardDueForReview(c));
        }
        return true;
      });
  }, [pages, cardsByPage, searchQuery, filterMode]);

  const allAvailablePageIds = useMemo(() => {
    const ids: string[] = [];
    for (const grp of notebookGroups) {
      for (const item of grp.pages) ids.push(item.page.id);
    }
    for (const item of unfiledPages) ids.push(item.page.id);
    return ids;
  }, [notebookGroups, unfiledPages]);

  const areAllPagesSelected = useMemo(() => {
    if (allAvailablePageIds.length === 0) return false;
    return allAvailablePageIds.every((id) => selectedPageIds.has(id));
  }, [allAvailablePageIds, selectedPageIds]);

  const toggleSelectAll = () => {
    if (areAllPagesSelected) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(allAvailablePageIds));
    }
  };

  const toggleAllExpanded = () => {
    if (expandedNotebooks.size >= notebookGroups.length && notebookGroups.length > 0) {
      setExpandedNotebooks(new Set());
    } else {
      setExpandedNotebooks(new Set(notebookGroups.map((g) => g.notebook.id)));
    }
  };

  const toggleNotebookExpand = (id: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelect = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleNotebookSelect = (nbPages: { page: Page }[]) => {
    const allSelected = nbPages.every((item) => selectedPageIds.has(item.page.id));
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        nbPages.forEach((p) => next.delete(p.page.id));
      } else {
        nbPages.forEach((p) => next.add(p.page.id));
      }
      return next;
    });
  };

  const selectedCards = useMemo(() => {
    const list: Flashcard[] = [];
    for (const pageId of selectedPageIds) {
      const c = cardsByPage.get(pageId);
      if (c?.length) list.push(...c);
    }
    return list;
  }, [selectedPageIds, cardsByPage]);

  const handleStudyAll = () => {
    if (flashcards.length === 0) {
      toast.info(t("no_flashcards"));
      return;
    }
    setStudyingQueue({
      title: t("study_all"),
      cards: flashcards,
    });
  };

  const handleStudyDue = () => {
    if (dueFlashcards.length === 0) {
      toast.success(t("all_caught_up"));
      return;
    }
    setStudyingQueue({
      title: `${t("due_today")} (${dueFlashcards.length})`,
      cards: dueFlashcards,
    });
  };

  const handleStudySelected = () => {
    if (selectedCards.length === 0) return;
    setStudyingQueue({
      title: `${t("study_selected")} (${selectedCards.length})`,
      cards: selectedCards,
    });
  };

  const handleStudySinglePage = (p: Page, cList: Flashcard[]) => {
    setStudyingQueue({
      title: p.title || t("untitled"),
      cards: cList,
    });
  };

  const handleStudyNotebook = (nb: Notebook, nbPages: { cards: Flashcard[] }[]) => {
    const allCards = nbPages.flatMap((item) => item.cards);
    setStudyingQueue({
      title: nb.name,
      cards: allCards,
    });
  };

  if (studyingQueue) {
    return (
      <FlashcardStudySession
        cards={studyingQueue.cards}
        title={studyingQueue.title}
        intervalModifier={userSettings.intervalModifier}
        onReview={async (cardId, rating) => {
          await adapter.reviewFlashcard(cardId, rating, userSettings.intervalModifier);
        }}
        onClose={() => setStudyingQueue(null)}
      />
    );
  }

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 md:px-8 py-6 sm:py-9 pb-36 pb-safe space-y-7 sm:space-y-9">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--surface-2)]/60 p-5 sm:p-8 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.3)]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 size-64 bg-gradient-to-br from-[var(--accent)]/15 via-sky-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 size-48 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--canvas)]/80 backdrop-blur-sm px-3 py-1 text-[11px] font-bold text-muted shadow-2xs">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="uppercase tracking-widest font-extrabold text-[10px] text-[var(--accent)]">
                Synapsys Spaced Repetition System
              </span>
            </div>

            <div className="flex items-start sm:items-center gap-3.5">
              <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-sky-600 text-white shadow-md shadow-[var(--accent)]/20 shrink-0">
                <GraduationCap className="size-6 sm:size-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                  {t("flashcards_title")}
                </h1>
                <p className="text-xs sm:text-sm text-muted mt-0.5 leading-relaxed">
                  {t("flashcards_desc")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-ink gap-2 text-xs sm:text-sm h-11 px-4 shadow-xs cursor-pointer font-bold"
            >
              <SlidersHorizontal className="size-4 text-muted" />
              <span>{t("configure_reviews")}</span>
            </Button>

            {dueFlashcards.length > 0 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStudyDue}
                className="rounded-2xl gap-2 text-xs sm:text-sm h-11 px-5 font-extrabold shadow-lg shadow-amber-500/25 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:brightness-105 text-white cursor-pointer active:scale-95 transition"
              >
                <RotateCw className="size-4 animate-spin-reverse" />
                <span>{t("review_now")}</span>
                <span className="ml-1 rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-mono font-black">
                  {dueFlashcards.length}
                </span>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStudyAll}
                disabled={flashcards.length === 0}
                className="rounded-2xl gap-2 text-xs sm:text-sm h-11 px-5 font-extrabold shadow-md bg-gradient-to-r from-[var(--accent)] to-sky-600 hover:brightness-105 cursor-pointer active:scale-95 transition"
              >
                <Play className="size-4 fill-current" />
                <span>{t("study_all")}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-xs transition hover:border-[var(--border-strong)] relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {t("due_today")}
            </span>
            <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <Clock className="size-4.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl sm:text-4xl font-black text-ink tracking-tight font-mono">
              {dueFlashcards.length}
            </p>
            <span className="text-[11px] font-mono text-faint">cards</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs">
            {dueFlashcards.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                <span className="size-2 rounded-full bg-amber-500 animate-ping" />
                <span>{dueFlashcards.length} pendentes</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5 stroke-[3]" />
                <span>{t("all_caught_up")}</span>
              </span>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-xs transition hover:border-[var(--border-strong)] relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {t("total_cards")}
            </span>
            <div className="flex size-9 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] group-hover:scale-110 transition-transform">
              <Layers className="size-4.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl sm:text-4xl font-black text-ink tracking-tight font-mono">
              {flashcards.length}
            </p>
            <span className="text-[11px] font-mono text-faint">cards</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted font-medium">
            <span className="font-bold text-ink">{notebookGroups.length}</span>
            <span>{t("deck_view").toLowerCase()} ativos</span>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-xs transition hover:border-[var(--border-strong)] relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {t("mastered_cards")}
            </span>
            <div className="flex size-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="size-4.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl sm:text-4xl font-black text-ink tracking-tight font-mono">
              {masteredCount}
            </p>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {masteryPercentage}%
            </span>
          </div>
          <div className="mt-2.5 w-full h-1.5 rounded-full bg-[var(--canvas)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${masteryPercentage}%` }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-xs transition hover:border-[var(--border-strong)] relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {t("learning_cards")}
            </span>
            <div className="flex size-9 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform">
              <BookOpen className="size-4.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl sm:text-4xl font-black text-ink tracking-tight font-mono">
              {learningCount}
            </p>
            <span className="text-[11px] font-mono text-faint">cards</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 font-bold">
            <TrendingUp className="size-3.5" />
            <span>Em consolidação</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 pt-1">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-faint pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("filter_flashcards")}
            className="pl-10 pr-9 rounded-2xl border-[var(--border)] bg-[var(--surface)] text-sm h-11 shadow-2xs focus:ring-2 focus:ring-[var(--accent)]/20 transition"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full hover:bg-[var(--surface-hover)] text-muted hover:text-ink cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
          <div className="flex items-center rounded-2xl bg-[var(--surface-2)] p-1 border border-[var(--border)]/60 text-xs">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                filterMode === "all"
                  ? "bg-[var(--surface)] text-ink shadow-2xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t("all_notebooks")}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("due")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === "due"
                  ? "bg-[var(--surface)] text-amber-600 dark:text-amber-400 shadow-2xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span>{t("due_today")}</span>
              {dueFlashcards.length > 0 ? (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono font-bold">
                  {dueFlashcards.length}
                </span>
              ) : null}
            </button>
          </div>

          {notebookGroups.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAllExpanded}
              className="rounded-2xl text-xs text-muted hover:text-ink h-9 px-3 cursor-pointer font-semibold"
            >
              {expandedNotebooks.size >= notebookGroups.length ? (
                <ChevronDown className="size-3.5 mr-1" />
              ) : (
                <ChevronRight className="size-3.5 mr-1" />
              )}
              <span>
                {expandedNotebooks.size >= notebookGroups.length ? t("clear") : t("all_notebooks")}
              </span>
            </Button>
          ) : null}

          {allAvailablePageIds.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="rounded-2xl text-xs text-muted hover:text-ink h-9 px-3 cursor-pointer font-semibold"
            >
              {areAllPagesSelected ? t("deselect_all") : t("select_all")}
            </Button>
          ) : null}
        </div>
      </div>

      {selectedCards.length > 0 ? (
        <div className="fixed bottom-6 inset-x-4 max-w-xl mx-auto z-40 bg-[var(--surface)]/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.4)] rounded-3xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 min-w-0 pl-1">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-[var(--accent)] text-white font-mono font-black text-sm shrink-0 shadow-sm">
              {selectedCards.length}
            </div>
            <div className="truncate text-xs sm:text-sm font-bold text-ink">
              <span>{t("study_selected")}</span>
              <span className="hidden sm:inline text-muted font-medium ml-1.5">
                ({selectedPageIds.size} {t("notes")})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPageIds(new Set())}
              className="rounded-xl text-xs text-muted hover:text-ink h-9 px-3 cursor-pointer font-semibold"
            >
              {t("clear")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStudySelected}
              className="rounded-2xl gap-2 text-xs sm:text-sm h-9.5 px-4.5 font-black shadow-md bg-gradient-to-r from-[var(--accent)] to-sky-600 cursor-pointer active:scale-95 transition"
            >
              <Play className="size-3.5 fill-current" />
              <span>{t("study_selected")}</span>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {notebookGroups.length === 0 && unfiledPages.length === 0 ? (
          <div className="py-20 sm:py-24 text-center border border-dashed border-[var(--border)] rounded-3xl bg-[var(--surface)] p-6 sm:p-12 space-y-4">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-[var(--accent)]/15 to-sky-500/10 text-[var(--accent)] mx-auto border border-[var(--accent)]/20 shadow-sm">
              <GraduationCap className="size-8" />
            </div>
            <h3 className="font-extrabold text-base sm:text-xl text-ink">
              {t("no_flashcards")}
            </h3>
            <p className="text-xs sm:text-sm text-muted max-w-md mx-auto leading-relaxed">
              {t("no_flashcards_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notebookGroups.map(({ notebook, pages: nbPages, totalCards, dueCards }) => {
              const isExpanded = expandedNotebooks.has(notebook.id);
              const allNbPagesSelected = nbPages.every((p) => selectedPageIds.has(p.page.id));

              return (
                <div
                  key={notebook.id}
                  className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-[var(--border-strong)] shadow-xs"
                >
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center size-8 shrink-0">
                        <input
                          type="checkbox"
                          checked={allNbPagesSelected}
                          onChange={() => toggleNotebookSelect(nbPages)}
                          className="size-4.5 rounded-md border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                          aria-label={`Select all notes in ${notebook.name}`}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleNotebookExpand(notebook.id)}
                        className="flex items-center gap-3 min-w-0 text-left cursor-pointer group flex-1"
                      >
                        <div className="flex size-8 items-center justify-center rounded-xl bg-[var(--canvas)] text-muted group-hover:text-ink transition shrink-0 border border-[var(--border)]/60">
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </div>

                        <span className="text-2xl shrink-0">
                          {notebook.emoji || "📓"}
                        </span>

                        <div className="min-w-0">
                          <span className="truncate block font-extrabold text-sm sm:text-base text-ink group-hover:text-[var(--accent)] transition">
                            {notebook.name}
                          </span>
                          <span className="text-[11px] text-muted sm:hidden">
                            {totalCards} {t("cards_count_badge")}
                          </span>
                        </div>
                      </button>

                      <span className="hidden sm:inline-flex items-center font-mono text-[11px] font-bold text-muted bg-[var(--canvas)] px-3 py-1 rounded-full border border-[var(--border)] shrink-0">
                        {totalCards} {t("cards_count_badge")}
                      </span>

                      {dueCards > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-1 text-[11px] font-extrabold shrink-0 border border-amber-500/20">
                          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>{dueCards} {t("due_today")}</span>
                        </span>
                      ) : null}
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStudyNotebook(notebook, nbPages)}
                      className="rounded-2xl gap-2 text-xs font-bold text-ink shrink-0 h-9.5 px-3.5 cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    >
                      <Play className="size-3 fill-current text-[var(--accent)]" />
                      <span className="hidden sm:inline">{t("study_all")}</span>
                    </Button>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-[var(--border)] bg-[var(--canvas)]/50 p-3 sm:p-4 space-y-2">
                      <div className="space-y-1.5">
                        {nbPages.map(({ page, cards: cList }) => {
                          const isSelected = selectedPageIds.has(page.id);
                          const dueCount = cList.filter((c) => isCardDueForReview(c)).length;

                          return (
                            <div
                              key={page.id}
                              className={`flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 ${
                                isSelected
                                  ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                                  : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePageSelect(page.id)}
                                  className="size-4 rounded border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                                />

                                <Link
                                  href={`/home/p/${page.id}`}
                                  className="truncate text-xs sm:text-sm font-bold text-ink hover:text-[var(--accent)] transition flex items-center gap-2 min-w-0"
                                >
                                  <span className="text-lg shrink-0">{page.icon || "📄"}</span>
                                  <span className="truncate">{page.title || t("untitled")}</span>
                                </Link>

                                <span className="text-[11px] font-mono text-faint shrink-0">
                                  ({cList.length})
                                </span>

                                {dueCount > 0 ? (
                                  <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10.5px] font-mono font-bold shrink-0">
                                    {dueCount}
                                  </span>
                                ) : null}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStudySinglePage(page, cList)}
                                className="h-8.5 px-3 rounded-xl text-xs font-bold text-muted hover:text-ink shrink-0 gap-1.5 cursor-pointer hover:bg-[var(--surface)]"
                                title={t("study_this_note")}
                              >
                                <Play className="size-3 fill-current text-[var(--accent)]" />
                                <span className="hidden sm:inline">{t("study_this_note")}</span>
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {unfiledPages.length > 0 ? (
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3 shadow-xs">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-[var(--canvas)] text-muted border border-[var(--border)]/60">
                    <Folder className="size-4.5" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-ink">
                    {t("unfiled")}
                  </h3>
                  <span className="text-[11px] font-mono text-faint ml-auto">
                    {unfiledPages.length} {t("notes")}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {unfiledPages.map(({ page, cards: cList }) => {
                    const isSelected = selectedPageIds.has(page.id);
                    const dueCount = cList.filter((c) => isCardDueForReview(c)).length;

                    return (
                      <div
                        key={page.id}
                        className={`flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                            : "border-transparent hover:border-[var(--border)] hover:bg-[var(--canvas)]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePageSelect(page.id)}
                            className="size-4 rounded border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                          />

                          <Link
                            href={`/home/p/${page.id}`}
                            className="truncate text-xs sm:text-sm font-bold text-ink hover:text-[var(--accent)] transition flex items-center gap-2 min-w-0"
                          >
                            <span className="text-lg shrink-0">{page.icon || "📄"}</span>
                            <span className="truncate">{page.title || t("untitled")}</span>
                          </Link>

                          <span className="text-[11px] font-mono text-faint shrink-0">
                            ({cList.length})
                          </span>

                          {dueCount > 0 ? (
                            <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10.5px] font-mono font-bold shrink-0">
                              {dueCount}
                            </span>
                          ) : null}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStudySinglePage(page, cList)}
                          className="h-8.5 px-3 rounded-xl text-xs font-bold text-muted hover:text-ink shrink-0 gap-1.5 cursor-pointer hover:bg-[var(--surface)]"
                          title={t("study_this_note")}
                        >
                          <Play className="size-3 fill-current text-[var(--accent)]" />
                          <span className="hidden sm:inline">{t("study_this_note")}</span>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {settingsOpen ? (
        <FlashcardsSettingsModal
          settings={userSettings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
