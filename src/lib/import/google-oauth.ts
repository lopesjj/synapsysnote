export const GOOGLE_DOCS_OAUTH_COOKIE = "google_docs_oauth_state";

export interface GoogleDocsOauthState {
  nonce: string;
  workspaceId: string;
  uid: string;
}

export function encodeGoogleDocsOauthState(state: GoogleDocsOauthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeGoogleDocsOauthState(raw: string): GoogleDocsOauthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GoogleDocsOauthState;
    if (!parsed.nonce || !parsed.workspaceId || !parsed.uid) return null;
    return parsed;
  } catch {
    return null;
  }
}
