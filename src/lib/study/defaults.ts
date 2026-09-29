import type {
  BuiltInCategoryId,
  StickyColor,
  StudyCategory,
  StudySettings,
  TimerSound,
} from "@/types/study";

export const SUBJECT_COLORS = [
  "#2a78d6",
  "#e0662f",
  "#129c6d",
  "#b98200",
  "#d2548a",
  "#5f8a1c",
  "#7a68d8",
  "#d94444",
  "#0e8aa0",
  "#a4643c",
  "#b5519e",
  "#607489",
] as const;

export const BUILT_IN_CATEGORIES: readonly BuiltInCategoryId[] = [
  "theory",
  "practice",
  "review",
];

export const DEFAULT_CATEGORIES: StudyCategory[] = [
  { id: "theory", name: "", color: "#2a78d6" },
  { id: "practice", name: "", color: "#129c6d" },
  { id: "review", name: "", color: "#e0662f" },
];

export const REVIEW_INTERVAL_PRESETS = [1, 3, 7, 15, 30, 60, 90, 120, 180, 270, 365] as const;

export const TIMER_SOUNDS: readonly TimerSound[] = ["chime", "bell", "soft", "digital", "none"];

export const STICKY_COLORS: readonly StickyColor[] = ["sun", "mint", "sky", "rose", "lilac"];

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  activePlanId: null,
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  weekStartsOn: 1,
  performanceLow: 70,
  performanceHigh: 85,
  reviewIntervals: [1, 7, 30],
  autoReviews: true,
  categories: DEFAULT_CATEGORIES,
  timerSound: "chime",
  timeZone: "auto",
  pomodoroFocus: 25,
  pomodoroShort: 5,
  pomodoroLong: 15,
  pomodoroRounds: 4,
  updatedAt: 0,
};

export const MAX_TOPICS_PER_SUBJECT = 600;
export const MAX_NAME_LENGTH = 160;
export const MAX_TOPIC_LENGTH = 300;
export const MAX_SESSION_SECONDS = 16 * 3600;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanCategories(value: unknown): StudyCategory[] {
  if (!Array.isArray(value)) return DEFAULT_CATEGORIES;
  const removed = new Set(["reading", "video", "summary"]);
  const seen = new Set<string>();
  const list: StudyCategory[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<StudyCategory>;
    const id = typeof raw.id === "string" ? raw.id.slice(0, 40) : "";
    if (!id || seen.has(id) || removed.has(id)) continue;
    seen.add(id);
    list.push({
      id,
      name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "",
      color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#607489",
    });
  }
  for (const builtIn of DEFAULT_CATEGORIES) {
    if (!seen.has(builtIn.id)) list.push(builtIn);
  }
  return list;
}

export function normalizeSettings(raw: Partial<StudySettings> | null | undefined): StudySettings {
  const source = raw ?? {};
  const weekdays = Array.isArray(source.studyWeekdays)
    ? [...new Set(source.studyWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : DEFAULT_STUDY_SETTINGS.studyWeekdays;
  const intervals = Array.isArray(source.reviewIntervals)
    ? [...new Set(source.reviewIntervals.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 730))].sort(
        (a, b) => a - b
      )
    : DEFAULT_STUDY_SETTINGS.reviewIntervals;
  const low = clampInt(source.performanceLow, 1, 98, DEFAULT_STUDY_SETTINGS.performanceLow);
  const high = clampInt(source.performanceHigh, low + 1, 100, Math.max(low + 1, DEFAULT_STUDY_SETTINGS.performanceHigh));
  return {
    activePlanId: typeof source.activePlanId === "string" ? source.activePlanId : null,
    studyWeekdays: weekdays,
    weekStartsOn: source.weekStartsOn === 0 ? 0 : 1,
    performanceLow: low,
    performanceHigh: high,
    reviewIntervals: intervals.slice(0, 16),
    autoReviews: source.autoReviews !== false,
    categories: cleanCategories(source.categories),
    timerSound: TIMER_SOUNDS.includes(source.timerSound as TimerSound)
      ? (source.timerSound as TimerSound)
      : DEFAULT_STUDY_SETTINGS.timerSound,
    timeZone: typeof source.timeZone === "string" && source.timeZone ? source.timeZone : "auto",
    pomodoroFocus: clampInt(source.pomodoroFocus, 5, 120, DEFAULT_STUDY_SETTINGS.pomodoroFocus),
    pomodoroShort: clampInt(source.pomodoroShort, 1, 60, DEFAULT_STUDY_SETTINGS.pomodoroShort),
    pomodoroLong: clampInt(source.pomodoroLong, 1, 90, DEFAULT_STUDY_SETTINGS.pomodoroLong),
    pomodoroRounds: clampInt(source.pomodoroRounds, 2, 8, DEFAULT_STUDY_SETTINGS.pomodoroRounds),
    updatedAt: Number(source.updatedAt) || 0,
  };
}

export function nextSubjectColor(used: string[]): string {
  const counts = new Map<string, number>(SUBJECT_COLORS.map((color) => [color, 0]));
  for (const color of used) {
    if (counts.has(color)) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  let best: string = SUBJECT_COLORS[0];
  let bestCount = Infinity;
  for (const color of SUBJECT_COLORS) {
    const count = counts.get(color) ?? 0;
    if (count < bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}
