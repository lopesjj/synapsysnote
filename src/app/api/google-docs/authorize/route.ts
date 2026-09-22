import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { ApiError, jsonError } from "@/lib/api/errors";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import { encodeGoogleDocsOauthState, GOOGLE_DOCS_OAUTH_COOKIE } from "@/lib/import/google-oauth";
import type { GoogleDocsIntegration } from "@/types/models";

export const runtime = "nodejs";

const SCOPES = ["drive.readonly", "documents.readonly"];

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      accessToken?: string;
      accountEmail?: string;
      accountName?: string;
      avatarUrl?: string;
    };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, body.workspaceId);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const accessToken = body.accessToken?.trim();

    if (accessToken) {
      if (!isAdminConfigured()) {
        throw new ApiError(
          503,
          "Firebase Admin não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON."
        );
      }

      const accountEmail = body.accountEmail?.trim() || user.email || "";
      const accountName = body.accountName?.trim() || user.name || "Conta Google";
      const avatarUrl = body.avatarUrl || null;

      const db = adminDb();
      const integrationRef = db
        .collection("workspaces")
        .doc(body.workspaceId)
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
            scopes: SCOPES,
            connectedBy: user.uid,
            connectedAt: FieldValue.serverTimestamp(),
            lastSyncAt: null,
            revokedAt: null,
          },
          { merge: true }
        );

        tx.set(integrationRef.collection("secure").doc("token"), {
          accessTokenCipher: encryptToken(accessToken),
          rotatedAt: FieldValue.serverTimestamp(),
        });
      });

      const integration: GoogleDocsIntegration = {
        id: "google-docs",
        provider: "google-docs",
        connected: true,
        accountEmail,
        accountName,
        avatarUrl,
        tokenPreview: tokenPreview(accessToken),
        scopes: SCOPES,
        connectedBy: user.uid,
        connectedAt: Date.now(),
        lastSyncAt: null,
        revokedAt: null,
      };

      return Response.json({ connected: integration });
    }

    if (!clientId) {
      return Response.json({ requiresPopup: true });
    }

    const origin = new URL(request.url).origin;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/google-docs/callback`;

    const state = encodeGoogleDocsOauthState({
      nonce: randomBytes(16).toString("hex"),
      workspaceId: body.workspaceId,
      uid: user.uid,
    });

    const jar = await cookies();
    jar.set(GOOGLE_DOCS_OAUTH_COOKIE, state, sharedCookieOptions(600));

    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set(
      "scope",
      "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents.readonly"
    );
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");

    return Response.json({ redirectUrl: authorizeUrl.toString() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
  dest.searchParams.set("error", "google_start_from_app");
  return NextResponse.redirect(dest);
}
