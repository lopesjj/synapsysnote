import type { AgendaEntry, AgendaRepeat, DayKey } from "@/types/study";
import { addDays, compareDay, weekdayOf } from "./dates";

export const MAX_AGENDA_ENTRIES = 120;
export const MAX_AGENDA_REMOVED = 400;

export interface AgendaDraft {
  subjectId: string;
  minutes: number;
  start: DayKey;
  repeat: AgendaRepeat;
  weekdays: number[];
  topicId: string | null;
  note?: string;
}

type Schedule = Pick<AgendaEntry, "start" | "until" | "repeat" | "weekdays" | "removed">;

export function occursOn(entry: Schedule, day: DayKey): boolean {
  if (compareDay(day, entry.start) < 0 || entry.removed.includes(day)) return false;
  if (entry.until && compareDay(day, entry.until) > 0) return false;
  const weekday = weekdayOf(day);
  switch (entry.repeat) {
    case "daily":
      return true;
    case "weekly":
      return weekday === weekdayOf(entry.start);
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "monthly":
      return day.slice(8, 10) === entry.start.slice(8, 10);
    case "custom":
      return entry.weekdays.includes(weekday);
    default:
      return day === entry.start;
  }
}

export function nextOccurrence(entry: Schedule, from: DayKey): DayKey | null {
  let day = compareDay(entry.start, from) > 0 ? entry.start : from;
  for (let step = 0; step < 400; step += 1, day = addDays(day, 1)) {
    if (entry.until && compareDay(day, entry.until) > 0) return null;
    if (occursOn(entry, day)) return day;
    if (entry.repeat === "none") return null;
  }
  return null;
}

/**
 * Minutos que os dias fixos com repetição semanal ocupam numa semana a partir de
 * `from`. Marcações avulsas e mensais ficam de fora: não fazem parte da semana típica.
 */
export function weeklyAgendaMinutes(agenda: readonly AgendaEntry[], from: DayKey): number {
  let total = 0;
  const weekly = agenda.filter((entry) => entry.repeat !== "none" && entry.repeat !== "monthly");
  for (let step = 0; step < 7; step += 1) {
    const day = addDays(from, step);
    for (const entry of weekly) if (occursOn(entry, day)) total += entry.minutes;
  }
  return total;
}

export function nextWeekday(from: DayKey, weekday: number): DayKey {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}

export function makeAgendaEntry(
  draft: AgendaDraft,
  base?: Pick<AgendaEntry, "id" | "until" | "removed" | "createdAt">
): AgendaEntry {
  const weekdays =
    draft.repeat === "custom"
      ? [...new Set(draft.weekdays)].filter((value) => Number.isInteger(value) && value >= 0 && value <= 6).sort((a, b) => a - b)
      : [];
  return {
    id: base?.id ?? "",
    subjectId: draft.subjectId,
    minutes: Math.min(600, Math.max(5, Math.round(draft.minutes))),
    start: draft.start,
    repeat: draft.repeat === "custom" && !weekdays.length ? "none" : draft.repeat,
    weekdays,
    topicId: draft.topicId,
    note: draft.topicId ? "" : (draft.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    until: base?.until ?? null,
    removed: base?.removed ?? [],
    createdAt: base?.createdAt ?? 0,
  };
}

export function upsertAgendaEntry(agenda: AgendaEntry[], entry: AgendaEntry): AgendaEntry[] {
  if (entry.id && agenda.some((item) => item.id === entry.id)) return agenda.map((item) => (item.id === entry.id ? entry : item));
  return [...agenda, entry];
}

export function deleteAgendaEntry(agenda: AgendaEntry[], id: string): AgendaEntry[] {
  return agenda.filter((item) => item.id !== id);
}

/** Tira um único dia da repetição; uma disciplina sem repetição sai inteira. */
export function dropAgendaDay(agenda: AgendaEntry[], id: string, day: DayKey): AgendaEntry[] {
  return agenda.flatMap((item) => {
    if (item.id !== id) return [item];
    if (item.repeat === "none") return [];
    return [{ ...item, removed: [...new Set([...item.removed, day])].slice(-MAX_AGENDA_REMOVED) }];
  });
}

/** Encerra a repetição na véspera de `day` ("este e os seguintes"). */
export function endAgendaBefore(agenda: AgendaEntry[], id: string, day: DayKey): AgendaEntry[] {
  return agenda.flatMap((item) => {
    if (item.id !== id) return [item];
    if (compareDay(day, item.start) <= 0) return [];
    const until = addDays(day, -1);
    return [{ ...item, until, removed: item.removed.filter((removed) => compareDay(removed, until) <= 0) }];
  });
}
