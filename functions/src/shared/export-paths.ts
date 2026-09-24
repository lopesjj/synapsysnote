export const EXPORT_PREFIX = "exports/";
export const EXPORT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export function exportPrefixOf(uid: string): string {
  return `${EXPORT_PREFIX}${uid}/`;
}
