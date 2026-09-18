export interface TranscribeProgressCallback {
  (currentText: string, percent: number, isInitialReady: boolean): void;
}

function mergeOverlappingTranscripts(prev: string, next: string): string {
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

  return prev + " " + next;
}

async function fetchAudioBlob(audioUrl: string): Promise<Blob | null> {
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

async function tryGeminiTranscription(
  blob: Blob,
  audioUrl: string | undefined,
  targetLang: string,
  onProgress?: TranscribeProgressCallback
): Promise<string | null> {
  let currentPercent = 10;
  onProgress?.("", currentPercent, false);

  const timer = setInterval(() => {
    currentPercent = Math.min(88, currentPercent + 6);
    onProgress?.("", currentPercent, false);
  }, 600);

  try {
    const formData = new FormData();
    formData.append("audio", blob, "audio-file");
    formData.append("targetLanguage", targetLang);

    const transcribeRes = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: {
        "x-target-language": targetLang,
      },
      body: formData,
    });

    clearInterval(timer);

    if (transcribeRes.status === 429) {
      const errData = await transcribeRes.json().catch(() => null);
      if (errData?.error === "QUOTA_EXCEEDED" || transcribeRes.status === 429) {
        throw new Error("QUOTA_EXCEEDED");
      }
    }

    if (transcribeRes.ok) {
      const data = await transcribeRes.json();
      const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
      if (text) {
        onProgress?.(text, 100, true);
        return text;
      }
    }

    if (audioUrl) {
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

      if (jsonRes.status === 429) {
        const errData = await jsonRes.json().catch(() => null);
        if (errData?.error === "QUOTA_EXCEEDED" || jsonRes.status === 429) {
          throw new Error("QUOTA_EXCEEDED");
        }
      }

      if (jsonRes.ok) {
        const data = await jsonRes.json();
        const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
        if (text) {
          onProgress?.(text, 100, true);
          return text;
        }
      }
    }
  } catch (err) {
    clearInterval(timer);
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      throw err;
    }
  }

  return null;
}

async function tryWhisperLocalTranscription(
  blob: Blob,
  targetLang: string,
  onProgress?: TranscribeProgressCallback
): Promise<string | null> {
  const AudioContextClass =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      : null;

  if (!AudioContextClass) return null;

  let audioBuffer: AudioBuffer | null = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch {}
    }
    audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      const promise = audioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      if (promise && typeof promise.then === "function") {
        promise.then(resolve).catch(reject);
      }
    });
  } catch {
    return null;
  }

  if (!audioBuffer) return null;

  const targetSampleRate = 16000;
  const length = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, length, targetSampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const pcmData = renderedBuffer.getChannelData(0);

  let maxAmp = 0;
  for (let i = 0; i < pcmData.length; i++) {
    const abs = Math.abs(pcmData[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 0.001 && maxAmp < 0.95) {
    const gain = Math.min(0.95 / maxAmp, 3.5);
    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = pcmData[i] * gain;
    }
  }

  const totalSamples = pcmData.length;
  const durationSec = totalSamples / targetSampleRate;
  const langCode = targetLang || "pt";

  if (durationSec <= 120) {
    const pcmBuffer = pcmData.buffer.slice(
      pcmData.byteOffset,
      pcmData.byteOffset + pcmData.byteLength
    );

    let currentPercent = 15;
    onProgress?.("", currentPercent, false);

    const timer = setInterval(() => {
      currentPercent = Math.min(88, currentPercent + 8);
      onProgress?.("", currentPercent, false);
    }, 500);

    try {
      const transcribeRes = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-target-language": langCode,
        },
        body: pcmBuffer,
      });

      clearInterval(timer);

      if (transcribeRes.ok) {
        const data = await transcribeRes.json();
        const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
        onProgress?.(text, 100, true);
        return text || null;
      }
    } catch (e) {
      clearInterval(timer);
      throw e;
    }
    return null;
  }

  const chunkDurationSec = 60;
  const overlapSec = 4;
  const chunkSamples = targetSampleRate * chunkDurationSec;
  const stepSamples = targetSampleRate * (chunkDurationSec - overlapSec);

  const cuts: { start: number; end: number }[] = [];
  let cur = 0;
  while (cur < totalSamples) {
    const end = Math.min(totalSamples, cur + chunkSamples);
    cuts.push({ start: cur, end });
    if (end >= totalSamples) break;
    cur += stepSamples;
  }

  const parts: string[] = [];

  for (let i = 0; i < cuts.length; i++) {
    const { start, end } = cuts[i];
    const chunkData = pcmData.subarray(start, end);
    const pcmBuffer = chunkData.buffer.slice(
      chunkData.byteOffset,
      chunkData.byteOffset + chunkData.byteLength
    );

    const transcribeRes = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-target-language": langCode,
      },
      body: pcmBuffer,
    });

    if (transcribeRes.ok) {
      const data = await transcribeRes.json();
      const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
      if (text) {
        if (parts.length === 0) {
          parts.push(text);
        } else {
          const merged = mergeOverlappingTranscripts(parts[parts.length - 1], text);
          parts[parts.length - 1] = merged;
        }
      }
    }

    const currentText = parts.join(" ").trim();
    const percent = Math.round(((i + 1) / cuts.length) * 100);
    onProgress?.(currentText, percent, i === 0);
  }

  const result = parts.join(" ").trim();
  return result || null;
}

export async function transcribeAudioSource(
  audioUrl: string,
  audioBlob?: Blob | null,
  onProgress?: TranscribeProgressCallback,
  targetLang?: string
): Promise<string> {
  if (!audioUrl && !audioBlob) return "";
  if (typeof window === "undefined") return "";

  const lang = targetLang || "pt";

  try {
    let blob = audioBlob || null;
    if (!blob && audioUrl) {
      blob = await fetchAudioBlob(audioUrl);
    }

    if (!blob) return "";

    const geminiResult = await tryGeminiTranscription(blob, audioUrl, lang, onProgress);
    if (geminiResult) return geminiResult;

    const whisperResult = await tryWhisperLocalTranscription(blob, lang, onProgress);
    if (whisperResult) return whisperResult;
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTA_EXCEEDED") {
      throw e;
    }
    console.error("Falha ao processar e transcrever áudio:", e);
  }

  return "";
}
