/**
 * Compressão de vídeo no navegador, priorizando qualidade.
 *
 * O vídeo é redesenhado quadro a quadro em um canvas e re-codificado pelo
 * MediaRecorder na maior taxa de bits que ainda cabe no limite. A resolução só
 * é reduzida quando a taxa disponível não sustenta os pixels do original
 * (bits por pixel abaixo do alvo) — assim um arquivo pouco acima do limite sai
 * praticamente idêntico, e não há re-codificação nenhuma quando já cabe.
 */

import { replaceExtension } from "./compress-attachment";

export type VideoCompressionProgress = (percent: number, round: number) => void;

const MAX_ROUNDS = 3;
/**
 * Piso absoluto: abaixo disso o resultado seria mancha em movimento, e a
 * recodificação levaria mais tempo que o vídeo inteiro sem entregar nada
 * assistível.
 */
const MIN_TOTAL_BITRATE = 260_000;
/**
 * A recodificação roda em tempo real: um vídeo de uma hora custaria uma hora de
 * espera. Passando disso, recusar é mais honesto que prender o usuário.
 */
const MAX_COMPRESSIBLE_SECONDS = 30 * 60;
const MIN_VIDEO_BITRATE = 180_000;
const AUDIO_BITRATE_FULL = 128_000;
const AUDIO_BITRATE_LEAN = 64_000;
/** Acima desta taxa sobra orçamento para áudio cheio e 30 quadros por segundo. */
const COMFORTABLE_BITRATE = 1_400_000;
const TARGET_FILL = 0.9;
// O arquivo gravado termina um pouco mais longo que a fonte (último bloco de
// dados + cabeçalhos do contêiner); mirar nisso evita uma rodada extra.
const DURATION_OVERHEAD_S = 0.4;
const TARGET_BPP = 0.09;
const CAPTURE_FPS = 30;
const LEAN_FPS = 24;
const MIN_HEIGHT = 240;
const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 45_000;
const STALL_TIMEOUT_MS = 20_000;

const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.4d002a,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=h264,opus",
  "video/webm",
];

export function videoTooLargeError(limitMb: number): Error {
  return new Error(
    `Vídeo muito grande: não foi possível comprimir para ${limitMb} MB mantendo a qualidade. Tente um vídeo menor ou mais curto.`
  );
}

/**
 * Caso diferente de "grande demais": a duração é tanta que nem no piso de
 * qualidade caberia no limite. Vale avisar com outras palavras, porque cortar o
 * vídeo é a única saída.
 */
export function videoTooLongError(limitMb: number, minutes: number): Error {
  return new Error(
    `Vídeo longo demais: ${minutes} min não cabem em ${limitMb} MB com imagem aproveitável.`
  );
}

/** Só para o console: a mensagem que o usuário vê fala apenas de tamanho. */
function reportFailure(reason: string, details: unknown = {}) {
  console.warn(`[synapsys] vídeo não pôde ser preparado (${reason})`, details);
}

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {}
  }
  return null;
}

function baseMime(mimeType: string): string {
  return mimeType.split(";")[0] || "video/webm";
}

function extensionFor(mimeType: string): string {
  return baseMime(mimeType).includes("mp4") ? ".mp4" : ".webm";
}

function evenSize(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Maior resolução (nunca acima da original) em que a taxa de bits disponível
 * ainda entrega bits por pixel suficientes para não borrar a imagem.
 */
export function planResolution(
  sourceWidth: number,
  sourceHeight: number,
  videoBitrate: number,
  fps = CAPTURE_FPS
): { width: number; height: number } {
  const srcW = Math.max(2, Math.round(sourceWidth));
  const srcH = Math.max(2, Math.round(sourceHeight));
  const maxPixels = videoBitrate / (TARGET_BPP * fps);
  const scale = Math.min(1, Math.sqrt(maxPixels / (srcW * srcH)));

  let width = evenSize(srcW * scale);
  let height = evenSize(srcH * scale);

  if (height < MIN_HEIGHT && srcH >= MIN_HEIGHT) {
    const floorScale = MIN_HEIGHT / srcH;
    width = evenSize(srcW * floorScale);
    height = evenSize(srcH * floorScale);
  }

  return {
    width: Math.max(2, Math.min(srcW, width)),
    height: Math.max(2, Math.min(srcH, height)),
  };
}

/**
 * Maior duração (em segundos) que ainda cabe no limite com imagem
 * aproveitável. Acima disso o anexo é recusado em vez de gastar o tempo do
 * vídeo inteiro recodificando para nada.
 */
export function maxCompressibleDuration(targetBytes: number): number {
  const byBudget = (targetBytes * TARGET_FILL * 8) / MIN_TOTAL_BITRATE - DURATION_OVERHEAD_S;
  return Math.max(0, Math.min(byBudget, MAX_COMPRESSIBLE_SECONDS));
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

function createOffscreenVideo(objectUrl: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.disablePictureInPicture = true;
  video.style.cssText =
    "position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1;";
  video.src = objectUrl;
  document.body.appendChild(video);
  return video;
}

function destroyVideo(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {}
  try {
    video.removeAttribute("src");
    video.load();
  } catch {}
  try {
    video.remove();
  } catch {}
}

export async function readVideoMetadata(file: Blob): Promise<VideoMetadata> {
  const objectUrl = URL.createObjectURL(file);
  const video = createOffscreenVideo(objectUrl);

  try {
    return await new Promise<VideoMetadata>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("VIDEO_METADATA_TIMEOUT")), METADATA_TIMEOUT_MS);
      const finish = () => {
        clearTimeout(timer);
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };
      video.addEventListener(
        "loadedmetadata",
        () => {
          // Arquivos gravados em stream (WebM) só expõem a duração após um seek.
          if (!Number.isFinite(video.duration) || video.duration <= 0) {
            video.addEventListener("durationchange", finish, { once: true });
            try {
              video.currentTime = 1e6;
            } catch {
              finish();
            }
            return;
          }
          finish();
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("VIDEO_DECODE_ERROR"));
        },
        { once: true }
      );
      video.load();
    });
  } finally {
    destroyVideo(video);
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Cronômetro imune ao afunilamento de timers em aba de fundo — sem ele, uma
 * compressão longa congelaria os quadros assim que o usuário troca de aba.
 */
function createTicker(intervalMs: number, onTick: () => void): () => void {
  try {
    const source = `let id=null;onmessage=(e)=>{if(e.data&&e.data.start){clearInterval(id);id=setInterval(()=>postMessage(0),e.data.start);}else{clearInterval(id);id=null;}};`;
    const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(blobUrl);
    worker.onmessage = () => onTick();
    worker.postMessage({ start: intervalMs });
    return () => {
      try {
        worker.postMessage({ stop: true });
        worker.terminate();
      } catch {}
      URL.revokeObjectURL(blobUrl);
    };
  } catch {
    const id = setInterval(onTick, intervalMs);
    return () => clearInterval(id);
  }
}

interface RoundOptions {
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  fps: number;
  mimeType: string;
  duration: number;
  onTick?: (currentTime: number) => void;
}

async function recordRound(file: Blob, options: RoundOptions): Promise<Blob> {
  const { width, height, videoBitrate, audioBitrate, fps, mimeType, duration, onTick } = options;
  const objectUrl = URL.createObjectURL(file);
  const video = createOffscreenVideo(objectUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    destroyVideo(video);
    URL.revokeObjectURL(objectUrl);
    throw new Error("VIDEO_CANVAS_UNAVAILABLE");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let audioCtx: AudioContext | null = null;
  let stopTicker: (() => void) | null = null;
  let stallTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;

  const cleanup = () => {
    stopped = true;
    if (stopTicker) stopTicker();
    if (stallTimer) clearInterval(stallTimer);
    try {
      stream?.getTracks().forEach((track) => track.stop());
    } catch {}
    if (audioCtx) {
      void audioCtx.close().catch(() => undefined);
    }
    destroyVideo(video);
    URL.revokeObjectURL(objectUrl);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("VIDEO_METADATA_TIMEOUT")), METADATA_TIMEOUT_MS);
      video.addEventListener(
        "loadeddata",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("VIDEO_DECODE_ERROR"));
        },
        { once: true }
      );
      video.load();
    });

    stream = canvas.captureStream(fps);

    // O áudio passa pelo Web Audio (sem ligar na saída) para ser gravado sem
    // tocar nas caixas de som do usuário.
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        audioCtx = new AudioCtor();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => undefined);
        }
        const source = audioCtx.createMediaElementSource(video);
        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);
        for (const track of destination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
      }
    } catch {
      audioCtx = null;
    }

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioBitrate,
    });

    const activeRecorder = recorder;
    const chunks: BlobPart[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      activeRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      activeRecorder.onerror = () => reject(new Error("VIDEO_RECORDER_ERROR"));
      activeRecorder.onstop = () => resolve(new Blob(chunks, { type: baseMime(mimeType) }));
    });

    recorder.start(1000);

    try {
      await video.play();
    } catch {
      // Sem gesto do usuário o navegador só libera a reprodução muda: mantém a
      // compressão funcionando (o áudio capturado fica silencioso).
      video.muted = true;
      await video.play();
    }

    const drawFrame = () => {
      if (stopped) return;
      try {
        ctx.drawImage(video, 0, 0, width, height);
      } catch {}
      onTick?.(video.currentTime);
    };

    const frameCallback = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }
    ).requestVideoFrameCallback;

    if (typeof frameCallback === "function") {
      const loop = () => {
        if (stopped) return;
        drawFrame();
        frameCallback.call(video, loop);
      };
      frameCallback.call(video, loop);
    }
    // O callback de quadro para quando a aba sai de foco; o ticker segue.
    stopTicker = createTicker(Math.round(1000 / fps), drawFrame);

    await new Promise<void>((resolve, reject) => {
      video.addEventListener("ended", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("VIDEO_DECODE_ERROR")), { once: true });

      let lastTime = -1;
      let lastProgressAt = Date.now();
      stallTimer = setInterval(() => {
        if (video.currentTime > lastTime + 0.05) {
          lastTime = video.currentTime;
          lastProgressAt = Date.now();
          return;
        }
        if (video.ended) {
          resolve();
          return;
        }
        if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
          if (duration > 0 && video.currentTime >= duration - 0.5) {
            resolve();
          } else {
            reject(new Error("VIDEO_STALLED"));
          }
        }
      }, 1000);
    });

    if (stallTimer) clearInterval(stallTimer);
    if (stopTicker) {
      stopTicker();
      stopTicker = null;
    }
    drawFrame();

    // Deixa o último bloco de dados chegar antes de fechar o arquivo.
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (recorder.state !== "inactive") recorder.stop();

    const blob = await recorded;
    if (!blob || blob.size === 0) throw new Error("VIDEO_EMPTY_OUTPUT");
    return blob;
  } finally {
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {}
    cleanup();
  }
}

/**
 * Re-codifica o vídeo quantas vezes forem necessárias até caber em
 * `targetBytes`, começando pela melhor qualidade possível dentro do limite.
 * Lança erro quando nem a última rodada consegue caber.
 */
export async function compressVideoUntilFits(
  file: File,
  targetBytes: number,
  onProgress?: VideoCompressionProgress
): Promise<File> {
  const limitMb = Math.round(targetBytes / (1024 * 1024));

  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    reportFailure("navegador sem MediaRecorder");
    throw videoTooLargeError(limitMb);
  }
  if (file.size > MAX_INPUT_BYTES) {
    reportFailure("arquivo acima do limite de entrada", { sizeBytes: file.size });
    throw videoTooLargeError(limitMb);
  }

  const mimeType = pickRecorderMime();
  if (!mimeType) {
    reportFailure("nenhum formato de gravação suportado");
    throw videoTooLargeError(limitMb);
  }

  let metadata: VideoMetadata;
  try {
    metadata = await readVideoMetadata(file);
  } catch (error) {
    reportFailure("metadados ilegíveis", {
      type: file.type,
      name: file.name,
      error: error instanceof Error ? error.message : error,
    });
    throw videoTooLargeError(limitMb);
  }

  const duration = metadata.duration;
  if (!Number.isFinite(duration) || duration <= 0 || !metadata.width || !metadata.height) {
    reportFailure("duração ou dimensões inválidas", metadata);
    throw videoTooLargeError(limitMb);
  }

  const budgetBits = targetBytes * TARGET_FILL * 8;
  const totalBitrate = Math.floor(budgetBits / (duration + DURATION_OVERHEAD_S));
  if (duration > maxCompressibleDuration(targetBytes)) {
    // Ou não caberia nem no piso de qualidade, ou a espera seria longa demais.
    reportFailure("duração longa demais para o limite", {
      durationSeconds: Math.round(duration),
      tetoSegundos: Math.round(maxCompressibleDuration(targetBytes)),
      bitrateDisponivel: totalBitrate,
      minimo: MIN_TOTAL_BITRATE,
    });
    throw videoTooLongError(limitMb, Math.max(1, Math.round(duration / 60)));
  }

  // Em vídeo longo cada bit conta: áudio enxuto e menos quadros deixam mais
  // orçamento para a imagem, que é o que o olho percebe primeiro.
  const audioBitrate = totalBitrate >= COMFORTABLE_BITRATE ? AUDIO_BITRATE_FULL : AUDIO_BITRATE_LEAN;
  const fps = totalBitrate >= COMFORTABLE_BITRATE ? CAPTURE_FPS : LEAN_FPS;

  const sourceBitrate = Math.floor((file.size * 8) / duration);
  let videoBitrate = Math.max(MIN_VIDEO_BITRATE, totalBitrate - audioBitrate);
  // Nunca gasta mais bits que o original: acima disso só incharia o arquivo.
  videoBitrate = Math.min(videoBitrate, Math.max(MIN_VIDEO_BITRATE, sourceBitrate));

  const roundCeilings = [70, 90, 99];
  let best: File | null = null;
  let lastError: unknown = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const { width, height } = planResolution(metadata.width, metadata.height, videoBitrate, fps);
    const floorPercent = round === 1 ? 0 : roundCeilings[round - 2];
    const ceilPercent = roundCeilings[round - 1];

    let blob: Blob;
    try {
      blob = await recordRound(file, {
        width,
        height,
        videoBitrate,
        audioBitrate,
        fps,
        mimeType,
        duration,
        onTick: (currentTime) => {
          const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
          onProgress?.(Math.round(floorPercent + ratio * (ceilPercent - floorPercent)), round);
        },
      });
    } catch (error) {
      lastError = error;
      break;
    }

    const output = new File([blob], replaceExtension(file.name, extensionFor(mimeType)), {
      type: baseMime(mimeType),
      lastModified: Date.now(),
    });

    if (!best || output.size < best.size) best = output;
    if (output.size <= targetBytes) {
      onProgress?.(100, round);
      return output;
    }

    const overshoot = targetBytes / output.size;
    const nextBitrate = Math.floor(videoBitrate * overshoot * 0.9);
    if (nextBitrate < MIN_VIDEO_BITRATE || nextBitrate >= videoBitrate) break;
    videoBitrate = nextBitrate;
  }

  if (best && best.size <= targetBytes) {
    onProgress?.(100, MAX_ROUNDS);
    return best;
  }

  reportFailure("rodadas esgotadas", {
    durationSeconds: Math.round(duration),
    entradaBytes: file.size,
    melhorSaidaBytes: best?.size ?? null,
    alvoBytes: targetBytes,
    error: lastError instanceof Error ? lastError.message : lastError,
  });
  throw videoTooLargeError(limitMb);
}
