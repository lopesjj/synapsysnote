import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { ensureWorkspace } from "@/lib/api/session";
import {
  decodeOauthState,
  notionOauthErrorMessage,
  NOTION_OAUTH_COOKIE,
} from "@/lib/notion/server/oauth";

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

/**
 * ETAPA 3.1 — OAuth 2.0 callback.
 *
 * Exchanges the authorization code for a bot token, encrypts it and writes it to
 * `/workspaces/{workspaceId}/integrations/notion`. The document is written with
 * the Admin SDK because the security rules deny every client write on that path;
 * the ciphertext lives in the `secure` subcollection, which is denied even for
 * reads, so the browser can render connection status without ever seeing the
 * credential.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (message: string) =>
    NextResponse.redirect(`${url.origin}/app/integrations?error=${encodeURIComponent(message)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const notionError = url.searchParams.get("error");

  if (notionError) return fail(notionOauthErrorMessage(notionError));
  if (!code || !state) return fail("Resposta do Notion incompleta (code/state ausentes).");

  const jar = await cookies();
  const expectedState = jar.get(NOTION_OAUTH_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return fail("Falha na verificação de CSRF (state divergente).");
  }
  jar.delete(NOTION_OAUTH_COOKIE);

  const parsedState = decodeOauthState(state);
  if (!parsedState) return fail("State inválido.");

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${url.origin}/api/notion/callback`;
  if (!clientId || !clientSecret) return fail("Credenciais do Notion ausentes no servidor.");

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  const payload = (await response.json()) as NotionTokenResponse;
  if (!response.ok || !payload.access_token) {
    return fail(payload.error_description ?? payload.error ?? "Troca de token falhou.");
  }

  if (!isAdminConfigured()) {
    return fail(
      "Firebase Admin não configurado: defina FIREBASE_SERVICE_ACCOUNT_JSON para salvar a integração."
    );
  }

  await ensureWorkspace({ uid: parsedState.uid }, parsedState.workspaceId);

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

    // Ciphertext is isolated in a subcollection that no client rule can read.
    tx.set(integrationRef.collection("secure").doc("token"), {
      accessTokenCipher: encryptToken(payload.access_token),
      rotatedAt: FieldValue.serverTimestamp(),
    });
  });

  return NextResponse.redirect(`${url.origin}/app/integrations?connected=notion`);
}
