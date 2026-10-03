import type {
  BuiltInCategoryId,
  StickyColor,
  StudyCategory,
  StudyMotto,
  StudySettings,
  TimerSound,
} from "@/types/study";

export const SUBJECT_COLORS = [
  "#82a8d9",
  "#dca483",
  "#7abe9f",
  "#d3b877",
  "#da99b2",
  "#a6bc7e",
  "#ac9fd8",
  "#db9894",
  "#7fbac7",
  "#c8a58a",
  "#c598c1",
  "#97a4b2",
] as const;

export const LEGACY_SUBJECT_COLORS: Readonly<Record<string, string>> = {
  "#2a78d6": SUBJECT_COLORS[0],
  "#e0662f": SUBJECT_COLORS[1],
  "#129c6d": SUBJECT_COLORS[2],
  "#b98200": SUBJECT_COLORS[3],
  "#d2548a": SUBJECT_COLORS[4],
  "#5f8a1c": SUBJECT_COLORS[5],
  "#7a68d8": SUBJECT_COLORS[6],
  "#d94444": SUBJECT_COLORS[7],
  "#0e8aa0": SUBJECT_COLORS[8],
  "#a4643c": SUBJECT_COLORS[9],
  "#b5519e": SUBJECT_COLORS[10],
  "#607489": SUBJECT_COLORS[11],
  "#6f9ddb": SUBJECT_COLORS[0],
  "#e39a72": SUBJECT_COLORS[1],
  "#67bd98": SUBJECT_COLORS[2],
  "#d5b267": SUBJECT_COLORS[3],
  "#e18fae": SUBJECT_COLORS[4],
  "#9ebb6e": SUBJECT_COLORS[5],
  "#a797dc": SUBJECT_COLORS[6],
  "#e28a86": SUBJECT_COLORS[7],
  "#6fb7c6": SUBJECT_COLORS[8],
  "#c99c7f": SUBJECT_COLORS[9],
  "#c38dc0": SUBJECT_COLORS[10],
  "#8d9dae": SUBJECT_COLORS[11],
  "#9bb8d6": SUBJECT_COLORS[0],
  "#d2b19a": SUBJECT_COLORS[1],
  "#93c0a8": SUBJECT_COLORS[2],
  "#cfc08e": SUBJECT_COLORS[3],
  "#d2a8b6": SUBJECT_COLORS[4],
  "#b0be94": SUBJECT_COLORS[5],
  "#b4abd2": SUBJECT_COLORS[6],
  "#d2ada8": SUBJECT_COLORS[7],
  "#94bec8": SUBJECT_COLORS[8],
  "#c8b29a": SUBJECT_COLORS[9],
  "#c8a8c2": SUBJECT_COLORS[10],
  "#a4aeb8": SUBJECT_COLORS[11],
  "#8eb0d8": SUBJECT_COLORS[0],
  "#d7aa8e": SUBJECT_COLORS[1],
  "#86bfa3": SUBJECT_COLORS[2],
  "#d1bc82": SUBJECT_COLORS[3],
  "#d6a0b4": SUBJECT_COLORS[4],
  "#abbd89": SUBJECT_COLORS[5],
  "#b0a5d5": SUBJECT_COLORS[6],
  "#d7a29e": SUBJECT_COLORS[7],
  "#89bcc7": SUBJECT_COLORS[8],
  "#c8ab92": SUBJECT_COLORS[9],
  "#c6a0c1": SUBJECT_COLORS[10],
  "#9da9b5": SUBJECT_COLORS[11],
};

export function subjectColorOf(color: string): string {
  const key = color.toLowerCase();
  return LEGACY_SUBJECT_COLORS[key] ?? key;
}

export function subjectTone(color: string): string {
  const resolved = subjectColorOf(color);
  if (!/^#[0-9a-f]{6}$/i.test(resolved)) return resolved;
  return `oklch(from ${resolved} calc(l * var(--subject-l-mult) + var(--subject-l-add)) calc(c * var(--subject-c)) h)`;
}

export const BUILT_IN_CATEGORIES: readonly BuiltInCategoryId[] = [
  "theory",
  "practice",
  "review",
];

export const DEFAULT_CATEGORIES: StudyCategory[] = [
  { id: "theory", name: "", color: SUBJECT_COLORS[0] },
  { id: "practice", name: "", color: SUBJECT_COLORS[2] },
  { id: "review", name: "", color: SUBJECT_COLORS[1] },
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
  claimedAwards: {},
  awardOrder: {},
  motto: null,
  seenMottoIds: [],
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
      color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? subjectColorOf(raw.color) : SUBJECT_COLORS[11],
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
    claimedAwards: cleanClaims(source.claimedAwards),
    awardOrder: cleanAwardOrder(source.awardOrder),
    motto: cleanMotto(source.motto),
    seenMottoIds: cleanMottoIds(source.seenMottoIds),
    updatedAt: Number(source.updatedAt) || 0,
  };
}

function cleanAwardOrder(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [planId, ids] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    if (!planId || planId.length > 80 || !Array.isArray(ids)) continue;
    const clean = ids
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 80)
      .slice(0, 80);
    if (clean.length) out[planId] = clean;
  }
  return out;
}

function cleanMotto(value: unknown): StudySettings["motto"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<StudyMotto>;
  const day = typeof raw.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : "";
  const id = typeof raw.id === "string" && /^[a-f0-9]{20}$/.test(raw.id) ? raw.id : "";
  const en = typeof raw.en === "string" ? raw.en.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  if (!day || !id || !en) return null;
  const texts: Record<string, string> = {};
  if (raw.texts && typeof raw.texts === "object" && !Array.isArray(raw.texts)) {
    for (const [language, text] of Object.entries(raw.texts)) {
      if (!/^[a-z]{2}$/.test(language) || typeof text !== "string") continue;
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 280);
      if (clean) texts[language] = clean;
    }
  }
  if (!texts.en) texts.en = en;
  return {
    day,
    id,
    author: typeof raw.author === "string" ? raw.author.replace(/\s+/g, " ").trim().slice(0, 80) : "",
    en,
    texts,
  };
}

function cleanMottoIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !/^[a-f0-9]{20}$/.test(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
    if (ids.length >= 20_000) break;
  }
  return ids;
}

function cleanClaims(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, stamp] of Object.entries(value as Record<string, unknown>).slice(0, 2000)) {
    const at = Number(stamp);
    if (key && key.length <= 200 && Number.isFinite(at) && at > 0) out[key] = at;
  }
  return out;
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
