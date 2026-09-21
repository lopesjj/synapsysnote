import type { AppBlock, Page, RichTextSpan, TableRow } from "@/types/models";
import { formatBytes, formatDuration } from "@/lib/utils";
import { isIconUrl } from "@/lib/icons/workspace-icon";
import { coverPresetById } from "@/lib/covers/presets";
import type { TranslationKey } from "@/lib/i18n/translations";
import katex from "katex";

export interface ExportPdfOptions {
  notebookName?: string;
  authorName?: string;
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onProgress?: (status: string) => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}



function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveImageToDataUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("data:")) return rawUrl;

  try {
    const res = await fetch(rawUrl, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      return await blobToDataUrl(blob);
    }
  } catch {}

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const blob = await res.blob();
      return await blobToDataUrl(blob);
    }
  } catch {}

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
          return;
        }
      } catch {}
      resolve(rawUrl);
    };
    img.onerror = () => resolve(rawUrl);
    img.src = rawUrl;
  });
}

function spansToHtml(spans: RichTextSpan[] | undefined): string {
  if (!spans || spans.length === 0) return "";
  return spans
    .map((span) => {
      if (span.mention) {
        return `<span style="display:inline-block;padding:1px 6px;border-radius:9999px;background:#e0f2fe;color:#0369a1;font-weight:500;font-size:12px;">@${escapeHtml(span.mention.label)}</span>`;
      }
      const rawText = span.text || "";
      let html = rawText.split("\n").map(escapeHtml).join("<br>");
      const a = span.annotations;
      if (a?.bold) html = `<strong>${html}</strong>`;
      if (a?.italic) html = `<em>${html}</em>`;
      if (a?.underline) html = `<u>${html}</u>`;
      if (a?.strikethrough) html = `<s>${html}</s>`;
      if (a?.code) html = `<code style="padding:1px 4px;border-radius:4px;background:#f1f5f9;color:#0f172a;font-family:monospace;font-size:12px;">${html}</code>`;
      if (a?.color) html = `<span style="color:${a.color === "var(--text)" ? "inherit" : a.color};">${html}</span>`;
      if (a?.highlight) {
        const bg = typeof a.highlight === "string" ? a.highlight : "#fef08a";
        html = `<mark style="background-color:${bg};color:inherit;padding:1px 2px;border-radius:2px;">${html}</mark>`;
      }
      if (span.href) {
        html = `<a href="${escapeHtml(span.href)}" style="color:#0284c7;text-decoration:underline;">${html}</a>`;
      }
      return html;
    })
    .join("");
}

function isPdfAttachment(block: AppBlock): boolean {
  const mime = block.media?.mimeType?.toLowerCase() || "";
  const name = block.media?.name?.toLowerCase() || "";
  const url = block.media?.url?.toLowerCase() || "";
  return mime.includes("pdf") || name.endsWith(".pdf") || /\.pdf($|\?)/i.test(url);
}

function isAudioAttachment(block: AppBlock): boolean {
  if (block.type === "audio") return true;
  const mime = block.media?.mimeType?.toLowerCase() || "";
  const name = block.media?.name?.toLowerCase() || "";
  return mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm|aac)($|\?)/i.test(name);
}

function isVideoAttachment(block: AppBlock): boolean {
  if (block.type === "video") return true;
  const mime = block.media?.mimeType?.toLowerCase() || "";
  const name = block.media?.name?.toLowerCase() || "";
  return mime.startsWith("video/") || /\.(mp4|m4v|mov|mkv|avi|3gp|ogv)($|\?)/i.test(name);
}

function renderVideoCard(block: AppBlock): string {
  const media = block.media;
  const name = escapeHtml(media?.name || "Vídeo");
  const duration = media?.durationSeconds ? formatDuration(media.durationSeconds) : null;
  const size = media?.sizeBytes ? formatBytes(media.sizeBytes) : null;
  const mime = media?.mimeType ? escapeHtml(media.mimeType) : "Vídeo";
  const url = media?.url;
  const transcript = media?.transcript?.trim();

  const metaParts = [duration, size, mime].filter(Boolean);

  return `
    <div style="margin:14px 0;border:1px solid #ddd6fe;border-radius:10px;background:#f8fafc;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border-bottom:1px solid #e2e8f0;">
        <tr>
          <td style="width:34px;vertical-align:middle;line-height:0;padding:0 10px 8px 0;">
            <div style="width:34px;height:34px;border-radius:8px;background:#ede9fe;color:#6d28d9;display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            </div>
          </td>
          <td style="vertical-align:middle;text-align:left;padding:0 0 8px 0;">
            <div style="font-weight:600;font-size:13.5px;color:#0f172a;line-height:1.3;">${name}</div>
            <div style="font-size:11px;color:#64748b;line-height:1.3;margin-top:2px;">${metaParts.join(" · ")}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;padding:0 0 8px 10px;">
            <span style="background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:9999px;display:inline-block;">
              Vídeo
            </span>
          </td>
        </tr>
      </table>
      ${
        url
          ? `
        <div style="font-size:11px;">
          <a href="${escapeHtml(url)}" style="color:#6d28d9;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:4px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <span>Abrir vídeo anexado</span>
          </a>
        </div>
      `
          : ""
      }
      ${
        transcript
          ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;">
          <div style="font-size:10.5px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Transcrição</div>
          <div style="font-size:12px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${escapeHtml(transcript)}</div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderAudioCard(block: AppBlock): string {
  const media = block.media;
  const name = escapeHtml(media?.name || "Gravação de Áudio");
  const duration = media?.durationSeconds ? formatDuration(media.durationSeconds) : null;
  const size = media?.sizeBytes ? formatBytes(media.sizeBytes) : null;
  const mime = media?.mimeType ? escapeHtml(media.mimeType) : "Áudio";
  const url = media?.url;

  const metaParts = [duration, size, mime].filter(Boolean);

  return `
    <div style="margin:14px 0;border:1px solid #bfdbfe;border-radius:10px;background:#f8fafc;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border-bottom:1px solid #e2e8f0;">
        <tr>
          <td style="width:34px;vertical-align:middle;line-height:0;padding:0 10px 8px 0;">
            <div style="width:34px;height:34px;border-radius:8px;background:#e0f2fe;color:#0284c7;display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </div>
          </td>
          <td style="vertical-align:middle;text-align:left;padding:0 0 8px 0;">
            <div style="font-weight:600;font-size:13.5px;color:#0f172a;line-height:1.3;">${name}</div>
            <div style="font-size:11px;color:#64748b;line-height:1.3;margin-top:2px;">${metaParts.join(" · ")}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;padding:0 0 8px 10px;">
            <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:600;padding:4px 10px;border-radius:9999px;display:inline-block;">
              Gravação de Áudio
            </span>
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#64748b;font-style:italic;">
        Arquivo de áudio gravado anexado à nota
      </div>
      ${
        url
          ? `
        <div style="margin-top:8px;font-size:11px;">
          <a href="${escapeHtml(url)}" style="color:#0284c7;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:4px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <span>Ouvir gravação de áudio anexada</span>
          </a>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderPdfPageCardHtml(
  _name: string,
  dataUrl: string,
  pageNum: number,
  _totalPages: number,
  _title: string
): string {
  const isSubsequent = pageNum > 1;
  return `
    <div style="${isSubsequent ? "page-break-before:always;break-before:page;" : "margin-top:14px;"}margin-bottom:8px;page-break-inside:avoid;break-inside:avoid;text-align:center;">
      <img src="${escapeHtml(dataUrl)}" crossorigin="anonymous" style="width:100%;max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;" />
    </div>
  `;
}

function renderPdfFallbackCard(block: AppBlock): string {
  const name = escapeHtml(block.media?.name || "Documento PDF");
  const size = block.media?.sizeBytes ? formatBytes(block.media.sizeBytes) : null;
  const url = block.media?.url;
  return `
    <div style="margin:14px 0;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;padding:12px 14px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:36px;vertical-align:middle;line-height:0;padding-right:12px;">
            <div style="width:36px;height:36px;border-radius:8px;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            </div>
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <div style="font-weight:600;font-size:13.5px;color:#0f172a;line-height:1.3;">${name}</div>
            <div style="font-size:11px;color:#64748b;line-height:1.3;margin-top:2px;">${size || "Documento PDF anexo"}</div>
          </td>
          ${url ? `
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;padding-left:10px;">
            <a href="${escapeHtml(url)}" style="font-size:11.5px;color:#0284c7;text-decoration:none;font-weight:600;padding:4px 10px;border-radius:6px;background:#e0f2fe;display:inline-block;">Abrir PDF</a>
          </td>` : ""}
        </tr>
      </table>
    </div>
  `;
}

function renderTableHtml(block: AppBlock): string {
  const rows = (block.props?.tableRows || []) as TableRow[];
  if (!rows || rows.length === 0) return "";
  const hasColHeader = Boolean(block.props?.hasColumnHeader);
  const colWidths = block.props?.colWidths || [];

  let html = `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:12.5px;line-height:1.5;">`;

  if (colWidths.length > 0) {
    html += "<colgroup>";
    for (const w of colWidths) {
      html += `<col style="width:${w}px;" />`;
    }
    html += "</colgroup>";
  }

  html += "<tbody>";
  rows.forEach((row, rowIndex) => {
    const isHeaderRow = hasColHeader && rowIndex === 0;
    const tag = isHeaderRow ? "th" : "td";
    html += `<tr style="${isHeaderRow ? "background:#f1f5f9;font-weight:600;" : rowIndex % 2 === 1 ? "background:#f8fafc;" : ""}">`;

    (row.cells || []).forEach((cell) => {
      const textAlign = cell.horizontalAlign || "left";
      const verticalAlign = cell.verticalAlign || "top";
      const content = spansToHtml(cell.spans);
      html += `<${tag} style="border:1px solid #cbd5e1;padding:6px 10px;text-align:${textAlign};vertical-align:${verticalAlign};">`;
      html += content || "&nbsp;";
      html += `</${tag}>`;
    });

    html += "</tr>";
  });
  html += "</tbody></table>";

  return html;
}

function renderBlockHtml(block: AppBlock, imageMap: Map<string, string>, depth = 0): string {
  if (isVideoAttachment(block)) {
    return renderVideoCard(block);
  }

  if (isAudioAttachment(block)) {
    return renderAudioCard(block);
  }

  const spans = block.richText || [];
  const inline = spansToHtml(spans);

  switch (block.type) {
    case "paragraph": {
      const align = block.props?.textAlign || "left";
      const indent = typeof block.props?.indent === "number" ? block.props.indent : 0;
      const indentFirst = Boolean(block.props?.indentFirst);
      const paddingLeft = indent > 0 ? `${indent * 24}px` : "0";
      const textIndent = indentFirst ? "24px" : "0";
      return `<p style="margin:5px 0;text-align:${align};padding-left:${paddingLeft};text-indent:${textIndent};font-size:13.5px;line-height:1.65;color:#1e293b;">${inline || "&nbsp;"}</p>`;
    }

    case "heading_1": {
      const align = block.props?.textAlign || "left";
      return `<h1 style="margin:18px 0 8px 0;font-size:20px;font-weight:700;color:#0f172a;text-align:${align};line-height:1.3;">${inline}</h1>`;
    }

    case "heading_2": {
      const align = block.props?.textAlign || "left";
      return `<h2 style="margin:14px 0 6px 0;font-size:17px;font-weight:600;color:#0f172a;text-align:${align};line-height:1.35;">${inline}</h2>`;
    }

    case "heading_3": {
      const align = block.props?.textAlign || "left";
      return `<h3 style="margin:12px 0 4px 0;font-size:15px;font-weight:600;color:#1e293b;text-align:${align};line-height:1.4;">${inline}</h3>`;
    }

    case "bulleted_list_item": {
      const bullets = ["•", "○", "▪", "–"];
      const bullet = bullets[Math.min(depth, bullets.length - 1)];
      const marginLeft = 6 + depth * 16;
      const childrenHtml = (block.children || []).map((b) => renderBlockHtml(b, imageMap, depth + 1)).join("");
      return `
        <table style="width:100%;border-collapse:collapse;margin:3px 0 3px ${marginLeft}px;">
          <tr>
            <td style="width:14px;vertical-align:top;padding-top:1px;font-size:14px;line-height:1.6;color:#64748b;">${bullet}</td>
            <td style="vertical-align:top;font-size:13.5px;line-height:1.6;color:#1e293b;">${inline}</td>
          </tr>
        </table>
        ${childrenHtml}
      `;
    }

    case "numbered_list_item": {
      const marginLeft = 6 + depth * 16;
      const childrenHtml = (block.children || []).map((b) => renderBlockHtml(b, imageMap, depth + 1)).join("");
      return `
        <table style="width:100%;border-collapse:collapse;margin:3px 0 3px ${marginLeft}px;">
          <tr>
            <td style="width:14px;vertical-align:top;padding-top:1px;font-size:13px;line-height:1.6;color:#64748b;">•</td>
            <td style="vertical-align:top;font-size:13.5px;line-height:1.6;color:#1e293b;">${inline}</td>
          </tr>
        </table>
        ${childrenHtml}
      `;
    }

    case "todo": {
      const checked = Boolean(block.props?.checked);
      const childrenHtml = (block.children || []).map((b) => renderBlockHtml(b, imageMap, depth + 1)).join("");
      return `
        <table style="width:100%;border-collapse:collapse;margin:3px 0 3px ${2 + depth * 16}px;">
          <tr>
            <td style="width:20px;vertical-align:top;padding-top:3px;line-height:0;">
              <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${checked ? "#0284c7" : "#94a3b8"};border-radius:3px;background:${checked ? "#0284c7" : "transparent"};color:white;font-size:10px;text-align:center;line-height:12px;box-sizing:border-box;">${checked ? "✓" : ""}</span>
            </td>
            <td style="vertical-align:top;font-size:13.5px;line-height:1.6;${checked ? "text-decoration:line-through;color:#94a3b8;" : "color:#1e293b;"};">
              ${inline}
            </td>
          </tr>
        </table>
        ${childrenHtml}
      `;
    }

    case "toggle": {
      const childrenHtml = (block.children || []).map((b) => renderBlockHtml(b, imageMap, 0)).join("");
      return `
        <div style="margin:10px 0;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;background:#fcfcfc;">
          <div style="font-weight:600;font-size:13.5px;color:#0f172a;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:10px;color:#64748b;">▼</span> <span>${inline}</span>
          </div>
          <div style="padding-left:14px;border-left:2px solid #e2e8f0;margin-top:6px;">
            ${childrenHtml}
          </div>
        </div>
      `;
    }

    case "callout": {
      const emoji = block.props?.emoji || "💡";
      const childrenHtml = (block.children || []).map((b) => renderBlockHtml(b, imageMap, 0)).join("");
      return `
        <div style="margin:12px 0;padding:12px 14px;border-radius:8px;background:#f0f9ff;border:1px solid #bae6fd;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:26px;vertical-align:top;line-height:1;font-size:16px;padding-right:8px;">
                ${emoji}
              </td>
              <td style="vertical-align:top;font-size:13px;color:#0369a1;line-height:1.55;">
                ${inline ? `<div>${inline}</div>` : ""}
                ${childrenHtml}
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    case "quote": {
      return `
        <blockquote style="margin:10px 0;padding:6px 14px;border-left:3px solid #0284c7;background:#f8fafc;font-style:italic;color:#334155;font-size:13.5px;line-height:1.6;">
          ${inline}
        </blockquote>
      `;
    }

    case "divider": {
      return `<hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0;" />`;
    }

    case "code": {
      const language = block.props?.language && block.props.language !== "auto" ? block.props.language : "código";
      const codeHtml = spans.some((s) => s.annotations && Object.keys(s.annotations).length > 0)
        ? spans
            .map((span) => {
              const rawText = span.text || "";
              let html = rawText.split("\n").map(escapeHtml).join("<br>");
              const a = span.annotations;
              if (a?.color) html = `<span style="color:${a.color === "var(--text)" ? "#f8fafc" : a.color};">${html}</span>`;
              if (a?.highlight) {
                const bg = typeof a.highlight === "string" ? a.highlight : "#fef08a";
                html = `<mark style="background-color:${bg};color:inherit;padding:1px 2px;border-radius:2px;">${html}</mark>`;
              }
              return html;
            })
            .join("")
        : escapeHtml(spans.map((s) => s.text).join(""));
      return `
        <div style="margin:12px 0;border-radius:8px;background:#0f172a;color:#f8fafc;overflow:hidden;border:1px solid #1e293b;">
          <div style="background:#1e293b;padding:5px 12px;font-size:11px;font-family:monospace;color:#94a3b8;text-transform:uppercase;">
            ${escapeHtml(language)}
          </div>
          <pre style="margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;"><code>${codeHtml}</code></pre>
        </div>
      `;
    }

    case "equation": {
      const expression = block.props?.expression || "";
      let renderedMath = "";
      try {
        renderedMath = katex.renderToString(expression || "\\;", {
          displayMode: true,
          throwOnError: false,
          output: "html",
        });
      } catch {
        renderedMath = escapeHtml(expression);
      }
      return `
        <div style="margin:12px 0;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;">
          ${renderedMath}
        </div>
      `;
    }

    case "table": {
      return renderTableHtml(block);
    }

    case "image": {
      const rawUrl = block.media?.url;
      if (!rawUrl) return "";
      const finalUrl = imageMap.get(rawUrl) || rawUrl;
      const displayWidth = block.media?.displayWidth;
      const widthStyle = displayWidth ? `${displayWidth}%` : "100%";
      return `
        <div style="margin:16px 0;text-align:center;page-break-inside:avoid;break-inside:avoid;">
          <img src="${escapeHtml(finalUrl)}" crossorigin="anonymous" style="max-width:${widthStyle};max-height:440px;border-radius:8px;object-fit:contain;box-shadow:0 1px 4px rgba(0,0,0,0.08);display:inline-block;" />
        </div>
      `;
    }

    case "file": {
      const name = escapeHtml(block.media?.name || "Arquivo");
      const size = block.media?.sizeBytes ? formatBytes(block.media.sizeBytes) : null;
      const url = block.media?.url;
      return `
        <div style="margin:10px 0;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;padding:10px 12px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:24px;vertical-align:middle;line-height:0;padding-right:10px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              </td>
              <td style="vertical-align:middle;text-align:left;">
                <div style="font-weight:500;font-size:13px;color:#0f172a;line-height:1.3;">${name}</div>
                <div style="font-size:11px;color:#64748b;line-height:1.3;margin-top:2px;">${size || "Anexo"}</div>
              </td>
              ${url ? `
              <td style="vertical-align:middle;text-align:right;white-space:nowrap;padding-left:10px;">
                <a href="${escapeHtml(url)}" style="font-size:11px;color:#0284c7;text-decoration:none;font-weight:500;">Baixar</a>
              </td>` : ""}
            </tr>
          </table>
        </div>
      `;
    }

    case "bookmark":
    case "embed": {
      const title = escapeHtml(block.props?.title || block.props?.url || "Link");
      const url = block.props?.url || "#";
      return `
        <div style="margin:10px 0;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
          <a href="${escapeHtml(url)}" style="color:#0284c7;text-decoration:none;font-weight:500;font-size:13px;display:inline-flex;align-items:center;gap:6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <span>${title}</span>
          </a>
        </div>
      `;
    }

    default: {
      return inline ? `<p style="margin:5px 0;font-size:13.5px;line-height:1.65;color:#1e293b;">${inline}</p>` : "";
    }
  }
}

function renderBlockToHtmlItems(
  block: AppBlock,
  imageMap: Map<string, string>,
  pdfPagesMap: Map<string, string[]>,
  noteTitle: string
): string[] {
  if (isPdfAttachment(block)) {
    const key = block.id || block.media?.url || "";
    const pages = pdfPagesMap.get(key) || [];
    if (pages.length > 0) {
      const name = escapeHtml(block.media?.name || "Documento PDF");
      return pages.map((dataUrl, idx) =>
        renderPdfPageCardHtml(name, dataUrl, idx + 1, pages.length, noteTitle)
      );
    }
    return [renderPdfFallbackCard(block)];
  }

  const singleHtml = renderBlockHtml(block, imageMap);
  return singleHtml ? [singleHtml] : [];
}

function renderDocumentHeader(page: Page, options: ExportPdfOptions, imageMap: Map<string, string>): string {
  const title = escapeHtml(page.title || "Sem título");
  const tags = page.tags || [];
  const rawCoverUrl = page.coverUrl;
  const preset = coverPresetById(rawCoverUrl);
  const actualCoverUrl = preset?.imageUrl || (rawCoverUrl && !rawCoverUrl.startsWith("cover:") ? rawCoverUrl : null);
  const coverUrl = actualCoverUrl ? imageMap.get(actualCoverUrl) || actualCoverUrl : null;
  const icon = page.icon;
  const notebook = options.notebookName ? escapeHtml(options.notebookName) : null;
  const author = options.authorName ? escapeHtml(options.authorName) : null;
  const dateStr = new Date(page.updatedAt || Date.now()).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rawIconUrl = icon && isIconUrl(icon) ? icon : null;
  const resolvedIconUrl = rawIconUrl ? imageMap.get(rawIconUrl) || rawIconUrl : null;

  let iconCell = "";
  if (resolvedIconUrl) {
    iconCell = `<td style="width:36px;vertical-align:middle;padding-right:12px;line-height:0;"><img src="${escapeHtml(resolvedIconUrl)}" crossorigin="anonymous" style="width:36px;height:36px;border-radius:8px;object-fit:cover;display:block;" /></td>`;
  } else if (icon) {
    iconCell = `<td style="width:36px;vertical-align:middle;padding-right:12px;line-height:1;text-align:center;"><span style="display:inline-block;font-size:28px;line-height:1;vertical-align:middle;">${escapeHtml(icon)}</span></td>`;
  } else {
    iconCell = `<td style="width:28px;vertical-align:middle;padding-right:10px;line-height:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></td>`;
  }

  return `
    <div style="margin-bottom:20px;">
      ${
        coverUrl
          ? `<div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;"><img src="${escapeHtml(coverUrl)}" crossorigin="anonymous" style="width:100%;height:140px;object-fit:cover;object-position:center ${Math.round((page.coverPosition ?? 0.5) * 100)}%;display:block;" /></div>`
          : ""
      }

      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <tr>
          ${iconCell}
          <td style="vertical-align:middle;text-align:left;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.25;letter-spacing:-0.02em;">
              ${title}
            </h1>
          </td>
        </tr>
      </table>

      <div style="margin-bottom:16px;line-height:1.8;">
        ${
          notebook
            ? `<table style="display:inline-table;vertical-align:middle;border-collapse:separate;border-spacing:0;margin:3px 6px 3px 0;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:6px;padding:0;">
                 <tr>
                   <td style="padding:4px 0 4px 7px;vertical-align:middle;line-height:0;">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                   </td>
                   <td style="padding:4px 8px 4px 5px;vertical-align:middle;white-space:nowrap;font-size:11px;font-weight:600;color:#0f766e;line-height:1;">
                     ${notebook}
                   </td>
                 </tr>
               </table>`
            : ""
        }
        ${tags
          .map(
            (tag) =>
              `<table style="display:inline-table;vertical-align:middle;border-collapse:separate;border-spacing:0;margin:3px 6px 3px 0;background:#eff6ff;border:1px solid #dbeafe;border-radius:6px;padding:0;">
                 <tr>
                   <td style="padding:4px 0 4px 7px;vertical-align:middle;line-height:0;">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>
                   </td>
                   <td style="padding:4px 8px 4px 4px;vertical-align:middle;white-space:nowrap;font-size:11px;font-weight:500;color:#1d4ed8;line-height:1;">
                     ${escapeHtml(tag)}
                   </td>
                 </tr>
               </table>`
          )
          .join("")}
        ${
          author
            ? `<table style="display:inline-table;vertical-align:middle;border-collapse:separate;border-spacing:0;margin:3px 6px 3px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0;">
                 <tr>
                   <td style="padding:4px 0 4px 7px;vertical-align:middle;line-height:0;">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                   </td>
                   <td style="padding:4px 8px 4px 5px;vertical-align:middle;white-space:nowrap;font-size:11px;font-weight:500;color:#475569;line-height:1;">
                     ${author}
                   </td>
                 </tr>
               </table>`
            : ""
        }
        <table style="display:inline-table;vertical-align:middle;border-collapse:separate;border-spacing:0;margin:3px 6px 3px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0;">
          <tr>
            <td style="padding:4px 0 4px 7px;vertical-align:middle;line-height:0;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </td>
            <td style="padding:4px 8px 4px 5px;vertical-align:middle;white-space:nowrap;font-size:11px;font-weight:500;color:#64748b;line-height:1;">
              Atualizado em ${dateStr}
            </td>
          </tr>
        </table>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px 0;" />
    </div>
  `;
}



async function fetchBinary(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch {}

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch {}

  return null;
}

async function renderPdfPagesToDataUrls(bytes: Uint8Array, scale = 2): Promise<string[]> {
  try {
    const pdfjs = await import("pdfjs-dist");
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }

    const loading = pdfjs.getDocument({
      data: bytes.slice(),
    });
    const doc = await loading.promise;
    const dataUrls: string[] = [];

    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          dataUrls.push(canvas.toDataURL("image/jpeg", 0.95));
        }
        page.cleanup();
      }
    } finally {
      await doc.cleanup();
      await loading.destroy();
    }

    return dataUrls;
  } catch (err) {
    console.error("Erro ao rasterizar páginas do PDF:", err);
    return [];
  }
}



function collectImageUrls(page: Page): string[] {
  const urls: string[] = [];
  if (page.coverUrl) {
    const preset = coverPresetById(page.coverUrl);
    if (preset?.imageUrl) {
      urls.push(preset.imageUrl);
    } else if (!page.coverUrl.startsWith("cover:")) {
      urls.push(page.coverUrl);
    }
  }
  if (page.icon && isIconUrl(page.icon)) urls.push(page.icon);

  const walk = (blocks: AppBlock[]) => {
    for (const b of blocks) {
      if (b.type === "image" && b.media?.url) {
        urls.push(b.media.url);
      }
      if (b.children && b.children.length) {
        walk(b.children);
      }
    }
  };

  walk(page.blocks || []);
  return Array.from(new Set(urls.filter(Boolean)));
}

function isEmptyBlock(block: AppBlock): boolean {
  if (block.type === "image" || block.type === "file" || block.type === "audio" || block.type === "video") {
    return !block.media?.url && !block.media?.name;
  }
  if (block.type === "divider") {
    return false;
  }
  if (block.type === "equation") {
    const expr = block.props?.expression || "";
    return expr.replace(/[\s\u00a0\u200B-\u200D\uFEFF]/g, "").length === 0;
  }
  if (block.type === "table") {
    const rows = (block.props?.tableRows || []) as TableRow[];
    if (!rows || rows.length === 0) return true;
    return rows.every((r) =>
      (r.cells || []).every((c) =>
        (c.spans || []).map((s) => s.text || "").join("").replace(/[\s\u00a0\u200B-\u200D\uFEFF]/g, "").length === 0
      )
    );
  }

  const rawText = (block.richText || []).map((s) => s.text || "").join("");
  const cleanText = rawText.replace(/[\s\u00a0\u200B-\u200D\uFEFF]/g, "");

  if (block.type === "callout" || block.type === "toggle") {
    const hasNonEmptyChildren = (block.children || []).some((c) => !isEmptyBlock(c));
    return cleanText.length === 0 && !hasNonEmptyChildren;
  }

  return cleanText.length === 0;
}

export async function exportNoteToPdf(page: Page, options: ExportPdfOptions = {}): Promise<boolean> {
  const t = options.t;
  const onProgress = options.onProgress ?? (() => undefined);
  onProgress(t ? t("pdf_export_loading_attachments") : "Carregando imagens e anexos...");

  const imageUrls = collectImageUrls(page);
  const imageMap = new Map<string, string>();
  if (imageUrls.length > 0) {
    await Promise.all(
      imageUrls.map(async (u) => {
        const dataUrl = await resolveImageToDataUrl(u);
        if (dataUrl) imageMap.set(u, dataUrl);
      })
    );
  }

  const pdfBlocks: AppBlock[] = [];
  const walkPdf = (blks: AppBlock[]) => {
    for (const b of blks) {
      if (isPdfAttachment(b) && b.media?.url) pdfBlocks.push(b);
      if (b.children?.length) walkPdf(b.children);
    }
  };
  walkPdf(page.blocks || []);

  const pdfPagesMap = new Map<string, string[]>();
  if (pdfBlocks.length > 0) {
    onProgress(
      t
        ? t("pdf_export_processing_pdfs", { count: pdfBlocks.length })
        : `Processando PDFs anexos (${pdfBlocks.length})...`
    );
    for (const pb of pdfBlocks) {
      const url = pb.media?.url;
      if (!url) continue;
      const key = pb.id || url;
      const pdfBytes = await fetchBinary(url);
      if (pdfBytes) {
        const pages = await renderPdfPagesToDataUrls(pdfBytes, 2);
        if (pages.length > 0) pdfPagesMap.set(key, pages);
      }
    }
  }

  const rawBlocks = page.blocks || [];
  let lastContentIdx = rawBlocks.length - 1;
  while (
    lastContentIdx >= 0 &&
    (isEmptyBlock(rawBlocks[lastContentIdx]) ||
      (lastContentIdx === rawBlocks.length - 1 && rawBlocks[lastContentIdx].type === "divider"))
  ) {
    lastContentIdx--;
  }
  const blocks = rawBlocks.slice(0, lastContentIdx + 1);

  const safeTitle = escapeHtml(page.title || "Nota");
  const cssEscapedTitle = (page.title || "Nota")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");

  const headerHtml = renderDocumentHeader(page, options, imageMap);
  const bodyHtml = blocks
    .flatMap((b) => renderBlockToHtmlItems(b, imageMap, pdfPagesMap, safeTitle))
    .filter(Boolean)
    .join("\n");

  const katexCssUrl = `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css`;

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="${katexCssUrl}" crossorigin="anonymous">
  <style>
    @page {
      size: A4 portrait;
      margin-top: 10mm !important;
      margin-bottom: 12mm !important;
      margin-left: 8mm !important;
      margin-right: 8mm !important;
      @bottom-left {
        content: "Synapsys Note";
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 8.5px;
        font-weight: 600;
        color: #64748b;
        vertical-align: top;
        border-top: 1px solid #e2e8f0;
        padding-top: 3px;
      }
      @bottom-right {
        content: "${cssEscapedTitle} • Página " counter(page) " de " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 8px;
        color: #94a3b8;
        vertical-align: top;
        border-top: 1px solid #e2e8f0;
        padding-top: 3px;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13.5px;
      color: #0f172a;
      line-height: 1.6;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    img { max-width: 100%; height: auto; display: block; page-break-inside: avoid; break-inside: avoid; }
    svg { display: block; flex-shrink: 0; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    table { border-collapse: collapse; }
    a { color: #0284c7; }
    #print-hint {
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: #0f172a; color: #fff; padding: 12px 18px;
      border-radius: 10px; font-size: 13px; line-height: 1.5;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25); max-width: 280px;
    }
    #print-hint strong { display: block; margin-bottom: 4px; }
    @media print {
      @page {
        size: A4 portrait;
        margin-top: 10mm !important;
        margin-bottom: 12mm !important;
        margin-left: 8mm !important;
        margin-right: 8mm !important;
        @bottom-left {
          content: "Synapsys Note";
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 8.5px;
          font-weight: 600;
          color: #64748b;
          vertical-align: top;
          border-top: 1px solid #e2e8f0;
          padding-top: 3px;
        }
        @bottom-right {
          content: "${cssEscapedTitle} • Página " counter(page) " de " counter(pages);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 8px;
          color: #94a3b8;
          vertical-align: top;
          border-top: 1px solid #e2e8f0;
          padding-top: 3px;
        }
      }
      #print-hint { display: none !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
    }
  </style>
</head>
<body>
  <div id="print-hint">
    <strong>💾 Salvar como PDF</strong>
    No diálogo que abriu, selecione <em>Salvar como PDF</em> e escolha onde salvar.
  </div>
  ${headerHtml}
  ${bodyHtml}
</body>
</html>`;

  onProgress(t ? t("pdf_export_preparing_doc") : "Preparando documento...");

  await new Promise<boolean>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;pointer-events:none;";

    const cleanup = () => {
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
      }, 5000);
    };

    iframe.onload = () => {
      const iDoc = iframe.contentDocument;
      if (!iDoc) {
        cleanup();
        resolve(false);
        return;
      }
      iDoc.open();
      iDoc.write(fullHtml);
      iDoc.close();

      const iWin = iframe.contentWindow;
      if (!iWin) {
        cleanup();
        resolve(false);
        return;
      }

      const afterLoad = () => {
        setTimeout(() => {
          const dialogHint = t
            ? t("pdf_export_dialog_hint")
            : 'No diálogo de impressão, selecione "Salvar como PDF".';
          onProgress(dialogHint);
          let handled = false;
          const finish = () => {
            if (handled) return;
            handled = true;
            cleanup();
            resolve(true);
          };
          iWin.addEventListener("afterprint", finish, { once: true });
          iWin.focus();
          iWin.print();
          setTimeout(finish, 120000);
        }, 700);
      };

      if (iDoc.readyState === "complete") {
        afterLoad();
      } else {
        iWin.addEventListener("load", afterLoad, { once: true });
        setTimeout(afterLoad, 5000);
      }
    };

    document.body.appendChild(iframe);
  }).then(async (iframeOk) => {
    if (!iframeOk) {
      const printWin = window.open("", "_blank", "width=960,height=800,menubar=no,toolbar=no");
      if (!printWin) {
        throw new Error(
          t
            ? t("pdf_export_popup_blocked")
            : "Não foi possível abrir a janela de exportação. Permita popups para este site e tente novamente."
        );
      }
      printWin.document.write(fullHtml);
      printWin.document.close();
      await new Promise<void>((resolve) => {
        if (printWin.document.readyState === "complete") { resolve(); return; }
        printWin.addEventListener("load", () => resolve(), { once: true });
        setTimeout(resolve, 5000);
      });
      await new Promise((r) => setTimeout(r, 600));
      const dialogHint = t
        ? t("pdf_export_dialog_hint")
        : 'No diálogo de impressão, selecione "Salvar como PDF".';
      onProgress(dialogHint);
      printWin.focus();
      printWin.print();
    }
  });

  return true;
}
