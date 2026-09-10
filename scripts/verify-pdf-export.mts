import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import katex from "katex";
import type { AppBlock, Page } from "../src/types/models";

const dummyAttachedPdf = await PDFDocument.create();
dummyAttachedPdf.addPage([595.28, 841.89]);
dummyAttachedPdf.addPage([595.28, 841.89]);
const dummyPdfBytes = await dummyAttachedPdf.save();
assert.ok(dummyPdfBytes.length > 0);

const testPage: Page = {
  id: "page_test_123",
  title: "Nota Completa com Anexos e Áudio",
  icon: "📝",
  notebookId: "nb_1",
  parentPageId: null,
  path: [],
  plainText: "Texto simples de teste",
  transcriptText: "Transcrição de teste do áudio",
  tags: ["trabalho", "reuniao", "pericia"],
  outgoingLinks: [],
  backlinks: [],
  favorite: true,
  archived: false,
  deletedAt: null,
  createdBy: "user_1",
  updatedBy: "user_1",
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  blocks: [
    {
      id: "blk_h1",
      type: "heading_1",
      richText: [{ text: "Relatório Pericial Integrado", annotations: { bold: true } }],
    },
    {
      id: "blk_p1",
      type: "paragraph",
      richText: [
        { text: "Este documento contém texto formatado em " },
        { text: "negrito", annotations: { bold: true } },
        { text: ", " },
        { text: "itálico", annotations: { italic: true } },
        { text: ", " },
        { text: "código", annotations: { code: true } },
        { text: " e " },
        { text: "destaque amarelo", annotations: { highlight: "#fef08a" } },
        { text: "." },
      ],
      props: { textAlign: "justify", indent: 1 },
    },
    {
      id: "blk_task",
      type: "todo",
      richText: [{ text: "Item de checklist concluído" }],
      props: { checked: true },
    },
    {
      id: "blk_table",
      type: "table",
      props: {
        hasColumnHeader: true,
        tableRows: [
          {
            cells: [
              { spans: [{ text: "Item" }], horizontalAlign: "left" },
              { spans: [{ text: "Valor" }], horizontalAlign: "right" },
            ],
          },
          {
            cells: [
              { spans: [{ text: "Laudo A" }], horizontalAlign: "left" },
              { spans: [{ text: "R$ 1.500,00" }], horizontalAlign: "right" },
            ],
          },
        ],
      },
    },
    {
      id: "blk_eq",
      type: "equation",
      props: { expression: "E = mc^2" },
    },
    {
      id: "blk_audio",
      type: "audio",
      media: {
        url: "blob:http://localhost/audio-123",
        name: "Depoimento e Gravação - Caso 402",
        mimeType: "audio/webm",
        durationSeconds: 125,
        sizeBytes: 850000,
        transcript: "O periciando informou que estava presente no local dos fatos.",
        transcriptSummary: "Depoimento inicial sobre a dinâmica do ocorrido.",
      },
    },
    {
      id: "blk_pdf",
      type: "file",
      media: {
        url: "blob:http://localhost/doc-123.pdf",
        name: "laudo_tecnico_anexo.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2400000,
      },
    },
  ],
};

const renderedKatex = katex.renderToString("E = mc^2", { displayMode: true, throwOnError: false });
assert.ok(renderedKatex.includes("katex"));

const finalDoc = await PDFDocument.create();
const notePage1 = finalDoc.addPage([595.28, 841.89]);
notePage1.drawText("Página 1 da Nota", { x: 50, y: 800, size: 14 });

const attachedDoc = await PDFDocument.load(dummyPdfBytes);
assert.equal(attachedDoc.getPageCount(), 2);

const copiedPages = await finalDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
assert.equal(copiedPages.length, 2);

for (const p of copiedPages) {
  finalDoc.addPage(p);
}

const notePage2 = finalDoc.addPage([595.28, 841.89]);
notePage2.drawText("Página 2 da Nota (Continuação pós anexo)", { x: 50, y: 800, size: 14 });

assert.equal(finalDoc.getPageCount(), 4);

const finalBytes = await finalDoc.save();
assert.ok(finalBytes instanceof Uint8Array);
assert.ok(finalBytes.length > 1000);

const parsedResult = await PDFDocument.load(finalBytes);
assert.equal(parsedResult.getPageCount(), 4);

const audioBlock = testPage.blocks.find((b) => b.type === "audio");
assert.ok(audioBlock);
assert.equal(audioBlock.media?.name, "Depoimento e Gravação - Caso 402");
assert.equal(audioBlock.media?.durationSeconds, 125);
assert.ok(audioBlock.media?.transcript?.includes("periciando informou"));

const pdfBlock = testPage.blocks.find((b) => b.media?.mimeType === "application/pdf");
assert.ok(pdfBlock);
assert.equal(pdfBlock.media?.name, "laudo_tecnico_anexo.pdf");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const loaded = pdfjs.getDocument({ data: dummyPdfBytes.slice() });
const source = await loaded.promise;
assert.equal(source.numPages, 2);
await source.cleanup();
await loaded.destroy();

const trailingEmptyBlocks: AppBlock[] = [
  { id: "b1", type: "paragraph", richText: [{ text: "Conteúdo" }] },
  { id: "b2", type: "paragraph", richText: [{ text: "" }] },
  { id: "b3", type: "paragraph", richText: [{ text: "   \n\u00a0\u200B" }] },
  { id: "b4", type: "divider" },
];
let lastIdx = trailingEmptyBlocks.length - 1;
while (
  lastIdx >= 0 &&
  ((trailingEmptyBlocks[lastIdx].type === "paragraph" &&
    trailingEmptyBlocks[lastIdx].richText?.map((s) => s.text || "").join("").replace(/[\s\u00a0\u200B-\u200D\uFEFF]/g, "").length === 0) ||
    (lastIdx === trailingEmptyBlocks.length - 1 && trailingEmptyBlocks[lastIdx].type === "divider"))
) {
  lastIdx--;
}
const trimmed = trailingEmptyBlocks.slice(0, lastIdx + 1);
assert.equal(trimmed.length, 1);
assert.equal(trimmed[0].id, "b1");

console.log("all pdf export verification tests passed");

