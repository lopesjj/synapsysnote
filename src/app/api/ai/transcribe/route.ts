import { NextRequest, NextResponse } from "next/server";
import { appRequestUser, rateLimitKey } from "@/lib/api/app-session";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { clientIpOf } from "@/lib/api/client-ip";
import { safeFetchBuffer } from "@/lib/media/safe-fetch";
import { detectLanguage } from "@/lib/ai/language-detect";
import { SUPPORTED_TARGETS, translateText } from "@/lib/ai/translate-server";
import {
  GROQ_MAX_UPLOAD_BYTES,
  groqApiKey,
  transcribeWithGroq,
  type WhisperResult,
} from "@/lib/ai/groq-whisper";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Transcrever gasta a cota do Groq (da conta inteira) e CPU. O navegador manda
 * a aula inteira numa chamada, ou partes de ~1 h para gravações maiores, até
 * duas de cada vez (`TRANSCRIBE_CONCURRENCY` em `audio-transcriber.ts`); o
 * teto abaixo sobra para isso e segura quem tentasse torrar a cota.
 */
const transcribeLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 40,
  maxConcurrent: 3,
  maxBytes: 300 * 1024 * 1024,
});


/** Teto para baixar a mídia quando o cliente manda só a URL. */
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

async function safeFetchAudioUrl(
  audioUrl: string,
  timeoutMs: number
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Conexao presa ao IP validado, com o nome no SNI: buscar pelo IP com fetch
  // quebrava a validacao do certificado em toda URL https.
  const fetched = await safeFetchBuffer(audioUrl, MAX_AUDIO_BYTES, {
    timeoutMs,
    userAgent: "SynapsysNote-Transcribe/1.0",
  });
  if (!fetched) {
    console.warn("[transcribe] URL recusada ou indisponível");
    return null;
  }
  return { buffer: fetched.buffer, mime: fetched.contentType || "audio/webm" };
}

/**
 * Teto do que a rota aceita receber: o limite de arquivo do plano gratuito do
 * Groq (25 MB), abaixo também do corpo máximo do Cloud Run (32 MiB). Uma hora
 * de fala em Opus mono a 32 kbps dá ~14 MB.
 */
const MAX_AUDIO_BYTES = GROQ_MAX_UPLOAD_BYTES;
/**
 * PCM float32 a 16 kHz: o navegador manda trechos de 60 s (~3,8 MB). Dois
 * minutos de folga bastam; o que passar disso nao veio do app.
 */
const MAX_PCM_BYTES = 8 * 1024 * 1024;

/** Espera sugerida ao cliente antes de reenviar o mesmo arquivo. */
const RETRY_AFTER_SECONDS = 15;
/**
 * Acima disto a espera pedida pelo Groq não cabe na paciência de quem olha a
 * barra (a cota da hora pode pedir 20 min): o cliente para e avisa.
 */
const MAX_CLIENT_WAIT_MS = 90_000;

function reasonResponse(result: Pick<WhisperResult, "reason" | "quotaScope" | "retryAfterMs">) {
  if (result.reason === "QUOTA") {
    // O cliente precisa saber se vale esperar: a cota do minuto passa sozinha,
    // a da hora e a do dia não voltam enquanto a pessoa olha a barra.
    const waitMs = result.retryAfterMs ?? 30_000;
    const final = result.quotaScope === "day" || waitMs > MAX_CLIENT_WAIT_MS;
    return NextResponse.json(
      {
        transcript: "",
        error: "QUOTA_EXCEEDED",
        reason: "QUOTA",
        quotaScope: final ? "day" : "minute",
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      },
      { status: 429, headers: final ? {} : { "Retry-After": String(Math.ceil(waitMs / 1000)) } }
    );
  }
  if (result.reason === "SERVICE_BUSY") {
    // Quem chama reenvia; sem esta dica escolheria o intervalo no escuro.
    return NextResponse.json(
      { transcript: "", error: "SERVICE_BUSY", reason: "SERVICE_BUSY", retryAfterSeconds: RETRY_AFTER_SECONDS },
      { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } }
    );
  }
  if (result.reason === "TOO_LARGE") {
    return NextResponse.json({ transcript: "", reason: "TOO_LARGE" }, { status: 413 });
  }
  // Sem fala, sem chave ou recusa do arquivo: o cliente decide se tenta o
  // caminho local. Não é erro de servidor, então não devolve 500.
  return NextResponse.json({ transcript: "", reason: result.reason });
}

async function runWhisper(buffer: Buffer, mimeType: string, lang: string): Promise<WhisperResult> {
  const result = await transcribeWithGroq(buffer, mimeType);
  if (!result.text) return result;
  const text = cleanTranscriptText(result.text);
  if (!text) return { ...result, text: "", reason: "NO_SPEECH" };
  return { ...result, text: await inTargetLanguage(text, lang, result.language) };
}

/**
 * Leva o texto ao idioma escolhido só quando ele foi FALADO em outro. O
 * idioma da fala vem do próprio Whisper, que ouviu o áudio; o detector de
 * texto fica de reserva. Se a tradução falhar, volta o original completo —
 * nunca um texto metade traduzido, metade não.
 */
async function inTargetLanguage(text: string, lang: string, spoken?: string): Promise<string> {
  if (!text || !SUPPORTED_TARGETS.has(lang)) return text;
  const source = spoken || detectLanguage(text);
  if (source === lang) return text;
  try {
    const translated = await translateText(text, lang);
    if (!translated.chunks.length || translated.failed > 0) {
      console.warn(
        `[transcribe] tradução para ${lang} incompleta (${translated.failed}/${translated.chunks.length}); mantendo o original`
      );
      return text;
    }
    return cleanTranscriptText(translated.text);
  } catch (error) {
    console.warn("[transcribe] falha ao levar a transcrição para o idioma escolhido", error);
    return text;
  }
}

let localTranscriptionRunning = false;

async function transcribeLocally(
  audioSamples: Float32Array,
  whisperLanguage: string,
  promptContext: string,
  targetLang: string
) {
  if (localTranscriptionRunning) return reasonResponse({ reason: "SERVICE_BUSY" });
  localTranscriptionRunning = true;
  let output: { text?: string };
  try {
    const transcriber = await getTranscriber();
    output = await transcriber(audioSamples, {
      language: whisperLanguage,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      temperature: 0.0,
      initial_prompt: promptContext,
    });
  } finally {
    localTranscriptionRunning = false;
  }

  const resultText = await inTargetLanguage(cleanTranscriptText((output?.text || "").trim()), targetLang);

  return NextResponse.json({ transcript: resultText, reason: resultText ? "OK" : "NO_SPEECH" });
}

export async function POST(req: NextRequest) {
  let releaseLimit: (() => void) | null = null;
  try {
    // A rota gasta a cota do Groq e CPU do servidor: sem sessao, qualquer um
    // na internet poderia consumir os dois.
    if (isCrossSiteRequest(req)) {
      return NextResponse.json({ transcript: "", reason: "FORBIDDEN" }, { status: 403 });
    }
    const uid = await appRequestUser(req);
    if (!uid) {
      return NextResponse.json({ transcript: "", reason: "UNAUTHORIZED" }, { status: 401 });
    }

    const limitKey = rateLimitKey(uid, clientIpOf(req));
    if (!transcribeLimiter.take(limitKey)) {
      // Quase sempre é a vaga de concorrência, que abre em segundos: sem a dica
      // o cliente esperaria os 30 s pensados para a cota do minuto.
      return NextResponse.json(
        { transcript: "", reason: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": "5" } }
      );
    }
    let bytesUsed = 0;
    releaseLimit = () => transcribeLimiter.release(limitKey, bytesUsed);

    const contentType = req.headers.get("content-type") || "";
    const targetLangHeader = req.headers.get("x-target-language") || "pt";
    const targetLang = targetLangHeader.trim().toLowerCase().split("-")[0];
    const whisperLanguage = WHISPER_LANG_MAP[targetLang] || "portuguese";
    const promptContext = PROMPT_CONTEXT_MAP[targetLang] || PROMPT_CONTEXT_MAP.pt;

    // --- PCM cru vindo do fallback local do navegador --------------------
    if (contentType.includes("application/octet-stream")) {
      if (Number(req.headers.get("content-length") || 0) > MAX_PCM_BYTES) {
        return NextResponse.json({ transcript: "", reason: "TOO_LARGE" }, { status: 413 });
      }
      const arrayBuffer = await req.arrayBuffer();
      bytesUsed = arrayBuffer.byteLength;
      if (arrayBuffer.byteLength > MAX_PCM_BYTES) {
        return NextResponse.json({ transcript: "", reason: "TOO_LARGE" }, { status: 413 });
      }
      if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength % 4 !== 0) {
        return NextResponse.json({ transcript: "", reason: "INVALID_PCM" }, { status: 400 });
      }
      return await transcribeLocally(new Float32Array(arrayBuffer), whisperLanguage, promptContext, targetLang);
    }

    // --- URL de mídia: o servidor baixa e manda para o Whisper ------------
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
      if (!groqApiKey()) {
        return reasonResponse({ reason: "NOT_CONFIGURED" });
      }

      try {
        const fetched = await safeFetchAudioUrl(audioUrl, FETCH_TIMEOUT_MS);
        if (!fetched) {
          return NextResponse.json({ transcript: "", reason: "FETCH_FAILED" });
        }
        bytesUsed = fetched.buffer.byteLength;

        const result = await runWhisper(fetched.buffer, fetched.mime, reqTargetLang);
        if (result.text) {
          return NextResponse.json({ transcript: result.text, reason: result.reason, language: result.language });
        }
        return reasonResponse(result);
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

    if (!groqApiKey()) {
      return reasonResponse({ reason: "NOT_CONFIGURED" });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ transcript: "", reason: "TOO_LARGE" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    bytesUsed = buf.byteLength;
    const result = await runWhisper(buf, file.type || "audio/ogg", effectiveLang);
    if (result.text) {
      return NextResponse.json({ transcript: result.text, reason: result.reason, language: result.language });
    }
    // Um arquivo codificado (Ogg/WebM/MP4) NÃO é PCM: reinterpretar os bytes
    // aqui era o que estourava com "byte length ... multiple of 4". Quem sabe
    // decodificar é o navegador, que reenvia PCM por octet-stream.
    return reasonResponse(result);
  } catch (err) {
    // Detalhe interno fica no log do servidor; o cliente recebe so o codigo.
    console.error("[transcribe] falha inesperada", err);
    return NextResponse.json({ transcript: "", reason: "INTERNAL" }, { status: 500 });
  } finally {
    releaseLimit?.();
  }
}
