export const IMAGE_SIZE_LIMIT = 1 * 1024 * 1024;
export const PDF_SIZE_LIMIT = 3 * 1024 * 1024;
export const ATTACHMENT_SIZE_LIMIT = PDF_SIZE_LIMIT;
const MAX_ROUNDS = 18;
const MIN_EDGE = 320;

export function needsCompression(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return file.size > IMAGE_SIZE_LIMIT;
  }
  if (file.type === "application/pdf") {
    return file.size > PDF_SIZE_LIMIT;
  }
  return false;
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
  if (!needsCompression(file)) return file;
  return compressPdfUntilFits(file);
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
