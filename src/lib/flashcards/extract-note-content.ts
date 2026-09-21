import type { AppBlock, Page } from "@/types/models";
import { blocksToPlainText } from "@/components/editor/serializer";

export const EXTRACTION_LIMITS = {
  maxPdfDocuments: 10,
  maxPdfPages: 300,
  maxPdfChars: 240_000,
  maxImages: 20,
  maxInlineBytes: 14 * 1024 * 1024,
  maxSingleInlineBytes: 6 * 1024 * 1024,
  pdfTextRichThreshold: 800,
} as const;

export interface ExtractedImageAttachment {
  name: string;
  url: string;
  caption?: string;
  base64?: string;
  mimeType?: string;
}

export interface ExtractedPdfDocument {
  name: string;
  url: string;
  storagePath?: string;
  base64?: string;
  mimeType?: string;
  text?: string;
  pageCount?: number;
  truncated?: boolean;
}

export type PendingMediaKind = "audio" | "video";

export interface ExtractedPendingMedia {
  blockId: string;
  url: string;
  storagePath?: string;
  name: string;
  kind: PendingMediaKind;
}

export interface ExtractedTranscript {
  name: string;
  text: string;
}

export interface ExtractedNoteMediaSummary {
  title: string;
  textContent: string;
  ocrText: string;
  tablesContent: string[];
  audioTranscripts: ExtractedTranscript[];
  videoTranscripts: ExtractedTranscript[];
  pdfTexts: { name: string; text: string }[];
  pdfDocuments: ExtractedPdfDocument[];
  images: ExtractedImageAttachment[];
  pendingMedia: ExtractedPendingMedia[];
  detectedPdfsCount: number;
  detectedImagesCount: number;
  detectedMediaCount: number;
  detectedTablesCount: number;
  skippedInlineCount: number;
}

function walkBlocks(blocks: AppBlock[], visit: (block: AppBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.children?.length) {
      walkBlocks(block.children, visit);
    }
  }
}

async function fetchBlobWithProxy(url: string): Promise<Blob | null> {
  if (!url || typeof url !== "string") return null;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {}

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
    const resProxy = await fetch(proxyUrl);
    if (resProxy.ok) return await resProxy.blob();
  } catch {}

  return null;
}

function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) {
        resolve({ base64: "", mimeType: blob.type || "application/octet-stream" });
        return;
      }
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex !== -1 ? result.slice(commaIndex + 1) : result;
      resolve({ base64, mimeType: blob.type || "application/octet-stream" });
    };
    reader.onerror = () =>
      resolve({ base64: "", mimeType: blob.type || "application/octet-stream" });
    reader.readAsDataURL(blob);
  });
}

async function extractTextFromPdfBlob(
  blob: Blob,
  fileName: string
): Promise<{ name: string; text: string; pageCount: number; truncated: boolean } | null> {
  if (typeof window === "undefined") return null;
  try {
    const buf = await blob.arrayBuffer();
    const pdfjs = await import("pdfjs-dist");
    let loading: ReturnType<typeof pdfjs.getDocument>;
    try {
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      }
      loading = pdfjs.getDocument({ data: new Uint8Array(buf) });
    } catch {
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = "";
      }
      loading = pdfjs.getDocument({ data: new Uint8Array(buf) });
    }

    const pdfDoc = await loading.promise;
    const totalPages = pdfDoc.numPages || 1;
    const pageLimit = Math.min(totalPages, EXTRACTION_LIMITS.maxPdfPages);
    const pagesText: string[] = [];
    let charCount = 0;
    let truncated = totalPages > pageLimit;

    for (let i = 1; i <= pageLimit; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item) => (item && typeof item === "object" && "str" in item ? String(item.str) : ""))
        .filter(Boolean);

      if (pageStrings.length) {
        const pageBody = `[${fileName} | p.${i}/${totalPages}]\n${pageStrings.join(" ")}`;
        charCount += pageBody.length;
        if (charCount > EXTRACTION_LIMITS.maxPdfChars) {
          truncated = true;
          break;
        }
        pagesText.push(pageBody);
      }
    }

    if (!pagesText.length) return null;
    return {
      name: fileName,
      text: pagesText.join("\n\n"),
      pageCount: totalPages,
      truncated,
    };
  } catch {
    return null;
  }
}

function isPdfResource(
  mimeType?: string,
  fileName?: string,
  url?: string,
  storagePath?: string
): boolean {
  if (typeof mimeType === "string" && mimeType.toLowerCase().includes("pdf")) return true;
  if (typeof fileName === "string" && /\.pdf($|\?)/i.test(fileName)) return true;
  if (typeof url === "string" && /\.pdf($|\?|#)/i.test(url)) return true;
  if (typeof storagePath === "string" && /\.pdf($|\?)/i.test(storagePath)) return true;
  return false;
}

export async function resolveMediaUrl(url?: string, storagePath?: string): Promise<string> {
  const cleanUrl = typeof url === "string" ? url.trim() : "";
  const cleanPath = typeof storagePath === "string" ? storagePath.trim() : "";

  if (cleanUrl && !cleanUrl.startsWith("gs://")) {
    return cleanUrl;
  }

  const targetPath = cleanPath || (cleanUrl.startsWith("gs://") ? cleanUrl : "");
  if (targetPath && typeof window !== "undefined") {
    try {
      const { getFirebaseStorage } = await import("@/lib/firebase/client");
      const { ref, getDownloadURL } = await import("firebase/storage");
      const storage = getFirebaseStorage();
      const storageRef = ref(storage, targetPath);
      return await getDownloadURL(storageRef);
    } catch {}
  }
  return cleanUrl;
}

function approximateBytes(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

export interface ExtractNoteContentOptions {
  /**
   * Quando `false`, os PDFs e imagens sao apenas inventariados (nome, url e
   * contagem) sem baixar nem converter os binarios. Use para o resumo exibido
   * ao abrir o modal; a geracao com IA precisa dos anexos completos.
   */
  includeAttachments?: boolean;
}

export async function extractComprehensiveNoteContent(
  page: Page,
  options?: ExtractNoteContentOptions
): Promise<ExtractedNoteMediaSummary> {
  const includeAttachments = options?.includeAttachments !== false;
  let blocks = page.blocks || [];
  if ((!blocks || blocks.length === 0) && page.blocksJson) {
    try {
      const parsed = JSON.parse(page.blocksJson);
      if (Array.isArray(parsed)) blocks = parsed;
    } catch {}
  }

  const textContent = blocksToPlainText(blocks) || page.plainText || "";
  const ocrText = (page.extractedOCRText || "").trim();
  const tablesContent: string[] = [];
  const audioTranscripts: ExtractedTranscript[] = [];
  const videoTranscripts: ExtractedTranscript[] = [];
  const rawPdfs: { blockId: string; name: string; url: string; storagePath?: string }[] = [];
  const rawImages: { name: string; url: string; storagePath?: string; caption?: string }[] = [];
  const pendingMedia: ExtractedPendingMedia[] = [];

  let detectedAudioCount = 0;
  let detectedVideoCount = 0;

  if (page.transcriptText?.trim()) {
    audioTranscripts.push({ name: page.title || "", text: page.transcriptText.trim() });
  }

  walkBlocks(blocks, (block) => {
    const loose = block as AppBlock & Record<string, unknown>;
    const attrs = (loose.attrs as Record<string, unknown>) || {};
    const blockType = String(block.type || "");

    const mediaUrl = String(
      block.media?.url || block.props?.url || loose.url || attrs.url || loose.src || attrs.src || ""
    );
    const looseProps = (block.props || {}) as Record<string, unknown>;
    const mediaStoragePath =
      block.media?.storagePath ||
      (looseProps.storagePath as string | undefined) ||
      (loose.storagePath as string | undefined) ||
      (attrs.storagePath as string | undefined) ||
      undefined;
    const mediaName = String(
      block.media?.name ||
        block.props?.title ||
        loose.name ||
        attrs.name ||
        loose.title ||
        ""
    );
    const mimeType = String(
      block.media?.mimeType || loose.mimeType || attrs.mimeType || ""
    );

    if (block.type === "table" && block.props?.tableRows?.length) {
      const rows = block.props.tableRows.map((row) =>
        row.cells.map((cell) => cell.spans.map((s) => s.text).join("").trim()).join(" | ")
      );
      const filled = rows.filter((row) => row.replace(/[|\s]/g, "").length > 0);
      if (filled.length) {
        const label = block.props?.title ? `${block.props.title}\n` : "";
        tablesContent.push(`${label}${filled.join("\n")}`);
      }
    }

    const mediaTypeAttr = String(attrs.mediaType || loose.mediaType || "");
    const isGenericMedia = blockType === "mediaBlock" || blockType === "media";

    const isAudio =
      blockType === "audio" ||
      (isGenericMedia && mediaTypeAttr === "audio") ||
      mimeType.startsWith("audio/") ||
      /\.(webm|ogg|oga|mp3|m4a|wav|aac|flac)($|\?)/i.test(mediaName) ||
      /\.(webm|ogg|oga|mp3|m4a|wav|aac|flac)($|\?)/i.test(mediaUrl);

    const isVideo =
      blockType === "video" ||
      (isGenericMedia && mediaTypeAttr === "video") ||
      mimeType.startsWith("video/") ||
      /\.(mp4|mov|mkv|avi|m4v)($|\?)/i.test(mediaName) ||
      /\.(mp4|mov|mkv|avi|m4v)($|\?)/i.test(mediaUrl);

    if (isAudio || isVideo) {
      const kind: PendingMediaKind = isVideo ? "video" : "audio";
      if (kind === "video") detectedVideoCount += 1;
      else detectedAudioCount += 1;

      const transcript = String(
        block.media?.transcript || loose.transcript || attrs.transcript || ""
      ).trim();
      const summary = String(
        block.media?.transcriptSummary ||
          loose.transcriptSummary ||
          attrs.transcriptSummary ||
          ""
      ).trim();

      const label = mediaName || "";
      const merged = summary && transcript ? `${transcript}\n\n${summary}` : transcript || summary;

      if (merged) {
        const bucket = kind === "video" ? videoTranscripts : audioTranscripts;
        bucket.push({ name: label, text: merged });
      } else if (mediaUrl || mediaStoragePath) {
        pendingMedia.push({
          blockId: block.id,
          url: mediaUrl,
          storagePath: mediaStoragePath,
          name: label,
          kind,
        });
      }
      return;
    }

    const isPdf =
      blockType === "pdf" ||
      (isGenericMedia && mediaTypeAttr === "pdf") ||
      isPdfResource(mimeType, mediaName, mediaUrl, mediaStoragePath);

    if (isPdf && (mediaUrl || mediaStoragePath)) {
      rawPdfs.push({
        blockId: block.id,
        name: mediaName || "PDF",
        url: mediaUrl,
        storagePath: mediaStoragePath,
      });
      return;
    }

    const isImage =
      blockType === "image" ||
      (isGenericMedia && mediaTypeAttr === "image") ||
      mimeType.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|bmp|avif|heic)($|\?)/i.test(mediaName) ||
      /\.(jpe?g|png|gif|webp|bmp|avif|heic)($|\?)/i.test(mediaUrl);

    if (isImage && (mediaUrl || mediaStoragePath)) {
      rawImages.push({
        name: mediaName || "",
        url: mediaUrl,
        storagePath: mediaStoragePath,
        caption: block.media?.caption?.map((c) => c.text).join(" ").trim() || undefined,
      });
    }
  });

  let inlineBudget = EXTRACTION_LIMITS.maxInlineBytes;
  let skippedInlineCount = 0;

  const pdfTexts: { name: string; text: string }[] = [];
  const pdfDocuments: ExtractedPdfDocument[] = [];

  for (const pdf of rawPdfs.slice(0, EXTRACTION_LIMITS.maxPdfDocuments)) {
    if (!includeAttachments) {
      pdfDocuments.push({ name: pdf.name, url: pdf.url, storagePath: pdf.storagePath });
      continue;
    }
    const effectiveUrl = await resolveMediaUrl(pdf.url, pdf.storagePath);
    let base64: string | undefined;
    let mimeType: string | undefined;
    let extractedText: string | undefined;
    let pageCount: number | undefined;
    let truncated = false;

    if (effectiveUrl) {
      const blob = await fetchBlobWithProxy(effectiveUrl);
      if (blob) {
        const textResult = await extractTextFromPdfBlob(blob, pdf.name);
        if (textResult?.text) {
          extractedText = textResult.text;
          pageCount = textResult.pageCount;
          truncated = textResult.truncated;
          pdfTexts.push({ name: textResult.name, text: textResult.text });
        }

        const textIsRich =
          (extractedText?.length ?? 0) >= EXTRACTION_LIMITS.pdfTextRichThreshold;

        if (!textIsRich) {
          const converted = await blobToBase64(blob);
          const size = approximateBytes(converted.base64);
          if (
            converted.base64 &&
            size <= EXTRACTION_LIMITS.maxSingleInlineBytes &&
            size <= inlineBudget
          ) {
            base64 = converted.base64;
            mimeType = "application/pdf";
            inlineBudget -= size;
          } else if (converted.base64) {
            skippedInlineCount += 1;
          }
        }
      }
    }

    pdfDocuments.push({
      name: pdf.name,
      url: effectiveUrl || pdf.url,
      storagePath: pdf.storagePath,
      base64,
      mimeType,
      text: extractedText,
      pageCount,
      truncated,
    });
  }

  const images: ExtractedImageAttachment[] = [];
  for (const img of rawImages.slice(0, EXTRACTION_LIMITS.maxImages)) {
    if (!includeAttachments) {
      images.push({ name: img.name, url: img.url, caption: img.caption });
      continue;
    }
    const effectiveUrl = await resolveMediaUrl(img.url, img.storagePath);
    let base64: string | undefined;
    let mimeType: string | undefined;

    if (effectiveUrl) {
      const blob = await fetchBlobWithProxy(effectiveUrl);
      if (blob) {
        const converted = await blobToBase64(blob);
        const size = approximateBytes(converted.base64);
        if (
          converted.base64 &&
          size <= EXTRACTION_LIMITS.maxSingleInlineBytes &&
          size <= inlineBudget
        ) {
          base64 = converted.base64;
          mimeType = converted.mimeType;
          inlineBudget -= size;
        } else if (converted.base64) {
          skippedInlineCount += 1;
        }
      }
    }

    images.push({
      name: img.name,
      url: effectiveUrl || img.url,
      caption: img.caption,
      base64,
      mimeType,
    });
  }

  const resolvedPendingMedia: ExtractedPendingMedia[] = [];
  for (const item of pendingMedia) {
    let effectiveUrl = item.url;
    if (includeAttachments && !effectiveUrl && item.storagePath) {
      effectiveUrl = await resolveMediaUrl(item.url, item.storagePath);
    }
    resolvedPendingMedia.push({
      ...item,
      url: effectiveUrl,
    });
  }

  return {
    title: page.title || "",
    textContent,
    ocrText,
    tablesContent,
    audioTranscripts,
    videoTranscripts,
    pdfTexts,
    pdfDocuments,
    images,
    pendingMedia: resolvedPendingMedia,
    detectedPdfsCount: rawPdfs.length,
    detectedImagesCount: rawImages.length,
    detectedMediaCount: detectedAudioCount + detectedVideoCount,
    detectedTablesCount: tablesContent.length,
    skippedInlineCount,
  };
}
