export const IMAGE_SIZE_LIMIT = 1 * 1024 * 1024;
export const PDF_SIZE_LIMIT = 3 * 1024 * 1024;
export const AUDIO_SIZE_LIMIT = 3 * 1024 * 1024;
export const ATTACHMENT_SIZE_LIMIT = PDF_SIZE_LIMIT;
const MAX_ROUNDS = 18;
const MIN_EDGE = 320;

export const AUDIO_EXTENSIONS_REGEX = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|weba|wma)$/i;

export function isAudioFile(file: { name?: string; type?: string }): boolean {
  if (typeof file.type === "string" && file.type.startsWith("audio/")) return true;
  if (typeof file.name === "string" && AUDIO_EXTENSIONS_REGEX.test(file.name)) return true;
  return false;
}

export function needsCompression(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return file.size > IMAGE_SIZE_LIMIT;
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return file.size > PDF_SIZE_LIMIT;
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

export async function prepareEditorAttachment(file: File): Promise<File> {
  if (file.type.startsWith("image/")) {
    const optimized = await optimizeImageForFastLoad(file);
    if (!needsCompression(optimized)) return optimized;
    return compressImageUntilFits(optimized);
  }
  if (isAudioFile(file)) {
    if (!needsCompression(file)) return file;
    const compressed = await compressAudioUntilFits(file);
    if (compressed.size > AUDIO_SIZE_LIMIT) {
      throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
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
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
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
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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

async function resampleAudioToMono48k(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const sampleRate = 48000;
  const length = Math.max(1, Math.ceil(audioBuffer.duration * sampleRate));
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  if (OfflineCtx) {
    try {
      const offlineCtx = new OfflineCtx(1, length, sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      const rendered = await offlineCtx.startRendering();
      return rendered.getChannelData(0);
    } catch {}
  }

  const numChannels = audioBuffer.numberOfChannels;
  const channelData = new Float32Array(length);
  const origRate = audioBuffer.sampleRate;
  const step = origRate / sampleRate;
  const origChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    origChannels.push(audioBuffer.getChannelData(c));
  }
  const origLen = origChannels[0]?.length || 0;

  for (let i = 0; i < length; i++) {
    const srcIdx = i * step;
    const s0 = Math.min(origLen - 1, Math.max(0, Math.floor(srcIdx)));
    const s1 = Math.min(origLen - 1, s0 + 1);
    const frac = Math.max(0, Math.min(1, srcIdx - s0));
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      const ch = origChannels[c];
      sum += (ch[s0] || 0) * (1 - frac) + (ch[s1] || 0) * frac;
    }
    const val = sum / Math.max(1, numChannels);
    channelData[i] = Number.isFinite(val) ? Math.max(-1, Math.min(1, val)) : 0;
  }

  return channelData;
}

async function encodeAudioBufferToOpus(audioBuffer: AudioBuffer, targetBitrate: number): Promise<Blob> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
    throw new Error("O navegador não suporta codificação de áudio.");
  }

  const sampleRate = 48000;
  const numberOfChannels = 1;
  const channelData = await resampleAudioToMono48k(audioBuffer);

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

  const frameSize = 960;
  for (let offset = 0; offset < channelData.length; offset += frameSize) {
    if (encoderError) throw encoderError;
    const remaining = channelData.length - offset;
    const currentSize = Math.min(frameSize, remaining);
    const frame = new Float32Array(frameSize);
    frame.set(channelData.subarray(offset, offset + currentSize));
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frameSize,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: frame,
    });
    encoder.encode(audioData);
    audioData.close();

    if (encoder.encodeQueueSize > 25) {
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (encoderError) return reject(encoderError);
          if (encoder.encodeQueueSize <= 10) return resolve();
          setTimeout(check, 10);
        };
        check();
      });
    }
  }

  if (encoderError) throw encoderError;
  await encoder.flush();
  encoder.close();

  for (let i = 0; i < packets.length; i++) {
    totalGranule += BigInt(frameSize);
    const isLast = i === packets.length - 1;
    pages.push(makeOggPage(isLast ? 4 : 0, totalGranule, serial, seq++, [packets[i]]));
  }

  return new Blob(pages as BlobPart[], { type: "audio/ogg; codecs=opus" });
}

export async function compressAudioUntilFits(blob: Blob): Promise<Blob> {
  if (blob.size <= AUDIO_SIZE_LIMIT) return blob;

  if (typeof window === "undefined") {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
  }

  if (blob.size > 80 * 1024 * 1024) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
  }

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!OfflineCtx && !AudioCtx) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
  }

  let audioBuffer: AudioBuffer | null = null;
  const arrayBuffer = await blob.arrayBuffer();

  if (OfflineCtx) {
    try {
      const offCtx = new OfflineCtx(1, 48000, 48000);
      audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const promise = offCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        if (promise && typeof promise.then === "function") {
          promise.then(resolve).catch(reject);
        }
      });
    } catch {}
  }

  if (!audioBuffer && AudioCtx) {
    try {
      const actx = new AudioCtx();
      try {
        audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const promise = actx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
          if (promise && typeof promise.then === "function") {
            promise.then(resolve).catch(reject);
          }
        });
      } finally {
        void actx.close().catch(() => undefined);
      }
    } catch {}
  }

  if (!audioBuffer) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
  }

  const duration = Math.max(1, audioBuffer.duration);
  const maxPossibleDuration = (AUDIO_SIZE_LIMIT * 8) / 6000;
  if (duration > maxPossibleDuration) {
    throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
  }

  let targetBitrate = Math.max(
    8000,
    Math.min(36000, Math.floor(((AUDIO_SIZE_LIMIT * 0.76) * 8) / duration))
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

  throw new Error("Arquivo muito grande para ser comprimido. Limite de 3 MB.");
}
