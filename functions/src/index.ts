import { setGlobalOptions } from "firebase-functions/v2";


setGlobalOptions({
  region: process.env.FUNCTIONS_REGION || "us-east1",
  maxInstances: 20,
});

// A importacao do Notion, a transcricao e a busca rodam nas rotas do Next.js,
// sob a sessao de quem pediu. Aqui ficam so as rotinas de manutencao.
export { purgeExpiredTrash, purgeExpiredQuarantineMedia, purgePage } from "./maintenance/trash";
