"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Eye,
  Flame,
  Lightbulb,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import type { Flashcard, FlashcardRating } from "@/types/models";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/translations";
import { calculateNextReview } from "@/lib/flashcards/srs";

interface FlashcardStudySessionProps {
  cards: Flashcard[];
  onReview: (cardId: string, rating: FlashcardRating) => Promise<void>;
  onClose: () => void;
  title?: string;
  intervalModifier?: number;
}

interface RatingSummary {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export function FlashcardStudySession({
  cards,
  onReview,
  onClose,
  title,
  intervalModifier = 1.0,
}: FlashcardStudySessionProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [ratingStats, setRatingStats] = useState<RatingSummary>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  const studyQueue = useMemo(() => {
    return [...cards].sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  }, [cards]);

  const currentCard = studyQueue[currentIndex];

  const intervals = useMemo(() => {
    if (!currentCard) return { again: "1d", hard: "2d", good: "4d", easy: "7d" };
    const a = calculateNextReview(currentCard, "again", intervalModifier);
    const h = calculateNextReview(currentCard, "hard", intervalModifier);
    const g = calculateNextReview(currentCard, "good", intervalModifier);
    const e = calculateNextReview(currentCard, "easy", intervalModifier);
    return {
      again: `${a.interval}d`,
      hard: `${h.interval}d`,
      good: `${g.interval}d`,
      easy: `${e.interval}d`,
    };
  }, [currentCard, intervalModifier]);

  const handleRate = async (rating: FlashcardRating) => {
    if (!currentCard) return;
    setIsFlipped(false);
    setShowHint(false);
    setRatingStats((prev) => ({
      ...prev,
      [rating]: prev[rating] + 1,
    }));
    await onReview(currentCard.id, rating);
    setReviewedCount((prev) => prev + 1);

    if (currentIndex + 1 < studyQueue.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setReviewedCount(0);
    setRatingStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setSessionCompleted(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionCompleted) {
        if (e.key === "Escape") onClose();
        return;
      }

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
        return;
      }

      if (isFlipped) {
        if (e.key === "1") {
          e.preventDefault();
          void handleRate("again");
        } else if (e.key === "2") {
          e.preventDefault();
          void handleRate("hard");
        } else if (e.key === "3") {
          e.preventDefault();
          void handleRate("good");
        } else if (e.key === "4") {
          e.preventDefault();
          void handleRate("easy");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, sessionCompleted, currentCard]);

  const progressPercent = studyQueue.length
    ? Math.round((currentIndex / studyQueue.length) * 100)
    : 100;

  const retentionPercent = useMemo(() => {
    const total = ratingStats.again + ratingStats.hard + ratingStats.good + ratingStats.easy;
    if (total === 0) return 100;
    const successful = ratingStats.good + ratingStats.easy;
    return Math.round((successful / total) * 100);
  }, [ratingStats]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-2 sm:p-5 select-none overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-[var(--accent)]/15 via-sky-500/10 to-transparent blur-3xl opacity-70 rounded-full" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-t from-emerald-500/10 via-purple-500/5 to-transparent blur-3xl opacity-50 rounded-full" />
      </div>

      <div className="relative w-full max-w-2xl h-[560px] sm:h-[610px] max-h-[94vh] flex flex-col justify-between rounded-3xl border border-white/10 dark:border-white/10 bg-[var(--canvas)]/95 p-4 sm:p-7 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.6)] my-auto pb-safe overflow-hidden">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-muted hover:text-ink transition active:scale-95 cursor-pointer shrink-0"
              title={t("close")}
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/25">
                  <Flame className="size-3 fill-current" />
                  <span>Synapsys SRS</span>
                </span>
                <span className="text-[11px] font-mono text-muted hidden sm:inline">
                  {studyQueue.length - currentIndex} {t("cards_remaining")}
                </span>
              </div>
              <h2 className="truncate text-sm sm:text-base font-extrabold text-ink tracking-tight mt-0.5">
                {title || t("flashcards")}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 font-mono text-xs font-bold px-3 py-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-[var(--accent)]">{currentIndex + 1}</span>
              <span className="text-faint">/</span>
              <span className="text-muted">{studyQueue.length}</span>
            </div>
            <button
              onClick={onClose}
              className="flex size-8.5 items-center justify-center rounded-2xl hover:bg-[var(--surface-hover)] text-muted hover:text-ink transition active:scale-95 border border-transparent hover:border-[var(--border)] cursor-pointer"
              aria-label={t("close")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="w-full bg-[var(--surface-2)] h-2 rounded-full overflow-hidden mt-3 p-0.5 border border-[var(--border)]/60 shadow-inner shrink-0">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] via-sky-400 to-emerald-400 transition-all duration-300 shadow-[0_0_12px_rgba(14,116,144,0.5)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {!sessionCompleted && currentCard ? (
          <div className="flex-1 flex items-center justify-center w-full py-2 min-h-0">
            <div
              onClick={() => setIsFlipped((prev) => !prev)}
              role="button"
              tabIndex={0}
              className="group relative w-full h-[320px] sm:h-[360px] cursor-pointer select-none [perspective:1200px]"
            >
              <motion.div
                className="relative w-full h-full [transform-style:preserve-3d]"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                <div
                  className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-8 flex flex-col justify-between [backface-visibility:hidden] border border-[var(--border)]/80 bg-gradient-to-b from-[var(--surface)] via-[var(--surface)] to-[var(--surface-2)] shadow-[0_12px_36px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.4)] transition-colors group-hover:border-[var(--accent)]/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shadow-xs">
                      <span className="size-1.5 rounded-full bg-sky-500 animate-pulse" />
                      {t("card_front")}
                    </span>

                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted group-hover:text-[var(--accent)] transition bg-[var(--canvas)] px-3 py-1 rounded-full border border-[var(--border)]/60">
                      <RotateCw className="size-3 text-[var(--accent)] transition-transform duration-300 group-hover:rotate-180" />
                      <span>{t("flip_card")}</span>
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center text-center my-3 overflow-y-auto px-2 [scrollbar-width:none]">
                    <p className="text-lg sm:text-2xl font-semibold text-ink leading-relaxed tracking-tight max-w-xl">
                      {currentCard.front}
                    </p>

                    {currentCard.hint ? (
                      <div className="mt-3.5">
                        {showHint ? (
                          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-medium backdrop-blur-xs shadow-xs animate-in fade-in duration-200">
                            <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
                            <span>{currentCard.hint}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowHint(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--surface-2)] hover:bg-amber-500/10 border border-[var(--border)] hover:border-amber-500/30 text-muted hover:text-amber-600 dark:hover:text-amber-400 text-xs font-medium transition cursor-pointer"
                          >
                            <Lightbulb className="size-3" />
                            <span>{t("card_hint")}</span>
                          </button>
                        )}
                      </div>
                    ) : null}

                    {currentCard.imageUrl ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageModalUrl(currentCard.imageUrl || null);
                        }}
                        className="relative mt-3 max-h-24 sm:max-h-32 overflow-hidden rounded-2xl border border-[var(--border)] bg-black/5 hover:opacity-95 transition-all active:scale-95 shadow-xs group/img"
                      >
                        <img
                          src={currentCard.imageUrl}
                          alt="Attachment"
                          className="h-24 sm:h-32 w-auto object-contain rounded-2xl"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Eye className="size-4 drop-shadow" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-faint pt-2 border-t border-[var(--border)]/40">
                    <span className="truncate max-w-[200px]">
                      {currentCard.pageTitle || t("untitled")}
                    </span>
                    <span className="text-[10.5px] font-mono text-faint">
                      {t("flip_card_hint")}
                    </span>
                  </div>
                </div>

                <div
                  className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-8 flex flex-col justify-between [backface-visibility:hidden] [transform:rotateY(180deg)] border border-[var(--border)]/80 bg-gradient-to-b from-[var(--surface)] via-[var(--surface)] to-[var(--surface-2)] shadow-[0_12px_36px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.4)] transition-colors group-hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t("card_back")}
                    </span>

                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted group-hover:text-[var(--accent)] transition bg-[var(--canvas)] px-3 py-1 rounded-full border border-[var(--border)]/60">
                      <RotateCw className="size-3 text-emerald-500 transition-transform duration-300 group-hover:rotate-180" />
                      <span>{t("card_front")}</span>
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center text-center my-3 overflow-y-auto px-2 [scrollbar-width:none]">
                    <p className="text-lg sm:text-2xl font-semibold text-ink leading-relaxed tracking-tight max-w-xl">
                      {currentCard.back}
                    </p>

                    {currentCard.hint ? (
                      <span className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--canvas)] border border-[var(--border)] text-muted text-[11px]">
                        <Lightbulb className="size-3 text-amber-500" />
                        <span>{currentCard.hint}</span>
                      </span>
                    ) : null}

                    {currentCard.imageUrl ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageModalUrl(currentCard.imageUrl || null);
                        }}
                        className="relative mt-3 max-h-24 sm:max-h-32 overflow-hidden rounded-2xl border border-[var(--border)] bg-black/5 hover:opacity-95 transition-all active:scale-95 shadow-xs group/img"
                      >
                        <img
                          src={currentCard.imageUrl}
                          alt="Attachment"
                          className="h-24 sm:h-32 w-auto object-contain rounded-2xl"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Eye className="size-4 drop-shadow" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-faint pt-2 border-t border-[var(--border)]/40">
                    <span className="truncate max-w-[200px]">
                      {currentCard.pageTitle || t("untitled")}
                    </span>
                    <span className="text-[10.5px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {t("rate_shortcuts_hint")}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4 min-h-0">
            <div className="relative flex size-18 sm:size-22 items-center justify-center rounded-3xl bg-gradient-to-tr from-amber-500/20 via-emerald-500/20 to-[var(--accent)]/20 border border-amber-500/30 text-amber-500 mb-3 shadow-[0_8px_30px_rgba(245,158,11,0.2)] shrink-0">
              <Trophy className="size-9 sm:size-11 text-amber-500 drop-shadow" />
              <Sparkles className="absolute -top-1.5 -right-1.5 size-5 text-amber-400 animate-bounce" />
            </div>

            <h3 className="text-xl sm:text-2xl font-extrabold text-ink mb-1 tracking-tight">
              {t("session_completed")}
            </h3>
            <p className="text-xs sm:text-sm text-muted max-w-md mb-5 leading-relaxed">
              {t("session_completed_desc")}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-lg mb-6">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center shadow-xs">
                <span className="block text-2xl font-extrabold text-ink font-mono">
                  {reviewedCount}
                </span>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  {t("cards_reviewed")}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center shadow-xs">
                <span className="block text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  {retentionPercent}%
                </span>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  {t("retention_rate")}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center shadow-xs">
                <span className="block text-2xl font-extrabold text-sky-600 dark:text-sky-400 font-mono">
                  {ratingStats.good + ratingStats.easy}
                </span>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  {t("rating_good")}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center shadow-xs">
                <span className="block text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">
                  {ratingStats.again}
                </span>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  {t("rating_again")}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                className="px-5 h-10.5 rounded-2xl border border-[var(--border)] font-bold text-xs sm:text-sm cursor-pointer"
                onClick={handleRestart}
              >
                <RotateCw className="size-4 mr-2" />
                <span>{t("restart_session")}</span>
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="px-7 h-10.5 rounded-2xl shadow-md font-bold text-xs sm:text-sm cursor-pointer"
                onClick={onClose}
              >
                {t("back_to_flashcards")}
              </Button>
            </div>
          </div>
        )}

        {!sessionCompleted && currentCard ? (
          <div className="pt-3 border-t border-[var(--border)]/60 h-[68px] sm:h-[72px] flex items-center shrink-0">
            {!isFlipped ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full h-12 text-sm sm:text-base font-extrabold shadow-md bg-gradient-to-r from-[var(--accent)] via-sky-600 to-indigo-600 hover:brightness-105 active:scale-[0.99] transition rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
                onClick={() => setIsFlipped(true)}
              >
                <Eye className="size-4.5" />
                <span>{t("show_answer")}</span>
                <span className="ml-2 text-xs font-mono opacity-70 bg-black/20 px-2 py-0.5 rounded-lg">
                  Space
                </span>
              </Button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 w-full">
                <button
                  onClick={() => void handleRate("again")}
                  className="flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-500/10 to-rose-500/5 hover:from-rose-500/20 hover:to-rose-500/15 text-rose-600 dark:text-rose-400 font-bold transition active:scale-95 h-12 touch-manipulation shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <RotateCcw className="size-3.5 transition-transform group-hover:-rotate-45" />
                    <span className="text-xs sm:text-sm">{t("rating_again")}</span>
                  </div>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.2 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold">
                    <span>{intervals.again}</span>
                    <span className="opacity-60">(1)</span>
                  </span>
                </button>

                <button
                  onClick={() => void handleRate("hard")}
                  className="flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/15 text-amber-600 dark:text-amber-400 font-bold transition active:scale-95 h-12 touch-manipulation shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Zap className="size-3.5 transition-transform group-hover:scale-110" />
                    <span className="text-xs sm:text-sm">{t("rating_hard")}</span>
                  </div>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                    <span>{intervals.hard}</span>
                    <span className="opacity-60">(2)</span>
                  </span>
                </button>

                <button
                  onClick={() => void handleRate("good")}
                  className="flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl border border-sky-500/30 bg-gradient-to-b from-sky-500/10 to-sky-500/5 hover:from-sky-500/20 hover:to-sky-500/15 text-sky-600 dark:text-sky-400 font-bold transition active:scale-95 h-12 touch-manipulation shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Check className="size-3.5 transition-transform group-hover:scale-110" />
                    <span className="text-xs sm:text-sm">{t("rating_good")}</span>
                  </div>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.2 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold">
                    <span>{intervals.good}</span>
                    <span className="opacity-60">(3)</span>
                  </span>
                </button>

                <button
                  onClick={() => void handleRate("easy")}
                  className="flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 hover:from-emerald-500/20 hover:to-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold transition active:scale-95 h-12 touch-manipulation shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 transition-transform group-hover:scale-110" />
                    <span className="text-xs sm:text-sm">{t("rating_easy")}</span>
                  </div>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                    <span>{intervals.easy}</span>
                    <span className="opacity-60">(4)</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : null}

        {imageModalUrl ? (
          <div
            onClick={() => setImageModalUrl(null)}
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
          >
            <div className="relative max-w-3xl max-h-[85vh]">
              <img
                src={imageModalUrl}
                alt="Enlarged attachment"
                className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
              />
              <button
                onClick={() => setImageModalUrl(null)}
                className="absolute top-3 right-3 rounded-full bg-black/70 p-2 text-white hover:bg-black/90 transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
