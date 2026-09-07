import "server-only";

import { randomUUID } from "node:crypto";
import type { PropertyDef, PropertyType, RichTextSpan } from "@/types/models";
import { notionRichTextToSpans } from "./block-converter";


const NOTION_COLORS: Record<string, string> = {
  default: "#6B7280",
  gray: "#6B7280",
  brown: "#92400E",
  orange: "#EA580C",
  yellow: "#CA8A04",
  green: "#10B981",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  pink: "#EC4899",
  red: "#EF4444",
};

const TYPE_MAP: Record<string, PropertyType> = {
  title: "title",
  rich_text: "text",
  number: "number",
  select: "select",
  status: "select",
  multi_select: "multi_select",
  date: "date",
  checkbox: "checkbox",
  url: "url",
  email: "email",
  phone_number: "phone",
  people: "person",
  files: "files",
  relation: "relation",
  created_time: "created_time",
  last_edited_time: "last_edited_time",
};

interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  select?: { options: { id: string; name: string; color: string }[] };
  status?: { options: { id: string; name: string; color: string }[] };
  multi_select?: { options: { id: string; name: string; color: string }[] };
}

export function mapDatabaseSchema(
  properties: Record<string, NotionPropertySchema>
): PropertyDef[] {
  const entries = Object.entries(properties);
  const defs: PropertyDef[] = entries.map(([name, schema], index) => {
    const type = TYPE_MAP[schema.type] ?? "text";
    const optionSource = schema.select ?? schema.status ?? schema.multi_select;
    return {
      id: `p_${schema.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || randomUUID().slice(0, 8)}`,
      name,
      type,
      order: index,
      width: type === "title" ? 320 : type === "number" || type === "checkbox" ? 120 : 170,
      notionPropertyId: schema.id,
      ...(optionSource
        ? {
            options: optionSource.options.map((option) => ({
              id: option.id,
              name: option.name,
              color: NOTION_COLORS[option.color] ?? NOTION_COLORS.default,
            })),
          }
        : {}),
    };
  });

  if (!defs.some((def) => def.type === "title")) {
    defs.unshift({ id: "p_title", name: "Nome", type: "title", order: -1, width: 320 });
  }

  return defs.sort((a, b) => (a.type === "title" ? -1 : b.type === "title" ? 1 : a.order - b.order));
}

interface NotionPropertyValue {
  id: string;
  type: string;
  [key: string]: unknown;
}

export function mapPropertyValues(
  properties: Record<string, NotionPropertyValue>,
  defs: PropertyDef[]
): Record<string, unknown> {
  const byNotionId = new Map(defs.map((def) => [def.notionPropertyId, def]));
  const values: Record<string, unknown> = {};

  for (const value of Object.values(properties)) {
    const def = byNotionId.get(value.id);
    if (!def) continue;
    values[def.id] = extractValue(value);
  }

  return values;
}

function plain(spans: RichTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

function extractValue(value: NotionPropertyValue): unknown {
  switch (value.type) {
    case "title":
      return plain(notionRichTextToSpans(value.title as never));
    case "rich_text":
      return plain(notionRichTextToSpans(value.rich_text as never));
    case "number":
      return (value.number as number | null) ?? null;
    case "select":
      return (value.select as { name: string } | null)?.name ?? null;
    case "status":
      return (value.status as { name: string } | null)?.name ?? null;
    case "multi_select":
      return (value.multi_select as { name: string }[]).map((option) => option.name);
    case "date": {
      const date = value.date as { start: string; end?: string } | null;
      return date?.start ?? null;
    }
    case "checkbox":
      return Boolean(value.checkbox);
    case "url":
      return (value.url as string | null) ?? null;
    case "email":
      return (value.email as string | null) ?? null;
    case "phone_number":
      return (value.phone_number as string | null) ?? null;
    case "people":
      return (value.people as { name?: string; id: string }[]).map((p) => p.name ?? p.id);
    case "files":
      return (value.files as { name: string; file?: { url: string }; external?: { url: string } }[]).map(
        (file) => ({ name: file.name, url: file.file?.url ?? file.external?.url ?? "" })
      );
    case "created_time":
      return value.created_time as string;
    case "last_edited_time":
      return value.last_edited_time as string;
    case "formula": {
      const formula = value.formula as Record<string, unknown>;
      return (formula.string ?? formula.number ?? formula.boolean ?? formula.date ?? null) as unknown;
    }
    case "rollup": {
      const rollup = value.rollup as { type: string; number?: number; array?: unknown[] };
      return rollup.number ?? (rollup.array ? `${rollup.array.length} itens` : null);
    }
    case "relation":
      return (value.relation as { id: string }[]).map((relation) => relation.id);
    default:
      return null;
  }
}

export function defaultViews(properties: PropertyDef[]) {
  const groupBy = properties.find((property) => property.type === "select");
  return [
    { id: "v_table", name: "Tabela", type: "table" as const },
    {
      id: "v_kanban",
      name: "Kanban",
      type: "kanban" as const,
      groupByPropertyId: groupBy?.id,
    },
  ];
}
