import type { AppBlock, NotionTreeNode, RichTextSpan } from "@/types/models";

/**
 * Fixture that mirrors the shape returned by `POST /v1/search` + `GET /v1/blocks/{id}/children`
 * for a mid-sized Notion workspace.
 *
 * It powers two things:
 *   1. The credential-free demo (local adapter) — so the Import Wizard, the
 *      progress worker and the converted output can be reviewed before anyone
 *      creates a Notion integration.
 *   2. The Cloud Functions test-suite fixtures (`functions/src/notion/__fixtures__`).
 */

export const NOTION_MOCK_TREE: NotionTreeNode[] = [
  {
    id: "ntn_eng",
    title: "Engenharia",
    type: "page",
    icon: "🛠️",
    lastEditedTime: "2026-08-28T14:12:00.000Z",
    children: [
      {
        id: "ntn_eng_adr",
        title: "Decisões de arquitetura (ADRs)",
        type: "page",
        icon: "📐",
        lastEditedTime: "2026-08-27T09:41:00.000Z",
        children: [
          { id: "ntn_adr_001", title: "ADR-001 — Firestore como fonte da verdade", type: "page", icon: "📄" },
          { id: "ntn_adr_002", title: "ADR-002 — Rehospedar mídia do Notion", type: "page", icon: "📄" },
          { id: "ntn_adr_003", title: "ADR-003 — Busca híbrida com Vertex AI", type: "page", icon: "📄" },
        ],
      },
      {
        id: "ntn_eng_runbook",
        title: "Runbook de incidentes",
        type: "page",
        icon: "🚨",
        lastEditedTime: "2026-08-20T18:03:00.000Z",
        children: [{ id: "ntn_runbook_oncall", title: "Escala de plantão", type: "page", icon: "📟" }],
      },
      {
        id: "ntn_db_bugs",
        title: "Bugs & Incidentes",
        type: "database",
        icon: "🐞",
        lastEditedTime: "2026-08-29T11:22:00.000Z",
        childCount: 24,
      },
    ],
  },
  {
    id: "ntn_product",
    title: "Produto",
    type: "page",
    icon: "🧭",
    lastEditedTime: "2026-08-30T08:15:00.000Z",
    children: [
      {
        id: "ntn_db_roadmap",
        title: "Roadmap 2026",
        type: "database",
        icon: "🗺️",
        lastEditedTime: "2026-08-30T08:15:00.000Z",
        childCount: 18,
      },
      {
        id: "ntn_research",
        title: "Pesquisa com usuários",
        type: "page",
        icon: "🔍",
        children: [
          { id: "ntn_research_camila", title: "Entrevista — Camila (Operações)", type: "page", icon: "🎙️" },
          { id: "ntn_research_diego", title: "Entrevista — Diego (Jurídico)", type: "page", icon: "🎙️" },
          { id: "ntn_research_sintese", title: "Síntese das 12 entrevistas", type: "page", icon: "🧩" },
        ],
      },
      { id: "ntn_prd_editor", title: "PRD — Editor de blocos", type: "page", icon: "✍️" },
    ],
  },
  {
    id: "ntn_company",
    title: "Empresa",
    type: "page",
    icon: "🏢",
    lastEditedTime: "2026-07-11T10:00:00.000Z",
    children: [
      { id: "ntn_handbook", title: "Handbook", type: "page", icon: "📘" },
      { id: "ntn_db_contracts", title: "Contratos", type: "database", icon: "📁", childCount: 41 },
      { id: "ntn_brand", title: "Guia de marca", type: "page", icon: "🎨" },
    ],
  },
];

const text = (value: string, annotations?: RichTextSpan["annotations"]): RichTextSpan[] => [
  { text: value, annotations },
];

/** Deterministic body used when the demo worker "converts" a Notion page. */
export function mockConvertedBlocks(node: NotionTreeNode): AppBlock[] {
  const base: AppBlock[] = [
    {
      id: `${node.id}_b1`,
      type: "callout",
      richText: text(`Importado do Notion em ${new Date().toLocaleDateString("pt-BR")}. Hierarquia e anexos preservados.`),
      props: { emoji: "📥" },
      notionBlockId: `${node.id}-callout`,
    },
    {
      id: `${node.id}_b2`,
      type: "paragraph",
      richText: [
        { text: "Documento original: " },
        { text: node.title, annotations: { bold: true } },
        { text: ". Os blocos abaixo foram convertidos pelo " },
        { text: "notionBlockToAppBlock", annotations: { code: true } },
        { text: " preservando anotações, links e listas aninhadas." },
      ],
      notionBlockId: `${node.id}-intro`,
    },
    { id: `${node.id}_b3`, type: "heading_2", richText: text("Resumo"), notionBlockId: `${node.id}-h2` },
    {
      id: `${node.id}_b4`,
      type: "bulleted_list_item",
      richText: text("Contexto e decisão registrados na origem."),
    },
    {
      id: `${node.id}_b5`,
      type: "bulleted_list_item",
      richText: text("Anexos rehospedados no Cloud Storage com URL permanente."),
      children: [
        {
          id: `${node.id}_b5a`,
          type: "bulleted_list_item",
          richText: text("URLs presigned da Notion expiram em 1h — por isso o re-upload."),
        },
      ],
    },
    {
      id: `${node.id}_b6`,
      type: "toggle",
      richText: text("Detalhes técnicos da conversão"),
      children: [
        {
          id: `${node.id}_b6a`,
          type: "code",
          richText: text(
            `{\n  "object": "block",\n  "type": "bulleted_list_item",\n  "has_children": true\n}`
          ),
          props: { language: "json" },
        },
      ],
    },
    { id: `${node.id}_b7`, type: "divider" },
    {
      id: `${node.id}_b8`,
      type: "quote",
      richText: text("Nada de link quebrado: cada página filha vira parentPageId no Firestore."),
    },
    {
      id: `${node.id}_b9`,
      type: "todo",
      richText: text("Revisar formatação após a importação"),
      props: { checked: false },
    },
  ];

  if (node.type === "database") {
    base.splice(3, 0, {
      id: `${node.id}_bdb`,
      type: "child_database",
      richText: text(node.title),
      props: { title: node.title },
    });
  }

  return base;
}

/** Rough file counts per node, used to make the demo progress bar believable. */
export function mockFileCount(node: NotionTreeNode): number {
  if (node.type === "database") return 3;
  return (node.title.length % 4) + 1;
}

export function flattenTree(nodes: NotionTreeNode[]): NotionTreeNode[] {
  const out: NotionTreeNode[] = [];
  const walk = (list: NotionTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function findNode(nodes: NotionTreeNode[], id: string): NotionTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Parent lookup table, mirroring how the worker preserves hierarchy. */
export function parentMap(nodes: NotionTreeNode[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const walk = (list: NotionTreeNode[], parent: string | null) => {
    for (const node of list) {
      map[node.id] = parent;
      if (node.children) walk(node.children, node.id);
    }
  };
  walk(nodes, null);
  return map;
}
