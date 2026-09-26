import assert from "node:assert/strict";
import {
  getQuotaErrorMessageKey,
  isQuotaError,
  joinSegmentTexts,
  transcribeInSegments,
} from "../src/lib/accessibility/audio-transcriber";
import {
  fileNameForMime,
  parseGroqRetryAfter,
  whisperLanguageCode,
  whisperSegmentsToText,
} from "../src/lib/ai/groq-whisper";
import {
  ENERGY_FRAME_SECONDS,
  frameEnergies,
  planSpeechCuts,
  rangesFromCuts,
} from "../src/lib/media/speech-cuts";

// --- Whisper no Groq -------------------------------------------------------

// O 429 do Groq diz no texto quanto esperar; é o que separa "espere segundos"
// de "a cota da hora acabou".
assert.equal(parseGroqRetryAfter("Please try again in 3m20.5s. Need more tokens?"), 200_500);
assert.equal(parseGroqRetryAfter("Please try again in 45s."), 45_000);
assert.equal(parseGroqRetryAfter("Please try again in 1h2m."), 3_720_000);
assert.equal(parseGroqRetryAfter("Please try again in 500ms"), 500);
assert.equal(parseGroqRetryAfter("rate limit reached"), undefined);

assert.equal(isQuotaError(new Error("QUOTA_EXCEEDED")), true);
assert.equal(isQuotaError(new Error("QUOTA_EXCEEDED_HOUR")), true);
assert.equal(isQuotaError(new Error("QUOTA_EXCEEDED_DAY")), true);
assert.equal(isQuotaError(new Error("SERVICE_BUSY")), false);
assert.equal(getQuotaErrorMessageKey(new Error("QUOTA_EXCEEDED_HOUR")), "transcription_quota_exceeded_hour");
assert.equal(getQuotaErrorMessageKey(new Error("QUOTA_EXCEEDED_DAY")), "transcription_quota_exceeded_day");
assert.equal(getQuotaErrorMessageKey(new Error("QUOTA_EXCEEDED")), "transcription_quota_exceeded");

// O idioma FALADO vem do Whisper, em nome ou código.
assert.equal(whisperLanguageCode("Portuguese"), "pt");
assert.equal(whisperLanguageCode("english"), "en");
assert.equal(whisperLanguageCode("pt"), "pt");
assert.equal(whisperLanguageCode(""), undefined);
assert.equal(whisperLanguageCode(undefined), undefined);

// O Groq deduz o formato pela extensão do nome do arquivo.
assert.equal(fileNameForMime("audio/ogg; codecs=opus"), "audio.ogg");
assert.equal(fileNameForMime("audio/mpeg"), "audio.mp3");
assert.equal(fileNameForMime("video/mp4"), "audio.mp4");
assert.equal(fileNameForMime("audio/mp4"), "audio.m4a");
assert.equal(fileNameForMime("audio/webm"), "audio.webm");

// Alucinações do Whisper saem; fala real fica.
assert.equal(
  whisperSegmentsToText([
    { text: " Bom dia, turma.", no_speech_prob: 0.01, avg_logprob: -0.2 },
    // Silêncio que o modelo "preencheu": pouca chance de fala e baixa confiança.
    { text: " Obrigado.", no_speech_prob: 0.9, avg_logprob: -1.4 },
    { text: " Hoje vamos ver o Active Directory.", no_speech_prob: 0.02, avg_logprob: -0.3 },
    { text: " Legendas pela comunidade Amara.org", no_speech_prob: 0.4, avg_logprob: -0.8 },
  ]),
  "Bom dia, turma. Hoje vamos ver o Active Directory."
);
// Frase curta com confiança baixa mas SEM indício de silêncio é fala: fica.
assert.equal(
  whisperSegmentsToText([{ text: "Tá.", no_speech_prob: 0.1, avg_logprob: -1.5 }]),
  "Tá."
);
// Laço de repetição: duas ocorrências passam, da terceira em diante não.
assert.equal(
  whisperSegmentsToText([
    { text: "Ok, ok." },
    { text: "Ok, ok." },
    { text: "Ok, ok." },
    { text: "Ok, ok." },
    { text: "Vamos lá." },
  ]),
  "Ok, ok. Ok, ok. Vamos lá."
);
// Em qualquer alfabeto.
assert.equal(
  whisperSegmentsToText([{ text: "Привет всем." }, { text: "今日は授業です。" }]),
  "Привет всем. 今日は授業です。"
);

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
) => { status: number; transcript?: string; quotaScope?: "day" | "hour" | "minute" };

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
  assert.equal(result.quotaScope, "day");
  // Quem chamou trata isso como falha de cota; o texto parcial fica marcado,
  // e nao e gravado na nota como se fosse a aula inteira.
  assert.equal(result.text, "alpha um […]");
  // S2 nao e reenviado, e S3 nem chega a ser tentado.
  assert.deepEqual(
    calls.map((c) => c.segment),
    ["S1", "S2"]
  );
}

{
  const calls = installFetch((segment) =>
    segment === "S2"
      ? { status: 429, quotaScope: "hour" }
      : { status: 200, transcript: TEXTS[segment] }
  );
  const result = await transcribeInSegments(segments, "pt", undefined, fast);

  assert.equal(result.quotaExhausted, true);
  assert.equal(result.quotaScope, "hour");
  assert.equal(result.text, "alpha um […]");
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

// 9. Rodada congestionada com trechos em paralelo: o prazo é de relógio, não a
//    soma das recusas. Quatro trechos recusados ao mesmo tempo gastam o tempo
//    de UM, e antes isso somava 4× e abandonava a aula na primeira rodada.
{
  const four = Array.from({ length: 4 }, (_, i) => new Blob([`C${i}`]));
  const calls = installFetch(
    (segment, call) => (call === 1 ? { status: 503 } : { status: 200, transcript: segment }),
    30
  );
  const result = await transcribeInSegments(four, "pt", undefined, {
    retryBackoffMs: 1,
    busyBudgetMs: 80,
    concurrency: 4,
  });
  assert.equal(result.text, "C0 C1 C2 C3");
  assert.equal(result.missing, 0);
  assert.equal(calls.length, 8);
}

// 10. Nada voltou na primeira rodada, mas o prazo não venceu: a segunda
//     passada ainda tenta (antes exigia algum trecho já transcrito).
{
  installFetch((segment, call) =>
    call <= 2 ? { status: 503 } : { status: 200, transcript: segment }
  );
  const result = await transcribeInSegments([new Blob(["Z1"])], "pt", undefined, {
    retryBackoffMs: 1,
    busyBudgetMs: 60_000,
    concurrency: 1,
  });
  assert.equal(result.text, "Z1");
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


// Aula de até ~78 min vai inteira numa chamada; três horas viram três partes
// de ~1 h, cortadas em pausas.
{
  const fps = 1 / ENERGY_FRAME_SECONDS;
  assert.deepEqual(planSpeechCuts(new Float32Array(50 * 60 * fps).fill(0.1), { targetSeconds: 3600 }), []);
  assert.deepEqual(planSpeechCuts(new Float32Array(75 * 60 * fps).fill(0.1), { targetSeconds: 3600 }), []);
  const threeHours = planSpeechCuts(new Float32Array(3 * 3600 * fps).fill(0.1), { targetSeconds: 3600 });
  assert.equal(threeHours.length, 2);
}

console.log("verify:transcription OK");
