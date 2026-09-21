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

// A sobreposição de 5 s entre trechos vizinhos não pode virar fala repetida.
assert.equal(
  joinSegmentTexts(["a aula começa agora mesmo", "agora mesmo vamos ver"]),
  "a aula começa agora mesmo vamos ver"
);

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
const fast = { retryBackoffMs: 1, busyBudgetMs: 60_000 };

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

globalThis.fetch = realFetch;

console.log("verify:transcription OK");
