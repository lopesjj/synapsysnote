"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Maximize2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Flashcard, FlashcardRating } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Kbd, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import { useImageLightboxStore } from "@/lib/store/image-lightbox-store";
import { useWorkspace } from "@/lib/data/provider";
import { useFlashcardSettings } from "@/lib/flashcards/use-flashcard-settings";
import { calculateNextReview, formatInterval, orderStudyCards } from "@/lib/flashcards/srs";
import { formatDuration, intervalLabels } from "@/lib/flashcards/labels";
import { cardImage, hasCardImage } from "@/lib/flashcards/card-images";
import {
  CardFlipIcon,
  HintIcon,
  MasteredIcon,
  ReplayIcon,
} from "@/lib/icons/flashcard-icon";
import { notifyPlanError } from "@/lib/plans/client";

interface FlashcardStudySessionProps {
  cards: Flashcard[];
  onReview: (cardId: string, rating: FlashcardRating) => Promise<void>;
  onClose: () => void;
  title?: string;
  intervalModifier?: number;
}

const RATINGS: FlashcardRating[] = ["again", "hard", "good", "easy"];

// As cores vem de tokens redefinidos em .dark (globals.css), e nao do
// variante `dark:` do Tailwind: sem @custom-variant configurado ele segue o
// sistema operacional, nao o tema escolhido no app.
const RATING_STYLES: Record<
  FlashcardRating,
  { shell: string; key: string; dot: string; bar: string }
> = {
  again: {
    shell:
      "border-[color-mix(in_oklab,var(--rating-again)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-again)_8%,transparent)] text-[var(--rating-again-text)] hover:bg-[color-mix(in_oklab,var(--rating-again)_16%,transparent)]",
    key: "border-[color-mix(in_oklab,var(--rating-again)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-again)_12%,transparent)] text-[var(--rating-again-text)]",
    dot: "bg-[var(--rating-again)]",
    bar: "bg-[var(--rating-again)]",
  },
  hard: {
    shell:
      "border-[color-mix(in_oklab,var(--rating-hard)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-hard)_8%,transparent)] text-[var(--rating-hard-text)] hover:bg-[color-mix(in_oklab,var(--rating-hard)_16%,transparent)]",
    key: "border-[color-mix(in_oklab,var(--rating-hard)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-hard)_12%,transparent)] text-[var(--rating-hard-text)]",
    dot: "bg-[var(--rating-hard)]",
    bar: "bg-[var(--rating-hard)]",
  },
  good: {
    shell:
      "border-[color-mix(in_oklab,var(--rating-good)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-good)_8%,transparent)] text-[var(--rating-good-text)] hover:bg-[color-mix(in_oklab,var(--rating-good)_16%,transparent)]",
    key: "border-[color-mix(in_oklab,var(--rating-good)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-good)_12%,transparent)] text-[var(--rating-good-text)]",
    dot: "bg-[var(--rating-good)]",
    bar: "bg-[var(--rating-good)]",
  },
  easy: {
    shell:
      "border-[color-mix(in_oklab,var(--rating-easy)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-easy)_8%,transparent)] text-[var(--rating-easy-text)] hover:bg-[color-mix(in_oklab,var(--rating-easy)_16%,transparent)]",
    key: "border-[color-mix(in_oklab,var(--rating-easy)_28%,transparent)] bg-[color-mix(in_oklab,var(--rating-easy)_12%,transparent)] text-[var(--rating-easy-text)]",
    dot: "bg-[var(--rating-easy)]",
    bar: "bg-[var(--rating-easy)]",
  },
};

const RATING_LABEL_KEYS = {
  again: "rating_again",
  hard: "rating_hard",
  good: "rating_good",
  easy: "rating_easy",
} as const;

export function FlashcardStudySession({
  cards,
  onReview,
  onClose,
  title,
  intervalModifier = 1.0,
}: FlashcardStudySessionProps) {
  const { t } = useTranslation();
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const { adapter, notebooks, pages } = useWorkspace();
  const { settings } = useFlashcardSettings();
  const notebookByPage = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const page of pages) map.set(page.id, page.notebookId);
    return map;
  }, [pages]);
  const editsRef = useRef(new Map<string, { front: string; back: string; hint: string }>());
  const arrange = useCallback(
    (source: readonly Flashcard[]) =>
      orderStudyCards(
        source.map((card) => {
          const edit = editsRef.current.get(card.id);
          return edit ? { ...card, front: edit.front, back: edit.back, hint: edit.hint } : card;
        }),
        settings.studyOrder,
        { notebooks, notebookByPage }
      ),
    [notebookByPage, notebooks, settings.studyOrder]
  );

  const [queue, setQueue] = useState<Flashcard[]>(() => arrange(cards));
  const [baseOrder, setBaseOrder] = useState<string[]>(() => queue.map((card) => card.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftFront, setDraftFront] = useState("");
  const [draftBack, setDraftBack] = useState("");
  const [draftHint, setDraftHint] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [results, setResults] = useState<Map<string, FlashcardRating>>(new Map());
  const [answers, setAnswers] = useState<FlashcardRating[]>([]);
  const [completed, setCompleted] = useState(cards.length === 0);
  const lightboxOpen = useImageLightboxStore((state) => state.isOpen);
  const [elapsed, setElapsed] = useState(0);

  // Abre so a imagem da face atual: listar as duas deixaria a resposta a um
  // toque de distancia enquanto a pergunta ainda esta na tela.
  const openImage = useCallback(
    (url: string) => {
      useImageLightboxStore.getState().openLightbox([{ url }], 0);
    },
    []
  );

  const busyRef = useRef(false);
  const startedAtRef = useRef(0);
  const labels = useMemo(() => intervalLabels(t), [t]);

  const currentCard = queue[index];
  const total = baseOrder.length;
  const answeredUnique = results.size;

  useEffect(() => {
    if (startedAtRef.current === 0) startedAtRef.current = Date.now();
    if (completed) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [completed]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const intervals = useMemo(() => {
    const source = currentCard ?? { repetition: 0, interval: 1, easeFactor: 2.5 };
    return RATINGS.reduce<Record<FlashcardRating, string>>(
      (acc, rating) => {
        const result = calculateNextReview(source, rating, intervalModifier);
        acc[rating] = formatInterval(result.interval, labels, result.relearn);
        return acc;
      },
      { again: "", hard: "", good: "", easy: "" }
    );
  }, [currentCard, intervalModifier, labels]);

  const handleRate = useCallback(
    async (rating: FlashcardRating) => {
      if (busyRef.current || completed) return;
      const card = queue[index];
      if (!card) return;

      busyRef.current = true;
      setFlipped(false);
      setHintVisible(false);
      setAnswers((prev) => [...prev, rating]);
      setResults((prev) => {
        const next = new Map(prev);
        next.set(card.id, rating);
        return next;
      });

      try {
        await onReview(card.id, rating);
      } catch {
        busyRef.current = false;
        return;
      }

      let nextQueue = queue;
      if (rating === "again") {
        const projected = calculateNextReview(card, rating, intervalModifier);
        nextQueue = [
          ...queue,
          {
            ...card,
            repetition: projected.repetition,
            interval: projected.interval,
            easeFactor: projected.easeFactor,
            nextReviewDate: projected.nextReviewDate,
            lastReviewedAt: Date.now(),
          },
        ];
        setQueue(nextQueue);
      }

      if (index + 1 < nextQueue.length) setIndex(index + 1);
      else setCompleted(true);

      busyRef.current = false;
    },
    [completed, index, intervalModifier, onReview, queue]
  );

  const restart = () => {
    const fresh = arrange(cards);
    setQueue(fresh);
    setBaseOrder(fresh.map((card) => card.id));
    setIndex(0);
    setFlipped(false);
    setHintVisible(false);
    setEditing(false);
    setResults(new Map());
    setAnswers([]);
    setCompleted(fresh.length === 0);
    setElapsed(0);
    startedAtRef.current = Date.now();
  };

  const openEdit = useCallback(() => {
    const card = queue[index];
    if (!card) return;
    setDraftFront(card.front);
    setDraftBack(card.back);
    setDraftHint(card.hint ?? "");
    setEditing(true);
  }, [index, queue]);

  const saveEdit = useCallback(async () => {
    const card = queue[index];
    if (!card || savingEdit) return;
    const front = draftFront.trim();
    const back = draftBack.trim();
    const hint = draftHint.trim();
    const frontOk = front.length > 0 || Boolean(cardImage(card, "front").url);
    const backOk = back.length > 0 || Boolean(cardImage(card, "back").url);
    if (!frontOk || !backOk) {
      toast.error(t("card_side_required"));
      return;
    }
    setSavingEdit(true);
    try {
      await adapter.updateFlashcard(card.id, { front, back, hint: hint || undefined });
      editsRef.current.set(card.id, { front, back, hint });
      setQueue((prev) =>
        prev.map((item) => (item.id === card.id ? { ...item, front, back, hint } : item))
      );
      setEditing(false);
      toast.success(t("card_updated"));
    } catch (error) {
      if (!notifyPlanError(error)) toast.error(t("card_save_failed"));
    } finally {
      setSavingEdit(false);
    }
  }, [adapter, draftBack, draftFront, draftHint, index, queue, savingEdit, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Com o visualizador aberto ele e quem manda: tem os proprios atalhos de
      // zoom e de fechar.
      if (lightboxOpen) return;
      if (event.defaultPrevented) return;
      if (editing) {
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(false);
        }
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("[data-study-edit]")
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (completed) return;

      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) setFlipped((prev) => !prev);
        return;
      }

      if (!flipped) return;
      const position = Number(event.key);
      if (position >= 1 && position <= 4) {
        event.preventDefault();
        void handleRate(RATINGS[position - 1]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completed, editing, flipped, handleRate, lightboxOpen, onClose]);

  const counts = useMemo(() => {
    const base: Record<FlashcardRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const rating of answers) base[rating] += 1;
    return base;
  }, [answers]);

  const retention =
    answers.length === 0
      ? 100
      : Math.round(((counts.good + counts.easy) / answers.length) * 100);

  const remaining = completed ? 0 : Math.max(0, queue.length - index - 1);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-100 overflow-y-auto bg-[var(--canvas)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-6 pt-4 pb-safe sm:px-6 sm:pt-6">
        <header className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("exit_study")}
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-muted transition hover:text-ink"
          >
            <ArrowLeft className="size-4" />
          </button>

          <div className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              {t("study_session")}
            </span>
            <h2 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              {title || t("flashcards")}
            </h2>
          </div>

          <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[12px] font-semibold text-ink tabular-nums">
            {Math.min(answeredUnique + (completed ? 0 : 1), total)}
            <span className="mx-0.5 text-faint">/</span>
            <span className="text-muted">{total}</span>
          </span>
        </header>

        <div className="mt-3.5 flex shrink-0 gap-[3px]" aria-hidden="true">
          {baseOrder.map((id, position) => {
            const rating = results.get(id);
            const isCurrent = !completed && currentCard?.id === id;
            return (
              <span
                key={`${id}-${position}`}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  rating
                    ? RATING_STYLES[rating].bar
                    : isCurrent
                      ? "bg-[var(--accent)]/45"
                      : "bg-[var(--surface-2)]"
                )}
              />
            );
          })}
        </div>

        {!completed && currentCard ? (
          <>
            <div className="flex flex-1 items-center justify-center py-6">
              <div className="relative w-full">
                {editing ? (
                  <form
                    className="flex w-full flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-panel)] sm:p-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEdit();
                    }}
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-muted">
                        {t("card_front")}
                      </span>
                      <Textarea
                        value={draftFront}
                        onChange={(event) => setDraftFront(event.target.value)}
                        rows={4}
                        className="min-h-28 text-base leading-relaxed sm:min-h-24 sm:text-[14px]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-muted">
                        {t("card_back")}
                      </span>
                      <Textarea
                        value={draftBack}
                        onChange={(event) => setDraftBack(event.target.value)}
                        rows={4}
                        className="min-h-28 text-base leading-relaxed sm:min-h-24 sm:text-[14px]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-muted">
                        {t("card_hint")}
                      </span>
                      <Textarea
                        value={draftHint}
                        onChange={(event) => setDraftHint(event.target.value)}
                        rows={2}
                        placeholder={t("card_hint_placeholder")}
                        className="min-h-16 text-base leading-relaxed sm:min-h-14 sm:text-[14px]"
                      />
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        disabled={savingEdit}
                        onClick={() => setEditing(false)}
                        className="w-full sm:w-auto"
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={savingEdit}
                        className="w-full font-semibold sm:w-auto"
                      >
                        {t("save_changes")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 -bottom-2 h-10 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)]/70"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-1 h-10 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]"
                />

                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t("flip_card")}
                  onClick={() => setFlipped((prev) => !prev)}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      setFlipped((prev) => !prev);
                    }
                  }}
                  className={cn(
                    "group relative w-full cursor-pointer outline-none [perspective:1600px]",
                    hasCardImage(currentCard)
                      ? "h-[420px] sm:h-[470px]"
                      : "h-[360px] sm:h-[400px]"
                  )}
                >
                  <button
                    type="button"
                    data-study-edit=""
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit();
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                    }}
                    aria-label={t("edit_card")}
                    className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-[var(--surface-2)] hover:text-ink sm:right-4 sm:top-4 sm:size-8"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <motion.div
                    className="relative h-full w-full [transform-style:preserve-3d]"
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                    }
                  >
                    <CardFace
                      side="front"
                      card={currentCard}
                      hintVisible={hintVisible}
                      onShowHint={() => setHintVisible(true)}
                      onOpenImage={openImage}
                    />
                    <CardFace
                      side="back"
                      card={currentCard}
                      hintVisible
                      onOpenImage={openImage}
                    />
                  </motion.div>
                </div>
                  </>
                )}
              </div>
            </div>

            {!editing ? (
            <div className="shrink-0">
              {!flipped ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setFlipped(true)}
                  className="h-12 w-full gap-2 text-[14px] font-semibold"
                >
                  <CardFlipIcon className="size-4" />
                  <span>{t("show_answer")}</span>
                  <Kbd className="ml-1 border-white/25 bg-white/15 text-[10px] text-[var(--accent-contrast)]">
                    {t("key_space")}
                  </Kbd>
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RATINGS.map((rating, position) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => void handleRate(rating)}
                      className={cn(
                        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] border transition active:scale-[0.98]",
                        RATING_STYLES[rating].shell
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <Kbd className={cn("text-[10px]", RATING_STYLES[rating].key)}>
                          {position + 1}
                        </Kbd>
                        {t(RATING_LABEL_KEYS[rating])}
                      </span>
                      <span className="text-[11px] font-medium text-muted tabular-nums">
                        {intervals[rating]}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 text-[11.5px] text-faint">
                <span>{flipped ? t("rate_shortcuts_hint") : t("flip_card_hint")}</span>
                <span className="shrink-0 tabular-nums">{t("cards_remaining_count", { count: remaining })}</span>
              </div>
            </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]">
              <MasteredIcon className="size-7" />
            </span>

            <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
              {t("session_completed")}
            </h3>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
              {t("session_completed_desc")}
            </p>

            <div className="mt-7 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-left">
              <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
                <SummaryCell label={t("cards_reviewed")} value={String(answeredUnique)} />
                <SummaryCell label={t("retention_rate")} value={`${retention}%`} />
                <SummaryCell label={t("session_duration")} value={formatDuration(elapsed, t)} />
              </div>

              {answers.length > 0 ? (
                <div className="border-t border-[var(--border)] px-4 py-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                    {t("answers_distribution")}
                  </span>
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    {RATINGS.map((rating) =>
                      counts[rating] > 0 ? (
                        <span
                          key={rating}
                          style={{ width: `${(counts[rating] / answers.length) * 100}%` }}
                          className={cn("h-full", RATING_STYLES[rating].bar)}
                        />
                      ) : null
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                    {RATINGS.map((rating) => (
                      <span
                        key={rating}
                        className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"
                      >
                        <span
                          className={cn("size-2 rounded-full", RATING_STYLES[rating].dot)}
                        />
                        {t(RATING_LABEL_KEYS[rating])}
                        <span className="font-semibold text-ink tabular-nums">
                          {counts[rating]}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center gap-2.5">
              <Button variant="secondary" size="md" onClick={restart} className="gap-1.5">
                <ReplayIcon className="size-4" />
                <span>{t("restart_session")}</span>
              </Button>
              <Button variant="primary" size="md" onClick={onClose} className="font-semibold">
                {t("back_to_flashcards")}
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>,
    document.body
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <span className="block text-[20px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </span>
      <span className="mt-1.5 block text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
        {label}
      </span>
    </div>
  );
}

function CardFace({
  side,
  card,
  hintVisible,
  onShowHint,
  onOpenImage,
}: {
  side: "front" | "back";
  card: Flashcard;
  hintVisible: boolean;
  onShowHint?: () => void;
  onOpenImage: (url: string) => void;
}) {
  const { t } = useTranslation();
  const isFront = side === "front";
  const text = isFront ? card.front : card.back;
  const image = cardImage(card, side);
  const hasText = text.trim().length > 0;
  // Uma face so com imagem nao deve reservar espaco para um paragrafo vazio.
  const showTextBlock = hasText || Boolean(card.hint);

  return (
    <div
      className={cn(
        "absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--surface)] p-6 shadow-[var(--shadow-panel)] [backface-visibility:hidden] sm:p-8",
        isFront
          ? "border-[var(--border)]"
          : "border-[var(--border)] [transform:rotateY(180deg)]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          isFront ? "bg-[var(--accent)]" : "bg-[var(--success)]"
        )}
      />

      <div className="flex shrink-0 items-center justify-between gap-2 pr-10 sm:pr-8">
        <span
          className={cn(
            "shrink-0 text-[11px] font-semibold uppercase tracking-[0.09em]",
            isFront ? "text-[var(--accent)]" : "text-[var(--success)]"
          )}
        >
          {isFront ? t("card_front_short") : t("card_back_short")}
        </span>
        <span className="min-w-0 truncate text-[11.5px] text-faint">
          {card.pageTitle || t("untitled")}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center py-3">
        {showTextBlock ? (
          <div
            className={cn(
              "flex w-full flex-col items-center justify-center overflow-y-auto text-center [scrollbar-width:none]",
              // Sem imagem o texto ocupa a face inteira; com imagem ele fica
              // limitado para que a ilustracao receba o resto do espaco.
              image.url ? "max-h-[45%] shrink-0" : "min-h-0 flex-1"
            )}
          >
            {hasText ? (
              <p
                className={cn(
                  "max-w-[46ch] text-balance leading-[1.45] text-ink",
                  image.url
                    ? text.length > 120
                      ? "text-[14px] sm:text-[15.5px]"
                      : "text-[16.5px] font-medium sm:text-[19px]"
                    : text.length > 180
                      ? "text-[15px] sm:text-[17px]"
                      : "text-[19px] font-medium sm:text-[23px]"
                )}
              >
                {text}
              </p>
            ) : null}

            {card.hint ? (
              <div className={hasText ? "mt-3" : undefined}>
                {hintVisible ? (
                  <span className="inline-flex max-w-[38ch] items-start gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-left text-[12.5px] leading-snug text-muted">
                    <HintIcon className="mt-px size-3.5 shrink-0 text-[var(--warning)]" />
                    <span>{card.hint}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowHint?.();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] font-medium text-muted transition hover:text-ink"
                  >
                    <HintIcon className="size-3.5 text-[var(--warning)]" />
                    {t("view_hint")}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {image.url ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenImage(image.url as string);
            }}
            aria-label={t("expand")}
            className={cn(
              "group/img relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-sm)]",
              showTextBlock && "mt-3"
            )}
          >
            <img
              src={image.url}
              alt=""
              className="max-h-full max-w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] object-contain"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/40 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
              <Maximize2 className="size-4" />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
