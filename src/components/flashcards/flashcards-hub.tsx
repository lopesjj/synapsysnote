"use client";

import { Link } from "@/lib/i18n/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronRight, Layers, Loader2, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Flashcard } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { cardStage, endOfDay, startOfDay, summarizeCards } from "@/lib/flashcards/srs";
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
import { DeckIcon, FlashcardsIcon, StudyIcon } from "@/lib/icons/flashcard-icon";
import { FlashcardStudySession } from "./flashcard-study-session";
import { FlashcardsSettingsModal } from "./flashcards-settings-modal";

/* ------------------------------------------------------------------ */
/* Dados derivados                                                     */
/* ------------------------------------------------------------------ */

/**
 * A fila de hoje mistura dois tipos de card: os que já foram estudados e
 * venceram (revisões) e os que nunca foram vistos (novos). Os novos entram na
 * fila no dia em que nascem, mas não são "revisão" — por isso a contagem
 * aparece separada em toda a página.
 */
function splitQueue(cards: Flashcard[], reference = Date.now()) {
  const limit = endOfDay(reference);
  let reviews = 0;
  let fresh = 0;
  for (const card of cards) {
    if ((Number(card.nextReviewDate) || 0) > limit) continue;
    if (cardStage(card) === "new") fresh += 1;
    else reviews += 1;
  }
  return { reviews, fresh, total: reviews + fresh };
}

/** ~8 s por card, arredondado para cima em minutos. */
function sessionMinutes(count: number) {
  return Math.max(1, Math.ceil((count * 8) / 60));
}

function DailyCover({
  count,
  done,
  empty,
  label,
  className,
}: {
  count: number;
  done: boolean;
  empty: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "@container relative isolate aspect-square shrink-0 overflow-hidden rounded-[14px] shadow-[0_28px_60px_-24px_rgba(0,0,0,0.85)]",
        className
      )}
      style={{
        background:
          "linear-gradient(150deg, #5eead4 0%, #14b8a6 26%, #0e7490 58%, #1e1b4b 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_10%,rgba(255,255,255,0.35),transparent_60%)]"
      />
      <span
        aria-hidden="true"
        className="absolute right-[9%] top-[9%] h-[30%] w-[24%] rotate-[10deg] rounded-[14%] border border-white/35 bg-white/10"
      />
      <span
        aria-hidden="true"
        className="absolute right-[15%] top-[12%] h-[30%] w-[24%] rotate-[-6deg] rounded-[14%] border border-white/45 bg-white/15 backdrop-blur-sm"
      />
      <span className="absolute left-[9%] top-[9%] text-[8cqw] font-bold uppercase tracking-[0.14em] text-white/90">
        {label}
      </span>
      <span className="absolute bottom-[8%] left-[9%] right-[9%] text-white">
        {done ? (
          <span className="flex size-[34cqw] items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-sm">
            <Check className="size-[55%]" strokeWidth={2.75} />
          </span>
        ) : empty ? (
          <FlashcardsIcon className="size-[30cqw] text-white/85" />
        ) : (
          <span className="block text-[46cqw] font-black leading-[0.8] tracking-[-0.06em] tabular-nums">
            {count}
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cartões de progresso                                                */
/* ------------------------------------------------------------------ */

function Rings({ rings, size = 132 }: { rings: { value: number; color: string }[]; size?: number }) {
  const stroke = 13;
  const gap = 4;
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      {rings.map((ring, index) => {
        const radius = (size - stroke) / 2 - index * (stroke + gap);
        const circumference = 2 * Math.PI * radius;
        const ratio = Math.max(0, Math.min(1, ring.value));
        return (
          <g key={index}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`color-mix(in oklab, ${ring.color} 20%, transparent)`}
              strokeWidth={stroke}
            />
            {ratio > 0 ? (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-5 @[40rem]/fc:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

function CardTitle({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {aside}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de cadernos                                                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function FlashcardsHub() {
  const { adapter, notebooks, pages, flashcards, dueFlashcards, flashcardsReady } =
    useWorkspace();
  const { t, language } = useTranslation();
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
  const queue = useMemo(() => splitQueue(flashcards), [flashcards]);

  const reviewedToday = useMemo(() => {
    const from = startOfDay();
    return flashcards.filter((c) => (c.lastReviewedAt ?? 0) >= from).length;
  }, [flashcards]);

  const goal = Math.max(1, settings.dailyGoal);
  const goalReached = reviewedToday >= goal;

  // Quantos cards vencem em cada um dos próximos 7 dias (hoje inclui os atrasados).
  const forecast = useMemo(() => {
    const weekday = new Intl.DateTimeFormat(language, { weekday: "short" });
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return {
        end: end.getTime(),
        label: index === 0 ? t("today_short") : weekday.format(date).replace(".", ""),
        count: 0,
      };
    });
    for (const card of flashcards) {
      const next = Number(card.nextReviewDate) || 0;
      const slot = days.find((day) => next <= day.end);
      if (slot) slot.count += 1;
    }
    const upcoming = days.slice(1).reduce((sum, day) => sum + day.count, 0);
    const max = Math.max(1, ...days.map((day) => day.count));
    return { days, upcoming, max };
  }, [flashcards, language, t]);

  const cardsByPage = useMemo(() => {
    const map = new Map<string, Flashcard[]>();
    for (const card of flashcards) {
      const list = map.get(card.pageId);
      if (list) list.push(card);
      else map.set(card.pageId, [card]);
    }
    return map;
  }, [flashcards]);

  const term = searchQuery.trim().toLowerCase();

  const decks = useMemo(
    () =>
      buildDeckTree({
        pages,
        notebooks,
        cardsByPage,
        filterMode,
        term,
        unfiledLabel: t("unfiled"),
      }),
    [cardsByPage, filterMode, notebooks, pages, term, t]
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
  const isExpanded = (pageId: string) => term.length > 0 || expanded.has(pageId);

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
    startSession(t("today_queue"), dueFlashcards);
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
  const hasQueue = dueFlashcards.length > 0;
  const filtersActive = term.length > 0 || filterMode === "due";
  const caughtUp = flashcardsReady && hasAnyCard && !hasQueue;
  const total = globalStats.total;
  const pct = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const distribution = [
    { key: "mastered", label: t("stage_mastered"), value: globalStats.mastered, color: "var(--success)" },
    { key: "learning", label: t("stage_learning"), value: globalStats.learning, color: "var(--fc-teal)" },
    {
      key: "new",
      label: t("stage_new"),
      value: globalStats.fresh,
      color: "color-mix(in oklab, var(--text) 32%, transparent)",
    },
  ];

  const rootStyle = {
    "--fc-play": "#2dd4bf",
    "--fc-play-hover": "#5eead4",
    "--fc-teal": "color-mix(in oklab, #2dd4bf 72%, var(--accent))",
  } as CSSProperties;

  const heroTitle = !flashcardsReady
    ? t("hero_title")
    : !hasAnyCard
      ? t("no_flashcards")
      : caughtUp
        ? t("all_caught_up")
        : t("hero_title");

  const heroDesc = !flashcardsReady
    ? t("flashcards_desc")
    : !hasAnyCard
      ? t("no_flashcards_desc")
      : caughtUp
        ? t("all_caught_up_desc")
        : queue.reviews > 0
          ? t("hero_desc_reviews")
          : t("hero_desc_new");

  return (
    <div style={rootStyle} className="@container/fc relative w-full flex-1 overflow-x-hidden">
      <div className="mx-auto w-full max-w-[110rem] px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-3 @[40rem]/fc:px-6 @[40rem]/fc:pt-6 @[80rem]/fc:px-10">
        {/* ---------------- Destaque do dia ---------------- */}
        <section
          className="relative overflow-hidden rounded-[28px] text-white"
          style={{
            background:
              "linear-gradient(165deg, color-mix(in oklab, #14b8a6 58%, #0b1a2c) 0%, color-mix(in oklab, #0e7490 34%, #08111e) 58%, #060c16 100%)",
          }}
        >
          <div className="flex flex-col gap-6 p-5 @[40rem]/fc:flex-row @[40rem]/fc:items-end @[40rem]/fc:gap-8 @[40rem]/fc:p-8 @[80rem]/fc:p-10">
            <DailyCover
              count={queue.total}
              done={caughtUp}
              empty={!flashcardsReady || !hasAnyCard}
              label={t("today_short")}
              className="w-40 self-center @[40rem]/fc:w-52 @[40rem]/fc:self-auto @[80rem]/fc:w-60"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-white/85">{t("flashcards_title")}</p>
              <h1 className="mt-1.5 text-[40px] font-black leading-[0.92] tracking-[-0.05em] @[40rem]/fc:text-[60px] @[80rem]/fc:text-[84px]">
                {heroTitle}
              </h1>
              <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-white/70">{heroDesc}</p>
              {hasQueue ? (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-white/90">
                  <span className="font-bold text-white">
                    {t("hero_queue_title", { count: queue.total })}
                  </span>
                  <span className="text-white/40">•</span>
                  <span>
                    {[
                      queue.fresh > 0 ? t("new_badge", { count: queue.fresh }) : null,
                      queue.reviews > 0 ? t("reviews_badge", { count: queue.reviews }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-white/40">•</span>
                  <span>{t("about_minutes", { count: sessionMinutes(queue.total) })}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Uma ação principal só: estudar a fila de hoje. "Estudar todos" fica
              à parte, junto das opções, com outro ícone, para não parecer o mesmo botão. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 bg-black/20 px-5 py-4 @[40rem]/fc:px-8 @[80rem]/fc:px-10">
            {hasAnyCard ? (
              <button
                type="button"
                onClick={hasQueue ? handleReviewDue : handleStudyAll}
                className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--fc-play)] pl-2 pr-5 text-[14px] font-bold text-[#032027] shadow-[0_12px_28px_-10px_rgba(0,0,0,0.7)] outline-none transition hover:bg-[var(--fc-play-hover)] focus-visible:ring-2 focus-visible:ring-white/80 active:scale-[0.98] @[34rem]/fc:w-auto @[34rem]/fc:justify-start"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#032027] text-[var(--fc-play)]">
                  <StudyIcon className="size-4 translate-x-px" />
                </span>
                {hasQueue ? (queue.fresh > 0 ? t("study_now") : t("review_now")) : t("study_all")}
                {hasQueue ? (
                  <span className="rounded-full bg-[#032027]/15 px-2 py-0.5 text-[12px] font-bold tabular-nums">
                    {queue.total}
                  </span>
                ) : null}
              </button>
            ) : null}

            <div className="flex w-full items-center justify-center gap-1 @[34rem]/fc:ml-auto @[34rem]/fc:w-auto">
              {hasQueue ? (
                <>
                  <button
                    type="button"
                    onClick={handleStudyAll}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    <Layers className="size-4" />
                    {t("study_all")}
                    <span className="text-white/45 tabular-nums">{total}</span>
                  </button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/15" />
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label={t("configure_reviews")}
                title={t("configure_reviews")}
                className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden @[40rem]/fc:inline">{t("configure_reviews")}</span>
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- Progresso ---------------- */}
        {hasAnyCard ? (
          <div className="mt-4 grid grid-cols-1 gap-3 @[44rem]/fc:grid-cols-2 @[40rem]/fc:mt-5 @[40rem]/fc:gap-4 @[66rem]/fc:grid-cols-3">
            <Card>
              <CardTitle
                title={t("daily_goal_label")}
                aside={
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="text-[12.5px] font-semibold text-muted transition hover:text-ink hover:underline"
                  >
                    {t("adjust_goal")}
                  </button>
                }
              />
              <div className="mt-5 flex items-center gap-6">
                <Rings
                  rings={[
                    { value: reviewedToday / goal, color: "var(--fc-teal)" },
                    { value: total > 0 ? globalStats.mastered / total : 0, color: "var(--success)" },
                  ]}
                />
                <dl className="min-w-0 space-y-4">
                  <div>
                    <dt className="sr-only">{t("daily_goal_label")}</dt>
                    <dd className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--fc-teal)] tabular-nums">
                      {reviewedToday}
                      <span className="text-[15px] font-semibold text-muted">/{goal}</span>
                    </dd>
                    <dd
                      className={cn(
                        "mt-1 text-[12px]",
                        goalReached ? "font-medium text-[var(--success)]" : "text-muted"
                      )}
                    >
                      {goalReached
                        ? t("daily_goal_done")
                        : t("daily_goal_remaining", { count: goal - reviewedToday })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] font-medium text-muted">{t("mastery_heading")}</dt>
                    <dd className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--success)] tabular-nums">
                      {pct(globalStats.mastered)}
                      <span className="text-[15px] font-semibold text-muted">%</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <CardTitle
                title={t("cards_overview")}
                aside={<span className="text-[12.5px] text-muted tabular-nums">{total}</span>}
              />
              <div className="mt-5 flex h-3 w-full gap-1" aria-hidden="true">
                {distribution.map((item) =>
                  item.value > 0 ? (
                    <span
                      key={item.key}
                      className="h-full rounded-full transition-[flex-grow] duration-700"
                      style={{ flexGrow: item.value, flexBasis: 0, backgroundColor: item.color }}
                    />
                  ) : null
                )}
              </div>
              <dl className="mt-5 space-y-3">
                {distribution.map((item) => (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <dt className="flex-1 truncate text-[13.5px] text-ink">{item.label}</dt>
                    <dd className="text-[13.5px] font-semibold text-ink tabular-nums">{item.value}</dd>
                    <dd className="w-10 text-right text-[12px] text-muted tabular-nums">{pct(item.value)}%</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="@[44rem]/fc:col-span-2 @[66rem]/fc:col-span-1">
              <CardTitle
                title={t("upcoming_reviews")}
                aside={
                  <span className="text-[12.5px] text-muted tabular-nums">
                    {t("upcoming_total", { count: forecast.upcoming })}
                  </span>
                }
              />
              <div className="mt-5 grid h-[128px] grid-cols-7 items-end gap-2">
                {forecast.days.map((day, index) => (
                  <div key={index} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                    <span
                      className={cn(
                        "text-[12px] font-semibold tabular-nums",
                        day.count === 0 ? "text-faint" : index === 0 ? "text-ink" : "text-muted"
                      )}
                    >
                      {day.count}
                    </span>
                    <span
                      className={cn(
                        "w-full max-w-9 rounded-full transition-[height] duration-700",
                        index === 0
                          ? "bg-[var(--fc-teal)]"
                          : "bg-[color-mix(in_oklab,var(--fc-teal)_30%,var(--surface-2))]"
                      )}
                      style={{
                        height: day.count > 0 ? `${Math.max(10, (day.count / forecast.max) * 76)}px` : "6px",
                        opacity: day.count > 0 || index === 0 ? 1 : 0.6,
                      }}
                    />
                    <span
                      className={cn(
                        "w-full truncate text-center text-[11.5px] capitalize",
                        index === 0 ? "font-semibold text-ink" : "text-muted"
                      )}
                    >
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

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
                  <span className="min-w-0 truncate text-[13px] font-semibold text-ink tabular-nums">
                    {t("selected_cards", { count: selectedCards.length })}
                  </span>

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
