import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Synapsys Note — Cloud Functions entry point.
 *
 *  Notion pipeline (ETAPA 3)
 *    listNotionTree          callable   lists shared pages/databases for the wizard
 *    startNotionImport       callable   enqueues an import job document
 *    processNotionImportJob  trigger    background worker (60 min, 1 GiB)
 *    disconnectNotion        callable   revokes the integration and deletes the token
 *
 *  Media & AI (ETAPA 4)
 *    runOcrOnUpload          trigger    Cloud Vision OCR for images and PDFs
 *    reprocessOcr            callable   manual OCR re-run
 *    transcribeAudio         callable   Gemini transcription + summary
 *    transcribeOnUpload      trigger    transcription safety net
 *    embedPageOnWrite        trigger    keeps page vectors fresh
 *    semanticSearch          callable   findNearest over the page vectors
 *
 *  Maintenance
 *    purgeExpiredTrash       schedule   30-day trash retention
 *    purgePage / restorePage callable   trash actions
 */

setGlobalOptions({
  region: process.env.FUNCTIONS_REGION || "us-central1",
  maxInstances: 20,
});

export {
  listNotionTreeFn as listNotionTree,
  startNotionImport,
  processNotionImportJob,
  disconnectNotion,
} from "./notion/import-job";

export { runOcrOnUpload, reprocessOcr } from "./ai/ocr";
export { transcribeAudio, transcribeOnUpload } from "./ai/transcribe";
export { embedPageOnWrite, semanticSearch } from "./ai/embeddings";
export { purgeExpiredTrash, purgePage, restorePage } from "./maintenance/trash";
