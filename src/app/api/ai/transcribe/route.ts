import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

let transcriberPromise: Promise<any> | null = null;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (pipeline as any)("automatic-speech-recognition", "Xenova/whisper-base", {
        device: "cpu",
        quantized: true,
      });
    })();
  }
  return transcriberPromise;
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

async function adaptToTargetLanguage(text: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  if (!clean || !targetLang) return clean;

  const clients = ["gtx", "dict-chrome-ex"];
  for (const client of clients) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&dt=t&q=${encodeURIComponent(clean)}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translated = data[0].map((part: unknown[]) => part?.[0] ?? "").join("");
          if (translated && translated.trim()) {
            return translated.trim();
          }
        }
      }
    } catch {}
  }

  return clean;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const targetLangHeader = req.headers.get("x-target-language") || "pt";
    const targetLang = targetLangHeader.trim().toLowerCase().split("-")[0];
    const whisperLanguage = WHISPER_LANG_MAP[targetLang] || "portuguese";
    const promptContext = PROMPT_CONTEXT_MAP[targetLang] || PROMPT_CONTEXT_MAP.pt;

    let audioSamples: Float32Array | null = null;

    if (contentType.includes("application/octet-stream")) {
      const arrayBuffer = await req.arrayBuffer();
      audioSamples = new Float32Array(arrayBuffer);
    } else {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        const file = formData.get("audio") || formData.get("file");
        if (file instanceof Blob) {
          const ab = await file.arrayBuffer();
          audioSamples = new Float32Array(ab);
        }
      }
    }

    if (!audioSamples || audioSamples.length === 0) {
      return NextResponse.json({ transcript: "" });
    }

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
      resultText = await adaptToTargetLanguage(resultText, targetLang);
    }

    return NextResponse.json({ transcript: resultText });
  } catch (err) {
    return NextResponse.json(
      { transcript: "", error: err instanceof Error ? err.message : "Erro na transcrição" },
      { status: 500 }
    );
  }
}
