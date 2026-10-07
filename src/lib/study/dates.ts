import type { DayKey } from "@/types/study";

const DAY_MS = 86_400_000;
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function resolveZone(timeZone?: string | null): string | undefined {
  if (!timeZone || timeZone === "auto") return undefined;
  return timeZone;
}

function keyFormatter(timeZone?: string | null): Intl.DateTimeFormat {
  const zone = resolveZone(timeZone);
  const cacheKey = zone ?? "local";
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      formatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    formatters.set(cacheKey, formatter);
  }
  return formatter;
}

function minuteFormatter(timeZone?: string | null): Intl.DateTimeFormat {
  const zone = resolveZone(timeZone);
  const cacheKey = `m:${zone ?? "local"}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch {
      formatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
    formatters.set(cacheKey, formatter);
  }
  return formatter;
}

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export function dayKeyOf(ms: number, timeZone?: string | null): DayKey {
  const parts = keyFormatter(timeZone).formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function todayKey(timeZone?: string | null): DayKey {
  return dayKeyOf(Date.now(), timeZone);
}

export function minuteOfDay(ms: number, timeZone?: string | null): number {
  const [hour, minute] = minuteFormatter(timeZone).format(new Date(ms)).split(":").map(Number);
  return (hour % 24) * 60 + (minute || 0);
}

export function keyToUtc(key: DayKey): number {
  const match = KEY_PATTERN.exec(key);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function utcToKey(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, amount: number): DayKey {
  return utcToKey(keyToUtc(key) + amount * DAY_MS);
}

export function diffDays(from: DayKey, to: DayKey): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
}

export function weekdayOf(key: DayKey): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

export function startOfWeek(key: DayKey, weekStartsOn: 0 | 1): DayKey {
  const weekday = weekdayOf(key);
  const offset = (weekday - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function weekDays(start: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: DayKey, amount: number): DayKey {
  const date = new Date(keyToUtc(startOfMonth(key)));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return utcToKey(date.getTime());
}

export function monthGrid(month: DayKey, weekStartsOn: 0 | 1): DayKey[] {
  const first = startOfMonth(month);
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const total = diffDays(from, to);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_, index) => addDays(from, index));
}

export function compareDay(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function orderedWeekdays(weekStartsOn: 0 | 1): number[] {
  return Array.from({ length: 7 }, (_, index) => (index + weekStartsOn) % 7);
}

export function formatDay(
  key: DayKey,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
): string {
  if (!isDayKey(key)) return "";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(keyToUtc(key)));
}

/**
 * Intervalo de datas com o ano no fim — e também no começo quando o trecho
 * atravessa a virada do ano.
 */
export function dayRangeLabel(from: DayKey, to: DayKey, locale: string): { start: string; end: string } {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return {
    start: formatDay(from, locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }),
    end: formatDay(to, locale, { day: "numeric", month: "short", year: "numeric" }),
  };
}

export function weekdayLabel(weekday: number, locale: string, width: "narrow" | "short" | "long" = "short"): string {
  const reference = Date.UTC(2023, 0, 1 + weekday);
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(new Date(reference));
}

export function monthLabel(key: DayKey, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(keyToUtc(key))
  );
}

export function minuteLabel(minute: number | null | undefined): string {
  if (minute === null || minute === undefined || !Number.isFinite(minute)) return "";
  const safe = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function parseMinuteLabel(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function availableTimeZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const zones = intl.supportedValuesOf?.("timeZone");
    if (zones && zones.length) return zones;
  } catch {}
  return [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/Lisbon",
    "Europe/London",
    "Europe/Madrid",
    "Europe/Paris",
    "Europe/Rome",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Riyadh",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "UTC",
  ];
}

export function zoneOffsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return value.replace("GMT", "UTC") || "UTC";
  } catch {
    return "";
  }
}

export function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;
}
