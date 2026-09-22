"use client";

import { Link } from "@/lib/i18n/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Flashcard } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { startOfDay, summarizeCards } from "@/lib/flashcards/srs";
import {
  buildDeckTree,
  deckKey,
  deckPageIds,
  flattenDecks,
  flattenNodes,
  type CardNode,
  type DeckNode,
} from "@/lib/flashcards/note-tree";
import { useFlashcardSettings } from "@/lib/flashcards/use-flashcard-settings";
import {
  DeckIcon,
  DueIcon,
  FlashcardsIcon,
  GoalIcon,
  LearningIcon,
  MasteredIcon,
  ReplayIcon,
  StudyIcon,
} from "@/lib/icons/flashcard-icon";
import { FlashcardStudySession } from "./flashcard-study-session";
import { FlashcardsSettingsModal } from "./flashcards-settings-modal";

function ProgressRing({
  value,
  total,
  size = 104,
}: {
  value: number;
  total: number;
  size?: number;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, value / total) : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

function MasteryBar({
  mastered,
  learning,
  fresh,
  className,
}: {
  mastered: number;
  learning: number;
  fresh: number;
  className?: string;
}) {
  const total = mastered + learning + fresh;
  if (total === 0) return null;
  const pct = (value: number) => `${(value / total) * 100}%`;

  return (
    <div
      className={cn(
        "flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]",
        className
      )}
      aria-hidden="true"
    >
      {mastered > 0 ? (
        <span style={{ width: pct(mastered) }} className="h-full bg-[var(--success)]" />
      ) : null}
      {learning > 0 ? (
        <span style={{ width: pct(learning) }} className="h-full bg-[var(--accent)]" />
      ) : null}
      {fresh > 0 ? (
        <span style={{ width: pct(fresh) }} className="h-full bg-[var(--border-strong)]" />
      ) : null}
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  caption?: string;
  tone?: "accent" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[var(--warning)]"
      : tone === "success"
        ? "text-[var(--success)]"
        : "text-[var(--accent)]";

  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5 px-5 py-4">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
        <span className={cn("shrink-0", toneClass)}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </span>
      {caption ? <span className="truncate text-[11.5px] text-muted">{caption}</span> : null}
    </div>
  );
}

function DeckRow({
  deck,
  selectionMode,
  selectedIds,
  isExpanded,
  onToggleExpand,
  onToggleDeck,
  onToggleNote,
  onStudy,
}: {
  deck: DeckNode;
  selectionMode: boolean;
  selectedIds: Set<string>;
  isExpanded: (key: string) => boolean;
  onToggleExpand: (key: string) => void;
  onToggleDeck: (deck: DeckNode) => void;
  onToggleNote: (node: CardNode) => void;
  onStudy: (title: string, cards: Flashcard[]) => void;
}) {
  const { t } = useTranslation();
  const key = deckKey(deck);
  const name = deck.notebook?.name ?? t("unfiled");
  const open = isExpanded(key);
  const pageIds = deckPageIds(deck);
  const selected =
    selectionMode && pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  return (
    <section
      style={{ marginLeft: deck.depth ? `${deck.depth * 12}px` : undefined }}
      className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
        {selectionMode ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleDeck(deck)}
            aria-label={t("select_notes_of_deck", { name })}
            className="shrink-0"
          />
        ) : null}

        <button
          type="button"
          onClick={() => onToggleExpand(key)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-faint transition-transform duration-200",
              open && "rotate-90"
            )}
          />
          <span
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[16px] leading-none"
            style={
              deck.notebook?.color
                ? {
                    borderColor: `color-mix(in oklab, ${deck.notebook.color} 35%, transparent)`,
                    backgroundColor: `color-mix(in oklab, ${deck.notebook.color} 12%, transparent)`,
                  }
                : undefined
            }
          >
            {deck.notebook ? (
              <WorkspaceIcon icon={deck.notebook.emoji} fallback="\u{1F4D3}" size={18} />
            ) : (
              <DeckIcon className="size-4 text-muted" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-[var(--accent)]">
              {name}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-muted">
              {t("deck_meta", { cards: deck.cards.length, notes: deck.noteCount })}
            </span>
          </span>
        </button>

        {deck.due > 0 ? (
          <span className="shrink-0 rounded-full border border-[color-mix(in_oklab,var(--warning)_28%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)] tabular-nums">
            {t("due_badge", { count: deck.due })}
          </span>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-muted hover:text-ink"
          onClick={() => onStudy(name, deck.cards)}
          title={t("study_notebook")}
          aria-label={t("study_notebook")}
        >
          <StudyIcon className="size-3 text-[var(--accent)]" />
          <span className="hidden font-medium sm:inline">{t("study")}</span>
        </Button>
      </div>

      {open ? (
        <div className="space-y-1.5 border-t border-[var(--border)] bg-[var(--surface-2)]/45 p-1.5">
          {deck.nodes.map((node) => (
            <NoteRow
              key={node.page.id}
              node={node}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleNote}
              onStudy={onStudy}
            />
          ))}

          {/* Cadernos filhos: a hierarquia continua para dentro. */}
          {deck.children.map((child) => (
            <DeckRow
              key={deckKey(child)}
              deck={child}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onToggleDeck={onToggleDeck}
              onToggleNote={onToggleNote}
              onStudy={onStudy}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function NoteRow({
  node,
  selectionMode,
  selectedIds,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  onStudy,
}: {
  node: CardNode;
  selectionMode: boolean;
  selectedIds: Set<string>;
  isExpanded: (pageId: string) => boolean;
  onToggleExpand: (pageId: string) => void;
  onToggleSelect: (node: CardNode) => void;
  onStudy: (title: string, cards: Flashcard[]) => void;
}) {
  const { t } = useTranslation();
  const open = isExpanded(node.page.id);
  const hasChildren = node.children.length > 0;
  const title = node.page.title.trim() || t("untitled");
  const nested = node.subtreeCards.length - node.cards.length;
  const selected = selectionMode && selectedIds.has(node.page.id);

  return (
    <>
      <div
        style={{ marginLeft: node.depth ? `${node.depth * 12}px` : undefined }}
        className={cn(
          "overflow-hidden rounded-[var(--radius-sm)] border transition-colors",
          selected
            ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
            : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]"
        )}
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          {selectionMode ? (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelect(node)}
              aria-label={title}
              className="shrink-0"
              disabled={node.subtreeCards.length === 0}
            />
          ) : null}

          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleExpand(node.page.id)}
              aria-expanded={open}
              aria-label={title}
              className="shrink-0 text-faint transition-colors hover:text-ink"
            >
              <ChevronRight
                className={cn("size-4 transition-transform duration-200", open && "rotate-90")}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="size-4 shrink-0" />
          )}

          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] leading-none">
            <WorkspaceIcon icon={node.page.icon} fallback="\u{1F4C4}" size={14} />
          </span>

          <Link href={`/home/p/${node.page.id}`} className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-ink transition-colors hover:text-[var(--accent)]">
              {title}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-faint">
              {t("cards_count", { count: node.cards.length })}
              {nested > 0 ? (
                <>
                  <span aria-hidden="true" className="px-1.5 text-faint">
                    &middot;
                  </span>
                  {t("subtree_cards_count", { count: nested })}
                </>
              ) : null}
            </span>
          </Link>

          {node.subtreeDue > 0 ? (
            <span className="shrink-0 rounded-full border border-[color-mix(in_oklab,var(--warning)_28%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)] tabular-nums">
              {t("due_badge", { count: node.subtreeDue })}
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-muted hover:text-ink"
            disabled={node.subtreeCards.length === 0}
            onClick={() => onStudy(title, node.subtreeCards)}
            title={t("study_this_note")}
            aria-label={t("study_this_note")}
          >
            <StudyIcon className="size-3 text-[var(--accent)]" />
            <span className="hidden font-medium sm:inline">{t("study")}</span>
          </Button>
        </div>
      </div>

      {hasChildren && open
        ? node.children.map((child) => (
            <NoteRow
              key={child.page.id}
              node={child}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              onStudy={onStudy}
            />
          ))
        : null}
    </>
  );
}

function DeckListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2.5">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4"
        >
          <span className="size-4 shrink-0 animate-pulse rounded bg-[var(--surface-2)]" />
          <span className="size-9 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-2)]" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3 w-40 max-w-[60%] animate-pulse rounded bg-[var(--surface-2)]" />
            <span className="block h-2.5 w-24 max-w-[40%] animate-pulse rounded bg-[var(--surface-2)]" />
          </span>
          <span className="hidden h-1.5 w-28 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)] lg:block" />
          <span className="h-8 w-16 shrink-0 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-2)]" />
        </div>
      ))}
    </div>
  );
}

export function FlashcardsHub() {
  const { adapter, notebooks, pages, flashcards, dueFlashcards, flashcardsReady } =
    useWorkspace();
  const { t } = useTranslation();
  const { settings, saveSettings } = useFlashcardSettings();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "due">("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState(false);
  const [deletingSelection, setDeletingSelection] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<{ title: string; cards: Flashcard[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const globalStats = useMemo(() => summarizeCards(flashcards), [flashcards]);

  const reviewedToday = useMemo(() => {
    const from = startOfDay();
    return flashcards.filter((c) => (c.lastReviewedAt ?? 0) >= from).length;
  }, [flashcards]);

  const goal = Math.max(1, settings.dailyGoal);
  const goalReached = reviewedToday >= goal;

  const masteryPercentage =
    globalStats.total > 0 ? Math.round((globalStats.mastered / globalStats.total) * 100) : 0;

  const cardsByPage = useMemo(() => {
    const map = new Map<string, Flashcard[]>();
    for (const card of flashcards) {
      const list = map.get(card.pageId);
      if (list) list.push(card);
      else map.set(card.pageId, [card]);
    }
    return map;
  }, [flashcards]);

  const decks = useMemo(
    () =>
      buildDeckTree({
        pages,
        notebooks,
        cardsByPage,
        filterMode,
        term: searchQuery.trim().toLowerCase(),
        unfiledLabel: t("unfiled"),
      }),
    [cardsByPage, filterMode, notebooks, pages, searchQuery, t]
  );

  const flatDecks = useMemo(() => flattenDecks(decks), [decks]);
  const flatNodes = useMemo(
    () => flatDecks.flatMap((deck) => flattenNodes(deck.nodes)),
    [flatDecks]
  );

  const visibleNoteIds = useMemo(
    () => flatNodes.filter((node) => node.cards.length > 0).map((node) => node.page.id),
    [flatNodes]
  );

  const activeSelection = useMemo(() => {
    const allowed = new Set(visibleNoteIds);
    return new Set([...selectedPageIds].filter((id) => allowed.has(id)));
  }, [selectedPageIds, visibleNoteIds]);

  const allVisibleSelected =
    visibleNoteIds.length > 0 && visibleNoteIds.every((id) => activeSelection.has(id));

  const selectedCards = useMemo(() => {
    const list: Flashcard[] = [];
    for (const id of activeSelection) {
      const cards = cardsByPage.get(id);
      if (cards?.length) list.push(...cards);
    }
    return list;
  }, [activeSelection, cardsByPage]);

  const expandableIds = useMemo(
    () => [
      ...flatDecks.map(deckKey),
      ...flatNodes.filter((node) => node.children.length > 0).map((node) => node.page.id),
    ],
    [flatDecks, flatNodes]
  );

  const allExpanded =
    expandableIds.length > 0 && expandableIds.every((id) => expanded.has(id));

  // Buscando, abrir tudo: o resultado costuma estar dentro de uma subnota.
  const searching = searchQuery.trim().length > 0;
  const isExpanded = (pageId: string) => searching || expanded.has(pageId);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(expandableIds));
  };

  // Marcar uma nota marca a subarvore dela: e o que a indentacao promete.
  const toggleNode = (node: CardNode) => {
    const ids = flattenNodes([node])
      .filter((item) => item.cards.length > 0)
      .map((item) => item.page.id);
    if (ids.length === 0) return;
    const every = ids.every((id) => activeSelection.has(id));
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const toggleDeck = (deck: DeckNode) => {
    const ids = deckPageIds(deck);
    if (ids.length === 0) return;
    const every = ids.every((id) => activeSelection.has(id));
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedPageIds(new Set());
    setConfirmDeleteSelection(false);
  };

  const handleDeleteSelection = async () => {
    const pageIds = [...activeSelection];
    if (pageIds.length === 0) return;
    setDeletingSelection(true);
    let removed = 0;
    try {
      for (const pageId of pageIds) {
        removed += await adapter.deleteFlashcardsByPage(pageId);
      }
      toast.success(t("cards_deleted_count", { count: removed }));
      exitSelection();
    } catch {
      if (removed > 0) toast.warning(t("cards_deleted_count", { count: removed }));
      else toast.error(t("saving_indicator_hint"));
      setConfirmDeleteSelection(false);
    } finally {
      setDeletingSelection(false);
    }
  };

  const startSession = (title: string, cards: Flashcard[]) => {
    if (cards.length === 0) return;
    setSession({ title, cards });
  };

  const handleReviewDue = () => {
    if (dueFlashcards.length === 0) {
      toast.success(t("all_caught_up"), { description: t("all_caught_up_desc") });
      return;
    }
    startSession(t("due_today"), dueFlashcards);
  };

  const handleStudyAll = () => {
    if (flashcards.length === 0) {
      toast.info(t("no_flashcards"), { description: t("no_flashcards_desc") });
      return;
    }
    startSession(t("study_all"), flashcards);
  };

  if (session) {
    return (
      <FlashcardStudySession
        cards={session.cards}
        title={session.title}
        intervalModifier={settings.intervalModifier}
        onReview={async (cardId, rating) => {
          await adapter.reviewFlashcard(cardId, rating, settings.intervalModifier);
        }}
        onClose={() => setSession(null)}
      />
    );
  }

  const hasAnyCard = flashcards.length > 0;
  const filtersActive = searchQuery.trim().length > 0 || filterMode === "due";

  return (
    <div className="relative flex-1 w-full overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[22rem]"
        style={{
          backgroundImage:
            "radial-gradient(75% 70% at 50% -10%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 pb-32 pt-8 pb-safe sm:px-6 sm:pt-10 lg:px-8">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[34px]">
              {t("flashcards_title")}
            </h1>
            <p className="max-w-lg text-[13.5px] leading-relaxed text-muted">
              {t("flashcards_desc")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setSettingsOpen(true)}
              className="h-10 gap-2 px-3.5"
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">{t("configure_reviews")}</span>
            </Button>

            {dueFlashcards.length > 0 ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleReviewDue}
                className="h-10 gap-2 px-4 font-semibold"
              >
                <ReplayIcon className="size-4" />
                <span>{t("review_now")}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-px text-[11px] font-semibold tabular-nums">
                  {dueFlashcards.length}
                </span>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleStudyAll}
                disabled={!hasAnyCard}
                className="h-10 gap-2 px-4 font-semibold"
              >
                <StudyIcon className="size-4" />
                <span>{t("study_all")}</span>
              </Button>
            )}
          </div>
        </header>

        <section className="mt-8 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,17rem)_1fr]">
            <div className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-5 md:border-b-0 md:border-r">
              <div className="relative shrink-0">
                <ProgressRing value={reviewedToday} total={goal} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
                    {reviewedToday}
                  </span>
                  <span className="mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
                    {t("of_goal", { goal })}
                  </span>
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                  <GoalIcon className="size-3.5 text-[var(--accent)]" />
                  {t("daily_goal_label")}
                </span>
                <p className="text-[13px] font-medium leading-snug text-ink">
                  {goalReached ? t("daily_goal_done") : t("daily_goal_remaining", { count: goal - reviewedToday })}
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="text-[12px] font-medium text-[var(--accent)] transition hover:underline"
                >
                  {t("adjust_goal")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[var(--border)] sm:grid-cols-3 [&>*:nth-child(3)]:border-t [&>*:nth-child(3)]:border-[var(--border)] sm:[&>*:nth-child(3)]:border-t-0">
              <StatCell
                icon={<DueIcon className="size-3.5" />}
                label={t("due_today")}
                value={globalStats.due}
                caption={
                  globalStats.due > 0
                    ? t("cards_waiting", { count: globalStats.due })
                    : t("all_caught_up")
                }
                tone="warning"
              />
              <StatCell
                icon={<MasteredIcon className="size-3.5" />}
                label={t("mastered_cards")}
                value={globalStats.mastered}
                caption={t("of_total_cards", { percent: masteryPercentage, total: globalStats.total })}
                tone="success"
              />
              <StatCell
                icon={<LearningIcon className="size-3.5" />}
                label={t("learning_cards")}
                value={globalStats.learning + globalStats.fresh}
                caption={t("new_cards_count", { count: globalStats.fresh })}
                tone="accent"
              />
            </div>
          </div>

          {globalStats.total > 0 ? (
            <div className="border-t border-[var(--border)] px-5 py-3.5">
              <MasteryBar
                mastered={globalStats.mastered}
                learning={globalStats.learning}
                fresh={globalStats.fresh}
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--success)]" />
                  {t("stage_mastered")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--accent)]" />
                  {t("stage_learning")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--border-strong)]" />
                  {t("stage_new")}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        {hasAnyCard ? (
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("filter_flashcards")}
                aria-label={t("filter_flashcards")}
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-8 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("clear")}
                  className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-xs)] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
                    filterMode === "all"
                      ? "bg-[var(--surface)] text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  )}
                >
                  {t("filter_all_cards")}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("due")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
                    filterMode === "due"
                      ? "bg-[var(--surface)] text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  )}
                >
                  {t("filter_due_cards")}
                  {dueFlashcards.length > 0 ? (
                    <span className="rounded-full bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] px-1.5 text-[10.5px] font-semibold text-[var(--warning)] tabular-nums">
                      {dueFlashcards.length}
                    </span>
                  ) : null}
                </button>
              </div>

              {expandableIds.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={toggleAllExpanded} className="h-8">
                  {allExpanded ? t("collapse_all") : t("expand_all")}
                </Button>
              ) : null}

              <Button
                variant={selectionMode ? "subtle" : "ghost"}
                size="sm"
                onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
                className="h-8"
              >
                {selectionMode ? t("selection_cancel") : t("selection_start")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2.5 pb-2">
          {!flashcardsReady ? (
            <DeckListSkeleton />
          ) : decks.length === 0 ? (
            <div className="flex flex-col items-center rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-6 py-16 text-center">
              <div className="relative mb-5 h-16 w-20">
                <span className="absolute left-1/2 top-1 h-12 w-16 -translate-x-1/2 -rotate-6 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]" />
                <span className="absolute left-1/2 top-2 h-12 w-16 -translate-x-1/2 rotate-6 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]" />
                <span className="absolute left-1/2 top-2.5 flex h-12 w-16 -translate-x-1/2 items-center justify-center rounded-[10px] border border-[var(--accent)]/30 bg-[var(--surface)] text-[var(--accent)] shadow-sm">
                  <FlashcardsIcon className="size-6" />
                </span>
              </div>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {filtersActive && hasAnyCard ? t("no_filter_results") : t("no_flashcards")}
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
                {filtersActive && hasAnyCard ? t("no_filter_results_desc") : t("no_flashcards_desc")}
              </p>
              {filtersActive && hasAnyCard ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-5"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterMode("all");
                  }}
                >
                  {t("clear_filters")}
                </Button>
              ) : null}
            </div>
          ) : (
            decks.map((deck) => (
              <DeckRow
                key={deckKey(deck)}
                deck={deck}
                selectionMode={selectionMode}
                selectedIds={activeSelection}
                isExpanded={isExpanded}
                onToggleExpand={toggleExpand}
                onToggleDeck={toggleDeck}
                onToggleNote={toggleNode}
                onStudy={startSession}
              />
            ))
          )}
        </div>

        {selectionMode && visibleNoteIds.length > 0 ? (
          <div className="sticky bottom-4 z-40 mt-4 flex justify-center pb-safe">
            <div className="flex w-full max-w-lg items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] p-2.5 pl-4 shadow-[var(--shadow-float)]">
              {confirmDeleteSelection && selectedCards.length > 0 ? (
                <>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
                    {t("confirm_delete_selected_cards", { count: selectedCards.length })}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      disabled={deletingSelection}
                      onClick={() => setConfirmDeleteSelection(false)}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8 gap-1.5 font-semibold"
                      disabled={deletingSelection}
                      onClick={() => void handleDeleteSelection()}
                    >
                      {deletingSelection ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      <span>{t("delete_all_cards")}</span>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--accent)] text-[12px] font-semibold text-[var(--accent-contrast)] tabular-nums">
                      {selectedCards.length}
                    </span>
                    <span className="truncate text-[12.5px] font-medium text-ink">
                      {t("selected_notes", { count: activeSelection.size })}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() =>
                        setSelectedPageIds(
                          allVisibleSelected ? new Set() : new Set(visibleNoteIds)
                        )
                      }
                    >
                      {allVisibleSelected ? t("deselect_all") : t("select_all")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-faint hover:text-[var(--danger)]"
                      disabled={selectedCards.length === 0}
                      onClick={() => setConfirmDeleteSelection(true)}
                      aria-label={t("delete_selected_cards")}
                      title={t("delete_selected_cards")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-8 gap-1.5 font-semibold"
                      disabled={selectedCards.length === 0}
                      onClick={() => startSession(t("study_selected"), selectedCards)}
                    >
                      <StudyIcon className="size-3" />
                      <span>{t("study")}</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <FlashcardsSettingsModal
        open={settingsOpen}
        settings={settings}
        onSave={saveSettings}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
