import assert from "node:assert/strict";
import {
  joinSegmentTexts,
  transcribeInSegments,
} from "../src/lib/accessibility/audio-transcriber";
import {
  DEFAULT_TRANSCRIBE_MODEL,
  TRANSCRIBE_FALLBACK_MODELS,
  transcribeModelChain,
} from "../src/lib/ai/transcribe-models";
import {
  isModelResting,
  noteModelRefused,
  noteModelWorked,
  orderByAvailability,
  parseRetryDelay,
  resetModelCooldowns,
  restingKindOf,
} from "../src/lib/ai/model-cooldown";
import { raceModels, raceTimingFor, type RaceResult } from "../src/lib/ai/model-race";
import {
  ENERGY_FRAME_SECONDS,
  frameEnergies,
  planSpeechCuts,
  rangesFromCuts,
} from "../src/lib/media/speech-cuts";

// --- ordem em que os modelos são tentados --------------------------------

// O padrão de transcrição sai de medição (`scripts/check-gemini-audio.mts`):
// o flash mais novo é o mais disputado em áudio, e o 3.5 é o que responde.
assert.equal(transcribeModelChain()[0], DEFAULT_TRANSCRIBE_MODEL);

// Modelo aposentado não pode voltar para a lista: `gemini-2.5-flash-lite`
// responde 404 "no longer available to new users".
assert.ok(!transcribeModelChain().includes("gemini-2.5-flash-lite"));

const chain = transcribeModelChain("gemini-3.7-flash");
assert.equal(chain[0], "gemini-3.7-flash");
assert.equal(new Set(chain).size, chain.length);

// O defeito que deixou uma aula de 50 min sem transcrição: a segunda tentativa
// caía em `gemini-flash-latest`, apelido do mesmo flash mais novo, e voltava o
// mesmo 503 cinquenta segundos depois. Apelido só depois dos modelos exatos.
assert.ok(!chain[1].endsWith("-latest"));
assert.ok(chain.findIndex((m) => m.endsWith("-latest")) > 2);

// A ordem é estável: houve uma versão que girava a lista a cada tentativa e,
// com a cota real, isso empurrava a retentativa para os modelos de 20/dia.
assert.deepEqual(transcribeModelChain("gemini-3.7-flash"), chain);

// Preferido que já está na lista de reserva não aparece duas vezes.
const deduped = transcribeModelChain("gemini-3.5-flash");
assert.equal(new Set(deduped).size, deduped.length);
assert.equal(deduped.length, TRANSCRIBE_FALLBACK_MODELS.length);

// --- cota por modelo: quem recusou sai da frente -------------------------

// O plano gratuito dá 20 requisições por dia em cada flash e 500 no lite, e
// uma aula de 50 min são ~18 trechos: o padrão precisa ser o de cota larga.
assert.equal(DEFAULT_TRANSCRIBE_MODEL, "gemini-3.5-transcribe");

{
  resetModelCooldowns();
  const now = 1_000_000;
  const lista = transcribeModelChain();

  // Cota do dia estourada: o modelo sai da lista das próximas chamadas. Sem
  // isto, cada um dos 18 trechos recomeçava pelo mesmo modelo esgotado.
  noteModelRefused(lista[0], "quota-day", undefined, now);
  assert.ok(isModelResting(lista[0], now));
  assert.ok(!orderByAvailability(lista, now).includes(lista[0]));
  assert.equal(orderByAvailability(lista, now)[0], lista[1]);
  assert.equal(restingKindOf(lista, now), "quota-day");

  // Meia hora depois ele volta sozinho: a memória é atalho, não banimento.
  assert.ok(!isModelResting(lista[0], now + 31 * 60_000));

  // Um 503 curto não pode encurtar o descanso longo da cota diária.
  noteModelRefused(lista[0], "busy", undefined, now + 1000);
  assert.ok(isModelResting(lista[0], now + 5 * 60_000));

  // Cota de minuto passa em pouco mais de um minuto.
  noteModelRefused(lista[1], "quota-minute", undefined, now);
  assert.ok(isModelResting(lista[1], now + 30_000));
  assert.ok(!isModelResting(lista[1], now + 70_000));

  // O Gemini manda a espera no 429; um pedido maior que o padrão é respeitado.
  noteModelRefused(lista[2], "quota-minute", 5 * 60_000, now);
  assert.ok(isModelResting(lista[2], now + 4 * 60_000));

  // Deu certo: o modelo volta na hora, sem esperar o descanso vencer.
  noteModelWorked(lista[1]);
  assert.ok(!isModelResting(lista[1], now + 1000));
}

{
  // Todos de molho: ainda assim sobra uma tentativa, a do que acorda primeiro.
  resetModelCooldowns();
  const now = 2_000_000;
  const lista = transcribeModelChain();
  lista.forEach((model, index) =>
    noteModelRefused(model, "busy", (index + 2) * 60_000, now)
  );
  const restante = orderByAvailability(lista, now);
  assert.equal(restante.length, 1);
  assert.equal(restante[0], lista[0]);
  resetModelCooldowns();
}

assert.equal(parseRetryDelay("27s"), 27_000);
assert.equal(parseRetryDelay("1.5s"), 1_500);
assert.equal(parseRetryDelay("0s"), undefined);
assert.equal(parseRetryDelay("depois"), undefined);
assert.equal(parseRetryDelay(undefined), undefined);
// Um "volte em uma hora" não pode congelar a cadeia inteira.
assert.equal(parseRetryDelay("3600s"), 5 * 60_000);

// --- junção dos trechos ---------------------------------------------------

// Os trechos são cortados em pausas, sem sobreposição: a emenda é concatenação
// e nada é descartado por "parecer repetido" — uma frase dita duas vezes de
// verdade continua lá.
assert.equal(
  joinSegmentTexts(["a aula começa agora mesmo", "agora mesmo vamos ver"]),
  "a aula começa agora mesmo agora mesmo vamos ver"
);

// O defeito antigo: a comparação só via a-z/0-9, então em árabe, russo ou
// japonês toda palavra virava "" e o começo de cada trecho era apagado.
assert.equal(
  joinSegmentTexts(["Привет всем друзья сегодня", "мы изучаем новую тему урока"]),
  "Привет всем друзья сегодня мы изучаем новую тему урока"
);
assert.equal(
  joinSegmentTexts(["مرحبا بكم في الدرس", "اليوم نتعلم موضوعا جديدا"]),
  "مرحبا بكم في الدرس اليوم نتعلم موضوعا جديدا"
);
assert.equal(joinSegmentTexts(["今日は授業です。", "新しいテーマを学びます。"]), "今日は授業です。 新しいテーマを学びます。");

// Trecho perdido no meio vira marca visível: costurar calado entregaria uma
// aula com oito minutos faltando sem ninguém perceber.
assert.equal(joinSegmentTexts(["parte um", null, "parte dois"]), "parte um […] parte dois");
assert.equal(joinSegmentTexts(["parte um", null]), "parte um […]");
assert.equal(joinSegmentTexts([null, "parte um"]), "parte um");
assert.equal(joinSegmentTexts([null, null]), "");

// --- transcrição por trechos com o serviço congestionado ------------------

interface StubCall {
  segment: string;
  attempt: number;
}

type Plan = (
  segment: string,
  call: number
) => { status: number; transcript?: string; quotaScope?: "day" | "minute" };

const realFetch = globalThis.fetch;

function installFetch(plan: Plan, delayMs = 0): StubCall[] {
  const calls: StubCall[] = [];
  const perSegment = new Map<string, number>();

  globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
    const form = init.body as FormData;
    const audio = form.get("audio") as Blob;
    const segment = await audio.text();
    const headers = new Headers(init.headers as HeadersInit);
    const attempt = Number(headers.get("x-transcribe-attempt") || "0");
    calls.push({ segment, attempt });

    const count = (perSegment.get(segment) || 0) + 1;
    perSegment.set(segment, count);

    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const result = plan(segment, count);
    if (result.status === 429) {
      return new Response(
        JSON.stringify({
          transcript: "",
          error: "QUOTA_EXCEEDED",
          reason: "QUOTA",
          quotaScope: result.quotaScope || "minute",
        }),
        { status: 429, headers: { "content-type": "application/json", "Retry-After": "0" } }
      );
    }
    if (result.status === 503) {
      return new Response(
        JSON.stringify({ transcript: "", error: "SERVICE_BUSY", reason: "SERVICE_BUSY" }),
        { status: 503, headers: { "content-type": "application/json", "Retry-After": "0" } }
      );
    }
    return new Response(
      JSON.stringify({
        transcript: result.transcript ?? "",
        reason: result.transcript ? "OK" : "NO_SPEECH",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  return calls;
}

const segments = [new Blob(["S1"]), new Blob(["S2"]), new Blob(["S3"])];
const TEXTS: Record<string, string> = { S1: "alpha um", S2: "beta dois", S3: "gama três" };
// Estes cenários verificam a ordem exata das chamadas: um trecho por vez.
const fast = { retryBackoffMs: 1, busyBudgetMs: 60_000, concurrency: 1 };

// 1. Um 503 no primeiro trecho não pode abandonar o vídeo inteiro: era o que
//    fazia a aula de 50 min chegar aos flashcards sem uma palavra.
{
  const calls = installFetch((segment, call) =>
    segment === "S1" && call === 1 ? { status: 503 } : { status: 200, transcript: TEXTS[segment] }
  );

  const percents: number[] = [];
  const result = await transcribeInSegments(
    segments,
    "pt",
    (_text, percent) => percents.push(percent),
    fast
  );

  assert.equal(result.text, "alpha um beta dois gama três");
  assert.equal(result.missing, 0);
  assert.equal(result.busy, false);
  assert.ok(!result.text.includes("[…]"));
  // O trecho recusado é reenviado; os outros seguem normalmente.
  assert.deepEqual(
    calls.map((c) => c.segment),
    ["S1", "S1", "S2", "S3"]
  );
  assert.ok(percents.length >= 3);
  assert.deepEqual([...percents].sort((a, b) => a - b), percents);
}

// 2. Serviço realmente fora do ar: desiste dentro do orçamento em vez de
//    percorrer a aula inteira gastando minutos por trecho.
{
  const calls = installFetch(() => ({ status: 503 }), 20);
  const result = await transcribeInSegments(segments, "pt", undefined, {
    retryBackoffMs: 1,
    busyBudgetMs: 30,
    concurrency: 1,
  });

  assert.equal(result.text, "");
  assert.equal(result.busy, true);
  assert.equal(result.lastReason, "SERVICE_BUSY");
  // Um trecho tentado duas vezes estoura o teto; os outros dois não chegam a ser
  // enviados.
  assert.deepEqual(
    calls.map((c) => c.segment),
    ["S1", "S1"]
  );
}

// 3. Buraco no meio: o trecho recusado é tentado de novo no fim, e o que não
//    voltar fica marcado no texto.
{
  const calls = installFetch((segment) =>
    segment === "S2" ? { status: 503 } : { status: 200, transcript: TEXTS[segment] }
  );
  const result = await transcribeInSegments(segments, "pt", undefined, fast);

  assert.equal(result.text, "alpha um […] gama três");
  assert.equal(result.missing, 1);
  assert.equal(result.busy, true);
  // Duas tentativas na varredura e mais uma na segunda passada.
  assert.equal(calls.filter((c) => c.segment === "S2").length, 3);
}

// 4. Congestionamento passageiro: o trecho que volta a responder na segunda
//    passada entra no lugar certo, e não no fim do texto.
{
  installFetch((segment, call) =>
    segment === "S2" && call < 3
      ? { status: 503 }
      : { status: 200, transcript: TEXTS[segment] }
  );
  const result = await transcribeInSegments(segments, "pt", undefined, fast);

  assert.equal(result.text, "alpha um beta dois gama três");
  assert.equal(result.missing, 0);
}

// 5. Cota do DIA num trecho: para na hora, porque os proximos receberiam o
//    mesmo 429 — e avisa quem chamou, em vez de fingir que nao havia fala.
{
  const calls = installFetch((segment) =>
    segment === "S2"
      ? { status: 429, quotaScope: "day" }
      : { status: 200, transcript: TEXTS[segment] }
  );
  const result = await transcribeInSegments(segments, "pt", undefined, fast);

  assert.equal(result.quotaExhausted, true);
  // Quem chamou trata isso como falha de cota; o texto parcial fica marcado,
  // e nao e gravado na nota como se fosse a aula inteira.
  assert.equal(result.text, "alpha um […]");
  // S2 nao e reenviado, e S3 nem chega a ser tentado.
  assert.deepEqual(
    calls.map((c) => c.segment),
    ["S1", "S2"]
  );
}

// 6. Cota do MINUTO e passageira: vale reenviar o mesmo trecho.
{
  const calls = installFetch((segment, call) =>
    segment === "S2" && call === 1
      ? { status: 429, quotaScope: "minute" }
      : { status: 200, transcript: TEXTS[segment] }
  );
  const result = await transcribeInSegments(segments, "pt", undefined, fast);

  assert.equal(result.quotaExhausted, false);
  assert.equal(result.text, "alpha um beta dois gama três");
  assert.equal(calls.filter((c) => c.segment === "S2").length, 2);
}

// 7. Em paralelo: uma aula de uma hora (20 trechos) não pode custar 20 idas e
//    voltas enfileiradas. Quatro de cada vez levam ~1/4 do tempo.
{
  const many = Array.from({ length: 12 }, (_, i) => new Blob([`P${i}`]));
  installFetch((segment) => ({ status: 200, transcript: `texto ${segment}` }), 40);
  const started = Date.now();
  const updates: string[] = [];
  const result = await transcribeInSegments(many, "pt", (text) => updates.push(text), {
    retryBackoffMs: 1,
    busyBudgetMs: 60_000,
    concurrency: 4,
  });
  const took = Date.now() - started;
  assert.equal(
    result.text,
    many.map((_, i) => `texto P${i}`).join(" ")
  );
  // Sequencial seriam ~480 ms; em quatro filas, ~120 ms.
  assert.ok(took < 330, `paralelo demorou ${took} ms`);
  // O texto parcial é sempre um começo contínuo: nunca um trecho do meio
  // aparece antes dos anteriores (Libras lê em ordem).
  for (const text of updates) {
    assert.ok(result.text.startsWith(text), `parcial fora de ordem: ${text}`);
  }
}

// 8. Trecho lento no começo: o parcial espera por ele, mas o resto não.
{
  const lazyCalls: number[] = [];
  const source = {
    count: 4,
    load: async (index: number) => {
      lazyCalls.push(index);
      return new Blob([`L${index}`]);
    },
    seconds: () => 180,
  };
  let firstSeen = "";
  installFetch((segment) => ({ status: 200, transcript: segment.toLowerCase() }), 5);
  const result = await transcribeInSegments(
    source,
    "pt",
    (text, _percent, initial) => {
      if (initial) firstSeen = text;
    },
    { concurrency: 2, retryBackoffMs: 1 }
  );
  assert.equal(result.text, "l0 l1 l2 l3");
  assert.ok(firstSeen.startsWith("l0"));
  // Cada trecho é codificado uma vez só, sob demanda.
  assert.deepEqual([...lazyCalls].sort(), [0, 1, 2, 3]);
}

globalThis.fetch = realFetch;

// --- cortes nas pausas de fala -------------------------------------------

{
  const fps = 1 / ENERGY_FRAME_SECONDS;
  const seconds = 10 * 60;
  const energies = new Float32Array(seconds * fps).fill(0.2);
  // Pausas de 0,6 s perto dos 2:50 e 5:56: o corte deve cair nelas, e não no
  // relógio (3:00 / 5:50), partindo uma palavra ao meio.
  for (const pause of [170, 356]) {
    for (let f = pause * fps; f < (pause + 0.6) * fps; f++) energies[f] = 0.0001;
  }
  const cuts = planSpeechCuts(energies, { targetSeconds: 180 });
  assert.ok(cuts.length >= 2);
  assert.ok(Math.abs(cuts[0] - 170.3) < 0.3, `primeiro corte em ${cuts[0]}`);
  assert.ok(Math.abs(cuts[1] - 356.3) < 0.3, `segundo corte em ${cuts[1]}`);

  // As faixas cobrem a gravação inteira, sem buraco nem sobreposição.
  const ranges = rangesFromCuts(cuts, seconds);
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges[ranges.length - 1].end, seconds);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].start, ranges[i - 1].end);
  // Nenhum trecho foge muito do alvo.
  for (const range of ranges) assert.ok(range.end - range.start <= 180 * 1.3 + 1);

  // Áudio curto é um trecho só; e um resto curto vai junto com o último.
  assert.deepEqual(planSpeechCuts(new Float32Array(200 * fps), { targetSeconds: 180 }), []);

  // Duas horas contínuas, sem pausa nenhuma: ainda assim cortes regulares.
  const long = planSpeechCuts(new Float32Array(2 * 3600 * fps).fill(0.1), { targetSeconds: 180 });
  assert.ok(long.length >= 38 && long.length <= 41, `${long.length} cortes`);
}

{
  // Energia por quadro: silêncio é zero, tom é positivo.
  const rate = 16000;
  const samples = new Float32Array(rate);
  for (let i = rate / 2; i < rate; i++) samples[i] = Math.sin(i / 10) * 0.5;
  const energies = frameEnergies(
    (start, out) => {
      out.fill(0);
      const slice = samples.subarray(start, start + out.length);
      out.set(slice);
      return slice.length;
    },
    samples.length,
    rate
  );
  assert.equal(energies.length, 50);
  assert.equal(energies[0], 0);
  assert.ok(energies[49] > 0.05);
}

// --- corrida escalonada entre modelos -------------------------------------

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeModel(plan: Record<string, { ms: number; result: RaceResult }>) {
  const started: string[] = [];
  const aborted: string[] = [];
  const run = async (model: string, signal: AbortSignal) => {
    started.push(model);
    const { ms, result } = plan[model];
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        aborted.push(model);
        resolve();
      });
    });
    return result;
  };
  return { run, started, aborted };
}

// 1. Modelo congestionado: antes eram ~50 s até o 503 e só então o próximo.
//    Agora o reforço entra no tempo de espera e o primeiro texto vence.
{
  const fake = fakeModel({
    lento: { ms: 400, result: { text: "", reason: "SERVICE_BUSY" } },
    bom: { ms: 20, result: { text: "transcrito", reason: "OK" } },
  });
  const started = Date.now();
  const outcome = await raceModels(["lento", "bom"], fake.run, {
    hedgeDelayMs: 30,
    callTimeoutMs: 1000,
    deadline: Date.now() + 2000,
    minAttemptMs: 1,
  });
  assert.equal(outcome.text, "transcrito");
  assert.equal(outcome.model, "bom");
  assert.ok(Date.now() - started < 200);
  // Quem perdeu é cancelado, sem ficar gastando cota.
  assert.deepEqual(fake.aborted, ["lento"]);
}

// 2. Recusa rápida (cota) chama o próximo na hora, sem esperar o reforço.
{
  const fake = fakeModel({
    esgotado: { ms: 1, result: { text: "", reason: "QUOTA", quotaScope: "minute" } },
    bom: { ms: 5, result: { text: "ok", reason: "OK" } },
  });
  const started = Date.now();
  const settled: string[] = [];
  const outcome = await raceModels(
    ["esgotado", "bom"],
    fake.run,
    { hedgeDelayMs: 5_000, callTimeoutMs: 10_000, deadline: Date.now() + 10_000, minAttemptMs: 1 },
    (model) => settled.push(model)
  );
  assert.equal(outcome.text, "ok");
  assert.ok(Date.now() - started < 200);
  assert.deepEqual(settled, ["esgotado", "bom"]);
}

// 3. Sem fala é veredito do arquivo: não percorre a lista inteira.
{
  const fake = fakeModel({
    a: { ms: 1, result: { text: "", reason: "NO_SPEECH" } },
    b: { ms: 1, result: { text: "", reason: "NO_SPEECH" } },
  });
  const outcome = await raceModels(["a", "b"], fake.run, {
    hedgeDelayMs: 5_000,
    callTimeoutMs: 10_000,
    deadline: Date.now() + 10_000,
    minAttemptMs: 1,
  });
  assert.equal(outcome.reason, "NO_SPEECH");
  assert.deepEqual(fake.started, ["a"]);
}

// 4. Todos esgotados no dia: a resposta diz cota do DIA.
{
  const fake = fakeModel({
    a: { ms: 1, result: { text: "", reason: "QUOTA", quotaScope: "minute" } },
    b: { ms: 1, result: { text: "", reason: "QUOTA", quotaScope: "day" } },
  });
  const outcome = await raceModels(["a", "b"], fake.run, {
    hedgeDelayMs: 5_000,
    callTimeoutMs: 10_000,
    deadline: Date.now() + 10_000,
    minAttemptMs: 1,
  });
  assert.equal(outcome.reason, "QUOTA");
  assert.equal(outcome.quotaScope, "day");
}

// 5. Nunca mais que duas chamadas em voo, e nunca o mesmo modelo duas vezes
//    ao mesmo tempo (a segunda rodada repete os primeiros da lista).
{
  let inFlight = 0;
  let peak = 0;
  const concurrent = new Set<string>();
  const outcome = await raceModels(
    ["a", "b", "c", "a"],
    async (model) => {
      assert.ok(!concurrent.has(model), `${model} em dobro`);
      concurrent.add(model);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await wait(15);
      inFlight -= 1;
      concurrent.delete(model);
      return { text: "", reason: "SERVICE_BUSY" };
    },
    { hedgeDelayMs: 5, callTimeoutMs: 1000, deadline: Date.now() + 2000, minAttemptMs: 1 }
  );
  assert.equal(outcome.reason, "SERVICE_BUSY");
  assert.ok(peak <= 2);
}

// Tempos proporcionais à duração: o trecho de 3 min ganha reforço perto dos
// 20 s; uma hora inteira não é mais morta pelo teto fixo de 40 s.
{
  const segment = raceTimingFor(180);
  assert.ok(segment.hedgeDelayMs >= 15_000 && segment.hedgeDelayMs <= 25_000);
  assert.ok(segment.callTimeoutMs >= 40_000 && segment.callTimeoutMs <= 60_000);
  assert.ok(raceTimingFor(3600).callTimeoutMs >= 200_000);
}

console.log("verify:transcription OK");
