import type {
  AppBlock,
  AppDatabase,
  Notebook,
  Page,
  RichTextSpan,
} from "@/types/models";


let counter = 0;
const uid = (prefix: string) => `${prefix}_${(counter += 1).toString().padStart(3, "0")}`;

export const t = (text: string, annotations?: RichTextSpan["annotations"]): RichTextSpan[] => [
  { text, annotations },
];

const now = Date.now();
const minutes = (n: number) => now - n * 60_000;

function block(type: AppBlock["type"], text?: string, extra: Partial<AppBlock> = {}): AppBlock {
  return {
    id: uid("blk"),
    type,
    richText: text ? t(text) : undefined,
    ...extra,
  };
}

export function plainTextOf(blocks: AppBlock[]): string {
  const out: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const b of list) {
      if (b.richText) out.push(b.richText.map((s) => s.text).join(""));
      if (b.props?.title) out.push(b.props.title);
      if (b.media?.caption) out.push(b.media.caption.map((s) => s.text).join(""));
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out.join("\n");
}

function page(input: Partial<Page> & { title: string; blocks: AppBlock[] }): Page {
  const id = input.id ?? uid("page");
  return {
    id,
    title: input.title,
    icon: input.icon,
    coverUrl: null,
    notebookId: input.notebookId ?? null,
    parentPageId: input.parentPageId ?? null,
    path: input.path ?? [],
    blocks: input.blocks,
    plainText: plainTextOf(input.blocks),
    extractedOCRText: input.extractedOCRText ?? "",
    transcriptText: input.transcriptText ?? "",
    tags: input.tags ?? [],
    outgoingLinks: input.outgoingLinks ?? [],
    backlinks: input.backlinks ?? [],
    embedding: null,
    embeddingUpdatedAt: null,
    favorite: input.favorite ?? false,
    archived: false,
    deletedAt: input.deletedAt ?? null,
    notionPageId: input.notionPageId ?? null,
    notionUrl: input.notionUrl ?? null,
    importJobId: input.importJobId ?? null,
    createdBy: "demo-user",
    updatedBy: "demo-user",
    createdAt: input.createdAt ?? minutes(6000),
    updatedAt: input.updatedAt ?? minutes(30),
    order: input.order ?? 0,
  };
}

export function buildSeed(): {
  notebooks: Notebook[];
  pages: Page[];
  databases: AppDatabase[];
} {
  const nbResearch: Notebook = {
    id: "nb_research",
    name: "Pesquisa & Ideias",
    emoji: "🧠",
    color: "#8B5CF6",
    description: "Notas de leitura, entrevistas e hipóteses de produto.",
    parentId: null,
    order: 0,
    createdAt: minutes(9000),
    updatedAt: minutes(120),
  };
  const nbOps: Notebook = {
    id: "nb_ops",
    name: "Operações",
    emoji: "⚙️",
    color: "#6366F1",
    description: "Runbooks, decisões de arquitetura e rituais do time.",
    parentId: null,
    order: 1,
    createdAt: minutes(8000),
    updatedAt: minutes(240),
  };
  const nbPersonal: Notebook = {
    id: "nb_personal",
    name: "Pessoal",
    emoji: "🌱",
    color: "#0EA5E9",
    description: "Capturas rápidas, listas e diário de trabalho.",
    parentId: null,
    order: 2,
    createdAt: minutes(7000),
    updatedAt: minutes(45),
  };

  const architecture = page({
    id: "page_architecture",
    title: "Arquitetura do Synapsys Note",
    icon: "🏛️",
    notebookId: nbOps.id,
    favorite: true,
    tags: ["arquitetura", "firebase"],
    updatedAt: minutes(12),
    blocks: [
      block(
        "callout",
        "Documento vivo: toda decisão de arquitetura entra aqui antes de virar código.",
        { props: { emoji: "📌" } }
      ),
      block("heading_2", "Camadas"),
      block(
        "paragraph",
        "O cliente Next.js nunca fala diretamente com serviços externos. Tudo passa pelo Firestore (estado) e por Cloud Functions (efeitos colaterais), o que mantém tokens fora do browser."
      ),
      block("bulleted_list_item", "Next.js App Router + React Server Components para o shell."),
      block("bulleted_list_item", "Firestore com persistência offline como fonte da verdade reativa."),
      block("bulleted_list_item", "Cloud Functions para Notion e busca semântica."),
      block("heading_2", "Orçamento de latência"),
      block(
        "paragraph",
        "Abrir uma página deve custar no máximo uma leitura do cache local; a sincronização chega depois via onSnapshot."
      ),
      block("code", undefined, {
        props: { language: "typescript" },
        richText: t(
          `const unsubscribe = onSnapshot(\n  doc(db, "workspaces", workspaceId, "pages", pageId),\n  { includeMetadataChanges: true },\n  (snap) => setPage(snap.data() as Page)\n);`
        ),
      }),
      block("heading_3", "Fórmula de ranqueamento da busca híbrida"),
      block("equation", undefined, {
        props: { expression: "score = 0.6 \\cdot \\cos(q, d) + 0.3 \\cdot bm25(q, d) + 0.1 \\cdot recency(d)" },
      }),
      block("quote", "Se a busca não responde em 100ms, o usuário volta pro Cmd+F do navegador."),
      block("divider"),
      block("todo", "Revisar índices compostos antes do beta", { props: { checked: true } }),
      block("todo", "Medir custo de leitura por sessão", { props: { checked: false } }),
    ],
  });

  const notionMigration = page({
    id: "page_notion_migration",
    title: "Plano de migração do Notion",
    icon: "📥",
    notebookId: nbOps.id,
    tags: ["notion", "migração"],
    updatedAt: minutes(58),
    outgoingLinks: ["page_architecture"],
    blocks: [
      block(
        "paragraph",
        "Objetivo: trazer 4 anos de conhecimento do Notion sem perder hierarquia, anexos nem propriedades de banco de dados."
      ),
      block("heading_2", "Riscos conhecidos"),
      block("numbered_list_item", "URLs de arquivo da API do Notion expiram em 1 hora."),
      block("numbered_list_item", "Páginas muito aninhadas estouram o limite de tempo de uma requisição HTTP."),
      block("numbered_list_item", "Propriedades de rollup e fórmula não têm equivalente direto."),
      block(
        "callout",
        "Mitigação: worker em background que faz re-upload por streaming para o Cloud Storage e escreve progresso a cada item.",
        { props: { emoji: "🛡️" } }
      ),
      block("toggle", "Checklist antes de rodar em produção", {
        children: [
          block("todo", "Testar com um workspace de staging", { props: { checked: true } }),
          block("todo", "Validar limites de taxa (3 req/s por integração)", { props: { checked: false } }),
          block("todo", "Confirmar retenção da lixeira de 30 dias", { props: { checked: false } }),
        ],
      }),
    ],
  });

  const interview = page({
    id: "page_interview",
    title: "Entrevista - Camila, gestora de conhecimento",
    icon: "🎙️",
    notebookId: nbResearch.id,
    tags: ["pesquisa", "entrevista"],
    updatedAt: minutes(180),
    transcriptText: "",
    blocks: [
      block("heading_2", "Contexto"),
      block(
        "paragraph",
        "Camila coordena 32 pessoas e mantém a base de conhecimento de operações. Usa Notion para estrutura e Evernote para captura."
      ),
      block("heading_2", "Dores"),
      block("bulleted_list_item", "Busca não alcança texto dentro de imagens e PDFs."),
      block("bulleted_list_item", "Gravações de reunião viram arquivos órfãos."),
      block("bulleted_list_item", "Migrar entre ferramentas quebra links internos."),
      block("quote", "Eu não quero outro app. Quero um lugar onde o que eu capturo já nasce encontrável."),
      block("heading_3", "Trechos marcados"),
      block(
        "paragraph",
        "A gravação completa da entrevista está anexada como nota de áudio com os principais pontos destacados."
      ),
    ],
  });

  const captureInbox = page({
    id: "page_inbox",
    title: "Caixa de captura rápida",
    icon: "⚡",
    notebookId: nbPersonal.id,
    tags: ["inbox"],
    updatedAt: minutes(8),
    blocks: [
      block("paragraph", "Tudo que entra aqui deve ser processado até sexta."),
      block("todo", "Transcrever áudio da call de descoberta", { props: { checked: false } }),
      block("todo", "Anexar contrato assinado", { props: { checked: false } }),
      block("todo", "Arquivar notas duplicadas vindas do Notion", { props: { checked: true } }),
      block("divider"),
      block("paragraph", "Ideias soltas:"),
      block("bulleted_list_item", "Atalho global para gravar voz sem abrir o app."),
      block("bulleted_list_item", "Visualização de grafo dos backlinks."),
    ],
  });

  const editorNotes = page({
    id: "page_editor_notes",
    title: "Especificação do editor de blocos",
    icon: "✍️",
    notebookId: nbResearch.id,
    parentPageId: architecture.id,
    path: [architecture.id],
    tags: ["editor"],
    updatedAt: minutes(300),
    blocks: [
      block("paragraph", "O editor é a superfície mais sensível do produto: latência percebida acima de tudo."),
      block("heading_3", "Comandos de barra"),
      block("bulleted_list_item", "Digite / para inserir qualquer bloco sem tirar as mãos do teclado."),
      block("bulleted_list_item", "@ menciona páginas e cria backlinks automaticamente."),
      block("code", undefined, {
        props: { language: "typescript" },
        richText: t(
          `editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();`
        ),
      }),
    ],
  });

  const roadmap: AppDatabase = {
    id: "db_roadmap",
    name: "Roadmap do produto",
    icon: "🗺️",
    description: "Iniciativas em andamento, importadas do Notion.",
    notebookId: nbOps.id,
    parentPageId: null,
    notionDatabaseId: "notion-db-roadmap",
    deletedAt: null,
    createdAt: minutes(5000),
    updatedAt: minutes(90),
    properties: [
      { id: "p_title", name: "Iniciativa", type: "title", order: 0, width: 320 },
      {
        id: "p_status",
        name: "Status",
        type: "select",
        order: 1,
        width: 150,
        options: [
          { id: "s_backlog", name: "Backlog", color: "#6B7280" },
          { id: "s_progress", name: "Em progresso", color: "#6366F1" },
          { id: "s_review", name: "Em revisão", color: "#F59E0B" },
          { id: "s_done", name: "Entregue", color: "#10B981" },
        ],
      },
      {
        id: "p_owner",
        name: "Responsável",
        type: "select",
        order: 2,
        width: 150,
        options: [
          { id: "o_ana", name: "Ana", color: "#8B5CF6" },
          { id: "o_bruno", name: "Bruno", color: "#0EA5E9" },
          { id: "o_camila", name: "Camila", color: "#F43F5E" },
        ],
      },
      { id: "p_impact", name: "Impacto", type: "number", order: 3, width: 110 },
      { id: "p_due", name: "Prazo", type: "date", order: 4, width: 140 },
      {
        id: "p_tags",
        name: "Áreas",
        type: "multi_select",
        order: 5,
        width: 200,
        options: [
          { id: "t_editor", name: "Editor", color: "#6366F1" },
          { id: "t_import", name: "Importação", color: "#8B5CF6" },
          { id: "t_ai", name: "IA", color: "#10B981" },
          { id: "t_infra", name: "Infra", color: "#F59E0B" },
        ],
      },
      { id: "p_shipped", name: "Publicado", type: "checkbox", order: 6, width: 110 },
    ],
    views: [
      {
        id: "v_table",
        name: "Tabela",
        type: "table",
        sort: [{ propertyId: "p_impact", direction: "desc" }],
      },
      { id: "v_kanban", name: "Kanban", type: "kanban", groupByPropertyId: "p_status" },
    ],
    rows: [
      {
        id: "row_1",
        order: 0,
        createdAt: minutes(4000),
        updatedAt: minutes(120),
        values: {
          p_title: "Assistente de importação do Notion",
          p_status: "Em progresso",
          p_owner: "Ana",
          p_impact: 95,
          p_due: "2026-09-18",
          p_tags: ["Importação", "Infra"],
          p_shipped: false,
        },
      },
      {
        id: "row_2",
        order: 1,
        createdAt: minutes(4000),
        updatedAt: minutes(400),
        values: {
          p_title: "Indexação automática de anexos",
          p_status: "Em revisão",
          p_owner: "Bruno",
          p_impact: 80,
          p_due: "2026-09-25",
          p_tags: ["IA"],
          p_shipped: false,
        },
      },
      {
        id: "row_3",
        order: 2,
        createdAt: minutes(4000),
        updatedAt: minutes(900),
        values: {
          p_title: "Busca híbrida (texto + vetores)",
          p_status: "Backlog",
          p_owner: "Camila",
          p_impact: 88,
          p_due: "2026-10-06",
          p_tags: ["IA", "Editor"],
          p_shipped: false,
        },
      },
      {
        id: "row_4",
        order: 3,
        createdAt: minutes(4000),
        updatedAt: minutes(1500),
        values: {
          p_title: "Notas de voz com resumo automático",
          p_status: "Entregue",
          p_owner: "Ana",
          p_impact: 72,
          p_due: "2026-08-29",
          p_tags: ["IA"],
          p_shipped: true,
        },
      },
      {
        id: "row_5",
        order: 4,
        createdAt: minutes(4000),
        updatedAt: minutes(2600),
        values: {
          p_title: "Histórico de versões por página",
          p_status: "Backlog",
          p_owner: "Bruno",
          p_impact: 61,
          p_due: "2026-10-20",
          p_tags: ["Editor"],
          p_shipped: false,
        },
      },
      {
        id: "row_6",
        order: 5,
        createdAt: minutes(4000),
        updatedAt: minutes(60),
        values: {
          p_title: "Modo offline em campo",
          p_status: "Em progresso",
          p_owner: "Camila",
          p_impact: 77,
          p_due: "2026-09-30",
          p_tags: ["Infra"],
          p_shipped: false,
        },
      },
    ],
  };

  const trashed = page({
    id: "page_trashed",
    title: "Rascunho antigo de onboarding",
    icon: "🗑️",
    notebookId: nbPersonal.id,
    deletedAt: minutes(2880),
    updatedAt: minutes(2880),
    blocks: [block("paragraph", "Substituído pelo novo fluxo de primeiro acesso.")],
  });

  return {
    notebooks: [nbResearch, nbOps, nbPersonal],
    pages: [architecture, notionMigration, interview, captureInbox, editorNotes, trashed],
    databases: [roadmap],
  };
}
