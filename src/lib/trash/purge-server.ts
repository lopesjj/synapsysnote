import "server-only";

import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import {
  expiredTrash,
  purgeExpiredQuarantine as purgeQuarantineCore,
  purgeItems as purgeItemsCore,
  type BucketLike,
  type PurgeSet,
} from "./purge-core";

export { extractStoragePath } from "./purge-core";
export { TRASH_RETENTION_MS } from "./retention";
export type { PurgeSet } from "./purge-core";

const NO_STORAGE: BucketLike = {
  getFiles: async () => [[]],
  file: () => ({ delete: async () => undefined }),
};

function storage(): BucketLike {
  return isAdminConfigured() ? (adminBucket() as unknown as BucketLike) : NO_STORAGE;
}

export function purgeItems(workspaceId: string, purge: PurgeSet): Promise<number> {
  return purgeItemsCore(adminDb(), storage(), workspaceId, purge);
}

export function purgeExpiredQuarantine(workspaceId: string): Promise<number> {
  return purgeQuarantineCore(adminDb(), storage(), workspaceId);
}

export function expiredTrashOf(workspaceId: string, cutoff: Date): Promise<PurgeSet> {
  return expiredTrash(adminDb(), workspaceId, cutoff);
}
