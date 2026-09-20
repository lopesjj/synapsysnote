import type { Flashcard, FlashcardRating, FlashcardSettings } from "@/types/models";

export const DEFAULT_FLASHCARD_SETTINGS: FlashcardSettings = {
  dailyGoal: 20,
  intervalModifier: 1.0,
  enableNotifications: false,
  notificationTime: "09:00",
};

export const FLASHCARD_SETTINGS_STORAGE_KEY = "synapsys.flashcardSettings";

const DAY_MS = 86_400_000;

export const RELEARN_DELAY_MINUTES = 10;

const RELEARN_DELAY_MS = RELEARN_DELAY_MINUTES * 60_000;

export function startOfDay(timestamp: number = Date.now()): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(timestamp: number = Date.now()): number {
  const d = new Date(timestamp);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function scheduleInDays(days: number, from: number = Date.now()): number {
  return startOfDay(from + Math.max(1, Math.round(days)) * DAY_MS);
}

export interface ReviewCalculationResult {
  repetition: number;
  interval: number;
  easeFactor: number;
  nextReviewDate: number;
  relearn: boolean;
}

export function sanitizeModifier(modifier: number | undefined): number {
  const value = Number(modifier);
  if (!Number.isFinite(value) || value <= 0) return 1.0;
  return Math.max(0.5, Math.min(2.0, value));
}

export function calculateNextReview(
  current: Pick<Flashcard, "repetition" | "interval" | "easeFactor">,
  rating: FlashcardRating,
  modifier = 1.0
): ReviewCalculationResult {
  const safeModifier = sanitizeModifier(modifier);
  const prevRepetition = Math.max(0, Number(current.repetition) || 0);
  const prevInterval = Math.max(1, Number(current.interval) || 1);
  const prevEase = Math.max(1.3, Number(current.easeFactor) || 2.5);

  const quality = rating === "again" ? 1 : rating === "hard" ? 3 : rating === "good" ? 4 : 5;

  const newEase = Math.max(
    1.3,
    Math.min(3.0, prevEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  );

  let nextRepetition: number;
  let nextInterval: number;
  let relearn = false;

  if (rating === "again") {
    nextRepetition = 0;
    nextInterval = 1;
    relearn = true;
  } else if (rating === "hard") {
    nextRepetition = prevRepetition + 1;
    nextInterval =
      prevRepetition === 0
        ? Math.max(1, Math.round(1 * safeModifier))
        : Math.max(prevInterval + 1, Math.round(prevInterval * 1.2 * safeModifier));
  } else if (rating === "good") {
    nextRepetition = prevRepetition + 1;
    if (prevRepetition === 0) {
      nextInterval = Math.max(1, Math.round(1 * safeModifier));
    } else if (prevRepetition === 1) {
      nextInterval = Math.max(2, Math.round(6 * safeModifier));
    } else {
      nextInterval = Math.max(prevInterval + 1, Math.round(prevInterval * newEase * safeModifier));
    }
  } else {
    nextRepetition = prevRepetition + 1;
    if (prevRepetition === 0) {
      nextInterval = Math.max(3, Math.round(4 * safeModifier));
    } else {
      nextInterval = Math.max(
        prevInterval + 2,
        Math.round(prevInterval * newEase * 1.35 * safeModifier)
      );
    }
  }

  nextInterval = Math.min(nextInterval, 3650);

  return {
    repetition: nextRepetition,
    interval: nextInterval,
    easeFactor: Number(newEase.toFixed(2)),
    nextReviewDate: relearn ? Date.now() + RELEARN_DELAY_MS : scheduleInDays(nextInterval),
    relearn,
  };
}

export function isCardDueForReview(card: Flashcard, referenceTimestamp = Date.now()): boolean {
  return (Number(card.nextReviewDate) || 0) <= endOfDay(referenceTimestamp);
}

export type CardStage = "new" | "learning" | "mastered";

export const MASTERED_REPETITION_THRESHOLD = 3;

export function cardStage(card: Pick<Flashcard, "repetition" | "lastReviewedAt">): CardStage {
  if (!card.lastReviewedAt) return "new";
  if ((Number(card.repetition) || 0) >= MASTERED_REPETITION_THRESHOLD) return "mastered";
  return "learning";
}

export interface DeckStats {
  total: number;
  due: number;
  fresh: number;
  learning: number;
  mastered: number;
}

export function summarizeCards(cards: Flashcard[], reference = Date.now()): DeckStats {
  const stats: DeckStats = { total: cards.length, due: 0, fresh: 0, learning: 0, mastered: 0 };
  for (const card of cards) {
    if (isCardDueForReview(card, reference)) stats.due += 1;
    const stage = cardStage(card);
    if (stage === "new") stats.fresh += 1;
    else if (stage === "learning") stats.learning += 1;
    else stats.mastered += 1;
  }
  return stats;
}

export interface IntervalLabels {
  minutes: (value: number) => string;
  day: string;
  days: (value: number) => string;
  month: string;
  months: (value: number) => string;
  year: string;
  years: (value: string) => string;
}

export function formatInterval(days: number, labels: IntervalLabels, relearn = false): string {
  if (relearn) return labels.minutes(RELEARN_DELAY_MINUTES);
  const value = Math.max(1, Math.round(days));
  if (value < 30) return value === 1 ? labels.day : labels.days(value);
  if (value < 365) {
    const months = Math.round(value / 30);
    return months <= 1 ? labels.month : labels.months(months);
  }
  const years = Math.round((value / 365) * 10) / 10;
  if (years <= 1) return labels.year;
  return labels.years(Number.isInteger(years) ? String(years) : years.toFixed(1));
}

export function readStoredSettings(): FlashcardSettings {
  if (typeof window === "undefined") return DEFAULT_FLASHCARD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(FLASHCARD_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_FLASHCARD_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FlashcardSettings>;
    return {
      dailyGoal: Math.max(
        5,
        Math.min(200, Number(parsed.dailyGoal) || DEFAULT_FLASHCARD_SETTINGS.dailyGoal)
      ),
      intervalModifier: sanitizeModifier(parsed.intervalModifier),
      enableNotifications: Boolean(parsed.enableNotifications),
      notificationTime:
        typeof parsed.notificationTime === "string" && /^\d{2}:\d{2}$/.test(parsed.notificationTime)
          ? parsed.notificationTime
          : DEFAULT_FLASHCARD_SETTINGS.notificationTime,
    };
  } catch {
    return DEFAULT_FLASHCARD_SETTINGS;
  }
}

export function writeStoredSettings(settings: FlashcardSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLASHCARD_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("synapsys:flashcard-settings", { detail: settings }));
  } catch {}
}
