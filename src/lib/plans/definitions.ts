export const PLAN_IDS = ["free", "basic", "pro", "ultra", "owner"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PAID_PLANS = ["basic", "pro", "ultra"] as const;
export type PaidPlanId = (typeof PAID_PLANS)[number];

export const ASSIGNABLE_PLANS = ["free", "basic", "pro", "ultra"] as const;
export type AssignablePlanId = (typeof ASSIGNABLE_PLANS)[number];

export const CATALOG_PLANS = ["free", "basic", "pro", "ultra"] as const;

export const TRANSCRIBE_PURPOSE_HEADER = "x-transcribe-purpose";

export const DAY_MS = 86_400_000;
export const TRIAL_DAYS = 30;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;
export const READ_ONLY_GRACE_MS = 3 * DAY_MS;
export const TRIAL_WARNING_DAYS = 5;

export interface PlanLimits {
  pages: number | null;
  notebooksPerPage: number | null;
  notesPerNotebook: number | null;
  subnotesPerNote: number | null;
  activeGoals: number | null;
}

export type LimitKey = keyof PlanLimits;

export const LIMIT_KEYS: readonly LimitKey[] = [
  "pages",
  "notebooksPerPage",
  "notesPerNotebook",
  "subnotesPerNote",
  "activeGoals",
];

export interface PlanFeatures {
  video: boolean;
  transcription: boolean;
  flashcards: boolean;
  aiFlashcards: boolean;
  archive: boolean;
  goalArchive: boolean;
  awards: boolean;
}

export type FeatureKey = keyof PlanFeatures;

export const FEATURE_KEYS: readonly FeatureKey[] = [
  "video",
  "transcription",
  "flashcards",
  "aiFlashcards",
  "archive",
  "goalArchive",
  "awards",
];

export type PlanTier = "basic" | "pro" | "ultra" | "owner";

export const UNLIMITED: PlanLimits = {
  pages: null,
  notebooksPerPage: null,
  notesPerNotebook: null,
  subnotesPerNote: null,
  activeGoals: null,
};

export const ALL_FEATURES: PlanFeatures = {
  video: true,
  transcription: true,
  flashcards: true,
  aiFlashcards: true,
  archive: true,
  goalArchive: true,
  awards: true,
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  basic: { pages: 1, notebooksPerPage: 15, notesPerNotebook: 15, subnotesPerNote: 0, activeGoals: 1 },
  pro: { pages: 3, notebooksPerPage: 30, notesPerNotebook: 30, subnotesPerNote: 5, activeGoals: 3 },
  ultra: { pages: 10, notebooksPerPage: 50, notesPerNotebook: 50, subnotesPerNote: 10, activeGoals: 5 },
  owner: UNLIMITED,
};

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  basic: {
    video: false,
    transcription: false,
    flashcards: false,
    aiFlashcards: false,
    archive: false,
    goalArchive: false,
    awards: false,
  },
  pro: {
    video: true,
    transcription: true,
    flashcards: true,
    aiFlashcards: false,
    archive: true,
    goalArchive: true,
    awards: true,
  },
  ultra: ALL_FEATURES,
  owner: ALL_FEATURES,
};

export const TRIAL_TIER: PlanTier = "ultra";

export const READ_ONLY_FEATURES: PlanFeatures = {
  video: false,
  transcription: false,
  flashcards: false,
  aiFlashcards: false,
  archive: true,
  goalArchive: true,
  awards: true,
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}

export function isAssignablePlan(value: unknown): value is AssignablePlanId {
  return typeof value === "string" && (ASSIGNABLE_PLANS as readonly string[]).includes(value);
}

export function catalogLimits(plan: (typeof CATALOG_PLANS)[number]): PlanLimits {
  return plan === "free" ? PLAN_LIMITS[TRIAL_TIER] : PLAN_LIMITS[plan];
}

export function catalogFeatures(plan: (typeof CATALOG_PLANS)[number]): PlanFeatures {
  return plan === "free" ? PLAN_FEATURES[TRIAL_TIER] : PLAN_FEATURES[plan];
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|mkv|avi|3gp|3g2|mpg|mpeg|ogv|wmv|flv|ts|hevc)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba)$/i;

export function isVideoMedia(input: { name?: string | null; type?: string | null }): boolean {
  const type = (input.type ?? "").toLowerCase();
  if (type.startsWith("video/")) return true;
  if (type.startsWith("audio/")) return false;
  const name = input.name ?? "";
  if (AUDIO_EXTENSIONS.test(name)) return false;
  return VIDEO_EXTENSIONS.test(name);
}

const MAX_BLOCK_DEPTH = 64;

export function blocksContainVideo(blocks: unknown, depth = 0): boolean {
  if (!Array.isArray(blocks) || depth > MAX_BLOCK_DEPTH) return false;
  return blocks.some((block) => {
    if (!block || typeof block !== "object") return false;
    const entry = block as { type?: unknown; media?: unknown; children?: unknown };
    if (entry.type === "video") return true;
    if (entry.media && typeof entry.media === "object") {
      const media = entry.media as { name?: unknown; mimeType?: unknown };
      const name = typeof media.name === "string" ? media.name : null;
      const type = typeof media.mimeType === "string" ? media.mimeType : null;
      if (isVideoMedia({ name, type })) return true;
    }
    return blocksContainVideo(entry.children, depth + 1);
  });
}

export function pageContainsVideo(page: { blocks?: unknown; blocksJson?: unknown }): boolean {
  if (blocksContainVideo(page.blocks)) return true;
  if (typeof page.blocksJson !== "string" || !page.blocksJson) return false;
  try {
    return blocksContainVideo(JSON.parse(page.blocksJson));
  } catch {
    return false;
  }
}
