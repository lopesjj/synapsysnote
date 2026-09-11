"use client";

import { useCallback, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { AudioLines, Download, ExternalLink, FileText, GripVertical, Loader2 } from "lucide-react";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { useImageLightboxStore } from "@/lib/store/image-lightbox-store";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";

function isPdf(mimeType: unknown, name: unknown) {
  if (typeof mimeType === "string" && mimeType.includes("pdf")) return true;
  return typeof name === "string" && /\.pdf($|\?)/i.test(name);
}

function formatMediaDisplayName(
  rawName: unknown,
  mediaType: unknown,
  t: (key: TranslationKey) => string
): string {
  if (typeof rawName !== "string" || !rawName.trim()) {
    return mediaType === "audio" ? `${t("voice_note")}.webm` : t("attachment");
  }

  const trimmed = rawName.trim();
  const voiceNoteRegex =
    /^(?:nota[-_\s]de[-_\s]voz|voice[-_\s]note|note[-_\s]vocale|nota[-_\s]vocale|sprachnotiz|голосовая[-_\s]заметка|音声ノート|语音笔记)([-_\s].*?)?(\.[a-z0-9]+)?$/i;

  const match = trimmed.match(voiceNoteRegex);
  if (match) {
    const suffix = match[1] || "";
    const ext = match[2] || ".webm";
    return `${t("voice_note")}${suffix}${ext}`;
  }

  if (mediaType === "audio") {
    const timestampIdRegex = /^\d{10,14}(?:-[\w-]+)?\.(webm|ogg|mp3|m4a|wav)$/i;
    const timeMatch = trimmed.match(timestampIdRegex);
    if (timeMatch) {
      const ext = timeMatch[1] || "webm";
      return `${t("voice_note")}.${ext}`;
    }
  }

  return trimmed;
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

  const touchStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (e.touches.length === 1) {
      touchStartRef.current = {
        time: Date.now(),
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLImageElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const now = Date.now();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const distX = Math.abs(touch.clientX - start.x);
    const distY = Math.abs(touch.clientY - start.y);

    if (distX < 15 && distY < 15) {
      if (now - lastTapRef.current < 350) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        onDoubleClick?.();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    }
  };

  const handlePointerDownImage = (e: React.PointerEvent<HTMLImageElement>) => {
    e.stopPropagation();
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onDoubleClick?.();
  };

  return (
    <div
      ref={boxRef}
      contentEditable={false}
      className={cn(
        "group/image relative mx-auto max-w-full select-none",
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
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDownImage}
        className="h-auto max-h-[min(80vh,880px)] w-full cursor-zoom-in rounded-[var(--radius-md)] object-contain [-webkit-user-drag:none] select-none touch-manipulation"
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

function MediaView({ node, updateAttributes, editor, selected, getPos }: NodeViewProps) {
  const { t } = useTranslation();
  const {
    mediaType,
    url,
    name,
    mimeType,
    sizeBytes,
    durationSeconds,
    pending,
    displayWidth,
    displayHeight,
    tempId,
  } = node.attrs as Record<string, string | number | boolean | null>;

  const selectNode = (e: React.MouseEvent) => {
    if (!editor.isEditable) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, audio, input, video")) return;
    if (typeof getPos === "function") {
      const pos = getPos();
      if (typeof pos === "number") {
        editor.commands.setNodeSelection(pos);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!editor.isEditable) return;
    if (typeof getPos === "function") {
      const pos = getPos();
      if (typeof pos === "number") {
        const selection = NodeSelection.create(editor.state.doc, pos);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
        const slice = editor.state.selection.content();
        editor.view.dragging = { slice, move: true };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
        }
      }
    }
  };

  const pdf = isPdf(mimeType, name);
  const displayName = formatMediaDisplayName(name, mediaType, t);
  const visualOnly = mediaType === "image" || pdf;
  const isPending = Boolean(
    pending &&
      (Boolean(tempId) || (typeof url === "string" && url.startsWith("blob:")) || !url)
  );

  const handleOpenLightbox = () => {
    editor.commands.blur();
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
    <NodeViewWrapper className="my-3 overflow-visible" data-media contentEditable={false}>
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
          name={displayName || "PDF"}
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
        <div
          onClick={selectNode}
          className={cn(
            "overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] transition-shadow",
            selected && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
          )}
        >
          <div className="flex items-center gap-2 sm:gap-3 px-3 py-2.5">
            {editor.isEditable ? (
              <div
                draggable="true"
                data-drag-handle
                onDragStart={handleDragStart}
                className="cursor-grab active:cursor-grabbing p-0.5 text-faint transition hover:text-ink"
                title={t("drag_block")}
              >
                <GripVertical className="size-3.5" />
              </div>
            ) : null}
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--accent-soft)] text-[var(--accent)]">
              {mediaType === "audio" ? <AudioLines className="size-4" /> : <FileText className="size-4" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">{displayName}</p>
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

            {isPending ? (
              <Badge tone="accent">
                <Loader2 className="size-3 animate-spin" />
                {t("loading")}
              </Badge>
            ) : null}

            {url ? (
              <a
                href={url as string}
                download={displayName}
                className="rounded p-1.5 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                aria-label={t("download")}
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
