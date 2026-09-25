/**
 * Transcrição pelo Whisper hospedado no Groq (API compatível com a da OpenAI).
 *
 * Por que Whisper, e não mais o Gemini: o Gemini transcrevia e traduzia na
 * mesma chamada, e no plano gratuito passava boa parte do tempo em "high
 * demand" — uma aula de 50 min ficava sem transcrição. O Whisper só
 * transcreve, no idioma que foi falado; a tradução, quando o usuário pede outro
 * idioma, é um passo separado sobre o texto pronto. Assim a transcrição nunca
 * sai "traduzida pela metade", e o conteúdo da aula não depende da tradução.
 *
 * Cotas do plano gratuito (por conta, somando todos os usuários do app):
 * 20 requisições/min, 2.000/dia, 7.200 s de áudio por hora e 28.800 s por dia
 * — umas 8 h de aula por dia. Arquivo de até 25 MB no plano gratuito (100 MB
 * no pago). Uma hora de fala em Opus mono a 32 kbps dá ~14 MB: a aula inteira
 * cabe numa chamada só, sem cortes.
 */

export type WhisperReason =
  | "OK"
  | "NO_SPEECH"
  | "QUOTA"
  | "SERVICE_BUSY"
  | "TOO_LARGE"
  | "NOT_CONFIGURED"
  | "FAILED";

export interface WhisperResult {
  text: string;
  reason: WhisperReason;
  /** Idioma que o Whisper detectou na fala, em código ISO 639-1. */
  language?: string;
  /** Espera pedida pelo Groq no 429. */
  retryAfterMs?: number;
  /** "day" quando a cota que estourou só volta amanhã. */
  quotaScope?: "hour" | "day" | "minute";
}

export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const DEFAULT_WHISPER_MODEL = "whisper-large-v3-turbo";
/** O plano gratuito aceita 25 MB; a margem cobre o cabeçalho do multipart. */
export const GROQ_MAX_UPLOAD_BYTES = 24_000_000;

/** Tentativas extras em erro passageiro do Groq (5xx, rede). */
const TRANSIENT_RETRY_DELAYS_MS = [2_000, 5_000];
/** O Groq transcreve 1 h em ~15 s; o grosso do tempo é o envio do arquivo. */
const CALL_TIMEOUT_MS = 180_000;

export function groqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || "";
}

export function whisperModel(): string {
  return process.env.GROQ_TRANSCRIBE_MODEL?.trim() || DEFAULT_WHISPER_MODEL;
}

/** O Groq deduz o formato pela extensão do nome do arquivo, não pelo tipo. */
export function fileNameForMime(rawMime: string): string {
  const mime = rawMime.split(";")[0]?.trim().toLowerCase() || "";
  if (mime.includes("ogg") || mime.includes("opus")) return "audio.ogg";
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("flac")) return "audio.flac";
  if (mime.includes("mpeg") || mime.includes("mp3") || mime.includes("mpga")) return "audio.mp3";
  if (mime.includes("m4a") || mime === "audio/mp4" || mime === "audio/aac" || mime === "audio/x-m4a") {
    return "audio.m4a";
  }
  if (mime.includes("mp4") || mime.startsWith("video/")) return "audio.mp4";
  return "audio.ogg";
}

const LANGUAGE_CODES: Record<string, string> = {
  portuguese: "pt",
  english: "en",
  spanish: "es",
  french: "fr",
  italian: "it",
  german: "de",
  russian: "ru",
  japanese: "ja",
  chinese: "zh",
  mandarin: "zh",
  arabic: "ar",
};

/** "Portuguese", "portuguese" ou "pt" -> "pt". */
export function whisperLanguageCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const raw = value.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(raw)) return raw;
  return LANGUAGE_CODES[raw] ?? LANGUAGE_CODES[raw.split(/[\s(-]/)[0]];
}

/** "Please try again in 3m20.5s" / "1h2m" / "45s" / "500ms" -> milissegundos. */
export function parseGroqRetryAfter(message: string): number | undefined {
  const match = message.match(/try again in\s+((?:[\d.]+(?:ms|h|m|s))+)/i);
  if (!match) return undefined;
  let total = 0;
  for (const part of match[1].matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    const value = Number(part[1]);
    if (!Number.isFinite(value)) continue;
    total += part[2] === "h" ? value * 3_600_000 : part[2] === "m" ? value * 60_000 : part[2] === "s" ? value * 1_000 : value;
  }
  return total > 0 ? Math.round(total) : undefined;
}

export interface WhisperSegment {
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

function normalized(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Monta o texto a partir dos segmentos, tirando as "alucinações" clássicas do
 * Whisper sem tocar na fala real:
 *
 * - silêncio que virou frase: o próprio modelo marca com `no_speech_prob`
 *   alto E `avg_logprob` baixo (os limiares são os do Whisper original);
 * - laço de repetição: o mesmo segmento emendado muitas vezes seguidas. Duas
 *   ocorrências passam (gente repete "ok, ok"); da terceira em diante, não;
 * - créditos de legenda que o modelo aprendeu com vídeos da internet.
 */
export function whisperSegmentsToText(segments: WhisperSegment[]): string {
  const kept: string[] = [];
  let previous = "";
  let run = 0;
  for (const segment of segments) {
    const text = (segment.text || "").trim();
    if (!text) continue;
    const noSpeech = segment.no_speech_prob ?? 0;
    const logprob = segment.avg_logprob ?? 0;
    if (noSpeech > 0.6 && logprob < -1) continue;
    if (/(legendas?|subt[ií]tulos?|subtitles?)\s+(pela|por la|by the)\s+comunidad[ea]?|amara\.org/i.test(text)) {
      continue;
    }
    const key = normalized(text);
    if (key && key === previous) {
      run += 1;
      if (run >= 2) continue;
    } else {
      run = 0;
    }
    previous = key;
    kept.push(text);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(
  apiKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<WhisperResult & { transient?: boolean }> {
  const form = new FormData();
  const type = mimeType.split(";")[0]?.trim() || "audio/ogg";
  form.append("file", new Blob([new Uint8Array(buffer)], { type }), fileNameForMime(mimeType));
  form.append("model", whisperModel());
  // verbose_json traz o idioma detectado e a confiança de cada segmento, que é
  // o que permite filtrar alucinação sem cortar fala.
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Sem `language`: o Whisper transcreve no idioma que foi FALADO. Forçar o
  // idioma escolhido para a nota faria o modelo "traduzir" por conta própria,
  // e mal — é daí que vinham as traduções erradas.

  let res: Response;
  try {
    res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (error) {
    console.warn("[transcribe] Groq inacessível", error instanceof Error ? error.message : error);
    return { text: "", reason: "SERVICE_BUSY", transient: true };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = String(body?.error?.message || "");
    if (res.status === 429) {
      const header = Number(res.headers.get("retry-after"));
      const retryAfterMs =
        parseGroqRetryAfter(message) ?? (Number.isFinite(header) && header > 0 ? header * 1000 : undefined);
      const quotaScope = /per day|\(ASD\)|\(RPD\)/i.test(message)
        ? "day"
        : /per hour|\(ASH\)/i.test(message)
          ? "hour"
          : "minute";
      console.warn(`[transcribe] Groq sem cota (${quotaScope}): ${message.slice(0, 160)}`);
      return { text: "", reason: "QUOTA", quotaScope, retryAfterMs };
    }
    if (res.status === 413) return { text: "", reason: "TOO_LARGE" };
    if (res.status === 401 || res.status === 403) {
      console.error("[transcribe] GROQ_API_KEY recusada pelo Groq");
      return { text: "", reason: "NOT_CONFIGURED" };
    }
    if (res.status >= 500) {
      console.warn(`[transcribe] Groq indisponível (${res.status}): ${message.slice(0, 120)}`);
      return { text: "", reason: "SERVICE_BUSY", transient: true };
    }
    console.warn(`[transcribe] Groq recusou o arquivo (${res.status}): ${message.slice(0, 200)}`);
    return { text: "", reason: "FAILED" };
  }

  const data = (await res.json().catch(() => null)) as {
    text?: string;
    language?: string;
    segments?: WhisperSegment[];
  } | null;
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  const text = segments.length ? whisperSegmentsToText(segments) : (data?.text || "").trim();
  return {
    text,
    reason: text ? "OK" : "NO_SPEECH",
    language: whisperLanguageCode(data?.language),
  };
}

/** Transcreve o arquivo inteiro, repetindo só o que for falha passageira. */
export async function transcribeWithGroq(buffer: Buffer, mimeType: string): Promise<WhisperResult> {
  const apiKey = groqApiKey();
  if (!apiKey) return { text: "", reason: "NOT_CONFIGURED" };
  if (buffer.byteLength > GROQ_MAX_UPLOAD_BYTES) return { text: "", reason: "TOO_LARGE" };

  let result = await callGroq(apiKey, buffer, mimeType);
  for (const wait of TRANSIENT_RETRY_DELAYS_MS) {
    const shortQuota = result.reason === "QUOTA" && result.quotaScope === "minute" && (result.retryAfterMs ?? 0) <= 20_000;
    if (!result.transient && !shortQuota) break;
    await delay(shortQuota ? Math.max(wait, result.retryAfterMs ?? 0) : wait);
    result = await callGroq(apiKey, buffer, mimeType);
  }
  return {
    text: result.text,
    reason: result.reason,
    language: result.language,
    retryAfterMs: result.retryAfterMs,
    quotaScope: result.quotaScope,
  };
}
