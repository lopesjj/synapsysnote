import type { CycleCompletion, CycleItem, CycleSubjectConfig, DayKey, StudyCycle } from "@/types/study";
import { addDays, compareDay, weekdayOf } from "./dates";

export const CYCLE_HISTORY_LIMIT = 800;

function roundTo5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

export function subjectScore(config: CycleSubjectConfig): number {
  return Math.max(1, config.weight) * (6 - Math.min(5, Math.max(1, config.level)));
}

export interface CyclePlanInput {
  subjects: CycleSubjectConfig[];
  weekMinutes: number[];
  minBlock: number;
  maxBlock: number;
  items?: CycleItem[];
}

export function cycleLength(input: Pick<CyclePlanInput, "weekMinutes">): number {
  return input.weekMinutes.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function subjectMinutes(input: CyclePlanInput): Map<string, number> {
  const total = cycleLength(input);
  const scored = input.subjects.map((config) => ({ id: config.subjectId, score: subjectScore(config) }));
  const sum = scored.reduce((acc, entry) => acc + entry.score, 0);
  const map = new Map<string, number>();
  if (!sum || !total) return map;
  for (const entry of scored) {
    map.set(entry.id, Math.max(input.minBlock, roundTo5((entry.score / sum) * total)));
  }
  return map;
}

function splitIntoBlocks(minutes: number, minBlock: number, maxBlock: number): number[] {
  const low = Math.max(10, Math.min(minBlock, maxBlock));
  const high = Math.max(low, maxBlock);
  let count = Math.max(1, Math.ceil(minutes / high));
  while (count > 1 && minutes / count < low) count -= 1;
  const base = roundTo5(minutes / count);
  const blocks = Array.from({ length: count }, () => base);
  let diff = roundTo5(minutes) - base * count;
  let index = 0;
  while (diff !== 0 && index < count * 4) {
    const step = diff > 0 ? 5 : -5;
    const target = index % count;
    if (blocks[target] + step >= 5) {
      blocks[target] += step;
      diff -= step;
    }
    index += 1;
  }
  return blocks;
}

export function generateCycleItems(input: CyclePlanInput, newId: (index: number) => string): CycleItem[] {
  const minutes = subjectMinutes(input);
  const scores = new Map(input.subjects.map((config) => [config.subjectId, subjectScore(config)]));
  const entries: { subjectId: string; minutes: number; position: number; score: number }[] = [];
  for (const config of input.subjects) {
    const total = minutes.get(config.subjectId);
    if (!total) continue;
    const blocks = splitIntoBlocks(total, input.minBlock, input.maxBlock);
    blocks.forEach((value, index) => {
      entries.push({
        subjectId: config.subjectId,
        minutes: value,
        position: (index + 0.5) / blocks.length,
        score: scores.get(config.subjectId) ?? 0,
      });
    });
  }
  entries.sort((a, b) => a.position - b.position || b.score - a.score);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].subjectId !== entries[index - 1].subjectId) continue;
    const swap = entries.findIndex(
      (candidate, position) =>
        position > index &&
        candidate.subjectId !== entries[index - 1].subjectId &&
        (position + 1 >= entries.length || entries[position + 1].subjectId !== entries[index].subjectId)
    );
    if (swap > index) [entries[index], entries[swap]] = [entries[swap], entries[index]];
  }
  return entries.map((entry, index) => ({ id: newId(index), subjectId: entry.subjectId, minutes: entry.minutes }));
}

export type PlannedStatus = "done" | "skipped" | "planned";

export interface PlannedBlock {
  key: string;
  itemId: string;
  subjectId: string;
  minutes: number;
  round: number;
  sequence: number;
  status: PlannedStatus;
  isNext: boolean;
  completion: CycleCompletion | null;
  topicId?: string | null;
  notes?: string | null;
  day?: DayKey | null;
  recurrence?: string | null;
}

export function projectSchedule(
  cycle: Pick<StudyCycle, "items" | "weekMinutes" | "pointer" | "round" | "history">,
  from: DayKey,
  to: DayKey,
  today: DayKey
): Map<DayKey, PlannedBlock[]> {
  const result = new Map<DayKey, PlannedBlock[]>();
  const push = (day: DayKey, block: PlannedBlock) => {
    const list = result.get(day);
    if (list) list.push(block);
    else result.set(day, [block]);
  };

  const sequenceOf = new Map(cycle.items.map((item, index) => [item.id, index]));
  let usedToday = 0;
  for (const completion of cycle.history) {
    if (compareDay(completion.day, from) < 0 || compareDay(completion.day, to) > 0) {
      if (completion.day === today && !completion.skipped) usedToday += completion.minutes;
      continue;
    }
    if (completion.day === today && !completion.skipped) usedToday += completion.minutes;
    push(completion.day, {
      key: `h:${completion.itemId}:${completion.round}:${completion.at}`,
      itemId: completion.itemId,
      subjectId: completion.subjectId,
      minutes: completion.minutes,
      round: completion.round,
      sequence: sequenceOf.get(completion.itemId) ?? -1,
      status: completion.skipped ? "skipped" : "done",
      isNext: false,
      completion,
      topicId: completion.topicId,
      notes: completion.notes,
    });
  }

  const datedItems = cycle.items.filter((item) => item.day);
  const rotatingItems = cycle.items.filter((item) => !item.day);

  for (const item of datedItems) {
    if (!item.day) continue;
    let curr = from;
    while (compareDay(curr, to) <= 0) {
      const match =
        !item.recurrence || item.recurrence === "none"
          ? curr === item.day
          : compareDay(curr, item.day) >= 0 &&
            (item.recurrence === "daily"
              ? true
              : item.recurrence === "weekdays"
                ? weekdayOf(curr) >= 1 && weekdayOf(curr) <= 5
                : item.recurrence === "monthly"
                  ? curr.slice(8, 10) === item.day.slice(8, 10)
                  : weekdayOf(curr) === weekdayOf(item.day));

      if (match) {
        const hasHistory = cycle.history.some((h) => h.itemId === item.id && h.day === curr);
        if (!hasHistory) {
          push(curr, {
            key: `d:${item.id}:${curr}`,
            itemId: item.id,
            subjectId: item.subjectId,
            minutes: item.minutes,
            round: cycle.round,
            sequence: sequenceOf.get(item.id) ?? -1,
            status: "planned",
            isNext: curr === today,
            completion: null,
            topicId: item.topicId,
            notes: item.notes,
            day: curr,
            recurrence: item.recurrence,
          });
        }
      }
      curr = addDays(curr, 1);
    }
  }

  if (!rotatingItems.length || compareDay(to, today) < 0) return result;
  const hasCapacity = cycle.weekMinutes.some((value) => value > 0);
  if (!hasCapacity) return result;

  let pointer = cycle.pointer % rotatingItems.length;
  let round = cycle.round;
  let first = !datedItems.some((item) => item.day === today);
  let day = today;
  let guard = 0;
  while (compareDay(day, to) <= 0 && guard < 5000) {
    guard += 1;
    const capacity = cycle.weekMinutes[weekdayOf(day)] ?? 0;
    let remaining = day === today ? Math.max(0, capacity - usedToday) : capacity;
    let placed = 0;
    while (remaining > 0 && guard < 5000) {
      guard += 1;
      const item = rotatingItems[pointer];
      const fits = remaining >= item.minutes * 0.6;
      const lonely = placed === 0 && remaining === capacity && remaining >= item.minutes * 0.34;
      if (!fits && !lonely) break;
      if (compareDay(day, from) >= 0) {
        push(day, {
          key: `p:${item.id}:${round}`,
          itemId: item.id,
          subjectId: item.subjectId,
          minutes: item.minutes,
          round,
          sequence: sequenceOf.get(item.id) ?? -1,
          status: "planned",
          isNext: first,
          completion: null,
          topicId: item.topicId,
          notes: item.notes,
          day: item.day,
          recurrence: item.recurrence,
        });
      }
      first = false;
      placed += 1;
      remaining -= item.minutes;
      pointer += 1;
      if (pointer >= rotatingItems.length) {
        pointer = 0;
        round += 1;
      }
    }
    day = addDays(day, 1);
  }
  return result;
}

export function advanceCycle(
  cycle: StudyCycle,
  day: DayKey,
  options: { sessionId?: string | null; skipped?: boolean; at: number }
): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  if (!cycle.items.length) return null;
  const item = cycle.items[cycle.pointer % cycle.items.length];
  const completion: CycleCompletion = {
    itemId: item.id,
    subjectId: item.subjectId,
    minutes: item.minutes,
    round: cycle.round,
    day,
    sessionId: options.sessionId ?? null,
    skipped: Boolean(options.skipped),
    at: options.at,
    topicId: item.topicId ?? null,
    notes: item.notes ?? null,
  };
  const nextPointer = cycle.pointer + 1;
  const wrapped = nextPointer >= cycle.items.length;
  return {
    pointer: wrapped ? 0 : nextPointer,
    round: wrapped ? cycle.round + 1 : cycle.round,
    history: [...cycle.history, completion].slice(-CYCLE_HISTORY_LIMIT),
  };
}

export function undoLastCompletion(cycle: StudyCycle): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  const last = cycle.history[cycle.history.length - 1];
  if (!last || !cycle.items.length) return null;
  const index = cycle.items.findIndex((item) => item.id === last.itemId);
  if (index < 0) return { pointer: cycle.pointer, round: cycle.round, history: cycle.history.slice(0, -1) };
  return {
    pointer: index,
    round: last.round,
    history: cycle.history.slice(0, -1),
  };
}

export function roundProgress(cycle: Pick<StudyCycle, "items" | "pointer">): { done: number; total: number; minutesDone: number; minutesTotal: number } {
  const total = cycle.items.length;
  const pointer = total ? cycle.pointer % total : 0;
  let minutesDone = 0;
  let minutesTotal = 0;
  cycle.items.forEach((item, index) => {
    minutesTotal += item.minutes;
    if (index < pointer) minutesDone += item.minutes;
  });
  return { done: pointer, total, minutesDone, minutesTotal };
}
