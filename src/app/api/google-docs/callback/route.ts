import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { ensureWorkspace } from "@/lib/api/session";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import { decodeGoogleDocsOauthState, GOOGLE_DOCS_OAUTH_COOKIE } from "@/lib/import/google-oauth";

export const runtime = "nodejs";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = (query: { error?: string; connected?: string }) => {
    const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
    if (query.error) {
      dest.searchParams.set("error", query.error);
      dest.searchParams.set("provider", "google-docs");
    }
    if (query.connected) dest.searchParams.set("connected", query.connected);
    return dest;
  };
  const fail = (message: string) => NextResponse.redirect(destination({ error: message }));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(GOOGLE_DOCS_OAUTH_COOKIE)?.value;
  jar.set(GOOGLE_DOCS_OAUTH_COOKIE, "", sharedCookieOptions(0));

  if (googleError) return fail(googleError);
  if (!code || !state) return fail("google_incomplete_response");
  if (!expectedState || expectedState !== state) return fail("google_state_mismatch");

  const parsedState = decodeGoogleDocsOauthState(state);
  if (!parsedState) return fail("google_invalid_state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${url.origin}/api/google-docs/callback`;
  if (!clientId || !clientSecret) return fail("google_client_not_configured");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    console.warn("[google-callback] troca de token falhou", payload.error, payload.error_description);
    return fail(payload.error === "access_denied" ? "access_denied" : "google_token_exchange_failed");
  }

  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  let accountEmail = "";
  let accountName = "Conta Google";
  let avatarUrl: string | null = null;

  try {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userRes.ok) {
      const userInfo = (await userRes.json()) as GoogleUserInfo;
      if (userInfo.email) accountEmail = userInfo.email;
      if (userInfo.name) accountName = userInfo.name;
      if (userInfo.picture) avatarUrl = userInfo.picture;
    }
  } catch {}

  if (!isAdminConfigured()) return fail("firebase_admin_not_configured");

  try {
    await ensureWorkspace({ uid: parsedState.uid }, parsedState.workspaceId);
  } catch {
    return fail("google_connection_failed");
  }

  const db = adminDb();
  const integrationRef = db
    .collection("workspaces")
    .doc(parsedState.workspaceId)
    .collection("integrations")
    .doc("google-docs");

  await db.runTransaction(async (tx) => {
    tx.set(
      integrationRef,
      {
        id: "google-docs",
        provider: "google-docs",
        connected: true,
        accountEmail,
        accountName,
        avatarUrl,
        tokenPreview: tokenPreview(accessToken),
        scopes: ["drive.readonly", "documents.readonly"],
        connectedBy: parsedState.uid,
        connectedAt: FieldValue.serverTimestamp(),
        tokenExpiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
        refreshable: Boolean(refreshToken),
        lastSyncAt: null,
        revokedAt: null,
      },
      { merge: true }
    );

    tx.set(integrationRef.collection("secure").doc("token"), {
      accessTokenCipher: encryptToken(accessToken),
      ...(refreshToken ? { refreshTokenCipher: encryptToken(refreshToken) } : {}),
      rotatedAt: FieldValue.serverTimestamp(),
    });
  });

  return NextResponse.redirect(destination({ connected: "google-docs" }));
}
