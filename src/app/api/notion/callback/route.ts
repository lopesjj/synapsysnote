import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { ensureWorkspace } from "@/lib/api/session";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import { decodeOauthState, NOTION_OAUTH_COOKIE } from "@/lib/notion/server/oauth";

export const runtime = "nodejs";

interface NotionTokenResponse {
  access_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  owner?: { user?: { id?: string; name?: string } };
  error?: string;
  error_description?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const integrationsUrl = (query?: { error?: string; connected?: string }) => {
    const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
    if (query?.error) {
      dest.searchParams.set("error", query.error);
      dest.searchParams.set("provider", "notion");
    }
    if (query?.connected) dest.searchParams.set("connected", query.connected);
    return dest;
  };
  const fail = (message: string) => NextResponse.redirect(integrationsUrl({ error: message }));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const notionError = url.searchParams.get("error");

  if (notionError) return fail(notionError);
  if (!code || !state) return fail("notion_incomplete_response");

  const jar = await cookies();
  const expectedState = jar.get(NOTION_OAUTH_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return fail("notion_state_mismatch");
  }
  jar.set(NOTION_OAUTH_COOKIE, "", sharedCookieOptions(0));

  const parsedState = decodeOauthState(state);
  if (!parsedState) return fail("notion_invalid_state");

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${url.origin}/api/notion/callback`;
  if (!clientId || !clientSecret) return fail("notion_client_not_configured");

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  const payload = (await response.json().catch(() => ({}))) as NotionTokenResponse;
  if (!response.ok || !payload.access_token) {
    console.warn("[notion-callback] troca de token falhou", payload.error, payload.error_description);
    return fail(payload.error === "access_denied" ? "access_denied" : "notion_token_exchange_failed");
  }

  if (!isAdminConfigured()) return fail("firebase_admin_not_configured");

  try {
    await ensureWorkspace({ uid: parsedState.uid }, parsedState.workspaceId);
  } catch {
    return fail("notion_connection_failed");
  }

  const db = adminDb();
  const integrationRef = db
    .collection("workspaces")
    .doc(parsedState.workspaceId)
    .collection("integrations")
    .doc("notion");

  await db.runTransaction(async (tx) => {
    tx.set(
      integrationRef,
      {
        id: "notion",
        provider: "notion",
        connected: true,
        workspaceName: payload.workspace_name ?? "Workspace do Notion",
        workspaceIcon: payload.workspace_icon ?? null,
        notionWorkspaceId: payload.workspace_id,
        botId: payload.bot_id,
        tokenPreview: tokenPreview(payload.access_token),
        scopes: ["read_content"],
        connectedBy: parsedState.uid,
        notionOwnerId: payload.owner?.user?.id ?? null,
        connectedAt: FieldValue.serverTimestamp(),
        lastSyncAt: null,
        revokedAt: null,
      },
      { merge: true }
    );

    tx.set(integrationRef.collection("secure").doc("token"), {
      accessTokenCipher: encryptToken(payload.access_token),
      rotatedAt: FieldValue.serverTimestamp(),
    });
  });

  return NextResponse.redirect(integrationsUrl({ connected: "notion" }));
}
