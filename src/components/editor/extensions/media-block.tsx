"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  GripVertical,
  Hand,
  Languages,
  Loader2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/menu";
import { useImageLightboxStore } from "@/lib/store/image-lightbox-store";
import { useLibrasStore } from "@/lib/store/libras-store";
import { transcribeAudioSource } from "@/lib/accessibility/audio-transcriber";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { AUDIO_SIZE_LIMIT, compressAudioUntilFits, isAudioFile } from "@/lib/media/compress-attachment";

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
        alt="Imagem da nota"
        onLoad={onNaturalSize}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDownImage}
        className="h-auto max-h-[min(80vh,880px)] w-full cursor-zoom-in rounded-[var(--radius-md)] object-contain [-webkit-user-drag:none] select-none touch-manipulation"
        draggable={false}
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted">
            <p>Não foi possível exibir a prévia do PDF diretamente.</p>
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-ink hover:bg-[var(--surface-hover)]"
              >
                <ExternalLink className="size-3.5" />
                Abrir PDF
              </a>
              <a
                href={url}
                download={name || "documento.pdf"}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-ink hover:bg-[var(--surface-hover)]"
              >
                <Download className="size-3.5" />
                Baixar PDF
              </a>
            </div>
          </div>
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
  const { t, language } = useTranslation();
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
    storagePath,
    transcript,
    transcriptLanguage,
    transcriptCollapsed,
  } = node.attrs as Record<string, string | number | boolean | null>;

  const [isCompressing, setIsCompressing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Number(durationSeconds) || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLibrasLoading, setIsLibrasLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [ephemeralTranscript, setEphemeralTranscript] = useState<string>("");
  const [selectedTranscribeLang, setSelectedTranscribeLang] = useState<string | null>(() => {
    if (typeof transcriptLanguage === "string" && transcriptLanguage) {
      return transcriptLanguage;
    }
    if (typeof window !== "undefined") {
      return localStorage.getItem("synapsys_transcribe_language");
    }
    return null;
  });
  const [isTranscriptCollapsed, setIsTranscriptCollapsed] = useState<boolean>(() => {
    return Boolean(transcriptCollapsed);
  });
  const syncedUrlRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioProxyTriedRef = useRef(false);

  useEffect(() => {
    if (typeof transcriptCollapsed === "boolean") {
      setIsTranscriptCollapsed(transcriptCollapsed);
    }
  }, [transcriptCollapsed]);

  useEffect(() => {
    if (typeof transcriptLanguage === "string" && transcriptLanguage) {
      setSelectedTranscribeLang(transcriptLanguage);
    }
  }, [transcriptLanguage]);

  useEffect(() => {
    if (typeof transcript === "string" && transcript) {
      setEphemeralTranscript("");
    }
  }, [transcript]);

  const effectiveTranscribeLang = selectedTranscribeLang || language || "pt";

  const handleToggleTranscriptCollapsed = (collapsed: boolean) => {
    setIsTranscriptCollapsed(collapsed);
    persistMediaAttributes({
      transcriptCollapsed: collapsed,
    });
  };

  const handleSelectTranscribeLang = (code: string | null) => {
    setSelectedTranscribeLang(code);
    if (typeof window !== "undefined") {
      if (code) {
        localStorage.setItem("synapsys_transcribe_language", code);
      } else {
        localStorage.removeItem("synapsys_transcribe_language");
      }
    }
    persistMediaAttributes({
      transcriptLanguage: code || "",
    });
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    setVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      if (clamped > 0 && isMuted) {
        audioRef.current.muted = false;
        setIsMuted(false);
      } else if (clamped === 0 && !isMuted) {
        audioRef.current.muted = true;
        setIsMuted(true);
      }
    }
  };

  const persistMediaAttributes = useCallback(
    (attributes: Record<string, unknown>) => {
      updateAttributes(attributes);
      if (typeof getPos === "function") {
        const pos = getPos();
        if (typeof pos === "number" && editor && !editor.isDestroyed) {
          const currentNode = editor.state.doc.nodeAt(pos);
          const currentAttrs = currentNode ? currentNode.attrs : node.attrs;
          let hasDiff = false;
          for (const key of Object.keys(attributes)) {
            if (currentAttrs[key] !== attributes[key]) {
              hasDiff = true;
              break;
            }
          }
          if (!hasDiff) return;
          const { tr } = editor.state;
          tr.setNodeMarkup(pos, undefined, { ...currentAttrs, ...attributes });
          editor.view.dispatch(tr);
        }
      }
    },
    [editor, getPos, node.attrs, updateAttributes]
  );

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
  const isAudio =
    mediaType === "audio" ||
    isAudioFile({ name: name ? String(name) : undefined, type: mimeType ? String(mimeType) : undefined });
  const displayName = formatMediaDisplayName(name, isAudio ? "audio" : mediaType, t);
  const audioTranscript = isAudio ? (ephemeralTranscript || (typeof transcript === "string" ? transcript : "")) : "";
  const visualOnly = mediaType === "image" || pdf;
  const isPending = Boolean(
    pending ||
      tempId ||
      (typeof url === "string" && url.startsWith("blob:")) ||
      !url
  );
  const isBusy = isPending || isCompressing;

  const handleDirectDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url) return;
    try {
      const fileUrl = String(url);
      if (fileUrl.startsWith("blob:")) {
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      let res: Response | null = null;
      try {
        res = await fetch(fileUrl);
      } catch {
        const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
        res = await fetch(proxyUrl);
      }
      if (res && res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } else {
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = displayName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      window.open(String(url), "_blank");
    }
  };

  useEffect(() => {
    if (isBusy && isPlaying) {
      setIsPlaying(false);
    }
  }, [isBusy, isPlaying]);

  useEffect(() => {
    if (!url || typeof url !== "string") return;
    if (syncedUrlRef.current === url && sizeBytes) return;
    syncedUrlRef.current = url;
    let active = true;

    const syncMediaSize = async () => {
      try {
        if (url.startsWith("blob:")) {
          const res = await fetch(url);
          const blob = await res.blob();
          if (!active) return;

          if (mediaType === "audio" && blob.size > AUDIO_SIZE_LIMIT) {
            setIsCompressing(true);
            try {
              const compressed = await compressAudioUntilFits(blob);
              if (compressed.size < blob.size && active) {
                const newUrl = URL.createObjectURL(compressed);
                persistMediaAttributes({
                  url: newUrl,
                  sizeBytes: compressed.size,
                  mimeType: compressed.type || "audio/ogg",
                });
                return;
              }
            } finally {
              if (active) setIsCompressing(false);
            }
          }

          if (blob.size > 0 && blob.size !== sizeBytes && active) {
            persistMediaAttributes({
              sizeBytes: blob.size,
              mimeType: blob.type || mimeType,
            });
          }
        } else if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
          if (mediaType === "audio" && sizeBytes && Number(sizeBytes) > AUDIO_SIZE_LIMIT) {
            setIsCompressing(true);
            let blob: Blob | null = null;
            try {
              const res = await fetch(url);
              if (res.ok) blob = await res.blob();
            } catch {
              try {
                const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
                const res = await fetch(proxyUrl);
                if (res.ok) blob = await res.blob();
              } catch {}
            }
            if (!active || !blob) {
              if (active) setIsCompressing(false);
              return;
            }
            if (blob.size > AUDIO_SIZE_LIMIT) {
              try {
                const compressed = await compressAudioUntilFits(blob);
                if (compressed.size < blob.size && active) {
                  const storage = (editor.storage as unknown as Record<string, unknown>)?.mediaBlock as
                    | {
                        adapter?: {
                          uploadAudioNote?: (
                            pageId: string,
                            blob: Blob,
                            dur: number
                          ) => Promise<{ url: string; storagePath?: string }>;
                          deleteMedia?: (paths: string[], pageId?: string) => Promise<void>;
                        };
                        pageId?: string;
                      }
                    | undefined;

                  if (storage?.adapter?.uploadAudioNote && storage.pageId) {
                    try {
                      const uploaded = await storage.adapter.uploadAudioNote(
                        storage.pageId,
                        compressed,
                        Number(durationSeconds) || 0
                      );
                      if (
                        storagePath &&
                        uploaded.storagePath &&
                        storagePath !== uploaded.storagePath &&
                        storage.adapter.deleteMedia
                      ) {
                        void storage.adapter.deleteMedia([String(storagePath)], storage.pageId);
                      }
                      if (active) {
                        persistMediaAttributes({
                          url: uploaded.url,
                          storagePath: uploaded.storagePath ?? storagePath,
                          sizeBytes: compressed.size,
                          mimeType: compressed.type || "audio/ogg",
                        });
                      }
                    } catch {
                      if (active) {
                        persistMediaAttributes({
                          sizeBytes: compressed.size,
                          mimeType: compressed.type || "audio/ogg",
                        });
                      }
                    }
                  } else if (active) {
                    persistMediaAttributes({
                      sizeBytes: compressed.size,
                      mimeType: compressed.type || "audio/ogg",
                    });
                  }
                  return;
                }
              } finally {
                if (active) setIsCompressing(false);
              }
            } else if (blob.size !== sizeBytes && active) {
              persistMediaAttributes({
                sizeBytes: blob.size,
                mimeType: blob.type || mimeType,
              });
              if (active) setIsCompressing(false);
              return;
            }
            if (active) setIsCompressing(false);
          }

          const headRes = await fetch(url, { method: "HEAD" });
          const len = headRes.headers.get("content-length");
          const type = headRes.headers.get("content-type");
          if (len) {
            const num = parseInt(len, 10);
            if (num > 0 && num !== sizeBytes && active) {
              persistMediaAttributes({
                sizeBytes: num,
                mimeType: type || mimeType,
              });
            }
          }
        }
      } catch {
        if (active) setIsCompressing(false);
      }
    };

    void syncMediaSize();
    return () => {
      active = false;
    };
  }, [url, sizeBytes, mimeType, mediaType, durationSeconds, storagePath, persistMediaAttributes, editor]);

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
    <NodeViewWrapper
      className="my-3 overflow-visible"
      data-media={isAudio ? "audio" : (mediaType as string)}
      data-media-type={isAudio ? "audio" : (mediaType as string)}
      data-audio-block={isAudio ? "true" : undefined}
      data-transcript={audioTranscript}
      contentEditable={false}
    >
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
          contentEditable={false}
          data-media-type={isAudio ? "audio" : (mediaType as string)}
          data-audio-block={isAudio ? "true" : undefined}
          data-transcript={audioTranscript}
          data-audio-name={displayName}
          aria-label={isAudio ? t("audio_file") : displayName}
          className={cn(
            "select-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] transition-shadow",
            selected && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
          )}
        >
          <div
            onClick={selectNode}
            className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 cursor-default"
          >
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
              {isAudio ? <AudioLines className="size-4" /> : <FileText className="size-4" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">{displayName}</p>
              <p className="text-[11px] text-muted">
                {isCompressing
                  ? t("compressing_audio")
                  : [
                      isAudio ? null : (mimeType as string),
                      sizeBytes ? formatBytes(Number(sizeBytes)) : null,
                      durationSeconds ? formatDuration(Number(durationSeconds)) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>

            {isCompressing ? (
              <Badge tone="accent">
                <Loader2 className="size-3 animate-spin" />
                {t("compressing")}
              </Badge>
            ) : isPending ? (
              <Badge tone="accent">
                <Loader2 className="size-3 animate-spin" />
                {t("loading")}
              </Badge>
            ) : null}

            {url && !isBusy ? (
              <button
                type="button"
                onClick={handleDirectDownload}
                className="rounded p-1.5 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink cursor-pointer"
                aria-label={t("download")}
                title={t("download")}
              >
                <Download className="size-3.5" />
              </button>
            ) : null}
          </div>

          {(isAudio || mediaType === "audio") && url ? (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="space-y-2.5 px-3 pb-3 select-none touch-manipulation"
            >
              <div className="relative select-none">
                <audio
                  ref={audioRef}
                  src={isBusy ? undefined : (url as string)}
                  preload={isBusy ? "none" : "metadata"}
                  playsInline
                  className="hidden"
                  aria-hidden="true"
                  onPlay={() => {
                    if (isBusy) return;
                    setIsPlaying(true);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                  onTimeUpdate={() => {
                    if (audioRef.current) {
                      setCurrentTime(audioRef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
                      setDuration(audioRef.current.duration);
                    }
                  }}
                  onDurationChange={() => {
                    if (audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
                      setDuration(audioRef.current.duration);
                    }
                  }}
                  onError={() => {
                    if (!audioRef.current || !url || typeof url !== "string" || audioProxyTriedRef.current) return;
                    if (url.startsWith("blob:") || url.startsWith("/")) return;
                    audioProxyTriedRef.current = true;
                    audioRef.current.src = `/api/media/proxy?url=${encodeURIComponent(url)}`;
                    audioRef.current.load();
                  }}
                />
                <div
                  className={cn(
                    "flex flex-nowrap items-center gap-1.5 sm:gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 sm:px-3 py-2 text-ink shadow-2xs transition-opacity overflow-hidden",
                    isBusy && "pointer-events-none opacity-40 cursor-not-allowed"
                  )}
                >
                  <button
                    type="button"
                    disabled={isBusy}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                      if (!audioRef.current || isBusy) return;
                      if (isPlaying) {
                        audioRef.current.pause();
                      } else {
                        audioProxyTriedRef.current = false;
                        if (audioRef.current.readyState === 0) {
                          audioRef.current.load();
                        }
                        const p = audioRef.current.play();
                        if (p && typeof p.catch === "function") {
                          p.catch(() => {});
                        }
                      }
                    }}
                    className="touch-manipulation flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xs transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label={isPlaying ? t("pause") : t("play")}
                    title={isPlaying ? t("pause") : t("play")}
                  >
                    {isPlaying ? (
                      <Pause className="size-4 fill-current" />
                    ) : (
                      <Play className="size-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <span className="shrink-0 font-mono text-[10.5px] sm:text-[11px] text-muted select-none tabular-nums min-w-[64px] sm:min-w-[76px]">
                    {formatDuration(currentTime)} / {formatDuration(duration || Number(durationSeconds) || 0)}
                  </span>

                  <div className="relative flex flex-1 items-center min-w-[45px] sm:min-w-[100px]">
                    <input
                      type="range"
                      inputMode="none"
                      min={0}
                      max={duration || Number(durationSeconds) || 100}
                      step={0.1}
                      value={currentTime}
                      readOnly={false}
                      disabled={isBusy || !(duration || Number(durationSeconds))}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== e.currentTarget) {
                          document.activeElement.blur();
                        }
                      }}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCurrentTime(val);
                        if (audioRef.current) {
                          audioRef.current.currentTime = val;
                        }
                      }}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)] transition touch-manipulation disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={displayName}
                    />
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 ml-auto sm:ml-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={isBusy}
                          className="touch-manipulation flex size-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink active:scale-95 disabled:opacity-40"
                          aria-label={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
                          title={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
                        >
                          {isMuted || volume === 0 ? (
                            <VolumeX className="size-4" />
                          ) : volume <= 0.5 ? (
                            <Volume1 className="size-4" />
                          ) : (
                            <Volume2 className="size-4" />
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="center" side="top" sideOffset={8} className="w-48 p-2.5 shadow-lg bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] font-medium text-ink">
                          <span className="text-muted">Volume</span>
                          <span className="font-mono text-[11px] tabular-nums font-semibold text-[var(--accent)]">
                            {Math.round((isMuted ? 0 : volume) * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (audioRef.current) {
                                const next = !isMuted;
                                audioRef.current.muted = next;
                                setIsMuted(next);
                              }
                            }}
                            className="text-muted hover:text-ink transition p-0.5 rounded touch-manipulation cursor-pointer"
                            title={isMuted ? t("unmute") : t("mute")}
                          >
                            {isMuted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                          </button>
                          <input
                            type="range"
                            inputMode="none"
                            min={0}
                            max={1}
                            step={0.05}
                            value={isMuted ? 0 : volume}
                            onTouchStart={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              handleVolumeChange(Number(e.target.value));
                            }}
                            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)] transition touch-manipulation"
                            aria-label="Volume"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[var(--border)]/60 text-[10px] text-muted font-medium">
                          <button
                            type="button"
                            onClick={() => handleVolumeChange(volume - 0.1)}
                            className="px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)] hover:text-ink transition touch-manipulation cursor-pointer"
                          >
                            -10%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVolumeChange(1)}
                            className="px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)] hover:text-ink transition touch-manipulation cursor-pointer"
                          >
                            100%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVolumeChange(volume + 0.1)}
                            className="px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)] hover:text-ink transition touch-manipulation cursor-pointer"
                          >
                            +10%
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <Menu>
                      <MenuTrigger asChild>
                        <button
                          type="button"
                          disabled={isBusy}
                          className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink active:scale-95 disabled:opacity-40"
                          aria-label={t("playback_speed")}
                          title={t("playback_speed")}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </MenuTrigger>
                      <MenuContent align="end" className="w-48">
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted">
                          <Gauge className="size-3.5 text-[var(--accent)]" />
                          <span>{t("playback_speed")}</span>
                        </div>
                        <MenuSeparator />
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                          <MenuItem
                            key={speed}
                            onSelect={() => {
                              setPlaybackRate(speed);
                              if (audioRef.current) {
                                audioRef.current.playbackRate = speed;
                              }
                            }}
                            className="flex items-center justify-between"
                          >
                            <span>
                              {speed === 1
                                ? `${t("speed_normal")} (1x)`
                                : `${speed.toString().replace(".", ",")}x`}
                            </span>
                            {playbackRate === speed ? (
                              <Check className="size-3.5 text-[var(--accent)]" />
                            ) : null}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  </div>
                </div>
                {isBusy ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--surface-2)]/80 backdrop-blur-[1px] text-[12px] font-medium text-muted cursor-not-allowed border border-dashed border-[var(--border)]">
                    <Loader2 className="size-3.5 animate-spin mr-2 text-[var(--accent)]" />
                    <span>{isCompressing ? t("compressing_audio") : t("loading")}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    disabled={isBusy || isLibrasLoading || isTranscribing}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      let transcriptText = audioTranscript;
                      let quotaErr = false;

                      if (!transcriptText && url && typeof url === "string") {
                        setIsLibrasLoading(true);
                        setTranscribeProgress(0);
                        try {
                          let opened = false;
                          transcriptText = await transcribeAudioSource(
                            url,
                            null,
                            (partialText, percent, isInitialReady) => {
                              setEphemeralTranscript(partialText);
                              setTranscribeProgress(percent);
                              if (isInitialReady && !opened && partialText) {
                                opened = true;
                                setIsLibrasLoading(false);
                                useLibrasStore.getState().openWithText(partialText, {
                                  title: displayName || t("audio_file"),
                                  audioUrl: String(url),
                                });
                              } else if (opened && partialText) {
                                useLibrasStore.getState().updateText(partialText);
                              }
                            },
                            effectiveTranscribeLang
                          );
                          if (!opened && transcriptText) {
                            useLibrasStore.getState().openWithText(transcriptText, {
                              title: displayName || t("audio_file"),
                              audioUrl: String(url),
                            });
                          }
                        } catch (err) {
                          if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
                            quotaErr = true;
                            toast.error(t("transcription_quota_exceeded"));
                          }
                        } finally {
                          setIsLibrasLoading(false);
                        }
                      } else if (transcriptText) {
                        useLibrasStore.getState().openWithText(transcriptText, {
                          title: displayName || t("audio_file"),
                          audioUrl: String(url),
                        });
                        return;
                      }

                      if (!transcriptText && !quotaErr) {
                        toast.error(t("no_speech_detected_libras"));
                      }
                    }}
                    className="touch-manipulation inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-medium text-ink shadow-2xs transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label={isLibrasLoading ? t("preparing_libras") : t("see_in_libras")}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                    }}
                  >
                    {isLibrasLoading ? (
                      <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
                    ) : (
                      <Hand className="size-3.5 text-[var(--accent)]" />
                    )}
                    <span>{isLibrasLoading ? t("preparing_libras") : t("see_in_libras")}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || isTranscribing || isLibrasLoading}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                    }}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                      if (!url || typeof url !== "string") return;
                      setIsTranscribing(true);
                      setTranscribeProgress(0);
                      try {
                        const transcriptText = await transcribeAudioSource(
                          url,
                          null,
                          (partialText, percent) => {
                            setEphemeralTranscript(partialText);
                            setTranscribeProgress(percent);
                          },
                          effectiveTranscribeLang
                        );
                        if (transcriptText) {
                          setEphemeralTranscript(transcriptText);
                          setIsTranscriptCollapsed(false);
                          persistMediaAttributes({
                            transcript: transcriptText,
                            transcriptLanguage: effectiveTranscribeLang,
                            transcriptCollapsed: false,
                          });
                          toast.success(t("audio_transcribed_success"));
                        } else {
                          toast.error(t("no_speech_detected"));
                        }
                      } catch (err) {
                        if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
                          toast.error(t("transcription_quota_exceeded"));
                        } else {
                          toast.error(t("audio_transcribe_error"));
                        }
                      } finally {
                        setIsTranscribing(false);
                        setTranscribeProgress(0);
                      }
                    }}
                    className="touch-manipulation inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-medium text-ink shadow-2xs transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    title={audioTranscript ? t("transcribe_again_title") : t("transcribing_speech_with_ai")}
                  >
                    {isTranscribing ? (
                      <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" />
                    ) : (
                      <Sparkles className="size-3.5 text-[var(--accent)]" />
                    )}
                    <span className="inline-flex items-center gap-1">
                      {isTranscribing ? (
                        <>
                          <span>{t("transcribing_progress")}</span>
                          <span dir="ltr" className="inline-block tabular-nums">
                            ({transcribeProgress}%)
                          </span>
                          <span>...</span>
                        </>
                      ) : audioTranscript ? (
                        t("retranscribe_speech")
                      ) : (
                        t("transcribe_speech")
                      )}
                    </span>
                  </button>

                  <Menu modal={false}>
                    <MenuTrigger asChild>
                      <button
                        type="button"
                        disabled={isBusy || isTranscribing || isLibrasLoading}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                        }}
                        className="touch-manipulation inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-medium text-ink shadow-2xs transition hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] active:scale-95 disabled:opacity-40 cursor-pointer"
                        title={t("language")}
                      >
                        <Languages className="size-3.5 text-[var(--accent)]" />
                        <span>
                          {selectedTranscribeLang
                            ? `${SUPPORTED_LANGUAGES.find((l) => l.code === selectedTranscribeLang)?.flag || ""} ${t((`lang_${selectedTranscribeLang}`) as TranslationKey)}`
                            : `${SUPPORTED_LANGUAGES.find((l) => l.code === language)?.flag || "🌐"} ${t((`lang_${language}`) as TranslationKey)}`}
                        </span>
                        <ChevronDown className="size-3 text-muted" />
                      </button>
                    </MenuTrigger>
                    <MenuContent
                      align="start"
                      data-scrollable="true"
                      className="w-56 max-h-60 overflow-y-auto overscroll-contain touch-pan-y p-1"
                      style={{ maxHeight: "240px", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10.5px] font-semibold text-muted uppercase tracking-wider">
                        {t("language")}
                      </div>
                      <MenuItem
                        onSelect={() => handleSelectTranscribeLang(null)}
                        className="flex items-center justify-between cursor-pointer touch-pan-y"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="size-3.5 text-muted" />
                          <span>{t((`lang_${language}`) as TranslationKey)} ({t("language")})</span>
                        </div>
                        {!selectedTranscribeLang ? (
                          <Check className="size-3.5 text-[var(--accent)]" />
                        ) : null}
                      </MenuItem>
                      <MenuSeparator />
                      {SUPPORTED_LANGUAGES.map((langDef) => {
                        const isSelected = selectedTranscribeLang === langDef.code;
                        return (
                          <MenuItem
                            key={langDef.code}
                            onSelect={() => handleSelectTranscribeLang(langDef.code)}
                            className="flex items-center justify-between cursor-pointer touch-pan-y"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{langDef.flag}</span>
                              <span className="text-[12px]">{t((`lang_${langDef.code}`) as TranslationKey)}</span>
                            </div>
                            {isSelected ? (
                              <Check className="size-3.5 text-[var(--accent)]" />
                            ) : null}
                          </MenuItem>
                        );
                      })}
                    </MenuContent>
                  </Menu>
                </div>
              </div>

              {audioTranscript ? (
                isTranscriptCollapsed ? (
                  <div contentEditable={false} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)]/80 bg-[var(--surface)] px-3.5 py-2.5 text-[12.5px] shadow-2xs transition-all">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-3.5 text-[var(--accent)] shrink-0" />
                      <span className="truncate text-muted text-[11px] font-semibold uppercase tracking-wider">
                        {t("speech_transcript_title")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (document.activeElement instanceof HTMLElement) {
                          document.activeElement.blur();
                        }
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (document.activeElement instanceof HTMLElement) {
                          document.activeElement.blur();
                        }
                        handleToggleTranscriptCollapsed(false);
                      }}
                      className="touch-manipulation inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-ink shadow-2xs transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95 cursor-pointer"
                      title={t("open_transcript")}
                    >
                      <ChevronDown className="size-3.5 text-[var(--accent)]" />
                      <span>{t("open")}</span>
                    </button>
                  </div>
                ) : (
                  <div contentEditable={false} className="rounded-xl border border-[var(--border)]/80 bg-[var(--surface)] p-4 text-[13px] sm:text-[13.5px] shadow-2xs transition-all">
                    <div className="flex items-center justify-between gap-1.5 font-semibold text-muted mb-2.5 text-[11px] uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5 text-[var(--accent)]" />
                        {t("speech_transcript_title")}
                        {(isTranscribing || isLibrasLoading) && (
                          <span className="inline-flex items-center gap-1 normal-case font-normal text-[var(--accent)] ml-1">
                            <Loader2 className="size-3 animate-spin" />
                            <span dir="ltr" className="inline-block tabular-nums">
                              ({transcribeProgress}%)
                            </span>
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                          handleToggleTranscriptCollapsed(true);
                        }}
                        className="touch-manipulation inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition normal-case font-normal cursor-pointer"
                        title={t("close_transcript")}
                      >
                        <X className="size-3.5" />
                        <span>{t("close")}</span>
                      </button>
                    </div>
                    <div className="max-h-64 sm:max-h-80 overflow-y-auto pr-2 select-text overscroll-contain" contentEditable={false}>
                      <p className="text-ink leading-relaxed whitespace-pre-wrap font-normal select-text cursor-text" contentEditable={false}>
                        {audioTranscript}
                      </p>
                    </div>
                  </div>
                )
              ) : (isTranscribing || isLibrasLoading) ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/70 p-3 text-[12px] text-muted shadow-2xs">
                  <Loader2 className="size-3.5 animate-spin text-[var(--accent)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11.5px] font-medium text-ink mb-1">
                      <span>{t("transcribing_audio_speech")}</span>
                      <span dir="ltr" className="inline-block text-[var(--accent)] font-semibold tabular-nums">
                        {transcribeProgress}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full"
                        style={{ width: `${Math.max(5, transcribeProgress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
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

  addStorage() {
    return {
      adapter: null as unknown,
      pageId: "",
    };
  },

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
      transcriptLanguage: { default: null },
      transcriptCollapsed: { default: false },
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
