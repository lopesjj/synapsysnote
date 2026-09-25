import { optionalAuthHeader } from "@/lib/firebase/auth-headers";
import {
  TRANSCRIPTION_SAMPLE_RATE,
  createMonoFrameReader,
  decodeAudioBlob,
  extractAudioForTranscription,
  planAudioSegments,
} from "@/lib/media/compress-attachment";

export interface TranscribeProgressCallback {
  (currentText: string, percent: number, isInitialReady: boolean): void;
}

/** Acima disso o Gemini recusa o arquivo embutido na requisição. */
const INLINE_UPLOAD_LIMIT = 14 * 1024 * 1024;
/** Alvo da extração: menor que o teto, para subir rápido e com folga. */
const TRANSCRIPTION_TARGET_BYTES = 8 * 1024 * 1024;
const VIDEO_URL_REGEX = /\.(mp4|m4v|mov|mkv|avi|3gp|3g2|mpg|mpeg|ogv|wmv|flv|ts|hevc)($|\?)/i;

function looksLikeVideo(blob: Blob, sourceUrl?: string): boolean {
  if (blob.type.startsWith("video/")) return true;
  if (sourceUrl && VIDEO_URL_REGEX.test(sourceUrl)) return true;
  return false;
}

/** Acima disso vale fatiar: uma chamada só ficaria pesada e lenta demais. */
const SEGMENT_THRESHOLD_BYTES = 2 * 1024 * 1024;
/**
 * Duração alvo de cada trecho enviado (o corte cai na pausa de fala mais
 * próxima, ver `speech-cuts.ts`).
 *
 * Com 8 min por trecho, uma única chamada carregava ~1,4 MB de áudio e ficava
 * ~50 s em pé antes de a API desistir com 503 — e cada repetição custava os
 * mesmos 50 s. Em 3 min o pedido pesa um terço, responde em 5-15 s e uma
 * recusa sai barata. Mandar a aula inteira numa chamada só, como já foi feito,
 * nunca cabia no tempo de uma chamada: uma hora de fala leva minutos só para o
 * texto sair, e cada recusa jogava fora tudo.
 */
const SEGMENT_SECONDS = 180;
/**
 * Trechos em voo ao mesmo tempo, somando TODAS as transcrições da aba (vários
 * vídeos nos flashcards, Libras e o botão de transcrever). Precisa acompanhar
 * o `maxConcurrent` da rota: acima dele o servidor responde 429 e o trecho
 * espera à toa.
 */
const TRANSCRIBE_CONCURRENCY = 4;

let slotsInUse = 0;
const slotWaiters: (() => void)[] = [];

async function withTranscribeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (slotsInUse >= TRANSCRIBE_CONCURRENCY) {
    await new Promise<void>((resolve) => slotWaiters.push(resolve));
  } else {
    slotsInUse += 1;
  }
  try {
    return await task();
  } finally {
    // A vaga passa direto para quem espera, sem abrir brecha para um terceiro.
    const next = slotWaiters.shift();
    if (next) next();
    else slotsInUse -= 1;
  }
}

/**
 * Vídeos (e áudios longos) não cabem embutidos na chamada de transcrição, então
 * a fala é extraída para um Opus enxuto antes de subir.
 */
async function prepareTranscriptionSource(blob: Blob, sourceUrl?: string): Promise<Blob> {
  const isVideo = looksLikeVideo(blob, sourceUrl);
  if (!isVideo && blob.size <= INLINE_UPLOAD_LIMIT) return blob;

  try {
    const extracted = await extractAudioForTranscription(blob, TRANSCRIPTION_TARGET_BYTES);
    if (extracted && extracted.size > 0) return extracted;
  } catch {}

  return blob;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Emenda de dois textos transcritos por partes da mesma fala. */
function mergeOverlappingTranscripts(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  // Palavras comparadas por letra e número em QUALQUER alfabeto: com `[a-z0-9]`
  // uma palavra em árabe, russo ou japonês virava "" e toda emenda "batia",
  // descartando o começo do trecho seguinte.
  const normalize = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const prevWords = prev.split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(prevWords.length, nextWords.length, 10);

  for (let len = maxOverlap; len >= 3; len--) {
    const tail = prevWords.slice(-len).map(normalize);
    const head = nextWords.slice(0, len).map(normalize);
    if (tail.every((word, i) => word && word === head[i])) {
      return prevWords.concat(nextWords.slice(len)).join(" ");
    }
  }
  return `${prev} ${next}`;
}

export type DownloadProgress = (fraction: number) => void;

/** Baixa lendo em fluxo, para a barra andar durante um vídeo de 150 MB. */
async function readWithProgress(res: Response, onFraction?: DownloadProgress): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onFraction || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onFraction(Math.min(1, received / total));
    }
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") || "" });
}

async function fetchMediaBlob(audioUrl: string, onFraction?: DownloadProgress): Promise<Blob | null> {
  try {
    const res = await fetch(audioUrl);
    if (res.ok) return await readWithProgress(res, onFraction);
  } catch {}

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
    const resProxy = await fetch(proxyUrl);
    if (resProxy.ok) return await readWithProgress(resProxy, onFraction);
  } catch {}

  return null;
}

interface RemoteAttempt {
  text: string | null;
  /** O modelo está congestionado: não adianta insistir agora. */
  busy: boolean;
}

interface TranscribeResponse {
  text: string;
  busy: boolean;
  /** Motivo devolvido pela rota: distingue "sem fala" de "deu errado". */
  reason: string;
  /** Espera pedida pela rota quando o serviço está congestionado. */
  retryAfterMs?: number;
  /** Cota do DIA esgotada: não volta hoje, insistir só gasta o tempo de quem espera. */
  fatalQuota?: boolean;
}

function retryAfterMsOf(res: Response): number | undefined {
  const seconds = Number(res.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  // A dica é aceita, mas dentro do razoável: um "volte em dez minutos" deixaria
  // a transcrição inteira parada.
  return Math.min(60_000, Math.round(seconds * 1000));
}

async function readTranscribeResponse(res: Response): Promise<TranscribeResponse> {
  if (res.status === 429) {
    // Antes, qualquer 429 virava exceção e derrubava a mídia inteira. Mas o
    // 429 pode ser o limite por minuto (passa sozinho) ou o teto de requisições
    // do próprio app — só a cota do DIA é definitiva.
    const data = await res.json().catch(() => null);
    const daily = data?.quotaScope === "day";
    return {
      text: "",
      busy: !daily,
      reason: typeof data?.reason === "string" ? data.reason : "QUOTA",
      retryAfterMs: retryAfterMsOf(res) ?? (daily ? undefined : 30_000),
      fatalQuota: daily,
    };
  }
  if (res.status === 503) {
    return { text: "", busy: true, reason: "SERVICE_BUSY", retryAfterMs: retryAfterMsOf(res) };
  }
  const data = await res.json().catch(() => null);
  const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
  const reason = typeof data?.reason === "string" ? data.reason : res.ok ? "" : "FAILED";
  return { text, busy: reason === "SERVICE_BUSY", reason };
}

/** Envia um arquivo de áudio e devolve o texto (ou o aviso de congestionamento). */
async function postAudioFile(
  blob: Blob,
  targetLang: string,
  audioSeconds?: number
): Promise<TranscribeResponse> {
  return withTranscribeSlot(async () => {
    const formData = new FormData();
    formData.append("audio", blob, "audio-file");
    formData.append("targetLanguage", targetLang);

    try {
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: {
          "x-target-language": targetLang,
          // O servidor dimensiona o tempo de cada modelo pela duração: sem a
          // dica ele estima pelo tamanho do arquivo.
          ...(audioSeconds ? { "x-audio-seconds": String(Math.ceil(audioSeconds)) } : {}),
          ...(await optionalAuthHeader()),
        },
        body: formData,
      });
      return await readTranscribeResponse(res);
    } catch {
      return { text: "", busy: false, reason: "NETWORK" };
    }
  });
}

async function tryGeminiTranscription(
  blob: Blob,
  audioUrl: string | undefined,
  targetLang: string,
  onProgress?: TranscribeProgressCallback
): Promise<RemoteAttempt> {
  let currentPercent = 10;
  onProgress?.("", currentPercent, false);

  const timer = setInterval(() => {
    currentPercent = Math.min(88, currentPercent + 6);
    onProgress?.("", currentPercent, false);
  }, 600);

  let busy = false;

  try {
    const attempt = await postAudioFile(blob, targetLang);
    clearInterval(timer);
    // Cota do dia esgotada: nem o caminho por URL nem o Whisper local mudam
    // isso, e quem chamou precisa ouvir o motivo certo.
    if (attempt.fatalQuota) throw new Error("QUOTA_EXCEEDED");
    busy = busy || attempt.busy;
    if (attempt.text) {
      onProgress?.(attempt.text, 100, true);
      return { text: attempt.text, busy: false };
    }

    // O caminho por URL só vale quando o próprio arquivo original cabe embutido;
    // com vídeo grande o servidor só gastaria banda baixando tudo de novo.
    if (audioUrl && !busy) {
      const jsonRes = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-target-language": targetLang,
          ...(await optionalAuthHeader()),
        },
        body: JSON.stringify({
          audioUrl,
          targetLanguage: targetLang,
        }),
      });

      const urlAttempt = await readTranscribeResponse(jsonRes);
      if (urlAttempt.fatalQuota) throw new Error("QUOTA_EXCEEDED");
      busy = busy || urlAttempt.busy;
      if (urlAttempt.text) {
        onProgress?.(urlAttempt.text, 100, true);
        return { text: urlAttempt.text, busy: false };
      }
    }
  } catch (err) {
    clearInterval(timer);
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      throw err;
    }
  }

  clearInterval(timer);
  return { text: null, busy };
}

/** Ganho único para a gravação inteira, medido sem copiar a trilha. */
function peakGain(audioBuffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
  }
  if (peak <= 0.001 || peak >= 0.95) return 1;
  return Math.min(0.95 / peak, 3.5);
}

async function postPcmChunk(chunk: Float32Array, langCode: string): Promise<string> {
  const body = new Uint8Array(chunk.buffer as ArrayBuffer, chunk.byteOffset, chunk.byteLength);
  const res = await fetch("/api/ai/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-target-language": langCode,
      ...(await optionalAuthHeader()),
    },
    body,
  });
  if (!res.ok) return "";
  const data = await res.json();
  return typeof data?.transcript === "string" ? data.transcript.trim() : "";
}

/**
 * Transcrição local de reserva. A trilha nunca é materializada inteira em
 * memória: a decodificação já sai em 16 kHz e cada pedaço de 60 s é montado sob
 * demanda — senão um vídeo de uma hora custaria centenas de megabytes de RAM.
 */
/**
 * O modelo local roda no servidor da aplicação, um pedaço de 60 s por vez. Numa
 * aula de uma hora seriam dezenas de inferências em sequência — melhor avisar
 * que o serviço está ocupado do que deixar a barra girando por horas.
 */
const LOCAL_FALLBACK_MAX_SECONDS = 15 * 60;

async function tryWhisperLocalTranscription(
  blob: Blob,
  targetLang: string,
  onProgress?: TranscribeProgressCallback
): Promise<string | null> {
  const audioBuffer = await decodeAudioBlob(blob, TRANSCRIPTION_SAMPLE_RATE);
  if (!audioBuffer || !audioBuffer.duration) return null;
  if (audioBuffer.duration > LOCAL_FALLBACK_MAX_SECONDS) {
    console.warn(
      `[transcribe] ${Math.round(audioBuffer.duration / 60)} min excedem o limite do modo local`
    );
    // Devolver null aqui virava "nenhuma fala detectada" na tela.
    throw new Error("TRANSCRIBE_FAILED");
  }

  const rate = TRANSCRIPTION_SAMPLE_RATE;
  const reader = createMonoFrameReader(audioBuffer, rate);
  const totalSamples = reader.totalSamples;
  const durationSec = totalSamples / rate;
  const gain = peakGain(audioBuffer);
  const langCode = targetLang || "pt";

  const takeChunk = (startSample: number, endSample: number): Float32Array => {
    const chunk = new Float32Array(Math.max(0, endSample - startSample));
    reader.read(startSample, chunk);
    if (gain !== 1) {
      for (let i = 0; i < chunk.length; i++) chunk[i] *= gain;
    }
    return chunk;
  };

  if (durationSec <= 120) {
    let currentPercent = 15;
    onProgress?.("", currentPercent, false);

    const timer = setInterval(() => {
      currentPercent = Math.min(88, currentPercent + 8);
      onProgress?.("", currentPercent, false);
    }, 500);

    try {
      const text = await postPcmChunk(takeChunk(0, totalSamples), langCode);
      clearInterval(timer);
      onProgress?.(text, 100, true);
      return text || null;
    } catch (e) {
      clearInterval(timer);
      throw e;
    }
  }

  const chunkDurationSec = 60;
  const overlapSec = 4;
  const chunkSamples = rate * chunkDurationSec;
  const stepSamples = rate * (chunkDurationSec - overlapSec);

  const cuts: { start: number; end: number }[] = [];
  let cur = 0;
  while (cur < totalSamples) {
    const end = Math.min(totalSamples, cur + chunkSamples);
    cuts.push({ start: cur, end });
    if (end >= totalSamples) break;
    cur += stepSamples;
  }

  const parts: string[] = [];

  let consecutiveFailures = 0;
  for (let i = 0; i < cuts.length; i++) {
    const { start: from, end: to } = cuts[i];
    const text = await postPcmChunk(takeChunk(from, to), langCode);

    if (text) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      // Três blocos seguidos sem resposta é serviço fora, não silêncio: seguir
      // até o fim entregaria uma transcrição cheia de buracos invisíveis.
      if (consecutiveFailures >= 3) {
        console.warn("[transcribe] blocos consecutivos sem resposta; interrompendo");
        break;
      }
    }

    if (text) {
      if (parts.length === 0) {
        parts.push(text);
      } else {
        parts[parts.length - 1] = mergeOverlappingTranscripts(parts[parts.length - 1], text);
      }
    }

    const currentText = parts.join(" ").trim();
    const percent = Math.round(((i + 1) / cuts.length) * 100);
    onProgress?.(currentText, percent, i === 0);
  }

  const result = parts.join(" ").trim();
  return result || null;
}

/**
 * Espera antes de reenviar o mesmo trecho. O servidor já correu a cadeia de
 * modelos antes de dizer "ocupado", então reenviar na hora cairia na mesma fila.
 */
const SEGMENT_RETRY_BACKOFF_MS = 8_000;
/**
 * Tempo de relógio sem NENHUM trecho novo transcrito antes de desistir. Cada
 * trecho que volta renova o prazo: com o Gemini em "high demand" a aula anda
 * devagar mas anda, e desistir no meio jogaria fora o que ainda viria.
 *
 * Já foi a SOMA do tempo gasto em recusas — com quatro trechos em paralelo,
 * uma única rodada congestionada (4 × 2 min) estourava o teto e abandonava a
 * aula inteira na primeira tentativa.
 */
const BUSY_TIME_BUDGET_MS = 8 * 60_000;
/** Marca o trecho que ficou sem transcrição, em vez de emendar o buraco calado. */
const GAP_MARKER = "[…]";

async function postSegmentWithRetry(
  segment: Blob,
  lang: string,
  allowRetry: boolean,
  backoffMs: number,
  audioSeconds?: number
): Promise<TranscribeResponse> {
  const first = await postAudioFile(segment, lang, audioSeconds);
  if (first.text || first.fatalQuota || !first.busy || !allowRetry) return first;
  await delay(Math.max(backoffMs, first.retryAfterMs ?? 0));
  return postAudioFile(segment, lang, audioSeconds);
}

/**
 * Junta os trechos na ordem original. Os cortes caem em pausas de fala e não
 * se sobrepõem, então a emenda é concatenação — nada é descartado por parecer
 * repetido. Um trecho perdido no meio vira uma marca visível: costurar o que
 * veio antes com o que veio depois entregaria uma aula com minutos faltando e
 * ninguém saberia.
 */
export function joinSegmentTexts(texts: (string | null)[]): string {
  let merged = "";
  let gap = false;

  for (const text of texts) {
    if (!text) {
      // Vazio antes do primeiro trecho transcrito não é lacuna: é começo.
      if (merged) gap = true;
      continue;
    }
    if (!merged) {
      merged = text;
      continue;
    }
    merged = gap ? `${merged} ${GAP_MARKER} ${text}` : `${merged} ${text}`;
    gap = false;
  }

  if (gap && merged) merged = `${merged} ${GAP_MARKER}`;
  return merged.trim();
}

/** Texto contínuo desde o começo: o que já pode ser lido ou sinalizado em ordem. */
function contiguousPrefix(texts: (string | null | undefined)[], settled: boolean[]): string {
  const parts: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (!settled[i]) break;
    const text = texts[i];
    if (text) parts.push(text);
  }
  return parts.join(" ").trim();
}

export interface SegmentRunTuning {
  /** Espera antes de reenviar um trecho recusado. */
  retryBackoffMs?: number;
  /** Tempo de relógio sem trecho novo transcrito antes de desistir. */
  busyBudgetMs?: number;
  /** Trechos em voo ao mesmo tempo (o teto global da aba vale por cima). */
  concurrency?: number;
  /** Faixa da barra de progresso ocupada pelos trechos. */
  progressFrom?: number;
  progressTo?: number;
}

/** Trechos a transcrever: já prontos, ou codificados sob demanda. */
export interface SegmentSource {
  count: number;
  load(index: number): Promise<Blob>;
  seconds?(index: number): number;
}

function asSegmentSource(segments: Blob[] | SegmentSource): SegmentSource {
  if (!Array.isArray(segments)) return segments;
  return { count: segments.length, load: async (index) => segments[index] };
}

/**
 * Transcreve os trechos em paralelo, entregando o texto em ordem.
 *
 * Em série, uma aula de uma hora eram ~20 idas e voltas enfileiradas, e um
 * trecho lento segurava todos os seguintes. Em paralelo o tempo total cai para
 * perto do trecho mais lento de cada rodada, e o texto contínuo desde o começo
 * já aparece enquanto o resto termina — Libras abre com o primeiro trecho.
 *
 * Os tempos entram por parâmetro para que `verify:transcription` exercite a
 * repetição e o teto sem esperar minutos; em produção valem as constantes.
 */
export async function transcribeInSegments(
  segments: Blob[] | SegmentSource,
  lang: string,
  onProgress?: TranscribeProgressCallback,
  tuning?: SegmentRunTuning
): Promise<{
  text: string;
  busy: boolean;
  lastReason: string;
  missing: number;
  quotaExhausted: boolean;
}> {
  const source = asSegmentSource(segments);
  const total = source.count;
  const retryBackoffMs = tuning?.retryBackoffMs ?? SEGMENT_RETRY_BACKOFF_MS;
  const busyBudgetMs = tuning?.busyBudgetMs ?? BUSY_TIME_BUDGET_MS;
  const concurrency = Math.max(1, tuning?.concurrency ?? TRANSCRIBE_CONCURRENCY);
  const progressFrom = tuning?.progressFrom ?? 20;
  const progressTo = tuning?.progressTo ?? 99;
  // Guardar por índice, e não em um acumulador, é o que permite tentar de novo
  // só os buracos no fim e ainda montar o texto na ordem certa.
  const texts: (string | null)[] = new Array(total).fill(null);
  const settled: boolean[] = new Array(total).fill(false);
  const loaded = new Map<number, Blob>();
  const busySegments: number[] = [];
  let busy = false;
  let lastReason = "";
  let quotaExhausted = false;
  let processed = 0;
  let firstReported = false;
  let stop = false;

  const report = () => {
    const soFar = contiguousPrefix(texts, settled);
    const percent = Math.round(progressFrom + (processed / Math.max(1, total)) * (progressTo - progressFrom));
    const initial = Boolean(soFar) && !firstReported;
    if (initial) firstReported = true;
    onProgress?.(soFar, Math.min(99, percent), initial);
  };

  // Última vez que um trecho voltou com texto. É o que decide quando parar:
  // enquanto a aula anda, vale insistir; parada há minutos, é serviço fora.
  let lastProgressAt = Date.now();
  const stalled = () => Date.now() - lastProgressAt >= busyBudgetMs;

  const loadSegment = async (index: number): Promise<Blob | null> => {
    const cached = loaded.get(index);
    if (cached) return cached;
    try {
      const blob = await source.load(index);
      if (blob && blob.size > 0) {
        loaded.set(index, blob);
        return blob;
      }
    } catch (error) {
      console.warn(`[transcribe] trecho ${index + 1} não pôde ser preparado`, error);
    }
    return null;
  };

  const runOne = async (index: number, allowRetry: boolean) => {
    const blob = await loadSegment(index);
    if (!blob) {
      lastReason = "FAILED";
      return;
    }
    const attempt = await postSegmentWithRetry(
      blob,
      lang,
      allowRetry && !stalled(),
      retryBackoffMs,
      source.seconds?.(index)
    );
    lastReason = attempt.reason || lastReason;

    if (attempt.text) {
      texts[index] = attempt.text;
      lastProgressAt = Date.now();
    } else if (attempt.fatalQuota) {
      // A cota do dia acabou: os trechos seguintes receberiam o mesmo 429.
      quotaExhausted = true;
      stop = true;
    } else if (attempt.busy) {
      busy = true;
      if (!busySegments.includes(index)) busySegments.push(index);
      if (stalled()) {
        console.warn("[transcribe] tempo gasto em recusas estourou o teto; interrompendo");
        stop = true;
      }
    }
  };

  let nextIndex = 0;
  const worker = async () => {
    while (!stop && nextIndex < total) {
      const index = nextIndex++;
      await runOne(index, true);
      processed += 1;
      settled[index] = true;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  // O que não chegou a ser enviado conta como resolvido (vazio) para o texto
  // contínuo não parar no primeiro que ficou para trás.
  settled.fill(true);

  // Segunda passada só nos buracos: o congestionamento que derrubou um trecho no
  // meio do caminho costuma ter passado quando o resto termina.
  const retryable = busySegments.filter((index) => !texts[index]).sort((a, b) => a - b);
  if (!quotaExhausted && retryable.length > 0 && !stalled()) {
    // Um respiro antes: o servidor acabou de dizer que a fila está cheia.
    await delay(retryBackoffMs);
    stop = false;
    let cursor = 0;
    const retryWorker = async () => {
      while (!stop && cursor < retryable.length) {
        const index = retryable[cursor++];
        await runOne(index, false);
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, retryable.length) }, retryWorker));
  }

  return {
    text: joinSegmentTexts(texts),
    busy,
    lastReason,
    missing: texts.filter((text) => !text).length,
    quotaExhausted,
  };
}

/** Motivos que significam "a transcrição falhou", e não "o áudio não tem fala". */
function isFailureReason(reason: string): boolean {
  return Boolean(reason) && reason !== "OK" && reason !== "NO_SPEECH" && reason !== "TRUNCATED";
}

export interface TranscribeOptions {
  /**
   * Reaproveita, nesta sessão, o texto já obtido para a mesma mídia. A geração
   * de flashcards relê a nota a cada tentativa, e uma aula de 50 min custa
   * download, decodificação e uma dezena de chamadas: refazer tudo porque o
   * usuário trocou a quantidade de cards não faz sentido. O botão do bloco de
   * mídia não usa — ali "transcrever de novo" significa refazer de verdade.
   */
  reuseCache?: boolean;
}

const sessionTranscripts = new Map<string, string>();
/** Mesma mídia pedida duas vezes ao mesmo tempo (Libras e flashcards) vira uma só. */
const inFlightTranscripts = new Map<string, Promise<string>>();

function cacheKeyFor(audioUrl: string, lang: string): string {
  // O token da URL assinada muda a cada leitura; o caminho do arquivo não.
  return `${lang}::${audioUrl.split("?")[0]}`;
}

export async function transcribeAudioSource(
  audioUrl: string,
  audioBlob?: Blob | null,
  onProgress?: TranscribeProgressCallback,
  targetLang?: string,
  options?: TranscribeOptions
): Promise<string> {
  const lang = targetLang || "pt";
  const cacheKey = audioUrl ? cacheKeyFor(audioUrl, lang) : "";

  if (cacheKey && options?.reuseCache) {
    const cached = sessionTranscripts.get(cacheKey);
    if (cached) {
      onProgress?.(cached, 100, true);
      return cached;
    }
    const running = inFlightTranscripts.get(cacheKey);
    if (running) {
      const text = await running;
      if (text) onProgress?.(text, 100, true);
      return text;
    }
  }

  const job = runTranscription(audioUrl, audioBlob, onProgress, lang);
  if (cacheKey) inFlightTranscripts.set(cacheKey, job);
  try {
    const text = await job;
    // Todo resultado entra no cache, mesmo o do "transcrever de novo": é ele
    // que poupa Libras e flashcards de refazer a mesma aula logo em seguida.
    if (cacheKey && text && !text.includes(GAP_MARKER)) sessionTranscripts.set(cacheKey, text);
    return text;
  } finally {
    if (cacheKey && inFlightTranscripts.get(cacheKey) === job) inFlightTranscripts.delete(cacheKey);
  }
}

async function runTranscription(
  audioUrl: string,
  audioBlob: Blob | null | undefined,
  onProgress: TranscribeProgressCallback | undefined,
  lang: string
): Promise<string> {
  if (!audioUrl && !audioBlob) return "";
  if (typeof window === "undefined") return "";

  try {
    let blob = audioBlob || null;
    if (!blob && audioUrl) {
      // Um vídeo de 150 MB leva o seu tempo para descer: a barra acompanha.
      blob = await fetchMediaBlob(audioUrl, (fraction) =>
        onProgress?.("", Math.round(1 + fraction * 9), false)
      );
    }

    if (!blob) return "";

    const heavy = looksLikeVideo(blob, audioUrl) || blob.size > SEGMENT_THRESHOLD_BYTES;

    if (heavy) {
      onProgress?.("", 10, false);

      // Decodifica uma vez, corta nas pausas e manda os trechos em paralelo. É
      // o caminho de toda mídia pesada, de 3 min ou de duas horas.
      const plan = await planAudioSegments(blob, { segmentSeconds: SEGMENT_SECONDS });

      if (plan && plan.ranges.length) {
        onProgress?.("", 14, false);
        const result = await transcribeInSegments(
          {
            count: plan.ranges.length,
            load: (index) => plan.encode(index),
            seconds: (index) => plan.ranges[index].end - plan.ranges[index].start,
          },
          lang,
          onProgress,
          { progressFrom: 14, progressTo: 99 }
        );
        // Cota do dia estourada no meio: o que voltou é um pedaço da aula, e
        // gravar isso como "a transcrição" esconde o resto. Melhor dizer que
        // acabou a cota — a retentativa custa uma requisição só.
        if (result.quotaExhausted) throw new Error("QUOTA_EXCEEDED");
        if (result.text) {
          if (result.missing > 0) {
            console.warn(
              `[transcribe] ${result.missing} de ${plan.ranges.length} trechos ficaram sem transcrição`
            );
          }
          onProgress?.(result.text, 100, true);
          return result.text;
        }
        if (result.busy) throw new Error("SERVICE_BUSY");
        // Sem texto por recusa da API, chave ausente ou rede: dizer "nenhuma fala
        // detectada" mandaria o usuário caçar um problema que não existe.
        if (isFailureReason(result.lastReason)) throw new Error("TRANSCRIBE_FAILED");
        return "";
      }
      // Sem extração (navegador sem WebCodecs, contêiner que não decodifica) só
      // resta o caminho antigo — e ele só serve para arquivo pequeno.
      if (blob.size > INLINE_UPLOAD_LIMIT) {
        console.warn("[transcribe] não foi possível extrair a fala deste arquivo");
        throw new Error("TRANSCRIBE_FAILED");
      }
    }

    const sourceBlob = await prepareTranscriptionSource(blob, audioUrl);
    // O caminho por URL só faz sentido quando o arquivo original é o mesmo que
    // estamos enviando e cabe embutido.
    const urlFallback =
      sourceBlob === blob && blob.size <= INLINE_UPLOAD_LIMIT ? audioUrl : undefined;

    let serviceBusy = false;
    if (sourceBlob.size <= INLINE_UPLOAD_LIMIT) {
      const attempt = await tryGeminiTranscription(sourceBlob, urlFallback, lang, onProgress);
      if (attempt.text) return attempt.text;
      serviceBusy = attempt.busy;
    }

    const whisperResult = await tryWhisperLocalTranscription(sourceBlob, lang, onProgress);
    if (whisperResult) return whisperResult;

    // Sem transcrição e com o serviço congestionado: dizer isso é mais útil que
    // fingir que o áudio não tinha fala.
    if (serviceBusy) throw new Error("SERVICE_BUSY");
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "QUOTA_EXCEEDED" ||
        e.message === "SERVICE_BUSY" ||
        e.message === "TRANSCRIBE_FAILED")
    ) {
      throw e;
    }
    console.error("Falha ao processar e transcrever áudio:", e);
  }

  return "";
}
