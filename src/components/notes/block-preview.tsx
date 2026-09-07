"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AppBlock, RichTextSpan } from "@/types/models";
import { fromTableRows } from "@/lib/data/table-rows";

/**
 * Read-only renderer for `AppBlock[]`.
 *
 * The dual-pane note list needs to show a note without paying for a ProseMirror
 * instance per selection, so this walks the stored blocks directly. It covers
 * the block types that carry visible content and deliberately stops there:
 * anything else renders as its text, because a preview that silently drops a
 * paragraph is worse than one that renders it plainly.
 */

function Spans({ spans }: { spans?: RichTextSpan[] }) {
  if (!spans?.length) return null;
  return (
    <>
      {spans.map((span, index) => {
        const { annotations } = span;
        const content = (
          <span
            className={cn(
              annotations?.bold && "font-semibold",
              annotations?.italic && "italic",
              annotations?.underline && "underline",
              annotations?.strikethrough && "line-through",
              annotations?.code &&
                "rounded bg-[var(--accent-soft)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--accent)]"
            )}
          >
            {span.text}
          </span>
        );

        if (span.href) {
          return (
            <a
              key={index}
              href={span.href}
              className="text-[var(--accent)] underline underline-offset-2"
            >
              {content}
            </a>
          );
        }
        return <span key={index}>{content}</span>;
      })}
    </>
  );
}

export function BlockPreview({
  blocks,
  className,
  limit = 40,
}: {
  blocks: AppBlock[];
  className?: string;
  /** Caps the render so a very long note cannot stall the preview pane. */
  limit?: number;
}) {
  return (
    <div className={cn("reading-surface space-y-2.5 leading-relaxed text-ink", className)}>
      {blocks.slice(0, limit).map((block) => (
        <BlockNode key={block.id} block={block} />
      ))}
      {blocks.length > limit ? (
        <p className="pt-2 text-[12px] text-faint">
          + {blocks.length - limit} bloco(s). Abra a nota para ver tudo.
        </p>
      ) : null}
    </div>
  );
}

function headingAlign(block: AppBlock): CSSProperties | undefined {
  const align = block.props?.textAlign;
  const indent = block.props?.indent;
  if ((!align || align === "left") && !indent) return undefined;
  return {
    ...(align && align !== "left" ? { textAlign: align } : {}),
    ...(indent ? { paddingLeft: `${indent * 1.25}cm` } : {}),
  };
}

function BlockNode({ block }: { block: AppBlock }) {
  switch (block.type) {
    case "heading_1":
      return (
        <h2 className="pt-2 text-[1.5em] font-semibold tracking-[-0.02em]" style={headingAlign(block)}>
          <Spans spans={block.richText} />
        </h2>
      );
    case "heading_2":
      return (
        <h3 className="pt-1.5 text-[1.25em] font-semibold tracking-[-0.015em]" style={headingAlign(block)}>
          <Spans spans={block.richText} />
        </h3>
      );
    case "heading_3":
      return (
        <h4 className="pt-1 text-[1.1em] font-semibold" style={headingAlign(block)}>
          <Spans spans={block.richText} />
        </h4>
      );

    case "bulleted_list_item":
      return (
        <div className="flex gap-2">
          <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-[var(--text-faint)]" />
          <div className="min-w-0">
            <Spans spans={block.richText} />
            <Children blocks={block.children} />
          </div>
        </div>
      );

    case "numbered_list_item":
      return (
        <div className="flex gap-2">
          <span className="shrink-0 text-faint">•</span>
          <div className="min-w-0">
            <Spans spans={block.richText} />
            <Children blocks={block.children} />
          </div>
        </div>
      );

    case "todo":
      return (
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-[0.3em] flex size-[0.95em] shrink-0 items-center justify-center rounded-[3px] border text-[0.7em] leading-none",
              block.props?.checked
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "border-[var(--border-strong)]"
            )}
          >
            {block.props?.checked ? "✓" : ""}
          </span>
          <div className={cn("min-w-0", block.props?.checked && "text-faint line-through")}>
            <Spans spans={block.richText} />
            <Children blocks={block.children} />
          </div>
        </div>
      );

    case "toggle":
      return (
        <details className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2">
          <summary className="cursor-pointer">
            <Spans spans={block.richText} />
          </summary>
          <Children blocks={block.children} />
        </details>
      );

    case "callout":
      return (
        <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
          <span className="shrink-0">{block.props?.emoji ?? "💡"}</span>
          <div className="min-w-0">
            <Spans spans={block.richText} />
            <Children blocks={block.children} />
          </div>
        </div>
      );

    case "quote":
      return (
        <blockquote className="border-l-2 border-[var(--accent)] pl-3 italic text-muted">
          <Spans spans={block.richText} />
        </blockquote>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 font-mono text-[0.82em] leading-relaxed">
          {block.props?.language ? (
            <span className="mb-1.5 block text-[10px] font-sans font-medium uppercase tracking-[0.08em] text-faint">
              {block.props.language}
            </span>
          ) : null}
          <code>{block.richText?.map((span) => span.text).join("") ?? ""}</code>
        </pre>
      );

    case "equation":
      return (
        <p className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-center font-mono text-[0.9em] text-muted">
          {block.props?.expression}
        </p>
      );

    case "divider":
      return <hr className="border-[var(--border)]" />;

    case "image":
      return block.media?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.media.url}
          alt={block.media.name ?? ""}
          className="h-auto max-h-80 rounded-[var(--radius-md)] border border-[var(--border)] object-contain"
          style={{ width: `${Math.min(100, Math.max(20, block.media.displayWidth ?? 100))}%` }}
          loading="lazy"
        />
      ) : (
        <p className="text-[0.9em] text-faint">🖼️ {block.media?.name ?? "Imagem"}</p>
      );

    case "audio":
      return block.media?.url ? (
        <audio controls src={block.media.url} className="w-full" />
      ) : null;

    case "video":
      return block.media?.url ? (
        <video controls src={block.media.url} className="max-h-64 w-full rounded-[var(--radius-md)]" />
      ) : null;

    case "file":
      if (
        block.media?.url &&
        (block.media.mimeType?.includes("pdf") || /\.pdf($|\?)/i.test(block.media.name ?? ""))
      ) {
        return (
          <iframe
            src={block.media.url}
            title={block.media.name ?? "PDF"}
            className="h-64 w-full rounded-[var(--radius-md)] border border-[var(--border)]"
          />
        );
      }
      return (
        <a
          href={block.media?.url ?? block.props?.url ?? "#"}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-[0.9em] text-muted transition hover:border-[var(--accent)]"
        >
          📎 {block.media?.name ?? block.props?.title ?? block.props?.url ?? "Anexo"}
        </a>
      );

    case "bookmark":
    case "embed":
      return (
        <a
          href={block.media?.url ?? block.props?.url ?? "#"}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-[0.9em] text-muted transition hover:border-[var(--accent)]"
        >
          📎 {block.media?.name ?? block.props?.title ?? block.props?.url ?? "Anexo"}
        </a>
      );

    case "table": {
      const rows = fromTableRows(block.props?.tableRows);
      if (!rows.length) return null;
      const hasHeader = block.props?.hasColumnHeader ?? false;
      const header = hasHeader ? rows[0] : null;
      const body = hasHeader ? rows.slice(1) : rows;
      return (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full border-collapse text-[0.88em]">
            {header ? (
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {header.map((cell, index) => (
                    <th
                      key={index}
                      className="border-b border-[var(--border)] px-2.5 py-1.5 text-left font-medium"
                    >
                      <Spans spans={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[var(--border)] last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2.5 py-1.5 align-top">
                      <Spans spans={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "child_page":
    case "child_database":
      return (
        <p className="text-[0.9em] text-muted">
          📄 {block.props?.title ?? "Subpágina"}
        </p>
      );

    default:
      return block.richText?.length ? (
        <p
          className={cn("text-justify hyphens-auto", block.props?.indentFirst && "[text-indent:1.25cm]")}
          style={{
            ...(block.props?.textAlign && block.props.textAlign !== "justify"
              ? { textAlign: block.props.textAlign }
              : {}),
            ...(block.props?.indent
              ? { paddingLeft: `${block.props.indent * 1.25}cm` }
              : {}),
          }}
        >
          <Spans spans={block.richText} />
        </p>
      ) : null;
  }
}

function Children({ blocks }: { blocks?: AppBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-1.5 space-y-1.5 pl-1">
      {blocks.map((child) => (
        <BlockNode key={child.id} block={child} />
      ))}
    </div>
  );
}
