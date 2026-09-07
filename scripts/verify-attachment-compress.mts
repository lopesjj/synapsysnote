
import assert from "node:assert/strict";
import {
  ATTACHMENT_SIZE_LIMIT,
  needsCompression,
  prepareEditorAttachment,
  replaceExtension,
} from "../src/lib/media/compress-attachment";

const tiny = new File([new Uint8Array(32)], "foto.png", { type: "image/png" });
assert.equal(needsCompression(tiny), false);
assert.equal(await prepareEditorAttachment(tiny), tiny);

const hugePng = new File([new Uint8Array(ATTACHMENT_SIZE_LIMIT + 1)], "scan.png", {
  type: "image/png",
});
assert.equal(needsCompression(hugePng), true);

const hugeDoc = new File([new Uint8Array(ATTACHMENT_SIZE_LIMIT + 1)], "doc.docx", {
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
assert.equal(needsCompression(hugeDoc), false);
assert.equal(await prepareEditorAttachment(hugeDoc), hugeDoc);

assert.equal(replaceExtension("Scan.PNG", ".jpg"), "Scan.jpg");
assert.equal(ATTACHMENT_SIZE_LIMIT, 5 * 1024 * 1024);
console.log("  prepareEditorAttachment: under 5 MB and non-media pass through");
