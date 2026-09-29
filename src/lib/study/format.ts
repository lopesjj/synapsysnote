import type { SupportedLanguage } from "@/types/models";

export const INTL_LOCALE: Record<SupportedLanguage, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  de: "de-DE",
  ru: "ru-RU",
  ja: "ja-JP",
  zh: "zh-CN",
  ar: "ar-u-nu-latn",
};

export function intlLocale(language: string): string {
  return INTL_LOCALE[language as SupportedLanguage] ?? "pt-BR";
}

export function splitDuration(seconds: number): { h: number; m: number; s: number } {
  const safe = Math.max(0, Math.round(seconds));
  return { h: Math.floor(safe / 3600), m: Math.floor((safe % 3600) / 60), s: safe % 60 };
}

export function clockLabel(seconds: number, forceHours = false): string {
  const { h, m, s } = splitDuration(seconds);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0 || forceHours) return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function hmLabel(seconds: number): string {
  const { h, m } = splitDuration(seconds);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const clean = value.trim();
  if (!clean) return 0;
  if (/^\d+$/.test(clean)) return Number(clean) * 60;
  const parts = clean.split(":").map((part) => part.trim());
  if (parts.some((part) => !/^\d+$/.test(part)) || parts.length > 3) return null;
  const numbers = parts.map(Number);
  if (numbers.length === 2) {
    const [h, m] = numbers;
    if (m > 59) return null;
    return h * 3600 + m * 60;
  }
  const [h, m, s] = numbers;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

export function formatNumber(value: number, language: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits }).format(value);
}

export function formatHoursTick(hours: number, language: string, units: { h: string; min: string }): string {
  if (hours <= 0) return "0";
  if (hours < 1) return `${Math.round(hours * 60)}${units.min}`;
  return `${formatNumber(hours, language, 1)}${units.h}`;
}
