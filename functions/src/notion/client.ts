import { Client } from "@notionhq/client";
import { integrationRef } from "../lib/firebase";
import { decryptToken } from "../lib/crypto";

/**
 * Builds an authenticated Notion client for a workspace by decrypting the token
 * stored during the OAuth callback. The ciphertext lives in the `secure`
 * subcollection, unreadable by any client rule.
 */
export async function getNotionClient(workspaceId: string): Promise<Client> {
  const ref = integrationRef(workspaceId, "notion");
  const [integration, secret] = await Promise.all([
    ref.get(),
    ref.collection("secure").doc("token").get(),
  ]);

  if (!integration.exists || integration.get("connected") !== true) {
    throw new Error("failed-precondition: Notion integration is not connected");
  }

  const cipher = secret.get("accessTokenCipher") as string | undefined;
  if (!cipher) throw new Error("failed-precondition: stored Notion token is missing");

  return new Client({
    auth: decryptToken(cipher),
    notionVersion: "2022-06-28",
  });
}

/**
 * Notion allows ~3 requests/second per integration. Every call in the pipeline
 * goes through this helper, which paces requests and retries on 429/5xx with
 * exponential backoff plus jitter.
 */
export async function throttled<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    const result = await fn();
    await sleep(340);
    return result;
  } catch (error) {
    const status = (error as { status?: number }).status ?? 0;
    const retryable = status === 429 || status === 409 || status >= 500;
    if (!retryable || attempt >= 5) throw error;
    const backoff = Math.min(16_000, 2 ** attempt * 500) + Math.random() * 250;
    await sleep(backoff);
    return throttled(fn, attempt + 1);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
