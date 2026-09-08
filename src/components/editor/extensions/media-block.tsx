"use client";

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { toast } from "sonner";
import { AudioLines, Download, ExternalLink, FileText, Loader2, ScanText, Sparkles } from "lucide-react";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { useWorkspace } from "@/lib/data/provider";
import { useImageLightboxStore } from "@/lib/store/image-lightbox-store";

function isPdf(mimeType: unknown, name: unknown) {
  if (typeof mimeType === "string" && mimeType.includes("pdf")) return true;
  return typeof name === "string" && /\.pdf($|\?)/i.test(name);
}

const WIDTH_SNAPS = [25, 33, 50, 67, 75, 100];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapWidth(percent: number) {
  for (const snap of WIDTH_SNAPS) {
    if (Math.abs(percent - snap) <= 3) return snap;
  }
  return percent;
}

function smartDisplayWidth(naturalWidth: number, naturalHeight: number) {
  const ratio = naturalWidth / Math.max(1, naturalHeight);
  if (naturalWidth <= 360 && ratio > 0.7 && ratio < 1.4) return 36;
  if (naturalWidth <= 520) return 50;
  if (ratio > 2.2) return 100;
  return clamp(Math.round((naturalWidth / 880) * 100), 55, 100);
}

function ResizeHandle({
  edge,
  visible,
  onPointerDown,
}: {
  edge: "left" | "right";
  visible: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Redimensionar imagem"
      draggable={false}
      onPointerDown={onPointerDown}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "absolute top-1/2 z-10 flex h-16 w-4 -translate-y-1/2 items-center justify-center",
        "cursor-ew-resize touch-none opacity-0 transition-opacity",
        "group-hover/image:opacity-100 focus-visible:opacity-100",
        edge === "left" ? "left-1" : "right-1",
        visible && "opacity-100"
      )}
    >
      <span className="h-10 w-1.5 rounded-full border border-white/80 bg-[var(--accent)] shadow-[0_1px_4px_rgba(15,44,76,0.35)]" />
    </button>
  );
}

function ResizableImage({
  url,
  width,
  editable,
  selected,
  onWidth,
  onDoubleClick,
}: {
  url: string;
  width: number | null;
  editable: boolean;
  selected: boolean;
  onWidth: (percent: number) => void;
  onDoubleClick?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState<number | null>(null);
  const percent = clamp(width ?? 100, 20, 100);
  const showHandles = editable && (hovered || selected || resizing != null);

  const onNaturalSize = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (width != null) return;
      const image = event.currentTarget;
      onWidth(smartDisplayWidth(image.naturalWidth, image.naturalHeight));
    },
    [onWidth, width]
  );

  const startResize = (edge: "left" | "right") => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    const parent = boxRef.current?.parentElement;
    if (!parent) return;
    const parentWidth = parent.getBoundingClientRect().width;
    const startX = event.clientX;
    const startPercent = percent;

    const move = (pointer: PointerEvent) => {
      const delta = pointer.clientX - startX;
      const signed = edge === "right" ? delta : -delta;
      const next = snapWidth(clamp(Math.round(startPercent + (signed / parentWidth) * 100), 20, 100));
      setResizing(next);
      onWidth(next);
    };
    const up = () => {
      setResizing(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={boxRef}
      className={cn(
        "group/image relative mx-auto max-w-full",
        editable && "cursor-grab active:cursor-grabbing",
        showHandles && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
      )}
      style={{ width: `${percent}%` }}
      data-drag-handle={editable ? "" : undefined}
      draggable={editable}
      role="img"
      aria-label="Imagem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      
      <img
        src={url}
        alt=""
        onLoad={onNaturalSize}
        onDoubleClick={onDoubleClick}
        className="h-auto max-h-[min(80vh,880px)] w-full cursor-zoom-in rounded-[var(--radius-md)] object-contain [-webkit-user-drag:none]"
        draggable={false}
        aria-hidden
        loading="eager"
        decoding="async"
      />
      {editable ? (
        <>
          <ResizeHandle edge="left" visible={showHandles} onPointerDown={startResize("left")} />
          <ResizeHandle edge="right" visible={showHandles} onPointerDown={startResize("right")} />
          <span
            className={cn(
              "pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--text)]/85 px-2 py-0.5 text-[10px] text-[var(--surface)]",
              "opacity-0 transition-opacity group-hover/image:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            {resizing ?? percent}%
          </span>
        </>
      ) : null}
    </div>
  );
}

function ResizablePdf({
  url,
  name,
  width,
  height,
  editable,
  selected,
  onResize,
}: {
  url: string;
  name: string;
  width: number | null;
  height: number | null;
  editable: boolean;
  selected: boolean;
  onResize: (dims: { displayWidth?: number; displayHeight?: number }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState<{ width?: number; height?: number } | null>(null);

  const percent = clamp(width ?? 100, 25, 100);
  const currentHeight = clamp(height ?? 640, 220, 1400);

  const activeWidth = resizing?.width ?? percent;
  const activeHeight = resizing?.height ?? currentHeight;

  const showHandles = editable && (hovered || selected || resizing != null);

  const startResize =
    (mode: "horizontal" | "vertical" | "both", edge?: "left" | "right") =>
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!editable) return;
      event.preventDefault();
      event.stopPropagation();
      const parent = boxRef.current?.parentElement;
      if (!parent) return;
      const parentWidth = parent.getBoundingClientRect().width;
      const startX = event.clientX;
      const startY = event.clientY;
      const startPercent = percent;
      const startHeightPx = currentHeight;

      const move = (pointer: PointerEvent) => {
        const deltaX = pointer.clientX - startX;
        const deltaY = pointer.clientY - startY;

        let nextWidth = startPercent;
        let nextHeight = startHeightPx;

        if (mode === "horizontal" || mode === "both") {
          const signed = edge === "left" ? -deltaX : deltaX;
          nextWidth = snapWidth(clamp(Math.round(startPercent + (signed / parentWidth) * 100), 25, 100));
        }

        if (mode === "vertical" || mode === "both") {
          nextHeight = clamp(Math.round(startHeightPx + deltaY), 220, 1400);
        }

        setResizing({ width: nextWidth, height: nextHeight });
        onResize({
          ...(mode !== "vertical" ? { displayWidth: nextWidth } : {}),
          ...(mode !== "horizontal" ? { displayHeight: nextHeight } : {}),
        });
      };

      const up = () => {
        setResizing(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

  return (
    <div
      ref={boxRef}
      className={cn(
        "group/pdf relative mx-auto my-3 max-w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-xs transition-shadow",
        "max-sm:!w-full",
        showHandles && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
      )}
      style={{ width: `${activeWidth}%` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px]">
        <div className="flex items-center gap-1.5">
          <FileText className="size-4 shrink-0 text-red-500" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            title="Abrir em nova aba / tela cheia"
          >
            <ExternalLink className="size-3.5" />
            <span className="hidden sm:inline">Abrir</span>
          </a>
          <a
            href={url}
            download={name || "documento.pdf"}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            title="Baixar PDF"
          >
            <Download className="size-3.5" />
          </a>
        </div>
      </div>

      
      <div
        className="relative w-full overflow-hidden bg-[var(--surface)]"
        style={{ height: `${activeHeight}px` }}
      >
        <object
          data={`${url}#toolbar=1&navpanes=0`}
          type="application/pdf"
          className="h-full w-full"
          aria-label={name || "PDF"}
        >
          
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            title={name || "PDF"}
            className="h-full w-full border-0"
          />
        </object>
      </div>

      
      {editable ? (
        <>
          
          <button
            type="button"
            aria-label="Redimensionar largura à esquerda"
            draggable={false}
            onPointerDown={startResize("horizontal", "left")}
            className={cn(
              "absolute left-1 top-1/2 z-10 hidden sm:flex h-16 w-4 -translate-y-1/2 items-center justify-center",
              "cursor-ew-resize touch-none opacity-0 transition-opacity",
              "group-hover/pdf:opacity-100 focus-visible:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            <span className="h-10 w-1.5 rounded-full border border-white/80 bg-[var(--accent)] shadow-[0_1px_4px_rgba(15,44,76,0.35)]" />
          </button>

          
          <button
            type="button"
            aria-label="Redimensionar largura à direita"
            draggable={false}
            onPointerDown={startResize("horizontal", "right")}
            className={cn(
              "absolute right-1 top-1/2 z-10 hidden sm:flex h-16 w-4 -translate-y-1/2 items-center justify-center",
              "cursor-ew-resize touch-none opacity-0 transition-opacity",
              "group-hover/pdf:opacity-100 focus-visible:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            <span className="h-10 w-1.5 rounded-full border border-white/80 bg-[var(--accent)] shadow-[0_1px_4px_rgba(15,44,76,0.35)]" />
          </button>

          
          <button
            type="button"
            aria-label="Redimensionar altura vertical"
            draggable={false}
            onPointerDown={startResize("vertical")}
            className={cn(
              "absolute bottom-1 left-1/2 z-10 flex h-4 w-16 -translate-x-1/2 items-center justify-center",
              "cursor-ns-resize touch-none opacity-0 transition-opacity",
              "group-hover/pdf:opacity-100 focus-visible:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            <span className="h-1.5 w-10 rounded-full border border-white/80 bg-[var(--accent)] shadow-[0_1px_4px_rgba(15,44,76,0.35)]" />
          </button>

          
          <button
            type="button"
            aria-label="Redimensionar largura e altura"
            draggable={false}
            onPointerDown={startResize("both", "right")}
            className={cn(
              "absolute bottom-1 right-1 z-10 flex size-5 items-center justify-center",
              "cursor-nwse-resize touch-none opacity-0 transition-opacity",
              "group-hover/pdf:opacity-100 focus-visible:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            <span className="size-2.5 rounded-full border border-white/80 bg-[var(--accent)] shadow-[0_1px_4px_rgba(15,44,76,0.35)]" />
          </button>

          
          <span
            className={cn(
              "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--text)]/85 px-2.5 py-0.5 text-[10px] text-[var(--surface)]",
              "opacity-0 transition-opacity group-hover/pdf:opacity-100",
              showHandles && "opacity-100"
            )}
          >
            {activeWidth}% × {activeHeight}px
          </span>
        </>
      ) : null}
    </div>
  );
}

function MediaView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const {
    mediaType,
    url,
    storagePath,
    name,
    mimeType,
    sizeBytes,
    durationSeconds,
    ocrText,
    transcript,
    transcriptSummary,
    pending,
    displayWidth,
    displayHeight,
  } = node.attrs as Record<string, string | number | boolean | null>;
  const [showText, setShowText] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { adapter } = useWorkspace();
  const params = useParams<{ pageId?: string }>();
  const pageId = params.pageId;

  const extracted = (ocrText as string) || (transcript as string) || "";
  const pdf = isPdf(mimeType, name);
  const visualOnly = mediaType === "image" || pdf;
  const canTranscribe =
    mediaType === "audio" && Boolean(storagePath) && Boolean(pageId) && !extracted;

  const retryTranscription = async () => {
    if (!pageId || !storagePath || retrying) return;
    setRetrying(true);
    updateAttributes({ pending: true });
    try {
      await adapter.retryMediaProcessing(pageId, String(storagePath));
    } catch (error) {
      updateAttributes({ pending: false });
      toast.error(error instanceof Error ? error.message : "Não foi possível transcrever o áudio.");
    } finally {
      setRetrying(false);
    }
  };

  const handleOpenLightbox = () => {
    const images: { url: string; name?: string }[] = [];
    editor.state.doc.descendants((docNode) => {
      if (
        docNode.type.name === "mediaBlock" &&
        docNode.attrs.mediaType === "image" &&
        docNode.attrs.url
      ) {
        images.push({
          url: String(docNode.attrs.url),
          name: docNode.attrs.name ? String(docNode.attrs.name) : undefined,
        });
      }
    });
    const currentUrl = String(url);
    const idx = images.findIndex((img) => img.url === currentUrl);
    useImageLightboxStore.getState().openLightbox(
      images.length ? images : [{ url: currentUrl, name: name ? String(name) : undefined }],
      idx >= 0 ? idx : 0
    );
  };

  return (
    <NodeViewWrapper className="my-3 overflow-visible" data-media>
      {mediaType === "image" && url ? (
        <ResizableImage
          url={url as string}
          width={typeof displayWidth === "number" ? displayWidth : null}
          editable={editor.isEditable}
          selected={selected}
          onWidth={(percent) => updateAttributes({ displayWidth: percent })}
          onDoubleClick={handleOpenLightbox}
        />
      ) : null}

      {pdf && url ? (
        <ResizablePdf
          url={url as string}
          name={(name as string) || "PDF"}
          width={typeof displayWidth === "number" ? displayWidth : null}
          height={typeof displayHeight === "number" ? displayHeight : null}
          editable={editor.isEditable}
          selected={selected}
          onResize={(dims) => updateAttributes(dims)}
        />
      ) : null}

      {mediaType === "video" && url ? (
        <video src={url as string} controls className="max-h-[440px] w-full rounded-[var(--radius-md)]" />
      ) : null}

      {visualOnly ? null : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--accent-soft)] text-[var(--accent)]">
              {mediaType === "audio" ? <AudioLines className="size-4" /> : <FileText className="size-4" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">{(name as string) || "Anexo"}</p>
              <p className="text-[11px] text-muted">
                {[
                  mimeType as string,
                  sizeBytes ? formatBytes(Number(sizeBytes)) : null,
                  durationSeconds ? formatDuration(Number(durationSeconds)) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {pending || retrying ? (
              <button
                type="button"
                onClick={() => void retryTranscription()}
                disabled={retrying || !canTranscribe}
                className="rounded-full"
                title="Tentar transcrever de novo"
              >
                <Badge tone="accent">
                  <Loader2 className="size-3 animate-spin" />
                  processando
                </Badge>
              </button>
            ) : extracted ? (
              <button
                type="button"
                onClick={() => setShowText((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted transition hover:text-ink"
              >
                <ScanText className="size-3" />
                {mediaType === "audio" ? "transcrição" : "texto OCR"}
              </button>
            ) : canTranscribe ? (
              <button
                type="button"
                onClick={() => void retryTranscription()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted transition hover:text-ink"
              >
                <ScanText className="size-3" />
                Transcrever
              </button>
            ) : null}

            {url ? (
              <a
                href={url as string}
                download={(name as string) ?? true}
                className="rounded p-1.5 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                aria-label="Baixar"
              >
                <Download className="size-3.5" />
              </a>
            ) : null}
          </div>

          {mediaType === "audio" && url ? (
            <div className="px-3 pb-3">
              <audio src={url as string} controls className="w-full" />
            </div>
          ) : null}

          {showText && extracted ? (
            <div className="space-y-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              {transcriptSummary ? (
                <p className="flex items-start gap-2 text-[12px] text-ink">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
                  <span>{transcriptSummary as string}</span>
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">{extracted}</p>
            </div>
          ) : null}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const MediaBlock = Node.create({
  name: "mediaBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      mediaType: { default: "file" },
      url: { default: "" },
      storagePath: { default: null },
      name: { default: "" },
      mimeType: { default: "" },
      sizeBytes: { default: null },
      durationSeconds: { default: null },
      ocrText: { default: null },
      transcript: { default: null },
      transcriptSummary: { default: null },
      pending: { default: false },
      displayWidth: { default: null },
      displayHeight: { default: null },
      tempId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="media"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "media" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaView);
  },
});
