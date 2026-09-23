export type LegalDocId = "terms" | "privacy" | "cookies";

export const LEGAL_DOC_IDS: readonly LegalDocId[] = ["terms", "privacy", "cookies"];

/**
 * Texto corrido aceita `**negrito**`, `[rótulo](destino)` e e-mails soltos.
 * Destinos: `doc:privacy`, `doc:privacy#retention`, `https://...`.
 * Placeholders como `{brand}` e `{privacyEmail}` são trocados antes.
 */
export type LegalBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalHighlight {
  title: string;
  text: string;
}

export interface LegalDocument {
  title: string;
  lead: string;
  highlights: LegalHighlight[];
  sections: LegalSection[];
}

export type LegalBundle = Record<LegalDocId, LegalDocument>;
