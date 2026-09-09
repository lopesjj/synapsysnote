
import assert from "node:assert/strict";
import {
  IMAGE_SIZE_LIMIT,
  PDF_SIZE_LIMIT,
  needsCompression,
  prepareEditorAttachment,
  replaceExtension,
} from "../src/lib/media/compress-attachment";

const tiny = new File([new Uint8Array(32)], "foto.png", { type: "image/png" });
assert.equal(needsCompression(tiny), false);
assert.equal(await prepareEditorAttachment(tiny), tiny);

const hugePng = new File([new Uint8Array(IMAGE_SIZE_LIMIT + 1)], "scan.png", {
  type: "image/png",
});
assert.equal(needsCompression(hugePng), true);

const smallPdf = new File([new Uint8Array(PDF_SIZE_LIMIT - 100)], "doc.pdf", {
  type: "application/pdf",
});
assert.equal(needsCompression(smallPdf), false);

const hugePdf = new File([new Uint8Array(PDF_SIZE_LIMIT + 1)], "livro.pdf", {
  type: "application/pdf",
});
assert.equal(needsCompression(hugePdf), true);

const hugeDoc = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "doc.docx", {
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
assert.equal(needsCompression(hugeDoc), false);
assert.equal(await prepareEditorAttachment(hugeDoc), hugeDoc);

assert.equal(replaceExtension("Scan.PNG", ".jpg"), "Scan.jpg");
assert.equal(IMAGE_SIZE_LIMIT, 1 * 1024 * 1024);
assert.equal(PDF_SIZE_LIMIT, 3 * 1024 * 1024);
console.log("  prepareEditorAttachment: image 1 MB, pdf 3 MB and non-media pass through");
