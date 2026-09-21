import {
  TRANSCRIPTION_SAMPLE_RATE,
  createMonoFrameReader,
  decodeAudioBlob,
  extractAudioForTranscription,
  extractAudioSegments,
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
/** Segundos repetidos entre trechos vizinhos, e a fala média por segundo. */
const SEGMENT_OVERLAP_SECONDS = 5;
/**
 * Duração de cada trecho enviado.
 *
 * Com 8 min por trecho, uma única chamada carregava ~1,4 MB de áudio e ficava
 * ~50 s em pé antes de a API desistir com 503 — e cada repetição custava os
 * mesmos 50 s. Em 3 min o pedido pesa um terço, responde em segundos e uma
 * recusa sai barata; o preço é mais requisições, que cabem folgadas no teto de
 * 60 por 10 min da rota.
 */
const SEGMENT_SECONDS = 180;
const WORDS_PER_SECOND = 2.5;

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

function mergeOverlappingTranscripts(prev: string, next: string, overlapWords = 0): string {
  if (!prev) return next;
  if (!next) return prev;
  const prevWords = prev.split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(prevWords.length, nextWords.length, 10);

  for (let len = maxOverlap; len >= 2; len--) {
    const prevSlice = prevWords.slice(-len).map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, "")).join(" ");
    const nextSlice = nextWords.slice(0, len).map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, "")).join(" ");
    if (prevSlice && prevSlice === nextSlice) {
      return prevWords.concat(nextWords.slice(len)).join(" ");
    }
  }

  // Sem emenda textual: quando sabemos que os trechos se sobrepõem no tempo,
  // colar tudo repetiria alguns segundos de fala em cada junta.
  if (overlapWords > 0 && nextWords.length > overlapWords) {
    return prevWords.concat(nextWords.slice(overlapWords)).join(" ");
  }

  return prev + " " + next;
}

async function fetchMediaBlob(audioUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(audioUrl);
    if (res.ok) return await res.blob();
  } catch {}

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
    const resProxy = await fetch(proxyUrl);
    if (resProxy.ok) return await resProxy.blob();
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
async function postAudioFile(blob: Blob, targetLang: string): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append("audio", blob, "audio-file");
  formData.append("targetLanguage", targetLang);

  try {
    const res = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: { "x-target-language": targetLang },
      body: formData,
    });
    return await readTranscribeResponse(res);
  } catch {
    return { text: "", busy: false, reason: "NETWORK" };
  }
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
 * Teto do arquivo único enviado de uma vez. 50 min de fala em Opus mono a
 * 24 kbps dão ~9 MB, e acima de 6 MB a rota sobe pela Files API — então o
 * limite de ~20 MB do corpo embutido do Gemini deixa de valer. Fica abaixo do
 * teto da rota (24 MB), que por sua vez respeita o corpo máximo do Cloud Run.
 */
const WHOLE_UPLOAD_LIMIT = 20 * 1024 * 1024;

/**
 * Manda a fala inteira numa requisição só.
 *
 * Medido com a chave do projeto: 50 min de áudio custam 75.012 tokens de
 * entrada e voltam em segundos — UMA requisição, contra 18 no caminho
 * fatiado. Numa conta gratuita de 20 requisições por dia em cada modelo, essa
 * diferença é a diferença entre transcrever a aula e gastar o dia nela.
 *
 * Devolve `null` quando não dá para extrair a fala (navegador sem WebCodecs,
 * contêiner que não decodifica): aí vale o caminho fatiado.
 */
async function transcribeWholeSpeech(
  blob: Blob,
  lang: string,
  onProgress?: TranscribeProgressCallback
): Promise<TranscribeResponse | null> {
  let speech: Blob | null = null;
  try {
    // Extrair a fala de uma aula de 50 min leva um a dois minutos: esta fatia
    // da barra é avanço real, medido quadro a quadro pelo codificador.
    speech = await extractAudioForTranscription(blob, WHOLE_UPLOAD_LIMIT, (fraction) =>
      onProgress?.("", Math.round(4 + Math.min(1, Math.max(0, fraction)) * 36), false)
    );
  } catch {}
  if (!speech || speech.size === 0 || speech.size > WHOLE_UPLOAD_LIMIT) return null;

  // Daqui em diante é uma chamada só, sem progresso para consultar: a animação
  // existe para a barra não parecer travada enquanto o modelo transcreve.
  let percent = 42;
  onProgress?.("", percent, false);
  const timer = setInterval(() => {
    percent = Math.min(92, percent + 3);
    onProgress?.("", percent, false);
  }, 1500);

  try {
    return await postAudioFile(speech, lang);
  } finally {
    clearInterval(timer);
  }
}

/**
 * Transcreve em pedaços quando a mídia é longa.
 *
 * Uma aula de 50 min numa única chamada é o pior caso: arquivo pesado, minutos
 * de espera e, se a API recusar, perde-se tudo. Fatiado, cada chamada é leve, o
 * progresso é real e uma recusa isolada custa só aquele trecho.
 */
/**
 * Espera antes de reenviar o mesmo trecho. O servidor já varreu modelos antes
 * de dizer "ocupado", então reenviar na hora cairia na mesma fila.
 */
const SEGMENT_RETRY_BACKOFF_MS = 8_000;
/**
 * Teto do tempo gasto em trechos recusados. Cada recusa custa ~2 min, e uma
 * aula tem vários trechos: sem esse limite, um serviço fora do ar deixaria a
 * barra girando por meia hora antes de admitir a falha. O que já foi
 * transcrito até aqui é aproveitado.
 */
const BUSY_TIME_BUDGET_MS = 5 * 60_000;
/** Marca o trecho que ficou sem transcrição, em vez de emendar o buraco calado. */
const GAP_MARKER = "[…]";

async function postSegmentWithRetry(
  segment: Blob,
  lang: string,
  allowRetry: boolean,
  backoffMs: number
): Promise<TranscribeResponse> {
  const first = await postAudioFile(segment, lang);
  if (first.text || first.fatalQuota || !first.busy || !allowRetry) return first;
  await delay(Math.max(backoffMs, first.retryAfterMs ?? 0));
  return postAudioFile(segment, lang);
}

/**
 * Junta os trechos na ordem original. Um trecho perdido no meio vira uma marca
 * visível: costurar o que veio antes com o que veio depois entregaria uma aula
 * com oito minutos faltando e ninguém saberia.
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
    if (gap) {
      merged = `${merged} ${GAP_MARKER} ${text}`;
      gap = false;
      continue;
    }
    merged = mergeOverlappingTranscripts(
      merged,
      text,
      Math.round(SEGMENT_OVERLAP_SECONDS * WORDS_PER_SECOND)
    );
  }

  if (gap && merged) merged = `${merged} ${GAP_MARKER}`;
  return merged.trim();
}

export interface SegmentRunTuning {
  /** Espera antes de reenviar um trecho recusado. */
  retryBackoffMs?: number;
  /** Teto do tempo gasto em trechos recusados antes de desistir. */
  busyBudgetMs?: number;
}

/**
 * Os tempos entram por parâmetro para que `verify:transcription` exercite a
 * repetição e o teto sem esperar minutos; em produção valem as constantes.
 */
export async function transcribeInSegments(
  segments: Blob[],
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
  const retryBackoffMs = tuning?.retryBackoffMs ?? SEGMENT_RETRY_BACKOFF_MS;
  const busyBudgetMs = tuning?.busyBudgetMs ?? BUSY_TIME_BUDGET_MS;
  // Guardar por índice, e não em um acumulador, é o que permite tentar de novo
  // só os buracos no fim e ainda montar o texto na ordem certa.
  const texts: (string | null)[] = new Array(segments.length).fill(null);
  const busySegments: number[] = [];
  let busy = false;
  let lastReason = "";
  let quotaExhausted = false;
  let processed = 0;
  let firstReported = false;

  const report = () => {
    const soFar = joinSegmentTexts(texts);
    const percent = Math.round(20 + (processed / segments.length) * 80);
    const initial = Boolean(soFar) && !firstReported;
    if (initial) firstReported = true;
    onProgress?.(soFar, Math.min(99, percent), initial);
  };

  // Tempo queimado em trechos recusados. É o que decide quando parar: antes,
  // bastava o primeiro trecho voltar ocupado para o vídeo inteiro ser
  // abandonado, e uma aula de 50 min ficava sem uma linha de transcrição.
  let busySpentMs = 0;

  for (let i = 0; i < segments.length; i++) {
    const startedAt = Date.now();
    const attempt = await postSegmentWithRetry(
      segments[i],
      lang,
      busySpentMs < busyBudgetMs,
      retryBackoffMs
    );
    lastReason = attempt.reason || lastReason;
    processed += 1;

    if (attempt.text) {
      texts[i] = attempt.text;
    } else if (attempt.fatalQuota) {
      // A cota do dia acabou: os trechos seguintes receberiam o mesmo 429.
      quotaExhausted = true;
      report();
      break;
    } else if (attempt.busy) {
      busy = true;
      busySegments.push(i);
      busySpentMs += Date.now() - startedAt;
    }

    report();

    if (busySpentMs >= busyBudgetMs) {
      console.warn("[transcribe] tempo gasto em recusas estourou o teto; interrompendo");
      break;
    }
  }

  // Segunda passada só nos buracos: o congestionamento que derrubou um trecho no
  // meio do caminho costuma ter passado quando o resto termina.
  const retryable = busySegments.filter((index) => !texts[index]);
  if (retryable.length > 0 && texts.some(Boolean) && busySpentMs < busyBudgetMs) {
    for (const index of retryable) {
      const startedAt = Date.now();
      const attempt = await postSegmentWithRetry(segments[index], lang, false, retryBackoffMs);
      lastReason = attempt.reason || lastReason;
      if (attempt.text) texts[index] = attempt.text;
      else if (attempt.busy) busySpentMs += Date.now() - startedAt;
      report();
      if (busySpentMs >= busyBudgetMs) break;
    }
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
  const cacheKey = options?.reuseCache && audioUrl ? cacheKeyFor(audioUrl, lang) : "";

  if (cacheKey) {
    const cached = sessionTranscripts.get(cacheKey);
    if (cached) {
      onProgress?.(cached, 100, true);
      return cached;
    }
  }

  const text = await runTranscription(audioUrl, audioBlob, onProgress, lang);
  if (cacheKey && text) sessionTranscripts.set(cacheKey, text);
  return text;
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
      blob = await fetchMediaBlob(audioUrl);
    }

    if (!blob) return "";

    const heavy = looksLikeVideo(blob, audioUrl) || blob.size > SEGMENT_THRESHOLD_BYTES;

    if (heavy) {
      onProgress?.("", 2, false);

      // Caminho curto: a fala inteira em UMA requisição. Só quando ele não
      // serve é que a aula é fatiada.
      const single = await transcribeWholeSpeech(blob, lang, onProgress);
      if (single?.text && single.reason !== "TRUNCATED") {
        onProgress?.(single.text, 100, true);
        return single.text;
      }
      if (single?.reason === "TRUNCATED") {
        // O teto de saída cortou a aula no meio. Fatiada, cada resposta cabe —
        // é isso que garante a transcrição inteira, e não só o começo dela.
        console.warn("[transcribe] resposta cortada no teto de saída; refazendo em trechos");
      }

      const extracted = await extractAudioSegments(blob, {
        segmentSeconds: SEGMENT_SECONDS,
        overlapSeconds: SEGMENT_OVERLAP_SECONDS,
        onProgress: (done, total) =>
          onProgress?.("", Math.round(2 + (done / Math.max(1, total)) * 18), false),
      });

      if (extracted && extracted.segments.length) {
        const result = await transcribeInSegments(extracted.segments, lang, onProgress);
        // Cota do dia estourada no meio: o que voltou é um pedaço da aula, e
        // gravar isso como "a transcrição" esconde o resto. Melhor dizer que
        // acabou a cota — a retentativa custa uma requisição só.
        if (result.quotaExhausted) throw new Error("QUOTA_EXCEEDED");
        if (result.text) {
          if (result.missing > 0) {
            console.warn(
              `[transcribe] ${result.missing} de ${extracted.segments.length} trechos ficaram sem transcrição`
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
