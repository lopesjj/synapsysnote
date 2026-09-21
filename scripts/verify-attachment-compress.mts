
import assert from "node:assert/strict";
import {
  AUDIO_SIZE_LIMIT,
  IMAGE_SIZE_LIMIT,
  PDF_SIZE_LIMIT,
  VIDEO_SIZE_LIMIT,
  VIDEO_UPLOAD_TARGET,
  isAudioFile,
  isVideoFile,
  needsAudioCompression,
  needsCompression,
  prepareAudioAttachment,
  prepareEditorAttachment,
  replaceExtension,
} from "../src/lib/media/compress-attachment";
import { maxCompressibleDuration, planResolution } from "../src/lib/media/compress-video";
import { TRANSLATIONS, localizeErrorMessage } from "../src/lib/i18n/translations";

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

const smallAudioBlob = new Blob([new Uint8Array(AUDIO_SIZE_LIMIT - 1024)], {
  type: "audio/webm;codecs=opus",
});
assert.equal(needsAudioCompression(smallAudioBlob), false);
assert.equal(await prepareAudioAttachment(smallAudioBlob), smallAudioBlob);

const hugeAudioBlob = new Blob([new Uint8Array(AUDIO_SIZE_LIMIT + 10)], {
  type: "audio/webm",
});
assert.equal(needsAudioCompression(hugeAudioBlob), true);

const smallAudioFile = new File([new Uint8Array(1024)], "gravacao.webm", {
  type: "audio/webm",
});
assert.equal(needsCompression(smallAudioFile), false);

const hugeAudioFile = new File([new Uint8Array(AUDIO_SIZE_LIMIT + 500)], "gravacao.webm", {
  type: "audio/webm",
});
assert.equal(needsCompression(hugeAudioFile), true);

assert.equal(replaceExtension("Scan.PNG", ".jpg"), "Scan.jpg");
assert.equal(IMAGE_SIZE_LIMIT, 1 * 1024 * 1024);
assert.equal(PDF_SIZE_LIMIT, 3 * 1024 * 1024);
assert.equal(AUDIO_SIZE_LIMIT, 3 * 1024 * 1024);

// --- vídeo -------------------------------------------------------------

assert.equal(VIDEO_SIZE_LIMIT, 150 * 1024 * 1024);
// `storage.rules` exige `size < 150 MB` para vídeo: o alvo fica abaixo da borda.
assert.ok(VIDEO_UPLOAD_TARGET < VIDEO_SIZE_LIMIT);

assert.equal(isVideoFile({ name: "aula.mp4", type: "video/mp4" }), true);
assert.equal(isVideoFile({ name: "aula.MOV", type: "" }), true);
assert.equal(isVideoFile({ name: "nota-de-voz.webm", type: "audio/webm" }), false);
assert.equal(isAudioFile({ name: "aula.mp4", type: "video/mp4" }), false);
assert.equal(isAudioFile({ name: "nota-de-voz.webm", type: "audio/webm" }), true);

const smallVideo = new File([new Uint8Array(4 * 1024 * 1024)], "clipe.mp4", {
  type: "video/mp4",
});
assert.equal(needsCompression(smallVideo), false);
assert.equal(await prepareEditorAttachment(smallVideo), smallVideo);

const heavyButFine = new File([new Uint8Array(1024)], "aula-longa.mp4", { type: "video/mp4" });
Object.defineProperty(heavyButFine, "size", { value: 104 * 1024 * 1024 });
// 104 MB agora sobe inteiro, sem recodificar nada.
assert.equal(needsCompression(heavyButFine), false);
assert.equal(await prepareEditorAttachment(heavyButFine), heavyButFine);

const hugeVideo = new File([new Uint8Array(1024)], "aula.mp4", { type: "video/mp4" });
Object.defineProperty(hugeVideo, "size", { value: VIDEO_SIZE_LIMIT + 1 });
assert.equal(needsCompression(hugeVideo), true);

// Fora do navegador não há como recodificar: precisa falhar com a mensagem
// que vira o toast de erro traduzido.
await assert.rejects(
  () => prepareEditorAttachment(hugeVideo),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    assert.ok(message.includes("Vídeo muito grande"));
    const t = (key: keyof (typeof TRANSLATIONS)["pt"]) => TRANSLATIONS.pt[key];
    assert.equal(localizeErrorMessage(message, t), TRANSLATIONS.pt.video_too_large);
    return true;
  }
);

// Qualidade: com banda sobrando mantém a resolução original e nunca aumenta.
const fullHd = planResolution(1920, 1080, 12_000_000);
assert.deepEqual(fullHd, { width: 1920, height: 1080 });

const alreadySmall = planResolution(640, 360, 12_000_000);
assert.deepEqual(alreadySmall, { width: 640, height: 360 });

// Com pouca banda reduz, mantendo proporção e dimensões pares.
const starved = planResolution(1920, 1080, 700_000);
assert.ok(starved.width < 1920);
assert.equal(starved.width % 2, 0);
assert.equal(starved.height % 2, 0);
assert.ok(Math.abs(starved.width / starved.height - 1920 / 1080) < 0.05);

// Teto de duração: a recodificação roda em tempo real, então para de valer a
// pena em 30 min. Além disso o anexo é recusado com "longo demais".
const ceilingMinutes = maxCompressibleDuration(VIDEO_UPLOAD_TARGET) / 60;
assert.equal(Math.round(ceilingMinutes), 30);
assert.ok(50 * 60 > maxCompressibleDuration(VIDEO_UPLOAD_TARGET));
assert.ok(25 * 60 < maxCompressibleDuration(VIDEO_UPLOAD_TARGET));

// O limite exibido vem da mensagem de erro, não de um número fixo na tradução.
const tooLongMessage = "Vídeo longo demais: 50 min não cabem em 150 MB com imagem aproveitável.";
const localizedTooLong = localizeErrorMessage(tooLongMessage, (key, params) =>
  (TRANSLATIONS.pt[key] as string).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""))
);
assert.ok(localizedTooLong.includes("150 MB"), localizedTooLong);
assert.ok(!localizedTooLong.includes("{limit}"));

// Vídeo longo: taxa baixa ainda gera imagem, sem descer do piso de 240p.
const longVideo = planResolution(1920, 1080, 200_000, 24);
assert.equal(longVideo.height, 240);
assert.ok(longVideo.width >= 400 && longVideo.width <= 440);

console.log("  prepareEditorAttachment and prepareAudioAttachment verification passed");

