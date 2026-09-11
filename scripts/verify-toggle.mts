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

console.log("all toggle tests passed");
