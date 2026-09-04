export const NOTION_OAUTH_COOKIE = "notion_oauth_state";

export interface NotionOauthState {
  nonce: string;
  workspaceId: string;
  uid: string;
}

export function encodeOauthState(state: NotionOauthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOauthState(raw: string): NotionOauthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as NotionOauthState;
    if (!parsed.nonce || !parsed.workspaceId || !parsed.uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function notionOauthErrorMessage(code: string): string {
  if (code === "access_denied") return "A autorização no Notion foi cancelada.";
  if (code === "restricted_workspace" || /restring|restricted/i.test(code)) {
    return "Esta conexão Notion só aceita workspaces escolhidos pelo desenvolvedor. Recrie a integração pública com o escopo Any workspace.";
  }
  return code;
}
