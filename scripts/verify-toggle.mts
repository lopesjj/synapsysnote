import assert from "node:assert/strict";
import { blocksSignature, blocksToDoc, docToBlocks } from "../src/components/editor/serializer";
import { toTableRows } from "../src/lib/data/table-rows";
import type { AppBlock } from "../src/types/models";

const originalToggle: AppBlock = {
  id: "toggle_1",
  type: "toggle",
  richText: [{ text: "Título do teste" }],
  props: {
    open: false,
    color: "#2563EB",
    backgroundColor: "#FED7AA",
  },
  children: [
    {
      id: "p_1",
      type: "paragraph",
      richText: [{ text: "Linha interna 1" }],
    },
    {
      id: "p_2",
      type: "paragraph",
      richText: [{ text: "Linha interna 2" }],
    },
  ],
};

const doc = blocksToDoc([originalToggle]);
const toggleNode = doc.content?.[0];

assert.ok(toggleNode);
assert.equal(toggleNode.type, "toggleBlock");
assert.equal(toggleNode.attrs?.open, false);
assert.equal(toggleNode.content?.length, 3);
assert.equal(toggleNode.content?.[0]?.content?.[0]?.text, "Título do teste");

const backToBlocks = docToBlocks(doc);
assert.equal(backToBlocks.length, 1);
const restoredToggle = backToBlocks[0];

assert.equal(restoredToggle.type, "toggle");
assert.equal(restoredToggle.richText?.[0]?.text, "Título do teste");
assert.equal(restoredToggle.props?.open, false);
assert.equal(restoredToggle.children?.length, 2);
assert.equal(restoredToggle.children?.[0]?.richText?.[0]?.text, "Linha interna 1");
assert.equal(restoredToggle.children?.[1]?.richText?.[0]?.text, "Linha interna 2");

const headingToggle: AppBlock = {
  id: "toggle_h1",
  type: "toggle",
  richText: [{ text: "Título H1" }],
  props: {
    open: true,
    level: 1,
  },
  children: [
    {
      id: "p_inside",
      type: "paragraph",
      richText: [{ text: "Texto interno" }],
    },
  ],
};

const docH1 = blocksToDoc([headingToggle]);
const h1Node = docH1.content?.[0];
assert.ok(h1Node);
assert.equal(h1Node.content?.[0]?.type, "heading");
assert.equal(h1Node.content?.[0]?.attrs?.level, 1);

const restoredH1 = docToBlocks(docH1)[0];
assert.equal(restoredH1.props?.level, 1);
assert.equal(restoredH1.richText?.[0]?.text, "Título H1");
assert.equal(restoredH1.children?.length, 1);

// Titulo com conteudo dentro (titulo recolhivel do Notion importado antes da correcao):
// abre como titulo recolhivel e nada se perde ao salvar.
const legacyHeading: AppBlock = {
  id: "h2_legacy",
  type: "heading_2",
  notionBlockId: "n1",
  richText: [{ text: "1) Preposições" }],
  children: [
    { id: "p", type: "paragraph", richText: [{ text: "Preposição liga termos." }] },
    {
      id: "c",
      type: "callout",
      richText: [{ text: "Atenção" }],
      props: { emoji: "⚠️" },
      children: [{ id: "li", type: "bulleted_list_item", richText: [{ text: "a, ante, após" }] }],
    },
    { id: "img", type: "image", media: { url: "https://example.com/d.png", name: "d.png" } },
    { id: "t", type: "table", props: { hasColumnHeader: true, tableRows: toTableRows([[[{ text: "Prep" }], [{ text: "Sentido" }]]]) } },
  ],
};
const legacyDoc = blocksToDoc([legacyHeading]);
assert.equal(legacyDoc.content?.[0]?.type, "toggleBlock");
assert.deepEqual(legacyDoc.content?.[0]?.content?.map((node) => node.type), ["heading", "paragraph", "callout", "mediaBlock", "tableBlock"]);
assert.equal(legacyDoc.content?.[0]?.content?.[0]?.attrs?.level, 2);
assert.equal(legacyDoc.content?.[0]?.content?.[2]?.content?.[1]?.type, "bulletList");
const legacySaved = docToBlocks(legacyDoc)[0];
assert.equal(legacySaved.type, "toggle");
assert.equal(legacySaved.props?.level, 2);
assert.equal(legacySaved.children?.length, 4);
assert.equal(blocksSignature([legacyHeading]), blocksSignature(docToBlocks(legacyDoc)));

// Paragrafo com filhos recuados (como no Notion) nao perde os filhos.
const paragraphWithChildren = blocksToDoc([
  { id: "p0", type: "paragraph", richText: [{ text: "Pai" }], children: [{ id: "p1", type: "paragraph", richText: [{ text: "Filho" }] }] },
]);
assert.equal(docToBlocks(paragraphWithChildren).map((block) => block.richText?.[0]?.text).join("|"), "Pai|Filho");

// Lista dentro de destaque vira lista de verdade, nao bloco nao suportado.
const calloutDoc = blocksToDoc([
  { id: "c1", type: "callout", props: { emoji: "📌" }, children: [{ id: "l1", type: "numbered_list_item", richText: [{ text: "um" }] }] },
]);
assert.equal(calloutDoc.content?.[0]?.content?.[1]?.type, "orderedList");
console.log("all toggle tests passed");
