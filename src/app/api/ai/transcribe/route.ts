import { NextRequest, NextResponse } from "next/server";
import { hasValidAppSession } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { transcribeModelChain } from "@/lib/ai/transcribe-models";
import {
  isModelResting,
  noteModelRefused,
  noteModelWorked,
  orderByAvailability,
  parseRetryDelay,
  restingKindOf,
} from "@/lib/ai/model-cooldown";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Transcrever custa quota paga e CPU. Uma aula de 50 min vira ~7 chamadas, entao
 * o teto abaixo cabe umas oito aulas em dez minutos — bem acima do uso real e
 * bem abaixo do que daria para torrar a conta.
 */
const transcribeLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 60,
  maxConcurrent: 3,
  maxBytes: 300 * 1024 * 1024,
});

function transcribeKey(req: NextRequest): string {
  return clientIpOf(req);
}

/**
 * Teto de cada chamada externa: sem isso um destino lento trava a rota.
 *
 * Medido: um trecho de 3 min transcreve em 5-8 s no modelo bom, enquanto o
 * `gemini-flash-lite-latest` congestionado levou 72 s para 3 s de áudio e
 * estourou 90 s nos 3 min. Com o teto antigo, um único modelo lento consumia
 * o orçamento inteiro da cadeia; em 45 s sobra folga de sobra para o caminho
 * saudável e ainda dá tempo de tentar outros dois modelos.
 */
const UPSTREAM_TIMEOUT_MS = 90_000;
const TRANSLATE_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 60_000;

let transcriberPromise: Promise<unknown> | null = null;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("automatic-speech-recognition", "Xenova/whisper-base", {
        device: "cpu",
        // Pesos quantizados: o modelo em fp32 nao cabe com folga em 1 GiB.
        dtype: "q8",
      });
    })().catch((error) => {
      // Guardar a promessa rejeitada deixaria o fallback quebrado ate o proximo
      // deploy — toda requisicao seguinte herdaria a mesma falha.
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise as Promise<
    (input: Float32Array, options: Record<string, unknown>) => Promise<{ text?: string }>
  >;
}

const WHISPER_LANG_MAP: Record<string, string> = {
  pt: "portuguese",
  en: "english",
  es: "spanish",
  fr: "french",
  it: "italian",
  de: "german",
  ru: "russian",
  ja: "japanese",
  zh: "chinese",
  ar: "arabic",
};

const PROMPT_CONTEXT_MAP: Record<string, string> = {
  pt: "Transcrição precisa em português com pontuação completa.",
  en: "Accurate English transcription with complete punctuation.",
  es: "Transcripción precisa en español con puntuación completa.",
  fr: "Transcription précise en français avec ponctuation complète.",
  it: "Trascrizione accurata in italiano con punteggiatura completa.",
  de: "Genaue deutsche Transkription mit vollständiger Zeichensetzung.",
  ru: "Точная транскрипция на русском языке с полной пунктуацией.",
  ja: "正確な句読点を含む日本語の音声文字起こし。",
  zh: "包含完整标点符号的准确中文语音转录。",
  ar: "نسخ دقيق باللغة العربية مع علامات الترقيم الكاملة.",
};

function cleanTranscriptText(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  text = text.replace(/\[(?:música|aplausos|risos|som|ruído|áudio|music|applause|laughter|noise)\]/gi, "");
  text = text.replace(/\((?:música|aplausos|risos|som|ruído|áudio|music|applause|laughter|noise)\)/gi, "");
  text = text.replace(/(?:legendas?|transcrição|subtitles) pela comunidade [^\n.]+/gi, "");

  text = text.replace(/\s+/g, " ");
  text = text.replace(/\s+([.,;:!?])/g, "$1");
  text = text.trim();

  return text;
}

function chunkTextForTranslation(text: string, maxLen = 4500): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let idx = remaining.lastIndexOf(". ", maxLen);
    if (idx < maxLen * 0.4) idx = remaining.lastIndexOf("\n", maxLen);
    if (idx < maxLen * 0.4) idx = remaining.lastIndexOf(" ", maxLen);
    if (idx <= 0) idx = maxLen;
    chunks.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }
  return chunks.filter(Boolean);
}

async function adaptToTargetLanguage(text: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  if (!clean || !targetLang) return clean;

  const chunks = chunkTextForTranslation(clean, 4500);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    let translatedChunk = "";
    const clients = ["gtx", "dict-chrome-ex"];
    for (const client of clients) {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(
          targetLang
        )}&dt=t`;

        const res = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
          body: new URLSearchParams({ q: chunk }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[0])) {
            const joined = data[0]
              .map((part: unknown[]) =>
                Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""
              )
              .join("");
            if (joined && joined.trim()) {
              translatedChunk = joined.trim();
              break;
            }
          }
        }
      } catch {}
    }
    translatedChunks.push(translatedChunk || chunk);
  }

  return translatedChunks.join(" ").trim();
}

const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Portuguese (Português)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  it: "Italian (Italiano)",
  de: "German (Deutsch)",
  ru: "Russian (Русский)",
  ja: "Japanese (日本語)",
  zh: "Chinese (简体中文)",
  ar: "Arabic (العربية)",
};

export type TranscribeReason =
  | "OK"
  | "TRUNCATED"
  | "NO_SPEECH"
  | "SERVICE_BUSY"
  | "MODEL_MISSING"
  | "QUOTA"
  | "NOT_CONFIGURED"
  | "FAILED";

interface GeminiResult {
  text: string;
  reason: TranscribeReason;
  /** Cota de minuto volta logo; a do dia, não. Muda quanto tempo o modelo descansa. */
  quotaScope?: "day" | "minute";
  /** Espera que o próprio Gemini pediu no RetryInfo do 429. */
  retryAfterMs?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Onde o áudio está para o Gemini: embutido no corpo do pedido, ou já enviado
 * à Files API e referenciado por URI.
 *
 * Medido: 50 min de áudio numa única chamada por `fileUri` custam 75.012
 * tokens de entrada e voltam em 6 s — contra 18 pedidos fatiados, que numa
 * conta gratuita de 20 requisições por dia consumiriam quase o dia inteiro. O
 * corpo embutido tem teto de ~20 MB por requisição; a referência não tem.
 */
type AudioSource =
  | { kind: "inline"; data: string }
  | { kind: "file"; uri: string };

/** Acima disto vale o custo de subir o arquivo antes em vez de embutir. */
const FILES_API_THRESHOLD_BYTES = 6 * 1024 * 1024;
const FILES_UPLOAD_TIMEOUT_MS = 120_000;

async function uploadToFilesApi(
  apiKey: string,
  buffer: Buffer,
  rawMimeType: string
): Promise<string | null> {
  const mimeType = rawMimeType.split(";")[0]?.trim() || "audio/webm";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(FILES_UPLOAD_TIMEOUT_MS),
        headers: {
          "X-Goog-Upload-Protocol": "raw",
          "X-Goog-Upload-Header-Content-Length": String(buffer.byteLength),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": mimeType,
        },
        body: new Uint8Array(buffer),
      }
    );
    if (!res.ok) {
      console.warn(`[transcribe] Files API recusou o upload (${res.status})`);
      return null;
    }
    const data = await res.json();
    let file = data?.file;
    // O arquivo só pode ser usado em ACTIVE; áudio costuma já nascer pronto.
    const name = typeof file?.name === "string" ? file.name : "";
    const deadline = Date.now() + FILES_UPLOAD_TIMEOUT_MS;
    while (file?.state === "PROCESSING" && name && Date.now() < deadline) {
      await delay(2000);
      const check = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      file = await check.json().catch(() => null);
    }
    if (file?.state !== "ACTIVE" || typeof file?.uri !== "string") {
      console.warn(`[transcribe] arquivo não ficou pronto na Files API (${file?.state})`);
      return null;
    }
    return file.uri;
  } catch (error) {
    if (isAbortError(error)) {
      console.warn("[transcribe] upload para a Files API estourou o tempo");
      return null;
    }
    throw error;
  }
}

async function callGemini(
  model: string,
  source: AudioSource,
  rawMimeType: string,
  targetLang: string,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { text: "", reason: "NOT_CONFIGURED" };
  const mimeType = rawMimeType.split(";")[0]?.trim() || "audio/webm";
  const isDedicatedTranscribe = model.includes("transcribe");
  const langName = LANGUAGE_NAMES[targetLang] || targetLang || "Portuguese";
  const prompt = `Transcribe all spoken content in this audio or video file. The transcription output must be strictly in ${langName} (${targetLang}). If the speech in the audio is in any language other than ${langName}, you must accurately translate the spoken content into ${langName}. Return only the final transcribed text in ${langName}, without commentary, quotes, markdown code fences, or explanations.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;

  const audioPart =
    source.kind === "file"
      ? { fileData: { mimeType, fileUri: source.uri } }
      : {
          inlineData: {
            mimeType,
            data: source.data,
          },
        };

  const body = isDedicatedTranscribe
    ? {
        contents: [
          {
            role: "user",
            parts: [audioPart],
          },
        ],
        generationConfig: {
          audioTranscriptionConfig: {
            mode: "SMART",
            languageCodes: targetLang ? [targetLang === "pt" ? "pt-BR" : targetLang] : [],
          },
        },
      }
    : {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, audioPart],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
      };

  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const msg = String(errorBody?.error?.message || "");
    const status = String(errorBody?.error?.status || "");
    // A cota é por modelo: a chave que já gastou o `gemini-3.7-flash` em áudio
    // ainda transcreve no 3.5. Derrubar a cadeia aqui condenava a transcrição
    // inteira por causa de um único modelo esgotado.
    if (res.status === 429 || status === "RESOURCE_EXHAUSTED" || /quota|exhausted|rate limit/i.test(msg)) {
      // O corpo do 429 diz QUAL cota estourou. No plano gratuito são 5 por
      // minuto e 20 por dia em cada flash: a primeira passa em um minuto, a
      // segunda só amanhã, e tratar as duas igual faria a cadeia voltar a um
      // modelo morto a cada trecho da aula.
      const details: unknown[] = Array.isArray(errorBody?.error?.details)
        ? errorBody.error.details
        : [];
      const quotaIds = details.flatMap((detail) => {
        const list = (detail as { violations?: unknown })?.violations;
        return Array.isArray(list)
          ? list.map((v) => String((v as { quotaId?: unknown })?.quotaId || ""))
          : [];
      });
      const perDay =
        quotaIds.some((id) => /perday/i.test(id)) || /per day|daily|por dia/i.test(msg);
      const retryAfterMs = details
        .map((detail) => parseRetryDelay((detail as { retryDelay?: unknown })?.retryDelay))
        .find((value) => typeof value === "number");
      console.warn(
        `[transcribe] ${model} sem cota (${perDay ? "dia" : "minuto"}): ${msg.slice(0, 120)}`
      );
      return {
        text: "",
        reason: "QUOTA",
        quotaScope: perDay ? "day" : "minute",
        retryAfterMs,
      };
    }
    // 503/500: modelo congestionado. Não é erro do arquivo, então vale trocar de modelo.
    if (res.status === 503 || res.status === 500 || status === "UNAVAILABLE") {
      console.warn(`[transcribe] ${model} indisponível (${res.status}): ${msg.slice(0, 120)}`);
      return { text: "", reason: "SERVICE_BUSY" };
    }
    // Nome de modelo que esta chave não enxerga (aposentado, ou um
    // GEMINI_MODEL com erro de digitação). É problema do modelo, não do
    // arquivo: parar aqui condenava a transcrição inteira por causa de um nome.
    if (res.status === 404 || /not found|is not supported|does not exist/i.test(msg)) {
      console.warn(`[transcribe] ${model} não disponível para esta chave: ${msg.slice(0, 120)}`);
      return { text: "", reason: "MODEL_MISSING" };
    }
    console.warn(`[transcribe] ${model} recusou (${res.status}): ${msg.slice(0, 200)}`);
    return { text: "", reason: "FAILED" };
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: unknown[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const joined = parts
    .map((part) => {
      if (typeof (part as { text?: unknown })?.text === "string") {
        return (part as { text: string }).text;
      }
      const audioText = (part as { audioTranscription?: { text?: unknown } })?.audioTranscription?.text;
      if (typeof audioText === "string") {
        return audioText;
      }
      return "";
    })
    .join("")
    .trim();
  const text = cleanTranscriptText(joined);

  const blockReason = data?.promptFeedback?.blockReason;
  if (!text && blockReason) {
    console.warn(`[transcribe] ${model} bloqueou a resposta (${blockReason})`);
    return { text: "", reason: "FAILED" };
  }
  if (candidate?.finishReason === "MAX_TOKENS") {
    console.warn(`[transcribe] ${model} atingiu o teto de saída: transcrição truncada`);
    return { text, reason: text ? "TRUNCATED" : "FAILED" };
  }
  return { text, reason: text ? "OK" : "NO_SPEECH" };
}

/** Abaixo disto não sobra tempo útil para mais uma chamada. */
const MIN_ATTEMPT_MS = 20_000;
/** Respiro entre um 503 e a tentativa seguinte. */
const BUSY_BACKOFF_MS = 1_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeWithGemini(
  buffer: Buffer,
  rawMimeType: string,
  targetLang: string,
  deadline = Number.POSITIVE_INFINITY
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { text: "", reason: "NOT_CONFIGURED" };
  const mimeType = rawMimeType.split(";")[0]?.trim() || "audio/webm";

  // Arquivo grande sobe uma vez e é reusado por todos os modelos da cadeia:
  // reenviar 9 MB embutidos a cada tentativa era o que fazia cada recusa
  // custar quase um minuto.
  let source: AudioSource | null = null;
  if (buffer.byteLength > FILES_API_THRESHOLD_BYTES) {
    const uri = await uploadToFilesApi(apiKey, buffer, mimeType);
    if (uri) source = { kind: "file", uri };
  }
  if (!source) {
    if (buffer.byteLength > INLINE_LIMIT_BYTES) {
      // Sem a Files API não há como embutir isto: melhor dizer do que tentar.
      console.warn("[transcribe] arquivo grande e Files API indisponível");
      return { text: "", reason: "SERVICE_BUSY" };
    }
    source = { kind: "inline", data: buffer.toString("base64") };
  }

  let lastReason: TranscribeReason = "NOT_CONFIGURED";
  let quotaScope: "day" | "minute" | null = null;
  // `GEMINI_MODEL` vale para os textos; áudio tem disponibilidade própria e
  // escolha própria, senão um modelo sem cota de áudio trava a transcrição.
  const fullChain = transcribeModelChain(process.env.GEMINI_TRANSCRIBE_MODEL);
  // Modelo que recusou há pouco sai da frente: numa aula de 18 trechos, sem
  // isto cada trecho recomeçava pelo mesmo esgotado.
  const chain = orderByAvailability(fullChain);
  if (chain.length < fullChain.length) {
    console.warn(
      `[transcribe] ${fullChain.length - chain.length} modelo(s) em descanso; tentando ${chain.join(", ")}`
    );
  }
  // Congestionamento é passageiro. Varrida a lista, voltar ao começo aproveita o
  // orçamento que sobrou em vez de devolver 503 com minutos na mão — o áudio já
  // está no servidor, então a segunda rodada não custa upload nenhum.
  const attempts = [...chain, ...chain.slice(0, 2)];

  for (let i = 0; i < attempts.length; i++) {
    // O corte de tempo vinha DEPOIS da chamada: o orçamento acabava na segunda
    // tentativa e metade da lista nunca era tentada.
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;

    const model = attempts[i];
    let result: GeminiResult;
    try {
      result = await callGemini(
        model,
        source,
        mimeType,
        targetLang,
        Math.min(UPSTREAM_TIMEOUT_MS, remaining)
      );
    } catch (error) {
      if (!isAbortError(error)) throw error;
      console.warn(`[transcribe] ${model} estourou o tempo limite`);
      result = { text: "", reason: "SERVICE_BUSY" };
    }
    if (result.text) {
      noteModelWorked(model);
      return result;
    }
    lastReason = result.reason;
    if (result.reason === "QUOTA") {
      // A do dia manda: se um modelo esgotou o dia, a mensagem não pode ser
      // "espere um minuto".
      if (result.quotaScope === "day" || quotaScope === null) {
        quotaScope = result.quotaScope === "day" ? "day" : "minute";
      }
      noteModelRefused(
        model,
        result.quotaScope === "day" ? "quota-day" : "quota-minute",
        result.retryAfterMs
      );
    } else if (result.reason === "SERVICE_BUSY") {
      noteModelRefused(model, "busy");
    } else if (result.reason === "MODEL_MISSING") {
      noteModelRefused(model, "missing");
    }
    // Só vale a pena tentar outro modelo quando o problema foi do modelo: uma
    // recusa do arquivo se repetiria igual na lista inteira.
    if (
      result.reason !== "SERVICE_BUSY" &&
      result.reason !== "MODEL_MISSING" &&
      result.reason !== "QUOTA"
    ) {
      return result;
    }
    // Cota estourada e nome inexistente falham na hora e não congestionam
    // nada: esperar antes do próximo só desperdiçaria o orçamento.
    if (result.reason === "SERVICE_BUSY" && i + 1 < attempts.length) {
      await delay(BUSY_BACKOFF_MS * (1 + Math.floor(i / chain.length)));
    }
  }
  if (!quotaScope && fullChain.every((m) => isModelResting(m) && restingKindOf([m]) === "quota-day")) {
    quotaScope = "day";
  }
  if (quotaScope) {
    return { text: "", reason: "QUOTA", quotaScope };
  }
  return { text: "", reason: lastReason };
}

/** Teto do arquivo embutido na chamada do Gemini (o limite da API é ~20 MB). */
const INLINE_LIMIT_BYTES = 14 * 1024 * 1024;
/**
 * Teto do que a rota aceita receber. Acima do limite de embutido o arquivo sobe
 * pela Files API — 50 min de fala em Opus mono dão ~9 MB, e a aula inteira numa
 * chamada só custa 75 mil tokens de entrada, medidos. O teto não pode passar do
 * corpo máximo de requisição do Cloud Run (32 MiB), senão a recusa vem da
 * plataforma antes de a rota ver o pedido; 24 MB ainda cobrem mais de duas
 * horas de fala.
 */
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
/**
 * Cada modelo congestionado gasta ~50 s até responder 503. Com 70 s o orçamento
 * acabava na segunda tentativa e metade da lista nunca era tentada; com muito
 * mais que isto, quem espera por uma aula inteira em trechos ficaria minutos
 * olhando a barra a cada trecho recusado. Este teto cabe dois ou três modelos
 * por chamada, e a rodada seguinte entra por outro ponto da lista.
 */
const MODEL_CHAIN_DEADLINE_MS = 180_000;

/** Espera sugerida ao cliente antes de reenviar o mesmo trecho. */
const RETRY_AFTER_SECONDS = 15;

function reasonResponse(reason: TranscribeReason, quotaScope?: "day" | "minute") {
  if (reason === "QUOTA") {
    // O cliente precisa saber QUAL cota: a do minuto passa sozinha e vale
    // esperar, a do dia não volta hoje e insistir só gasta o tempo de quem
    // está olhando a barra.
    return NextResponse.json(
      { transcript: "", error: "QUOTA_EXCEEDED", reason, quotaScope: quotaScope || "minute" },
      { status: 429, headers: quotaScope === "day" ? {} : { "Retry-After": "30" } }
    );
  }
  if (reason === "SERVICE_BUSY") {
    // Quem chama reenvia o trecho; sem esta dica escolheria o intervalo no
    // escuro e voltaria cedo demais para a mesma fila.
    return NextResponse.json(
      { transcript: "", error: "SERVICE_BUSY", reason, retryAfterSeconds: RETRY_AFTER_SECONDS },
      { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } }
    );
  }
  // Sem fala, sem chave ou recusa do modelo: o cliente decide se tenta o
  // caminho local. Não é erro de servidor, então não devolve 500.
  return NextResponse.json({ transcript: "", reason });
}

async function runGemini(
  buffer: Buffer,
  mimeType: string,
  lang: string
): Promise<GeminiResult> {
  const deadline = Date.now() + MODEL_CHAIN_DEADLINE_MS;
  const result = await transcribeWithGemini(buffer, mimeType, lang, deadline);
  if (result.text && lang) {
    const translated = await adaptToTargetLanguage(result.text, lang);
    if (translated) {
      result.text = cleanTranscriptText(translated);
    }
  }
  return result;
}

async function transcribeLocally(
  audioSamples: Float32Array,
  whisperLanguage: string,
  promptContext: string,
  targetLang: string
) {
  const transcriber = await getTranscriber();

  const output = await transcriber(audioSamples, {
    language: whisperLanguage,
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    temperature: 0.0,
    initial_prompt: promptContext,
  });

  const rawResult = (output?.text || "").trim();
  let resultText = cleanTranscriptText(rawResult);

  if (resultText && targetLang) {
    const translated = await adaptToTargetLanguage(resultText, targetLang);
    if (translated) {
      resultText = cleanTranscriptText(translated);
    }
  }

  return NextResponse.json({ transcript: resultText, reason: resultText ? "OK" : "NO_SPEECH" });
}

export async function POST(req: NextRequest) {
  let releaseLimit: (() => void) | null = null;
  try {
    // A rota gasta quota paga do Gemini e CPU do servidor: sem sessao, qualquer
    // um na internet poderia consumir os dois.
    if (isCrossSiteRequest(req)) {
      return NextResponse.json({ transcript: "", reason: "FORBIDDEN" }, { status: 403 });
    }
    if (!(await hasValidAppSession())) {
      return NextResponse.json({ transcript: "", reason: "UNAUTHORIZED" }, { status: 401 });
    }

    const limitKey = transcribeKey(req);
    if (!transcribeLimiter.take(limitKey)) {
      return NextResponse.json({ transcript: "", reason: "RATE_LIMITED" }, { status: 429 });
    }
    releaseLimit = () => transcribeLimiter.release(limitKey, 0);

    const contentType = req.headers.get("content-type") || "";
    const targetLangHeader = req.headers.get("x-target-language") || "pt";
    const targetLang = targetLangHeader.trim().toLowerCase().split("-")[0];
    const whisperLanguage = WHISPER_LANG_MAP[targetLang] || "portuguese";
    const promptContext = PROMPT_CONTEXT_MAP[targetLang] || PROMPT_CONTEXT_MAP.pt;

    // --- PCM cru vindo do fallback local do navegador --------------------
    if (contentType.includes("application/octet-stream")) {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength % 4 !== 0) {
        return NextResponse.json({ transcript: "", reason: "INVALID_PCM" }, { status: 400 });
      }
      return await transcribeLocally(
        new Float32Array(arrayBuffer),
        whisperLanguage,
        promptContext,
        targetLang
      );
    }

    // --- URL de mídia: o servidor baixa e manda para o Gemini -------------
    if (contentType.includes("application/json")) {
      const json = await req.json().catch(() => ({}));
      const audioUrl = typeof json?.audioUrl === "string" ? json.audioUrl.trim() : "";
      const reqTargetLang =
        typeof json?.targetLanguage === "string" && json.targetLanguage.trim()
          ? json.targetLanguage.trim().toLowerCase().split("-")[0]
          : targetLang;

      if (!audioUrl) {
        return NextResponse.json({ transcript: "", reason: "NO_INPUT" }, { status: 400 });
      }
      if (!process.env.GEMINI_API_KEY) {
        return reasonResponse("NOT_CONFIGURED");
      }

      try {
        const head = await fetch(audioUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => null);
        const declared = Number(head?.headers.get("content-length") || 0);
        // Um vídeo de 150 MB não cabe embutido na chamada — nem na memória do
        // servidor. O cliente já sabe extrair só a fala; deixa com ele.
        if (declared > MAX_AUDIO_BYTES) {
          return NextResponse.json({ transcript: "", reason: "TOO_LARGE_FOR_URL" });
        }

        const audioFetch = await fetch(audioUrl, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!audioFetch.ok) {
          return NextResponse.json({ transcript: "", reason: "FETCH_FAILED" });
        }
        // Alguns destinos nao declaram `content-length`: sem este segundo teto,
        // um arquivo enorme entraria inteiro na memoria do servidor.
        const declaredGet = Number(audioFetch.headers.get("content-length") || 0);
        if (declaredGet > MAX_AUDIO_BYTES) {
          return NextResponse.json({ transcript: "", reason: "TOO_LARGE_FOR_URL" });
        }
        const buf = Buffer.from(await audioFetch.arrayBuffer());
        if (buf.byteLength > MAX_AUDIO_BYTES) {
          return NextResponse.json({ transcript: "", reason: "TOO_LARGE_FOR_URL" });
        }

        const mime = audioFetch.headers.get("content-type") || "audio/webm";
        const result = await runGemini(buf, mime, reqTargetLang);
        if (result.text) {
          // O proprio prompt ja pede a saida no idioma alvo: reenviar o texto a
          // um endpoint nao documentado de traducao so adicionaria latencia e
          // exposicao do conteudo da nota.
          return NextResponse.json({ transcript: result.text, reason: result.reason });
        }
        return reasonResponse(result.reason, result.quotaScope);
      } catch {
        return NextResponse.json({ transcript: "", reason: "FETCH_FAILED" });
      }
    }

    // --- Arquivo de áudio enviado pelo navegador -------------------------
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("audio") || formData?.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ transcript: "", reason: "NO_INPUT" }, { status: 400 });
    }

    const formLang = formData?.get("targetLanguage") || formData?.get("targetLang");
    const effectiveLang =
      typeof formLang === "string" && formLang.trim()
        ? formLang.trim().toLowerCase().split("-")[0]
        : targetLang;

    if (!process.env.GEMINI_API_KEY) {
      return reasonResponse("NOT_CONFIGURED");
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ transcript: "", reason: "TOO_LARGE" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await runGemini(buf, file.type || "audio/webm", effectiveLang);
    if (result.text) {
      return NextResponse.json({ transcript: result.text, reason: result.reason });
    }
    // Um arquivo codificado (Ogg/WebM/MP4) NÃO é PCM: reinterpretar os bytes
    // aqui era o que estourava com "byte length ... multiple of 4". Quem sabe
    // decodificar é o navegador, que reenvia PCM por octet-stream.
    return reasonResponse(result.reason, result.quotaScope);
  } catch (err) {
    // Detalhe interno fica no log do servidor; o cliente recebe so o codigo.
    console.error("[transcribe] falha inesperada", err);
    return NextResponse.json({ transcript: "", reason: "INTERNAL" }, { status: 500 });
  } finally {
    releaseLimit?.();
  }
}
