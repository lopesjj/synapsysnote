"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { AudioLines, Download, FileText, Loader2, ScanText, Sparkles } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

/**
 * One node type covers every binary attachment (image, audio, video, file).
 * It also renders the async enrichment produced by Cloud Functions: OCR text
 * from Cloud Vision and transcript/summary from Gemini.
 */
function MediaView({ node }: NodeViewProps) {
  const {
    mediaType,
    url,
    name,
    mimeType,
    sizeBytes,
    durationSeconds,
    ocrText,
    transcript,
    transcriptSummary,
    pending,
  } = node.attrs as Record<string, string | number | boolean | null>;
  const [showText, setShowText] = useState(false);

  const extracted = (ocrText as string) || (transcript as string) || "";

  return (
    <NodeViewWrapper className="my-3" data-media>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]">
        {mediaType === "image" && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url as string} alt={(name as string) ?? "Anexo"} className="max-h-[440px] w-full object-contain" />
        ) : null}

        {mediaType === "video" && url ? (
          <video src={url as string} controls className="max-h-[440px] w-full" />
        ) : null}

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

          {pending ? (
            <Badge tone="accent">
              <Loader2 className="size-3 animate-spin" />
              processando
            </Badge>
          ) : extracted ? (
            <button
              type="button"
              onClick={() => setShowText((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted transition hover:text-ink"
            >
              <ScanText className="size-3" />
              {mediaType === "audio" ? "transcrição" : "texto OCR"}
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
