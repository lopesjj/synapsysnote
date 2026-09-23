"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { legalPlaceholders } from "@/lib/legal/entity";
import { LEGAL_DOC_IDS, type LegalDocId } from "@/lib/legal/types";

const PLACEHOLDERS = legalPlaceholders();

/** Troca `{brand}`, `{privacyEmail}`, `{trashDays}`... pelos valores reais. */
export function fillLegal(text: string): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => PLACEHOLDERS[key] ?? match);
}

/** Encaixa elementos React nos `{marcadores}` de uma frase já traduzida. */
export function interpolateNodes(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return <Fragment key={index}>{key && key in nodes ? nodes[key] : part}</Fragment>;
  });
}

export type LegalNavigate = (doc: LegalDocId, section?: string | null) => void;

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

const linkClass =
  "text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:decoration-current";

function parseDocHref(href: string): { doc: LegalDocId; section: string | null } | null {
  const match = href.match(/^doc:([a-z]+)(?:#([\w-]+))?$/);
  if (!match || !(LEGAL_DOC_IDS as readonly string[]).includes(match[1])) return null;
  return { doc: match[1] as LegalDocId, section: match[2] ?? null };
}

function LegalLink({ href, children, onNavigate }: { href: string; children: ReactNode; onNavigate: LegalNavigate }) {
  const target = parseDocHref(href);
  if (target) {
    return (
      <button type="button" onClick={() => onNavigate(target.doc, target.section)} className={linkClass}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <ArrowUpRight aria-hidden className="ms-0.5 inline size-3 -translate-y-px" />
    </a>
  );
}

export function LegalInline({ text, onNavigate }: { text: string; onNavigate: LegalNavigate }) {
  const filled = fillLegal(text);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of filled.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(filled.slice(cursor, index));
    if (match[1]) {
      nodes.push(
        <strong key={index} className="font-medium text-ink">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      nodes.push(
        <LegalLink key={index} href={match[3]} onNavigate={onNavigate}>
          {match[2]}
        </LegalLink>
      );
    } else {
      nodes.push(
        <a key={index} href={`mailto:${match[4]}`} dir="ltr" className={linkClass}>
          {match[4]}
        </a>
      );
    }
    cursor = index + match[0].length;
  }
  if (cursor < filled.length) nodes.push(filled.slice(cursor));
  return <>{nodes}</>;
}
