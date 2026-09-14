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

export async function transcribeAudioSource(
  audioUrl: string,
  audioBlob?: Blob | null,
  onProgress?: TranscribeProgressCallback,
  targetLang?: string
): Promise<string> {
  if (!audioUrl && !audioBlob) return "";
  if (typeof window === "undefined") return "";

  try {
    let blob = audioBlob;
    if (!blob && audioUrl) {
      try {
        const res = await fetch(audioUrl);
        if (res.ok) {
          blob = await res.blob();
        }
      } catch {
        const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
        const resProxy = await fetch(proxyUrl);
        if (resProxy.ok) {
          blob = await resProxy.blob();
        }
      }
    }

    if (!blob) return "";

    const arrayBuffer = await blob.arrayBuffer();

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return "";

    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

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
          return text;
        }
      } catch (e) {
        clearInterval(timer);
        throw e;
      }
      return "";
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

    return parts.join(" ").trim();
  } catch (e) {
    console.error("Falha ao processar e transcrever áudio:", e);
  }

  return "";
}
