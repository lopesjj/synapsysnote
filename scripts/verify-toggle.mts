import assert from "node:assert/strict";
import { blocksToDoc, docToBlocks } from "../src/components/editor/serializer";
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
assert.equal(toggleNode.attrs?.summary, "Título do teste");
assert.equal(toggleNode.attrs?.open, false);
assert.equal(toggleNode.attrs?.textColor, "#2563EB");
assert.equal(toggleNode.attrs?.backgroundColor, "#FED7AA");
assert.equal(toggleNode.content?.length, 2);

const backToBlocks = docToBlocks(doc);
assert.equal(backToBlocks.length, 1);
const restoredToggle = backToBlocks[0];

assert.equal(restoredToggle.type, "toggle");
assert.equal(restoredToggle.richText?.[0]?.text, "Título do teste");
assert.equal(restoredToggle.props?.open, false);
assert.equal(restoredToggle.props?.color, "#2563EB");
assert.equal(restoredToggle.props?.backgroundColor, "#FED7AA");
assert.equal(restoredToggle.children?.length, 2);
assert.equal(restoredToggle.children?.[0]?.richText?.[0]?.text, "Linha interna 1");
assert.equal(restoredToggle.children?.[1]?.richText?.[0]?.text, "Linha interna 2");

const openToggle: AppBlock = {
  id: "toggle_2",
  type: "toggle",
  richText: [{ text: "Toggle Aberto" }],
  props: {
    open: true,
  },
  children: [
    {
      id: "p_3",
      type: "paragraph",
      richText: [{ text: "Conteúdo aberto" }],
    },
  ],
};

const docOpen = blocksToDoc([openToggle]);
assert.equal(docOpen.content?.[0]?.attrs?.open, true);
const backOpen = docToBlocks(docOpen);
assert.equal(backOpen[0]?.props?.open, true);

const toggleWithEmptyFirstLine: AppBlock = {
  id: "toggle_3",
  type: "toggle",
  richText: [{ text: "PRONOMES INTERROGATIVOS" }],
  props: { open: true },
  children: [
    { id: "p_empty", type: "paragraph", richText: [] },
    { id: "p_content", type: "paragraph", richText: [{ text: "Servem basicamente..." }] },
  ],
};
const docEmptyFirst = blocksToDoc([toggleWithEmptyFirstLine]);
const toggleWithEmpty = docEmptyFirst.content?.[0];
assert.ok(toggleWithEmpty);
assert.equal(toggleWithEmpty.content?.length, 2);

const updatedChildren = toggleWithEmpty.content?.slice(1);
assert.equal(updatedChildren?.length, 1);
assert.equal(updatedChildren?.[0]?.content?.[0]?.text, "Servem basicamente...");

const currentSummary = "PRONOMES";
const childText = " INTERROGATIVOS";
const mergedSummary = currentSummary + childText;
assert.equal(mergedSummary, "PRONOMES INTERROGATIVOS");

console.log("all toggle tests passed");
