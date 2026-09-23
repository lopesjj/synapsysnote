"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Database, ExternalLink, FileText, Link2, PanelTop, Puzzle } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { readPreservedBlock } from "../serializer";

/**
 * Blocos que o editor nao sabe editar (subpagina e base do Notion, link salvo,
 * conteudo incorporado, bloco nao suportado). Antes viravam um paragrafo de
 * texto na primeira edicao e perdiam o destino; aqui o bloco original fica
 * guardado inteiro no atributo e volta igual ao salvar.
 */

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Ids do Notion chegam com e sem hifens conforme a origem. */
function sameNotionId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const clean = (value: string) => value.replace(/-/g, "").toLowerCase();
  return clean(a) === clean(b);
}

function PreservedView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const { livePages, databases } = useWorkspace();
  const block = readPreservedBlock(node.attrs.block);
  const title = block?.props?.title || block?.props?.url || "";

  let href: string | null = null;
  let external = false;
  let Icon = Puzzle;
  let label = t("unsupported_block");

  if (block?.type === "child_page") {
    Icon = FileText;
    label = t("linked_page");
    const target = block.notionBlockId
      ? livePages.find((page) => sameNotionId(page.notionPageId, block.notionBlockId))
      : block.props?.targetId
        ? livePages.find((page) => page.id === block.props?.targetId)
        : undefined;
    if (target) href = `/home/p/${target.id}`;
  } else if (block?.type === "child_database") {
    Icon = Database;
    label = t("linked_database");
    const target = block.notionBlockId
      ? databases.find(
          (database) => !database.deletedAt && sameNotionId(database.notionDatabaseId, block.notionBlockId)
        )
      : undefined;
    if (target) href = `/home/db/${target.id}`;
  } else if (block?.type === "bookmark" || block?.type === "embed") {
    Icon = block.type === "embed" ? PanelTop : Link2;
    label = block.type === "embed" ? t("link_embed") : t("link_bookmark");
    href = safeExternalUrl(block.props?.url);
    external = true;
  }

  const content = (
    <>
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-[0.06em] text-faint">{label}</span>
        {title ? <span className="block truncate text-[13.5px] text-ink">{title}</span> : null}
      </span>
      {href && external ? <ExternalLink className="size-3.5 shrink-0 text-faint" aria-hidden /> : null}
    </>
  );

  const className =
    "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-start no-underline transition";

  return (
    <NodeViewWrapper className="my-2" data-preserved-block contentEditable={false}>
      {href && external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} hover:border-[var(--accent)]`}>
          {content}
        </a>
      ) : href ? (
        <Link href={href} className={`${className} hover:border-[var(--accent)]`}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </NodeViewWrapper>
  );
}

export const PreservedBlock = Node.create({
  name: "preservedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      block: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block"),
        renderHTML: (attributes) => (attributes.block ? { "data-block": attributes.block } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="preserved-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "preserved-block" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PreservedView);
  },
});
