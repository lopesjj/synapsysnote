import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useUiStore } from "@/lib/store/ui-store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const RELATIVE_LOCALES: Record<
  string,
  {
    never: string;
    now: string;
    min: (n: number) => string;
    hour: (n: number) => string;
    day: (n: number) => string;
    locale: string;
  }
> = {
  pt: {
    never: "nunca",
    now: "agora",
    min: (n) => `há ${n} min`,
    hour: (n) => `há ${n} h`,
    day: (n) => `há ${n} d`,
    locale: "pt-BR",
  },
  en: {
    never: "never",
    now: "now",
    min: (n) => `${n}m ago`,
    hour: (n) => `${n}h ago`,
    day: (n) => `${n}d ago`,
    locale: "en-US",
  },
  es: {
    never: "nunca",
    now: "ahora",
    min: (n) => `hace ${n} min`,
    hour: (n) => `hace ${n} h`,
    day: (n) => `hace ${n} d`,
    locale: "es-ES",
  },
  fr: {
    never: "jamais",
    now: "maintenant",
    min: (n) => `il y a ${n} min`,
    hour: (n) => `il y a ${n} h`,
    day: (n) => `il y a ${n} j`,
    locale: "fr-FR",
  },
  it: {
    never: "mai",
    now: "ora",
    min: (n) => `${n} min fa`,
    hour: (n) => `${n} h fa`,
    day: (n) => `${n} g fa`,
    locale: "it-IT",
  },
  de: {
    never: "nie",
    now: "jetzt",
    min: (n) => `vor ${n} Min.`,
    hour: (n) => `vor ${n} Std.`,
    day: (n) => `vor ${n} T.`,
    locale: "de-DE",
  },
  ru: {
    never: "никогда",
    now: "сейчас",
    min: (n) => `${n} мин. назад`,
    hour: (n) => `${n} ч. назад`,
    day: (n) => `${n} дн. назад`,
    locale: "ru-RU",
  },
  ja: {
    never: "なし",
    now: "たった今",
    min: (n) => `${n}分前`,
    hour: (n) => `${n}時間前`,
    day: (n) => `${n}日前`,
    locale: "ja-JP",
  },
  zh: {
    never: "从不",
    now: "刚刚",
    min: (n) => `${n}分钟前`,
    hour: (n) => `${n}小时前`,
    day: (n) => `${n}天前`,
    locale: "zh-CN",
  },
};

export function formatRelative(ts: number | null | undefined, lang?: string): string {
  const currentLang =
    lang ||
    (typeof window !== "undefined" ? useUiStore.getState().language : undefined) ||
    "pt";
  const loc = RELATIVE_LOCALES[currentLang] || RELATIVE_LOCALES.pt;

  if (!ts) return loc.never;
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return loc.now;
  if (min < 60) return loc.min(min);
  const hours = Math.round(min / 60);
  if (hours < 24) return loc.hour(hours);
  const days = Math.round(hours / 24);
  if (days < 30) return loc.day(days);
  return new Date(ts).toLocaleDateString(loc.locale, { day: "numeric", month: "short" });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 360;
  return hash;
}

export function compareNatural(a: string, b: string, lang?: string) {
  const currentLang =
    lang ||
    (typeof window !== "undefined" ? useUiStore.getState().language : undefined) ||
    "pt";
  const loc = RELATIVE_LOCALES[currentLang]?.locale || "pt-BR";
  return a.localeCompare(b, loc, { numeric: true, sensitivity: "base" });
}

export function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
