import assert from "node:assert/strict";
import { blocksToPlainText, notionBlocksToAppBlocks, type NotionBlock } from "../src/lib/notion/server/block-converter";
import { blocksToDoc, docToBlocks } from "../src/components/editor/serializer";

const rt = (text: string) => [
  {
    type: "text",
    plain_text: text,
    href: null,
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
    text: { content: text, link: null },
  },
];

// Estrutura da nota "Aula 4 - Preposições e Conjunções": todo o conteúdo mora dentro
// dos títulos recolhíveis ("▶ 1) Preposições").
const top: NotionBlock[] = [
  { id: "h2-prep", type: "heading_2", has_children: true, heading_2: { rich_text: rt("1) Preposições"), is_toggleable: true, color: "default" } },
  { id: "h2-conj", type: "heading_2", has_children: true, heading_2: { rich_text: rt("2) Conjunções"), is_toggleable: true, color: "default" } },
  { id: "h3-pos", type: "heading_3", has_children: false, heading_3: { rich_text: rt("COMENTÁRIOS PÓS-EXERCÍCIOS"), is_toggleable: false } },
  { id: "c-end", type: "callout", has_children: false, callout: { rich_text: rt("Revisar crase"), icon: { type: "emoji", emoji: "📌" } } },
];

const children: Record<string, NotionBlock[]> = {
  "h2-prep": [
    { id: "h3-sub", type: "heading_3", has_children: true, heading_3: { rich_text: rt("1.1 Classificação"), is_toggleable: true } },
    { id: "c1", type: "callout", has_children: true, callout: { rich_text: rt("Atenção"), icon: { type: "emoji", emoji: "⚠️" } } },
    { id: "img1", type: "image", has_children: false, image: { type: "external", external: { url: "https://example.com/diagrama.png" }, caption: [] } },
    { id: "t1", type: "table", has_children: true, table: { table_width: 2, has_column_header: true } },
  ],
  "h3-sub": [{ id: "p1", type: "paragraph", has_children: false, paragraph: { rich_text: rt("Essenciais e acidentais.") } }],
  c1: [{ id: "li1", type: "bulleted_list_item", has_children: false, bulleted_list_item: { rich_text: rt("a, ante, após") } }],
  t1: [
    { id: "r1", type: "table_row", has_children: false, table_row: { cells: [rt("Prep"), rt("Sentido")] } },
    { id: "r2", type: "table_row", has_children: false, table_row: { cells: [rt("com"), rt("companhia")] } },
  ],
  "h2-conj": [{ id: "p2", type: "paragraph", has_children: false, paragraph: { rich_text: rt("Coordenativas e subordinativas.") } }],
};

const blocks = await notionBlocksToAppBlocks(top, { fetchChildren: async (id) => children[id] ?? [] });
assert.deepEqual(blocks.map((block) => block.type), ["toggle", "toggle", "heading_3", "callout"]);
const [prep, conj] = blocks;
assert.equal(prep.props?.level, 2);
assert.equal(prep.props?.open, true);
assert.equal(prep.richText?.[0]?.text, "1) Preposições");
assert.deepEqual(prep.children?.map((block) => block.type), ["toggle", "callout", "image", "table"]);
assert.equal(prep.children?.[0]?.props?.level, 3);
assert.equal(prep.children?.[0]?.children?.[0]?.richText?.[0]?.text, "Essenciais e acidentais.");
assert.equal(prep.children?.[1]?.children?.[0]?.type, "bulleted_list_item");
assert.equal(prep.children?.[2]?.media?.url, "https://example.com/diagrama.png");
assert.equal(prep.children?.[3]?.props?.tableRows?.length, 2);
assert.equal(conj.children?.[0]?.richText?.[0]?.text, "Coordenativas e subordinativas.");

// O editor mostra tudo e o salvamento não perde nada.
const doc = blocksToDoc(blocks);
assert.deepEqual(doc.content?.[0]?.content?.map((node) => node.type), ["heading", "toggleBlock", "callout", "mediaBlock", "tableBlock"]);
assert.equal(doc.content?.[0]?.content?.[2]?.content?.[1]?.type, "bulletList");
const saved = docToBlocks(doc);
assert.equal(saved[0].children?.length, 4);
assert.equal(saved[1].children?.length, 1);
assert.match(blocksToPlainText(blocks), /Coordenativas/);

// Subpágina não é copiada para dentro da nota pai: ela é importada por conta própria.
const sub = await notionBlocksToAppBlocks([{ id: "cp", type: "child_page", has_children: true, child_page: { title: "Aula 5" } }], {
  fetchChildren: async (id) => {
    throw new Error(`não devia buscar ${id}`);
  },
});
assert.equal(sub[0].type, "child_page");
assert.equal(sub[0].children, undefined);

// Título comum continua título.
const plain = await notionBlocksToAppBlocks([{ id: "h1", type: "heading_1", has_children: false, heading_1: { rich_text: rt("Título"), is_toggleable: false } }], {
  fetchChildren: async () => [],
});
assert.equal(plain[0].type, "heading_1");

console.log("verify-notion-blocks: ok");
