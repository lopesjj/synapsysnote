import type { AgendaEntry, CycleCompletion, CycleItem, CycleSubjectConfig, DayKey, StudyCycle, StudySession } from "@/types/study";
import { occursOn } from "./agenda";
import { addDays, compareDay, weekdayOf } from "./dates";

export const CYCLE_HISTORY_LIMIT = 800;

/**
 * Teto para o progresso parcial dos dias fixos. A chave é `entrada:dia`, e um
 * dia só estudado pela metade nunca fecha — sem o teto, um dia fixo diário
 * deixaria uma chave por dia no documento do ciclo, para sempre. As chaves da
 * rotação (`item:volta`) somem ao fechar o bloco, então ficam todas.
 */
export const CYCLE_PROGRESS_DAYS = 120;

const DATE_KEY = /:\d{4}-\d{2}-\d{2}$/;

function prunedProgress(progress: Record<string, number>): Record<string, number> {
  const dated = Object.keys(progress).filter((key) => DATE_KEY.test(key));
  if (dated.length <= CYCLE_PROGRESS_DAYS) return progress;
  const drop = new Set(dated.sort().slice(0, dated.length - CYCLE_PROGRESS_DAYS));
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(progress)) if (!drop.has(key)) next[key] = value;
  return next;
}

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
  cycle: Pick<StudyCycle, "items" | "agenda" | "weekMinutes" | "pointer" | "round" | "history"> & { progress?: Record<string, number> },
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

  const reserved = new Map<DayKey, number>();
  if (cycle.agenda.length) {
    for (let day = compareDay(from, today) < 0 ? from : today; compareDay(day, to) <= 0; day = addDays(day, 1)) {
      for (const entry of cycle.agenda) {
        if (!occursOn(entry, day) || marked.has(`${entry.id}:${day}`)) continue;
        const past = compareDay(day, today) < 0;
        const studied = cycle.progress?.[`${entry.id}:${day}`] ?? 0;
        const remainingMinutes = Math.max(0, entry.minutes - studied);
        if (!past) reserved.set(day, (reserved.get(day) ?? 0) + remainingMinutes);
        if (compareDay(day, from) < 0) continue;
        push(day, {
          key: `a:${entry.id}:${day}`,
          itemId: entry.id,
          subjectId: entry.subjectId,
          minutes: remainingMinutes,
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
      const progressKey = `${item.id}:${round}`;
      const studied = day === today && first ? (cycle.progress?.[progressKey] ?? 0) : 0;
      const effectiveMinutes = Math.max(0, item.minutes - studied);
      const fits = remaining >= effectiveMinutes * 0.6;
      const lonely = placed === 0 && remaining === capacity && remaining >= effectiveMinutes * 0.34;
      if (!fits && !lonely) break;
      if (compareDay(day, from) >= 0) {
        push(day, {
          key: `p:${item.id}:${round}`,
          itemId: item.id,
          subjectId: item.subjectId,
          minutes: effectiveMinutes,
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
      remaining -= effectiveMinutes;
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

/** Fecha uma disciplina na volta atual sem mexer no ponteiro. */
export function recordCycleItem(
  cycle: Pick<StudyCycle, "round" | "history">,
  item: CycleItem,
  day: DayKey,
  options: { sessionId?: string | null; skipped?: boolean; at: number; from?: number }
): Pick<StudyCycle, "history"> {
  const completion: CycleCompletion = {
    itemId: item.id,
    subjectId: item.subjectId,
    minutes: item.minutes,
    round: cycle.round,
    day,
    sessionId: options.sessionId ?? null,
    skipped: Boolean(options.skipped),
    at: options.at,
    ...(options.from === undefined ? null : { from: options.from }),
  };
  return { history: [...cycle.history, completion].slice(-CYCLE_HISTORY_LIMIT) };
}

export function advanceCycle(
  cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">,
  day: DayKey,
  options: { sessionId?: string | null; skipped?: boolean; at: number; from?: number }
): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  if (!cycle.items.length) return null;
  const item = cycle.items[cycle.pointer % cycle.items.length];
  const nextPointer = cycle.pointer + 1;
  const wrapped = nextPointer >= cycle.items.length;
  return {
    pointer: wrapped ? 0 : nextPointer,
    round: wrapped ? cycle.round + 1 : cycle.round,
    ...recordCycleItem(cycle, item, day, options),
  };
}

export function undoLastCompletion(
  cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history">
): Pick<StudyCycle, "pointer" | "round" | "history"> | null {
  const last = cycle.history[cycle.history.length - 1];
  if (!last) return null;
  const history = cycle.history.slice(0, -1);
  const index = cycle.items.findIndex((item) => item.id === last.itemId);
  const stay = { pointer: cycle.pointer, round: cycle.round, history };
  if (index < 0) return stay;
  // Registro novo guarda de onde o ponteiro saiu: desfazer devolve a volta ao
  // lugar exato, inclusive quando a disciplina foi contada fora da vez.
  if (last.from !== undefined) {
    return { pointer: Math.min(last.from, Math.max(0, cycle.items.length - 1)), round: last.round, history };
  }
  // Registro antigo, sem origem: o ponteiro só volta se foi ele que o moveu.
  const moved =
    index + 1 >= cycle.items.length
      ? cycle.pointer === 0 && cycle.round === last.round + 1
      : cycle.pointer === index + 1 && cycle.round === last.round;
  return moved ? { pointer: index, round: last.round, history } : stay;
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

export type CycleTally = Pick<StudyCycle, "items" | "agenda" | "pointer" | "round" | "history"> & { progress: Record<string, number> };

type TallySession = Pick<StudySession, "id" | "cycleItemId" | "day" | "durationSec" | "createdAt">;

export function tallyOf(cycle: StudyCycle): CycleTally {
  return {
    items: cycle.items,
    agenda: cycle.agenda,
    pointer: cycle.pointer,
    round: cycle.round,
    history: cycle.history,
    progress: { ...(cycle.progress ?? {}) },
  };
}

export function sessionMinutes(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}

/**
 * Posição da disciplina na volta: a da vez, ou — fora da vez — a próxima adiante.
 * Se ela só aparece atrás do ponteiro, vale essa mesmo assim: o tempo entra na
 * volta sem puxar o ponteiro para trás.
 */
function turnFor(cycle: Pick<StudyCycle, "items" | "pointer">, subjectId: string, outOfTurn: boolean): number | null {
  const total = cycle.items.length;
  const pointer = cycle.pointer % total;
  if (cycle.items[pointer].subjectId === subjectId) return pointer;
  if (!outOfTurn) return null;
  for (let index = pointer + 1; index < total; index += 1) {
    if (cycle.items[index].subjectId === subjectId) return index;
  }
  for (let index = 0; index < pointer; index += 1) {
    if (cycle.items[index].subjectId === subjectId) return index;
  }
  return null;
}

export function canCountSession(
  cycle: Pick<StudyCycle, "items" | "pointer" | "agenda" | "history">,
  subjectId: string,
  day: DayKey,
  outOfTurn: boolean
): boolean {
  if (pendingAgendaEntry(cycle, subjectId, day)) return true;
  return cycle.items.length > 0 && turnFor(cycle, subjectId, outOfTurn) !== null;
}

export function countSession(
  cycle: CycleTally,
  input: { subjectId: string; day: DayKey; durationSec: number },
  sessionId: string,
  at: number,
  options: { outOfTurn?: boolean } = {}
): { cycle: CycleTally; cycleItemId: string } | null {
  const minutes = sessionMinutes(input.durationSec);
  const fixed = pendingAgendaEntry(cycle, input.subjectId, input.day);
  if (fixed) {
    const key = `${fixed.id}:${input.day}`;
    const total = (cycle.progress[key] ?? 0) + minutes;
    const progress = { ...cycle.progress };
    if (total >= fixed.minutes) {
      const marked = recordAgendaDay(cycle, fixed, input.day, { sessionId, at });
      delete progress[key];
      return { cycle: { ...cycle, history: marked?.history ?? cycle.history, progress }, cycleItemId: fixed.id };
    }
    progress[key] = total;
    return { cycle: { ...cycle, progress: prunedProgress(progress) }, cycleItemId: fixed.id };
  }
  if (!cycle.items.length) return null;
  const turn = turnFor(cycle, input.subjectId, Boolean(options.outOfTurn));
  if (turn === null) return null;
  const from = cycle.pointer % cycle.items.length;
  const behind = turn < from;
  const item = cycle.items[turn];
  const key = `${item.id}:${cycle.round}`;
  const total = (cycle.progress[key] ?? 0) + minutes;
  const progress = { ...cycle.progress };
  // Enquanto o bloco não fecha, só o progresso muda: adiantar meia hora numa
  // disciplina mais à frente não pode pular as que vêm antes dela.
  if (total < item.minutes) {
    progress[key] = total;
    return { cycle: { ...cycle, progress: prunedProgress(progress) }, cycleItemId: item.id };
  }
  delete progress[key];
  // Atrás da vez, a disciplina fecha na volta e a próxima continua sendo a mesma.
  if (behind) {
    const recorded = recordCycleItem(cycle, item, input.day, { sessionId, at, from });
    return { cycle: { ...cycle, ...recorded, progress }, cycleItemId: item.id };
  }
  const moved = { ...cycle, pointer: turn };
  const advanced = advanceCycle(moved, input.day, { sessionId, at, from });
  return { cycle: { ...moved, ...(advanced ?? {}), progress }, cycleItemId: item.id };
}

export function uncountSession(cycle: CycleTally, session: TallySession, others: readonly TallySession[]): CycleTally | null {
  let state: CycleTally = { ...cycle, progress: { ...cycle.progress } };
  const peers = others.filter((entry) => entry.id !== session.id && entry.cycleItemId);
  const setProgress = (key: string, minutes: number) => {
    if (minutes > 0) state.progress[key] = minutes;
    else delete state.progress[key];
  };
  const linked = cycle.history.filter((entry) => entry.sessionId === session.id);
  let changed = false;
  for (const entry of linked) {
    if (cycle.agenda.some((item) => item.id === entry.itemId)) {
      state = { ...state, history: state.history.filter((item) => item !== entry) };
      changed = true;
      setProgress(
        `${entry.itemId}:${entry.day}`,
        peers.filter((peer) => peer.cycleItemId === entry.itemId && peer.day === entry.day).reduce((sum, peer) => sum + sessionMinutes(peer.durationSec), 0)
      );
      continue;
    }
    const removed = removeCompletion(state, entry);
    if (!removed) continue;
    state = { ...state, ...removed };
    changed = true;
    const head = state.items.length ? state.items[state.pointer % state.items.length] : null;
    if (head?.id !== entry.itemId || state.round !== entry.round) continue;
    const since = Math.max(0, ...state.history.filter((item) => item.itemId === entry.itemId && item.at < entry.at).map((item) => item.at));
    setProgress(
      `${entry.itemId}:${entry.round}`,
      peers
        .filter((peer) => peer.cycleItemId === entry.itemId && peer.createdAt > since && peer.createdAt <= entry.at)
        .reduce((sum, peer) => sum + sessionMinutes(peer.durationSec), 0)
    );
  }
  if (!linked.length && session.cycleItemId) {
    for (const key of [`${session.cycleItemId}:${session.day}`, `${session.cycleItemId}:${cycle.round}`]) {
      if (!state.progress[key]) continue;
      setProgress(key, state.progress[key] - sessionMinutes(session.durationSec));
      changed = true;
      break;
    }
  }
  return changed ? state : null;
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

export function roundProgress(
  cycle: Pick<StudyCycle, "items" | "pointer" | "round" | "history"> & { progress?: Record<string, number> }
): RoundProgress {
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
      const studied = index === cycle.pointer % total ? (cycle.progress?.[`${item.id}:${cycle.round}`] ?? 0) : 0;
      minutesDone += Math.min(item.minutes, studied);
      minutesLeft += Math.max(0, item.minutes - studied);
    }
  });
  return { done, total, position: total ? (cycle.pointer % total) + 1 : 0, minutesDone, minutesLeft, minutesTotal, states };
}
