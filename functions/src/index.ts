import { setGlobalOptions } from "firebase-functions/v2";


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

export { transcribeAudio, transcribeOnUpload } from "./ai/transcribe";
export { embedPageOnWrite, semanticSearch } from "./ai/embeddings";
export { purgeExpiredTrash, purgeExpiredQuarantineMedia, purgePage, restorePage } from "./maintenance/trash";
