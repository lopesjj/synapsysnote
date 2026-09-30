import type { AgendaEntry, CycleCompletion, CycleItem, CycleSubjectConfig, DayKey, StudyCycle } from "@/types/study";
import { occursOn } from "./agenda";
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
  /** Tempo semanal já ocupado pelos dias fixos; a rotação divide só o restante. */
  reservedMinutes?: number;
}

export function cycleLength(input: Pick<CyclePlanInput, "weekMinutes">): number {
  return input.weekMinutes.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function subjectMinutes(input: CyclePlanInput): Map<string, number> {
  const total = Math.max(0, cycleLength(input) - Math.max(0, input.reservedMinutes ?? 0));
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
  // O ciclo gira: a última disciplina encosta na primeira. Trocas que reduzem as
  // repetições contando a virada da volta também nunca aumentam as internas.
  const circular = () => entries.filter((entry, index) => entry.subjectId === entries[(index + 1) % entries.length].subjectId).length;
  let repeats = entries.length > 2 ? circular() : 0;
  for (let first = 0; repeats > 0 && first < entries.length - 1; first += 1) {
    for (let second = first + 1; repeats > 0 && second < entries.length; second += 1) {
      if (entries[first].subjectId === entries[second].subjectId) continue;
      [entries[first], entries[second]] = [entries[second], entries[first]];
      const next = circular();
      if (next < repeats) repeats = next;
      else [entries[first], entries[second]] = [entries[second], entries[first]];
    }
  }
  return entries.map((entry, index) => ({ id: newId(index), subjectId: entry.subjectId, minutes: entry.minutes }));
}

export type PlannedStatus = "done" | "skipped" | "planned" | "missed";

export interface PlannedBlock {
  key: string;
  itemId: string;
  subjectId: string;
  minutes: number;
  round: number;
  sequence: number;
  status: PlannedStatus;
  isNext: boolean;
  fixed: boolean;
  completion: CycleCompletion | null;
}

export function projectSchedule(
  cycle: Pick<StudyCycle, "items" | "agenda" | "weekMinutes" | "pointer" | "round" | "history">,
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
  const fixedIds = new Set(cycle.agenda.map((entry) => entry.id));
  const marked = new Set<string>();
  let usedToday = 0;
  for (const completion of cycle.history) {
    if (completion.day === today && !completion.skipped) usedToday += completion.minutes;
    if (fixedIds.has(completion.itemId)) marked.add(`${completion.itemId}:${completion.day}`);
    if (compareDay(completion.day, from) < 0 || compareDay(completion.day, to) > 0) continue;
    push(completion.day, {
      key: `h:${completion.itemId}:${completion.round}:${completion.at}`,
      itemId: completion.itemId,
      subjectId: completion.subjectId,
      minutes: completion.minutes,
      round: completion.round,
      sequence: sequenceOf.get(completion.itemId) ?? -1,
      status: completion.skipped ? "skipped" : "done",
      isNext: false,
      fixed: fixedIds.has(completion.itemId),
      completion,
    });
  }

  // Disciplinas em dia fixo aparecem nos seus dias e reservam esse tempo antes da rotação.
  const reserved = new Map<DayKey, number>();
  if (cycle.agenda.length) {
    for (let day = compareDay(from, today) < 0 ? from : today; compareDay(day, to) <= 0; day = addDays(day, 1)) {
      for (const entry of cycle.agenda) {
        if (!occursOn(entry, day) || marked.has(`${entry.id}:${day}`)) continue;
        const past = compareDay(day, today) < 0;
        if (!past) reserved.set(day, (reserved.get(day) ?? 0) + entry.minutes);
        if (compareDay(day, from) < 0) continue;
        push(day, {
          key: `a:${entry.id}:${day}`,
          itemId: entry.id,
          subjectId: entry.subjectId,
          minutes: entry.minutes,
          round: cycle.round,
          sequence: -1,
          status: past ? "missed" : "planned",
          isNext: false,
          fixed: true,
          completion: null,
        });
      }
    }
  }

  if (!cycle.items.length || compareDay(to, today) < 0) return result;
  if (!cycle.weekMinutes.some((value) => value > 0)) return result;

  // A projeção começa no ponteiro e preenche o tempo livre de cada dia a partir
  // de hoje; dias anteriores a `from` só consomem a sequência.
  let pointer = cycle.pointer % cycle.items.length;
  let round = cycle.round;
  let first = true;
  let day = today;
  let guard = 0;
  while (compareDay(day, to) <= 0 && guard < 5000) {
    guard += 1;
    const capacity = cycle.weekMinutes[weekdayOf(day)] ?? 0;
    let remaining = Math.max(0, capacity - (day === today ? usedToday : 0) - (reserved.get(day) ?? 0));
    let placed = 0;
    while (remaining > 0 && guard < 5000) {
      guard += 1;
      const item = cycle.items[pointer];
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
          sequence: pointer,
          status: "planned",
          isNext: first,
          fixed: false,
          completion: null,
        });
      }
      first = false;
      placed += 1;
      remaining -= item.minutes;
      pointer += 1;
      if (pointer >= cycle.items.length) {
        pointer = 0;
        round += 1;
      }
    }
    day = addDays(day, 1);
  }
  return result;
}

export type LapState = "done" | "skipped" | "current" | "pending";

/**
 * Situação de cada disciplina na volta atual. Vale o que está no histórico da
 * volta; a que ficou para trás do ponteiro sem registro (porque o usuário
 * escolheu outra como próxima) conta como pulada.
 */
export function lapStates(cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">): LapState[] {
  const total = cycle.items.length;
  if (!total) return [];
  const pointer = cycle.pointer % total;
  const marks = new Map<string, boolean>();
  for (const entry of cycle.history) {
    if (entry.round === cycle.round) marks.set(entry.itemId, entry.skipped);
  }
  return cycle.items.map((item, index) => {
    if (index === pointer) return "current";
    const skipped = marks.get(item.id);
    if (skipped === false) return "done";
    if (skipped === true || index < pointer) return "skipped";
    return "pending";
  });
}

/**
 * Depois de editar a lista, o ponteiro acompanha a disciplina que era a atual.
 * Se ela saiu, vai para a primeira que sobrou depois dela; se não sobrou
 * nenhuma depois, a volta terminou. Uma lista inteiramente nova recomeça do
 * início da mesma volta.
 */
export function remapPointer(
  previous: Pick<StudyCycle, "items" | "pointer" | "round">,
  items: readonly Pick<CycleItem, "id">[]
): { pointer: number; round: number } {
  const total = previous.items.length;
  if (!items.length || !total) return { pointer: 0, round: previous.round };
  const indexOf = new Map(items.map((item, index) => [item.id, index]));
  if (!previous.items.some((item) => indexOf.has(item.id))) return { pointer: 0, round: previous.round };
  for (let index = previous.pointer % total; index < total; index += 1) {
    const found = indexOf.get(previous.items[index].id);
    if (found !== undefined) return { pointer: found, round: previous.round };
  }
  return { pointer: 0, round: previous.round + 1 };
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
  };
  const nextPointer = cycle.pointer + 1;
  const wrapped = nextPointer >= cycle.items.length;
  return {
    pointer: wrapped ? 0 : nextPointer,
    round: wrapped ? cycle.round + 1 : cycle.round,
    history: [...cycle.history, completion].slice(-CYCLE_HISTORY_LIMIT),
  };
}

export function undoLastCompletion(
  cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">
): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  const last = cycle.history[cycle.history.length - 1];
  if (!last) return null;
  const index = cycle.items.findIndex((item) => item.id === last.itemId);
  if (index < 0) return { pointer: cycle.pointer, round: cycle.round, history: cycle.history.slice(0, -1) };
  return {
    pointer: index,
    round: last.round,
    history: cycle.history.slice(0, -1),
  };
}

/**
 * Apaga um registro do histórico. O último registro é desfeito por inteiro
 * (a disciplina volta a ser a atual); um registro mais antigo só sai da lista.
 */
export function removeCompletion(
  cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">,
  target: Pick<CycleCompletion, "itemId" | "day" | "at">
): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  const index = cycle.history.findIndex(
    (entry) => entry.itemId === target.itemId && entry.day === target.day && entry.at === target.at
  );
  if (index < 0) return null;
  if (index === cycle.history.length - 1) return undoLastCompletion(cycle);
  return { pointer: cycle.pointer, round: cycle.round, history: cycle.history.filter((_, position) => position !== index) };
}

export function pendingAgendaEntry(
  cycle: Pick<StudyCycle, "agenda" | "history">,
  subjectId: string,
  day: DayKey
): AgendaEntry | null {
  return (
    cycle.agenda.find(
      (entry) =>
        entry.subjectId === subjectId &&
        occursOn(entry, day) &&
        !cycle.history.some((completion) => completion.itemId === entry.id && completion.day === day)
    ) ?? null
  );
}

export function recordAgendaDay(
  cycle: Pick<StudyCycle, "round" | "history">,
  entry: AgendaEntry,
  day: DayKey,
  options: { sessionId?: string | null; skipped?: boolean; at: number }
): Pick<StudyCycle, "history"> | null {
  if (!occursOn(entry, day) || cycle.history.some((completion) => completion.itemId === entry.id && completion.day === day)) return null;
  const completion: CycleCompletion = {
    itemId: entry.id,
    subjectId: entry.subjectId,
    minutes: entry.minutes,
    round: cycle.round,
    day,
    sessionId: options.sessionId ?? null,
    skipped: Boolean(options.skipped),
    at: options.at,
  };
  return { history: [...cycle.history, completion].slice(-CYCLE_HISTORY_LIMIT) };
}

export interface RoundProgress {
  done: number;
  total: number;
  position: number;
  minutesDone: number;
  minutesLeft: number;
  minutesTotal: number;
  states: LapState[];
}

export function roundProgress(cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">): RoundProgress {
  const states = lapStates(cycle);
  const total = cycle.items.length;
  let done = 0;
  let minutesDone = 0;
  let minutesLeft = 0;
  let minutesTotal = 0;
  cycle.items.forEach((item, index) => {
    minutesTotal += item.minutes;
    if (states[index] === "done") {
      done += 1;
      minutesDone += item.minutes;
    } else if (states[index] !== "skipped") {
      minutesLeft += item.minutes;
    }
  });
  return { done, total, position: total ? (cycle.pointer % total) + 1 : 0, minutesDone, minutesLeft, minutesTotal, states };
}
