/**
 * Varredura do módulo Estudos: exercita as funções puras com casos de borda e
 * checa invariantes. Não substitui o verify-study (que fixa comportamento
 * acordado); aqui a pergunta é "dá para quebrar?".
 */
import {
  countSession,
  uncountSession,
  tallyOf,
  roundProgress,
  lapStates,
  generateCycleItems,
  projectSchedule,
  pendingAgendaEntry,
  recordAgendaDay,
  type CycleTally,
} from "../src/lib/study/cycle";
import { bucketReviews, reviewStages, reviewForecast, reviewPunctuality } from "../src/lib/study/review-queue";
import { studyWindow, windowCovers, termsOf, currentTerm, intervalsBefore } from "../src/lib/study/series";
import { aggregate, studiedDays, dayStatus, streakInfo, consistencyInfo, examTotals, accuracyOf } from "../src/lib/study/metrics";
import { occursOn, makeAgendaEntry, endAgendaBefore, dropAgendaDay } from "../src/lib/study/agenda";
import { addDays } from "../src/lib/study/dates";
import type { DayKey, MockExam, StudyCycle, StudyReview, StudySession } from "../src/types/study";

const problems: string[] = [];
const note = (area: string, message: string) => problems.push(`[${area}] ${message}`);

const DAY: DayKey = "2026-03-02";

function cycleOf(items: { id: string; subjectId: string; minutes: number }[], over: Partial<StudyCycle> = {}): CycleTally {
  return tallyOf({
    id: "c",
    planId: "p",
    items,
    agenda: [],
    weekMinutes: [0, 120, 120, 120, 120, 120, 0],
    pointer: 0,
    round: 0,
    history: [],
    subjects: items.map((item) => ({ subjectId: item.subjectId, weight: 3, level: 3 })),
    minBlock: 30,
    maxBlock: 60,
    progress: {},
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as StudyCycle);
}

function session(over: Partial<StudySession> = {}): StudySession {
  return {
    id: "s",
    planId: "p",
    subjectId: "a",
    topicId: null,
    day: DAY,
    startMinute: null,
    durationSec: 3600,
    categoryId: "theory",
    correct: 0,
    wrong: 0,
    pages: 0,
    pageRanges: [],
    videoSec: 0,
    videos: [],
    material: "",
    comment: "",
    reviewId: null,
    cycleItemId: null,
    completedTopic: false,
    pageId: null,
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

// ---------------------------------------------------------------- ciclo

// 1. Contar e descontar tem de devolver o ciclo ao estado anterior.
{
  const base = cycleOf([
    { id: "i0", subjectId: "a", minutes: 60 },
    { id: "i1", subjectId: "b", minutes: 60 },
    { id: "i2", subjectId: "c", minutes: 60 },
  ]);
  for (const minutes of [30, 60, 120]) {
    for (const outOfTurn of [false, true]) {
      for (const subjectId of ["a", "b", "c"]) {
        const counted = countSession(base, { subjectId, day: DAY, durationSec: minutes * 60 }, "s1", 10, { outOfTurn });
        if (!counted) continue;
        const logged = session({ id: "s1", subjectId, durationSec: minutes * 60, cycleItemId: counted.cycleItemId });
        const back = uncountSession(counted.cycle, logged, [logged]);
        const got = back ?? counted.cycle;
        const label = `${subjectId}/${minutes}min/${outOfTurn ? "fora da vez" : "na vez"}`;
        if (got.pointer !== base.pointer || got.round !== base.round) {
          note("ciclo", `desfazer não devolveu o ponteiro (${label}): ${got.pointer}/${got.round} != ${base.pointer}/${base.round}`);
        }
        if (got.history.length !== base.history.length) {
          note("ciclo", `desfazer deixou histórico sobrando (${label}): ${got.history.length}`);
        }
        const leftover = Object.entries(got.progress).filter(([, value]) => value !== 0);
        if (leftover.length) note("ciclo", `desfazer deixou progresso (${label}): ${JSON.stringify(got.progress)}`);
      }
    }
  }
}

// 2. Progresso nunca pode ficar negativo nem passar do bloco.
{
  let state = cycleOf([
    { id: "i0", subjectId: "a", minutes: 60 },
    { id: "i1", subjectId: "b", minutes: 60 },
  ]);
  const logs: StudySession[] = [];
  for (let n = 0; n < 12; n += 1) {
    const counted = countSession(state, { subjectId: n % 2 ? "b" : "a", day: DAY, durationSec: 20 * 60 }, `s${n}`, n, { outOfTurn: true });
    if (!counted) continue;
    state = counted.cycle;
    logs.push(session({ id: `s${n}`, subjectId: n % 2 ? "b" : "a", durationSec: 20 * 60, cycleItemId: counted.cycleItemId, createdAt: n }));
    for (const [key, value] of Object.entries(state.progress)) {
      if (value < 0) note("ciclo", `progresso negativo em ${key}: ${value}`);
      if (value >= 60) note("ciclo", `progresso ${value} não fechou o bloco de 60 em ${key}`);
    }
  }
  // Desfazer tudo, do último para o primeiro.
  for (let n = logs.length - 1; n >= 0; n -= 1) {
    const back = uncountSession(state, logs[n], logs.slice(0, n));
    if (back) state = back;
    for (const [key, value] of Object.entries(state.progress)) {
      if (value < 0) note("ciclo", `progresso negativo ao desfazer em ${key}: ${value}`);
    }
  }
  if (state.history.length) note("ciclo", `sobrou histórico após desfazer tudo: ${state.history.length}`);
}

// 3. roundProgress não pode passar do total nem ficar negativo.
{
  const items = [
    { id: "i0", subjectId: "a", minutes: 60 },
    { id: "i1", subjectId: "b", minutes: 45 },
    { id: "i2", subjectId: "c", minutes: 30 },
  ];
  for (let pointer = 0; pointer < 3; pointer += 1) {
    const state = cycleOf(items, { pointer, progress: { [`${items[pointer].id}:0`]: 20 } });
    const progress = roundProgress(state);
    if (progress.minutesDone + progress.minutesLeft > progress.minutesTotal + 1) {
      note("ciclo", `roundProgress estoura o total no ponteiro ${pointer}: ${progress.minutesDone}+${progress.minutesLeft}>${progress.minutesTotal}`);
    }
    if (progress.minutesDone < 0 || progress.minutesLeft < 0) note("ciclo", `roundProgress negativo no ponteiro ${pointer}`);
    if (progress.states.length !== items.length) note("ciclo", "lapStates com tamanho errado");
  }
}

// 4. Ciclo vazio ou de um item só não pode quebrar.
{
  const empty = cycleOf([]);
  if (countSession(empty, { subjectId: "a", day: DAY, durationSec: 600 }, "s", 1, { outOfTurn: true }) !== null) {
    note("ciclo", "ciclo sem itens aceitou contar sessão");
  }
  if (roundProgress(empty).total !== 0) note("ciclo", "roundProgress de ciclo vazio não é zero");
  if (lapStates(empty).length !== 0) note("ciclo", "lapStates de ciclo vazio não é vazio");
  const single = cycleOf([{ id: "i0", subjectId: "a", minutes: 60 }]);
  const counted = countSession(single, { subjectId: "a", day: DAY, durationSec: 3600 }, "s", 1, {});
  if (!counted) note("ciclo", "ciclo de um item recusou contar");
  else if (counted.cycle.round !== 1 || counted.cycle.pointer !== 0) {
    note("ciclo", `ciclo de um item não virou a volta: ${counted.cycle.pointer}/${counted.cycle.round}`);
  }
}

// 5. generateCycleItems: os minutos têm de bater com a configuração.
{
  for (const weekly of [[0, 60, 60, 60, 60, 60, 0], [0, 300, 300, 300, 300, 300, 600], [0, 0, 0, 0, 0, 0, 45]]) {
    const items = generateCycleItems(
      { subjects: [{ subjectId: "a", weight: 3, level: 3 }, { subjectId: "b", weight: 1, level: 5 }], weekMinutes: weekly, minBlock: 30, maxBlock: 60 },
      (index) => `g${index}`
    );
    for (const item of items) {
      if (item.minutes <= 0) note("ciclo", `bloco com ${item.minutes} minutos em ${JSON.stringify(weekly)}`);
    }
    if (new Set(items.map((item) => item.id)).size !== items.length) note("ciclo", "generateCycleItems repetiu ids");
  }
}

// ---------------------------------------------------------------- revisões

{
  const review = (over: Partial<StudyReview>): StudyReview => ({
    id: "r",
    planId: "p",
    subjectId: "a",
    topicId: null,
    sessionId: "s1",
    intervalDays: 7,
    dueDay: DAY,
    status: "pending",
    resolvedAt: null,
    resolvedSessionId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });
  const today: DayKey = "2026-03-02";
  const list = [
    review({ id: "r1", dueDay: "2026-03-02" }),
    review({ id: "r2", dueDay: "2026-02-20" }),
    review({ id: "r3", dueDay: "2026-04-02" }),
    review({ id: "r4", status: "done", resolvedAt: Date.UTC(2026, 1, 25), dueDay: "2026-02-24" }),
    review({ id: "r5", status: "ignored", resolvedAt: Date.UTC(2026, 1, 26), dueDay: "2026-02-25" }),
  ];
  for (const period of ["7", "30", "90", "365", "all"] as const) {
    const buckets = bucketReviews(list, { today, period });
    const seen = new Set([...buckets.due, ...buckets.overdue, ...buckets.upcoming, ...buckets.done, ...buckets.ignored].map((entry) => entry.id));
    const counted = buckets.due.length + buckets.overdue.length + buckets.upcoming.length + buckets.done.length + buckets.ignored.length;
    if (counted !== seen.size) note("revisões", `período ${period}: a mesma revisão caiu em mais de uma aba`);
    if (!buckets.due.some((entry) => entry.id === "r1")) note("revisões", `período ${period}: a revisão de hoje sumiu`);
  }
  const stages = reviewStages(list);
  for (const entry of list) {
    const stage = stages.get(entry.id);
    if (!stage) note("revisões", `reviewStages não cobriu ${entry.id}`);
    else if (stage.index < 1 || stage.index > stage.total) note("revisões", `etapa fora de faixa em ${entry.id}: ${stage.index}/${stage.total}`);
  }
  const forecast = reviewForecast(list, today, 14);
  if (forecast.length !== 14) note("revisões", "reviewForecast com tamanho errado");
  if (forecast.some((entry) => entry.count < 0)) note("revisões", "reviewForecast com contagem negativa");
  const punctual = reviewPunctuality(list, today, null, 30);
  if (punctual.onTime + punctual.late + punctual.ignored !== punctual.total) {
    note("revisões", "reviewPunctuality não fecha a conta");
  }
}

// ---------------------------------------------------------------- janela do edital

{
  const studied = new Set<DayKey>(["2026-01-10", "2026-01-11", "2026-07-02"]);
  const cases: { label: string; terms: { startDay: DayKey | null; examDate: DayKey | null }[] }[] = [
    { label: "sem prova", terms: [{ startDay: null, examDate: null }] },
    { label: "prova futura", terms: [{ startDay: null, examDate: "2027-01-01" }] },
    { label: "prova passada", terms: [{ startDay: null, examDate: "2026-02-01" }] },
    { label: "inicio depois da prova", terms: [{ startDay: "2026-09-01", examDate: "2026-02-01" }] },
    { label: "dois editais", terms: [{ startDay: "2026-01-01", examDate: "2026-02-01" }, { startDay: "2026-08-01", examDate: "2026-12-01" }] },
  ];
  for (const item of cases) {
    const window = studyWindow(item.terms, studied);
    for (const pause of window.pauses) {
      if (pause.until !== null && pause.until <= pause.from) note("janela", `${item.label}: pausa vazia ou invertida ${pause.from}→${pause.until}`);
    }
    // Um dia estudado nunca deveria ser escondido pela janela na tela, mas a
    // janela em si pode cobri-lo; o que não pode é a janela virar instável.
    const twice = studyWindow(item.terms, studied);
    if (JSON.stringify(window) !== JSON.stringify(twice)) note("janela", `${item.label}: studyWindow não é determinística`);
    for (const day of ["2026-01-05", "2026-02-01", "2026-02-02", "2026-07-02", "2026-12-31"] as DayKey[]) {
      const covered = windowCovers(window, day);
      if (typeof covered !== "boolean") note("janela", `${item.label}: windowCovers não devolveu boolean`);
    }
  }
  if (intervalsBefore([1, 7, 30], DAY, DAY).length) note("janela", "intervalo caiu no próprio dia da prova");
}

// ---------------------------------------------------------------- métricas

{
  const sessions = [
    session({ id: "a", day: "2026-03-01", durationSec: 1800, correct: 4, wrong: 1 }),
    session({ id: "b", day: "2026-03-02", durationSec: 0, correct: 0, wrong: 0 }),
    session({ id: "c", day: "2026-03-02", durationSec: 3600, correct: 0, wrong: 3 }),
  ];
  const agg = aggregate(sessions);
  if (agg.seconds !== 5400) note("métricas", `aggregate somou ${agg.seconds}s, esperado 5400`);
  if (agg.questions !== 8) note("métricas", `aggregate contou ${agg.questions} questões, esperado 8`);
  if (agg.accuracy === null || Math.abs(agg.accuracy - 0.5) > 1e-9) note("métricas", `accuracy ${agg.accuracy}, esperado 0.5`);
  if (accuracyOf(0, 0) !== null) note("métricas", "accuracyOf(0,0) devia ser nulo");

  // Sessão de duração zero não deveria marcar o dia como estudado.
  const days = studiedDays([session({ id: "z", day: "2026-05-05", durationSec: 0 })], []);
  if (days.has("2026-05-05")) note("métricas", "sessão de 0s marcou o dia como estudado");

  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const run = new Set<DayKey>(["2026-03-01", "2026-03-02", "2026-03-03"]);
  const streak = streakInfo(run, "2026-03-03", everyDay);
  if (streak.current !== 3 || streak.best !== 3) note("métricas", `streak ${streak.current}/${streak.best}, esperado 3/3`);
  const consistency = consistencyInfo(run, "2026-03-03", everyDay);
  if (consistency.studied !== 3 || consistency.ratio !== 1) note("métricas", `consistência ${consistency.studied}/${consistency.planned}`);
  if (dayStatus("2026-03-04", run, "2026-03-01", "2026-03-03", everyDay) !== "future") note("métricas", "dia depois de hoje não é future");

  const exam: Pick<MockExam, "rows" | "style"> = {
    style: "truefalse",
    rows: [{ id: "r", subjectId: null, name: "x", weight: 2, total: 10, correct: 7, wrong: 2, blank: 1 }],
  };
  const totals = examTotals(exam);
  if (totals.score !== 10) note("métricas", `examTotals score ${totals.score}, esperado 10`);
  if (totals.maxScore !== 20) note("métricas", `examTotals maxScore ${totals.maxScore}, esperado 20`);
  if (totals.correct + totals.wrong + totals.blank !== totals.total) note("métricas", "examTotals não fecha certas+erradas+brancos");
}

// ---------------------------------------------------------------- dias fixos

{
  const entry = makeAgendaEntry({ subjectId: "a", minutes: 60, start: "2026-03-02", repeat: "weekly", weekdays: [], topicId: null });
  const live = { ...entry, id: "e1" };
  if (!occursOn(live, "2026-03-02")) note("dias fixos", "semanal não ocorre no próprio início");
  if (!occursOn(live, "2026-03-09")) note("dias fixos", "semanal não ocorre uma semana depois");
  if (occursOn(live, "2026-03-03")) note("dias fixos", "semanal ocorreu no dia errado");
  const dropped = dropAgendaDay([live], "e1", "2026-03-09")[0];
  if (occursOn(dropped, "2026-03-09")) note("dias fixos", "dia removido ainda ocorre");
  const ended = endAgendaBefore([live], "e1", "2026-03-09")[0];
  if (!ended) note("dias fixos", "encerrar removeu a entrada inteira");
  else if (occursOn(ended, "2026-03-09")) note("dias fixos", "encerrado ainda ocorre no dia de corte");
  // Encerrar no próprio início remove a entrada.
  if (endAgendaBefore([live], "e1", "2026-03-02").length) note("dias fixos", "encerrar no início devia remover a entrada");

  const monthly = { ...makeAgendaEntry({ subjectId: "a", minutes: 30, start: "2026-01-31", repeat: "monthly", weekdays: [], topicId: null }), id: "m1" };
  const febOccurrences = ["2026-02-28", "2026-02-27", "2026-03-31"].filter((day) => occursOn(monthly, day as DayKey));
  if (!febOccurrences.includes("2026-03-31")) note("dias fixos", "mensal do dia 31 não caiu em março");
}

// ---------------------------------------------------------------- projeção

{
  const cycle = cycleOf([
    { id: "i0", subjectId: "a", minutes: 60 },
    { id: "i1", subjectId: "b", minutes: 60 },
  ]);
  const map = projectSchedule({ ...cycle, weekMinutes: [0, 120, 120, 120, 120, 120, 0] }, "2026-03-02", "2026-03-08", "2026-03-02");
  for (const [day, blocks] of map) {
    for (const block of blocks) {
      if (block.minutes < 0) note("projeção", `bloco negativo em ${day}`);
    }
  }
  // Intervalo invertido não pode gerar nada.
  const inverted = projectSchedule({ ...cycle, weekMinutes: [0, 120, 120, 120, 120, 120, 0] }, "2026-03-08", "2026-03-02", "2026-03-02");
  if ([...inverted.values()].flat().length) note("projeção", "intervalo invertido gerou blocos");

  const fixed = cycleOf([], {
    agenda: [{ id: "f1", subjectId: "a", minutes: 60, start: "2026-03-02", until: null, repeat: "daily", weekdays: [], topicId: null, note: "", removed: [], createdAt: 0 }],
  });
  void projectSchedule({ ...fixed, weekMinutes: [0, 0, 0, 0, 0, 0, 0] }, "2026-03-02", "2026-03-08", "2026-03-02");
  if (!pendingAgendaEntry(fixed, "a", "2026-03-03")) note("projeção", "dia fixo diário não ficou pendente");
  const marked = recordAgendaDay(fixed, fixed.agenda[0], "2026-03-03", { at: 1 });
  if (!marked) note("projeção", "recordAgendaDay recusou um dia válido");
  else if (pendingAgendaEntry({ ...fixed, history: marked.history }, "a", "2026-03-03")) {
    note("projeção", "dia fixo continuou pendente depois de marcado");
  }
}

// ---------------------------------------------------------------- corte da prova x caixa de revisões

{
  // Prova já passou e a pessoa segue estudando: nenhum intervalo cabe, mas a
  // tela continua oferecendo "Programar revisões".
  const intervals = [1, 7, 30];
  const examPast: DayKey = "2026-02-01";
  const studyDay: DayKey = "2026-03-02";
  // Nenhum intervalo cabe; o diálogo desliga a caixa e explica (logform_reviews_after_exam).
  const fit = intervalsBefore(intervals, studyDay, examPast);
  if (fit.length !== 0) note("revisões", `com a prova passada nada devia caber, veio ${JSON.stringify(fit)}`);
  // Véspera da prova: só o intervalo que ainda cabe.
  const eve = intervalsBefore(intervals, addDays(examPast, -3), examPast);
  if (eve.length !== 1 || eve[0] !== 1) note("revisões", `véspera devia deixar só o intervalo 1, veio ${JSON.stringify(eve)}`);
}

// ---------------------------------------------------------------- desfazer com sessões irmãs

{
  const base = cycleOf([
    { id: "i0", subjectId: "a", minutes: 60 },
    { id: "i1", subjectId: "b", minutes: 60 },
  ]);
  // Duas sessões de 30min fecham o bloco de "a"; desfazer a segunda tem de
  // devolver os 30min da primeira ao progresso, não zerar tudo.
  const first = countSession(base, { subjectId: "a", day: DAY, durationSec: 1800 }, "s1", 1, {});
  if (!first) note("ciclo", "primeira meia sessão recusada");
  else {
    const second = countSession(first.cycle, { subjectId: "a", day: DAY, durationSec: 1800 }, "s2", 2, {});
    if (!second) note("ciclo", "segunda meia sessão recusada");
    else {
      const s1 = session({ id: "s1", durationSec: 1800, cycleItemId: first.cycleItemId, createdAt: 1 });
      const s2 = session({ id: "s2", durationSec: 1800, cycleItemId: second.cycleItemId, createdAt: 2 });
      const back = uncountSession(second.cycle, s2, [s1, s2]);
      const got = back ?? second.cycle;
      if (got.pointer !== 0) note("ciclo", `desfazer a 2a meia sessão deixou o ponteiro em ${got.pointer}, esperado 0`);
      if ((got.progress["i0:0"] ?? 0) !== 30) {
        note("ciclo", `desfazer a 2a meia sessão devia devolver 30min ao progresso, veio ${got.progress["i0:0"] ?? 0}`);
      }
      if (got.history.length !== 0) note("ciclo", `desfazer a 2a meia sessão deixou ${got.history.length} registro(s) no histórico`);
    }
  }
}

// ---------------------------------------------------------------- dia fixo: contar e desfazer

{
  const fixed = cycleOf([{ id: "i0", subjectId: "b", minutes: 60 }], {
    agenda: [
      { id: "f1", subjectId: "a", minutes: 60, start: "2026-03-01", until: null, repeat: "daily", weekdays: [], topicId: null, note: "", removed: [], createdAt: 0 },
    ],
  });
  // Meia sessão: só progresso, o dia fixo continua pendente.
  const half = countSession(fixed, { subjectId: "a", day: DAY, durationSec: 1800 }, "s1", 1, { outOfTurn: true });
  if (!half) note("dias fixos", "contar meia sessão num dia fixo foi recusado");
  else {
    if (half.cycleItemId !== "f1") note("dias fixos", `contou no item errado: ${half.cycleItemId}`);
    if (!pendingAgendaEntry(half.cycle, "a", DAY)) note("dias fixos", "dia fixo deixou de ficar pendente com meia sessão");
    const full = countSession(half.cycle, { subjectId: "a", day: DAY, durationSec: 1800 }, "s2", 2, { outOfTurn: true });
    if (!full) note("dias fixos", "segunda meia sessão recusada");
    else {
      if (pendingAgendaEntry(full.cycle, "a", DAY)) note("dias fixos", "dia fixo continuou pendente depois de fechado");
      const s1 = session({ id: "s1", durationSec: 1800, cycleItemId: "f1", day: DAY, createdAt: 1 });
      const s2 = session({ id: "s2", durationSec: 1800, cycleItemId: "f1", day: DAY, createdAt: 2 });
      const back = uncountSession(full.cycle, s2, [s1, s2]);
      const got = back ?? full.cycle;
      if (!pendingAgendaEntry(got, "a", DAY)) note("dias fixos", "desfazer não devolveu o dia fixo para pendente");
      if ((got.progress["f1:" + DAY] ?? 0) !== 30) {
        note("dias fixos", `desfazer devia devolver 30min ao dia fixo, veio ${got.progress["f1:" + DAY] ?? 0}`);
      }
      // Desfazer as duas tem de zerar.
      const back2 = uncountSession(got, s1, [s1]);
      const end = back2 ?? got;
      if (Object.values(end.progress).some((value) => value !== 0)) {
        note("dias fixos", `desfazer tudo deixou progresso: ${JSON.stringify(end.progress)}`);
      }
      if (end.history.length) note("dias fixos", `desfazer tudo deixou ${end.history.length} registro(s)`);
    }
  }
}

// ---------------------------------------------------------------- crescimento do progresso

{
  // Dia fixo diário parcialmente estudado todo dia: cada dia deixa uma chave
  // em `progress`, e nada nunca a remove.
  let state = cycleOf([], {
    agenda: [
      { id: "f1", subjectId: "a", minutes: 60, start: "2026-01-01", until: null, repeat: "daily", weekdays: [], topicId: null, note: "", removed: [], createdAt: 0 },
    ],
  });
  let day: DayKey = "2026-01-01";
  for (let n = 0; n < 400; n += 1) {
    const counted = countSession(state, { subjectId: "a", day, durationSec: 600 }, `p${n}`, n, { outOfTurn: true });
    if (counted) state = counted.cycle;
    day = addDays(day, 1);
  }
  const keys = Object.keys(state.progress).length;
  if (keys > 120) {
    note("ciclo", `progress acumulou ${keys} chaves em 400 dias de dia fixo parcial — o teto não segurou`);
  }
  // Volta da rotação: a chave usa `itemId:round`, então cada volta deixa resto.
  let rot = cycleOf([
    { id: "r0", subjectId: "a", minutes: 60 },
    { id: "r1", subjectId: "b", minutes: 60 },
  ]);
  for (let n = 0; n < 40; n += 1) {
    const counted = countSession(rot, { subjectId: n % 2 ? "b" : "a", day: DAY, durationSec: 1800 }, `q${n}`, n, {});
    if (counted) rot = counted.cycle;
  }
  const rotKeys = Object.keys(rot.progress).length;
  if (rotKeys > 4) note("ciclo", `progress da rotação acumulou ${rotKeys} chaves`);
  if (rot.history.length > 40) note("ciclo", `histórico cresceu ${rot.history.length} além do esperado`);
}

if (problems.length) {
  console.log(`audit-study: ${problems.length} achado(s)`);
  for (const line of problems) console.log("  - " + line);
  process.exitCode = 1;
} else {
  console.log("audit-study: nenhum achado");
}
