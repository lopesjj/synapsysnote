import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { decryptToken } from "@/lib/crypto/token-cipher";

const REVOKE_TIMEOUT_MS = 8_000;
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const NOTION_REVOKE_URL = "https://api.notion.com/v1/oauth/revoke";
const NOTION_VERSION = "2022-06-28";

const ACCOUNT_FIELDS = {
  notion: [
    "workspaceName",
    "workspaceIcon",
    "notionWorkspaceId",
    "notionOwnerId",
    "botId",
    "tokenPreview",
    "connectedBy",
  ],
  "google-docs": ["accountEmail", "accountName", "avatarUrl", "tokenPreview", "connectedBy"],
  evernote: ["username", "displayName", "accountEmail", "avatarUrl", "tokenPreview", "connectedBy"],
} as const;

export type DisconnectableIntegration = keyof typeof ACCOUNT_FIELDS;

export function disconnectedIntegrationPatch(provider: DisconnectableIntegration) {
  const cleared: Record<string, FieldValue> = {};
  for (const field of ACCOUNT_FIELDS[provider]) cleared[field] = FieldValue.delete();
  return {
    ...cleared,
    connected: false,
    revokedAt: FieldValue.serverTimestamp(),
  };
}

export function readStoredToken(cipher: unknown): string | null {
  if (typeof cipher !== "string" || !cipher) return null;
  try {
    return decryptToken(cipher) || null;
  } catch {
    return null;
  }
}

export async function settleWithin(
  task: Promise<unknown>,
  timeoutMs: number = REVOKE_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function postRevocation(url: string, init: RequestInit): Promise<void> {
  try {
    const response = await fetch(url, {
      ...init,
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
  } catch {}
}

export async function revokeGoogleToken(token: string | null): Promise<void> {
  if (!token || token.startsWith("demo_")) return;
  await postRevocation(GOOGLE_REVOKE_URL, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export async function revokeNotionToken(token: string | null): Promise<void> {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!token || !clientId || !clientSecret) return;
  await postRevocation(NOTION_REVOKE_URL, {
    headers: {
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ token }),
  });
}
