import { PDF_WORKER_PATH, vendorUrl } from "@/lib/vendor-assets";
import { frameEnergies, planSpeechCuts, rangesFromCuts } from "@/lib/media/speech-cuts";

export const IMAGE_SIZE_LIMIT = 1 * 1024 * 1024;
export const PDF_SIZE_LIMIT = 3 * 1024 * 1024;
export const AUDIO_SIZE_LIMIT = 30 * 1024 * 1024;
export const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;
/**
 * `storage.rules` exige `size < 150 MB` para vídeo, então a compressão mira um
 * pouco abaixo do limite anunciado para o upload nunca bater na borda.
 */
export const VIDEO_UPLOAD_TARGET = VIDEO_SIZE_LIMIT - 512 * 1024;
export const ATTACHMENT_SIZE_LIMIT = PDF_SIZE_LIMIT;
const MAX_ROUNDS = 18;
const MIN_EDGE = 320;

export const AUDIO_EXTENSIONS_REGEX = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|weba|wma)$/i;
export const VIDEO_EXTENSIONS_REGEX = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|3g2|mpg|mpeg|ogv|wmv|flv|ts|hevc)$/i;

export function isAudioFile(file: { name?: string; type?: string }): boolean {
  if (typeof file.type === "string" && file.type.startsWith("audio/")) return true;
  if (typeof file.type === "string" && file.type.startsWith("video/")) return false;
  if (typeof file.name === "string" && AUDIO_EXTENSIONS_REGEX.test(file.name)) return true;
  return false;
}

export function isVideoFile(file: { name?: string; type?: string }): boolean {
  if (typeof file.type === "string" && file.type.startsWith("video/")) return true;
  if (typeof file.type === "string" && file.type.startsWith("audio/")) return false;
  // `.webm` serve aos dois formatos: sem MIME só tratamos como vídeo o que não
  // é extensão típica de áudio.
  if (typeof file.name === "string" && VIDEO_EXTENSIONS_REGEX.test(file.name)) {
    return !/\.(webm|ogg)$/i.test(file.name);
  }
  return false;
}

export function needsCompression(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return file.size > IMAGE_SIZE_LIMIT;
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return file.size > PDF_SIZE_LIMIT;
  }
  if (isVideoFile(file)) {
    return file.size > VIDEO_UPLOAD_TARGET;
  }
  if (isAudioFile(file)) {
    return file.size > AUDIO_SIZE_LIMIT;
  }
  return false;
}

export function needsAudioCompression(blob: Blob): boolean {
  return blob.size > AUDIO_SIZE_LIMIT;
}

export function replaceExtension(name: string, ext: string): string {
  return name.replace(/\.[^.]+$/, "") + ext;
}

const MAX_WEB_EDGE = 2048;
const HIGH_QUALITY = 0.86;

export async function optimizeImageForFastLoad(file: File): Promise<File> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  if (file.size < 600 * 1024) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDim = Math.max(bitmap.width, bitmap.height);
      const scale = maxDim > MAX_WEB_EDGE ? MAX_WEB_EDGE / maxDim : 1;
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

      if (scale === 1 && file.size <= IMAGE_SIZE_LIMIT) {
        return file;
      }

      const blob = await rasterToJpeg(bitmap, targetWidth, targetHeight, HIGH_QUALITY);
      if (blob.size < file.size) {
        return new File([blob], replaceExtension(file.name, ".jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
      return file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

export interface PrepareAttachmentOptions {
  /** Progresso (0-100) da compressão de vídeo, que roda em várias rodadas. */
  onVideoProgress?: (percent: number, round: number) => void;
}

export async function prepareEditorAttachment(
  file: File,
  options?: PrepareAttachmentOptions
): Promise<File> {
  if (isVideoFile(file)) {
    if (!needsCompression(file)) return file;
    const { compressVideoUntilFits } = await import("./compress-video");
    const compressed = await compressVideoUntilFits(
      file,
      VIDEO_UPLOAD_TARGET,
      options?.onVideoProgress
    );
    if (compressed.size > VIDEO_UPLOAD_TARGET) {
      const { videoTooLargeError } = await import("./compress-video");
      throw videoTooLargeError(Math.round(VIDEO_SIZE_LIMIT / (1024 * 1024)));
    }
    return compressed;
  }
  if (file.type.startsWith("image/")) {
    const optimized = await optimizeImageForFastLoad(file);
    if (!needsCompression(optimized)) return optimized;
    return compressImageUntilFits(optimized);
  }
  if (isAudioFile(file)) {
    if (!needsCompression(file)) return file;
    const compressed = await compressAudioUntilFits(file);
    if (compressed.size > AUDIO_SIZE_LIMIT) {
      throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
    }
    const targetType = compressed.type || (file.type && file.type.startsWith("audio/") ? file.type : "audio/ogg");
    const targetExt = targetType.includes("ogg") ? ".ogg" : targetType.includes("webm") ? ".webm" : "";
    const targetName = targetExt && !file.name.toLowerCase().endsWith(targetExt)
      ? replaceExtension(file.name, targetExt)
      : file.name;
    return new File([compressed], targetName, {
      type: targetType,
      lastModified: Date.now(),
    });
  }
  if (!needsCompression(file)) return file;
  return compressPdfUntilFits(file);
}

export async function prepareAudioAttachment(blob: Blob): Promise<Blob> {
  if (!needsAudioCompression(blob)) return blob;
  const compressed = await compressAudioUntilFits(blob);
  if (compressed.size > AUDIO_SIZE_LIMIT) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
  }
  return compressed;
}

async function compressImageUntilFits(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = 1;
    let quality = 0.82;
    let best = file;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const blob = await rasterToJpeg(bitmap, width, height, quality);
      if (blob.size < best.size) {
        best = new File([blob], replaceExtension(file.name, ".jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
      if (best.size <= IMAGE_SIZE_LIMIT) return best;

      if (quality > 0.32) {
        quality = Math.max(0.28, quality - 0.12);
      } else {
        scale *= 0.72;
        quality = 0.34;
      }
      if (Math.max(width, height) <= MIN_EDGE && quality <= 0.28) break;
    }

    if (best.size <= IMAGE_SIZE_LIMIT) return best;
    throw tooLarge(best.size, 1);
  } finally {
    bitmap.close();
  }
}

async function compressPdfUntilFits(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let scale = 1.15;
  let quality = 0.72;
  let best = file;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const blob = await rasterizePdf(bytes, scale, quality);
    if (blob.size < best.size) {
      best = new File([blob], file.name, { type: "application/pdf", lastModified: Date.now() });
    }
    if (best.size <= PDF_SIZE_LIMIT) return best;

    if (quality > 0.32) {
      quality = Math.max(0.26, quality - 0.1);
    } else {
      scale *= 0.7;
      quality = 0.36;
    }
    if (scale < 0.28 && quality <= 0.26) break;
  }

  if (best.size <= PDF_SIZE_LIMIT) return best;
  throw tooLarge(best.size, 3);
}

function tooLarge(size: number, limitMb: number): Error {
  return new Error(
    `Este arquivo continua acima de ${limitMb} MB (${Math.ceil(size / (1024 * 1024))} MB) mesmo após comprimir. Tente um arquivo menor.`
  );
}

async function rasterToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível comprimir a imagem.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível comprimir a imagem.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível comprimir a imagem."))),
      "image/jpeg",
      quality
    );
  });
}

async function rasterizePdf(bytes: Uint8Array, scale: number, quality: number): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  const { PDFDocument } = await import("pdf-lib");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = vendorUrl(PDF_WORKER_PATH);
  }

  const loading = pdfjs.getDocument({ data: bytes.slice() });
  const source = await loading.promise;
  const out = await PDFDocument.create();

  try {
    for (let i = 1; i <= source.numPages; i++) {
      const page = await source.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível comprimir o PDF.");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const jpeg = await rasterToJpeg(canvas, canvas.width, canvas.height, quality);
      const image = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const next = out.addPage([image.width, image.height]);
      next.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      page.cleanup();
    }
  } finally {
    await source.cleanup();
    await loading.destroy();
  }

  const written = await out.save({ useObjectStreams: true });
  const copy = new Uint8Array(written.byteLength);
  copy.set(written);
  return new Blob([copy], { type: "application/pdf" });
}

const OGG_CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) {
    r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
  }
  OGG_CRC_TABLE[i] = r >>> 0;
}

function oggCrc(buf: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  }
  return crc;
}

function makeOggPage(
  headerType: number,
  granulePos: bigint,
  serial: number,
  seq: number,
  packets: Uint8Array[]
): Uint8Array {
  const segments: number[] = [];
  let payloadLength = 0;
  for (const pkt of packets) {
    let len = pkt.length;
    while (len >= 255) {
      segments.push(255);
      len -= 255;
    }
    segments.push(len);
    payloadLength += pkt.length;
  }
  const page = new Uint8Array(27 + segments.length + payloadLength);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53, 0, headerType], 0);
  view.setBigInt64(6, granulePos, true);
  view.setUint32(14, serial, true);
  view.setUint32(18, seq, true);
  view.setUint32(22, 0, true);
  page[26] = segments.length;
  page.set(segments, 27);
  let offset = 27 + segments.length;
  for (const pkt of packets) {
    page.set(pkt, offset);
    offset += pkt.length;
  }
  const crc = oggCrc(page);
  view.setUint32(22, crc, true);
  return page;
}

function makeOpusHead(channels = 1, sampleRate = 48000): Uint8Array {
  const head = new Uint8Array(19);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, channels]);
  const view = new DataView(head.buffer);
  view.setUint16(10, 384, true);
  view.setUint32(12, sampleRate, true);
  view.setInt16(16, 0, true);
  head[18] = 0;
  return head;
}

function makeOpusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("synapsys");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]);
  const view = new DataView(tags.buffer);
  view.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true);
  return tags;
}

/**
 * Lê a trilha decodificada em quadros de 20 ms, misturando os canais e
 * reamostrando na hora. Nada de cópia do áudio inteiro: uma gravação de uma
 * hora ocuparia centenas de megabytes só nesse passo intermediário.
 */
export function createMonoFrameReader(audioBuffer: AudioBuffer, targetRate: number) {
  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const sourceLength = channels[0]?.length ?? 0;
  const ratio = audioBuffer.sampleRate / targetRate;
  const totalSamples = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));

  const read = (startSample: number, out: Float32Array) => {
    out.fill(0);
    const available = Math.min(out.length, totalSamples - startSample);
    for (let i = 0; i < available; i++) {
      const position = (startSample + i) * ratio;
      const left = Math.min(sourceLength - 1, Math.max(0, Math.floor(position)));
      const right = Math.min(sourceLength - 1, left + 1);
      const frac = Math.max(0, Math.min(1, position - left));
      let sum = 0;
      for (let c = 0; c < channels.length; c++) {
        const data = channels[c];
        sum += (data[left] || 0) * (1 - frac) + (data[right] || 0) * frac;
      }
      const value = sum / Math.max(1, channels.length);
      out[i] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    }
    return Math.max(0, available);
  };

  return { totalSamples, read };
}

async function encodeAudioBufferToOpus(
  audioBuffer: AudioBuffer,
  targetBitrate: number,
  encodeSampleRate = 48000,
  range?: { startSample: number; endSample: number },
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
    throw new Error("O navegador não suporta codificação de áudio.");
  }

  const sampleRate = encodeSampleRate;
  const numberOfChannels = 1;
  const reader = createMonoFrameReader(audioBuffer, sampleRate);

  const serial = (Math.random() * 0x7fffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let seq = 0;

  pages.push(makeOggPage(2, BigInt(0), serial, seq++, [makeOpusHead(numberOfChannels, sampleRate)]));
  pages.push(makeOggPage(0, BigInt(0), serial, seq++, [makeOpusTags()]));

  const packets: Uint8Array[] = [];
  let totalGranule = BigInt(0);
  let encoderError: Error | null = null;

  const encoder = new AudioEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      packets.push(buf);
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  encoder.configure({
    codec: "opus",
    sampleRate,
    numberOfChannels,
    bitrate: targetBitrate,
  });

  // 20 ms por quadro, na taxa em que estamos codificando.
  const frameSize = Math.round(sampleRate / 50);
  const from = Math.max(0, range?.startSample ?? 0);
  const to = Math.min(reader.totalSamples, range?.endSample ?? reader.totalSamples);

  const span = Math.max(1, to - from);
  let sinceReport = 0;

  try {
    for (let offset = from; offset < to; offset += frameSize) {
    if (encoderError) throw encoderError;
    // Uma aula de 50 min leva um a dois minutos aqui. Sem avisar o avanço, a
    // barra fica em 0% esse tempo todo e parece travada.
    if (onProgress && ++sinceReport >= 100) {
      sinceReport = 0;
      onProgress((offset - from) / span);
    }
    const frame = new Float32Array(frameSize);
    reader.read(offset, frame);
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frameSize,
      numberOfChannels,
      timestamp: Math.round(((offset - from) / sampleRate) * 1_000_000),
      data: frame,
    });
    encoder.encode(audioData);
    audioData.close();

    if (encoder.encodeQueueSize > 25) {
      // Com deadline: se a fila travar, a espera vira um loop infinito que
      // congela a aba sem nunca reportar erro.
      const until = Date.now() + 15_000;
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (encoderError) return reject(encoderError);
          if (encoder.encodeQueueSize <= 10) return resolve();
          if (Date.now() > until) return reject(new Error("AUDIO_ENCODER_STALLED"));
          setTimeout(check, 10);
        };
        check();
      });
    }
    }

    if (encoderError) throw encoderError;
    await encoder.flush();
  } finally {
    // Qualquer saida por erro deixava o encoder aberto, segurando memoria e um
    // worker de codificacao ate a aba fechar.
    try {
      if (encoder.state !== "closed") encoder.close();
    } catch {}
  }

  // A posição de granule do Ogg Opus é sempre contada em 48 kHz, qualquer que
  // seja a taxa de entrada — senão a duração sai errada no player.
  const granuleStep = BigInt(Math.round((frameSize * 48000) / sampleRate));
  for (let i = 0; i < packets.length; i++) {
    totalGranule += granuleStep;
    const isLast = i === packets.length - 1;
    pages.push(makeOggPage(isLast ? 4 : 0, totalGranule, serial, seq++, [packets[i]]));
  }

  return new Blob(pages as BlobPart[], { type: "audio/ogg; codecs=opus" });
}

/**
 * Decodifica a trilha de áudio de um arquivo (inclusive de vídeo, quando o
 * navegador consegue), devolvendo `null` em vez de lançar erro.
 */
export async function decodeAudioBlob(
  blob: Blob,
  targetSampleRate = 48000
): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!OfflineCtx && !AudioCtx) return null;

  let audioBuffer: AudioBuffer | null = null;

  if (OfflineCtx) {
    try {
      // Decodificar direto na taxa de destino evita guardar a trilha em 48 kHz
      // só para reamostrar depois. O buffer vai sem cópia: `decodeAudioData`
      // o consome, e copiar um vídeo de 150 MB "por garantia" dobrava o pico
      // de memória justo na etapa mais pesada.
      const arrayBuffer = await blob.arrayBuffer();
      const offCtx = new OfflineCtx(1, targetSampleRate, targetSampleRate);
      audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const promise = offCtx.decodeAudioData(arrayBuffer, resolve, reject);
        if (promise && typeof promise.then === "function") {
          promise.then(resolve).catch(reject);
        }
      });
    } catch {}
  }

  if (!audioBuffer && AudioCtx) {
    try {
      // Só o caminho de reserva relê o arquivo: o primeiro buffer já foi consumido.
      const arrayBuffer = await blob.arrayBuffer();
      const actx = new AudioCtx();
      try {
        audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const promise = actx.decodeAudioData(arrayBuffer, resolve, reject);
          if (promise && typeof promise.then === "function") {
            promise.then(resolve).catch(reject);
          }
        });
      } finally {
        void actx.close().catch(() => undefined);
      }
    } catch {}
  }

  return audioBuffer;
}

/**
 * Extrai só a fala de um arquivo grande (vídeo ou áudio) em um Opus enxuto,
 * para caber no limite de upload inline da transcrição.
 */
/** Fala cabe folgado em 16 kHz, e a decodificação ocupa um terço da memória. */
export const TRANSCRIPTION_SAMPLE_RATE = 16000;

async function opusEncodeRate(bitrate: number): Promise<number> {
  if (typeof AudioEncoder === "undefined") return 48000;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: TRANSCRIPTION_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate,
    });
    if (support.supported) return TRANSCRIPTION_SAMPLE_RATE;
  } catch {}
  return 48000;
}

export interface SegmentPlan {
  durationSeconds: number;
  /** Faixas [início, fim) em segundos, cortadas em pausas de fala, sem sobreposição. */
  ranges: { start: number; end: number }[];
  /** Codifica o trecho `index` em Opus. Sob demanda: a fila de envio puxa. */
  encode(index: number): Promise<Blob>;
}

/**
 * Prepara a fala para ser transcrita em trechos paralelos.
 *
 * A trilha é decodificada UMA vez (antes eram duas: uma para o envio inteiro,
 * outra para fatiar quando ele falhava) e os cortes caem em pausas de fala.
 * Cada trecho só é codificado quando a fila de envio chega nele, então o
 * primeiro já está sendo transcrito enquanto os outros ainda codificam.
 */
export async function planAudioSegments(
  blob: Blob,
  {
    segmentSeconds = 180,
    maxBytesPerSegment = 2 * 1024 * 1024,
    maxBitrate = 24000,
  }: { segmentSeconds?: number; maxBytesPerSegment?: number; maxBitrate?: number } = {}
): Promise<SegmentPlan | null> {
  if (typeof window === "undefined") return null;
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;

  const audioBuffer = await decodeAudioBlob(blob, TRANSCRIPTION_SAMPLE_RATE);
  if (!audioBuffer || !audioBuffer.duration) return null;

  const duration = audioBuffer.duration;
  const analysis = createMonoFrameReader(audioBuffer, TRANSCRIPTION_SAMPLE_RATE);
  const energies = frameEnergies(analysis.read, analysis.totalSamples, TRANSCRIPTION_SAMPLE_RATE);
  const ranges = rangesFromCuts(planSpeechCuts(energies, { targetSeconds: segmentSeconds }), duration);
  if (!ranges.length) return null;

  const longest = Math.max(...ranges.map((range) => range.end - range.start));
  const bitrate = Math.max(
    12000,
    Math.min(maxBitrate, Math.floor(((maxBytesPerSegment * 0.9) * 8) / Math.max(1, longest)))
  );
  const encodeRate = await opusEncodeRate(bitrate);

  return {
    durationSeconds: duration,
    ranges,
    encode: (index) => {
      const range = ranges[index];
      return encodeAudioBufferToOpus(audioBuffer, bitrate, encodeRate, {
        startSample: Math.round(range.start * encodeRate),
        endSample: Math.round(range.end * encodeRate),
      });
    },
  };
}

export async function extractAudioForTranscription(
  blob: Blob,
  maxBytes = 8 * 1024 * 1024,
  onProgress?: (fraction: number) => void
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;

  const audioBuffer = await decodeAudioBlob(blob, TRANSCRIPTION_SAMPLE_RATE);
  if (!audioBuffer || !audioBuffer.duration) return null;

  const duration = Math.max(1, audioBuffer.duration);
  // Fala em Opus mono 16 kHz fica clara bem abaixo disso, e um arquivo menor
  // sobe mais rápido e tem menos chance de esbarrar no limite da API.
  const bitrate = Math.max(
    12000,
    Math.min(24000, Math.floor(((maxBytes * 0.9) * 8) / duration))
  );

  try {
    const rate = await opusEncodeRate(bitrate);
    const encoded = await encodeAudioBufferToOpus(audioBuffer, bitrate, rate, undefined, onProgress);
    if (encoded && encoded.size > 0 && encoded.size <= maxBytes) return encoded;

    // Estourou o teto (o cabecalho de cada pagina Ogg pesa mais do que a conta
    // previa): reencoda mirando o tamanho medido.
    if (encoded && encoded.size > maxBytes) {
      const corrected = Math.max(
        8000,
        Math.floor(bitrate * (maxBytes / encoded.size) * 0.9)
      );
      const retry = await encodeAudioBufferToOpus(audioBuffer, corrected, rate);
      if (retry && retry.size > 0 && retry.size <= maxBytes) return retry;
    }
  } catch {}

  return null;
}

export async function compressAudioUntilFits(blob: Blob): Promise<Blob> {
  if (blob.size <= AUDIO_SIZE_LIMIT) return blob;

  if (typeof window === "undefined") {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
  }

  if (blob.size > 250 * 1024 * 1024) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
  }

  const audioBuffer = await decodeAudioBlob(blob);

  if (!audioBuffer) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
  }

  const duration = Math.max(1, audioBuffer.duration);
  const maxPossibleDuration = (AUDIO_SIZE_LIMIT * 8) / 6000;
  if (duration > maxPossibleDuration) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
  }

  let targetBitrate = Math.max(
    8000,
    Math.min(64000, Math.floor(((AUDIO_SIZE_LIMIT * 0.76) * 8) / duration))
  );

  try {
    const encoded = await encodeAudioBufferToOpus(audioBuffer, targetBitrate);
    if (encoded && encoded.size > 0 && encoded.size <= AUDIO_SIZE_LIMIT) {
      return encoded;
    }

    if (encoded && encoded.size > AUDIO_SIZE_LIMIT && targetBitrate > 10000) {
      targetBitrate = Math.max(8000, Math.floor(targetBitrate * (AUDIO_SIZE_LIMIT / encoded.size) * 0.85));
      const retryEncoded = await encodeAudioBufferToOpus(audioBuffer, targetBitrate);
      if (retryEncoded && retryEncoded.size > 0 && retryEncoded.size <= AUDIO_SIZE_LIMIT) {
        return retryEncoded;
      }
    }
  } catch (err) {
    console.error("Erro na codificação de áudio:", err);
  }

  throw new Error("Arquivo muito grande para ser comprimido. Limite de 30 MB.");
}
