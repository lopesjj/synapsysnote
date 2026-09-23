import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./region";

setGlobalOptions({
  region: REGION,
  maxInstances: 20,
});

export { purgeExpiredTrash, purgeExpiredQuarantineMedia, purgePage } from "./maintenance/trash";
