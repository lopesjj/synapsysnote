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
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
];

interface TokenInfo {
  email?: string;
  scope?: string;
  expires_in?: string | number;
  error_description?: string;
}

/**
 * O token do pop-up chega do navegador: antes de guardar, o Google confirma que
 * ele vale, que tem os escopos pedidos e de qual conta ele e.
 */
async function inspectAccessToken(accessToken: string): Promise<TokenInfo> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) }
  ).catch(() => null);
  if (!response?.ok) throw new ApiError(400, "google_token_invalid");
  const info = (await response.json().catch(() => ({}))) as TokenInfo;
  const granted = new Set(String(info.scope ?? "").split(" ").filter(Boolean));
  if (!REQUIRED_SCOPES.every((scope) => granted.has(scope))) {
    throw new ApiError(400, "google_scope_missing");
  }
  return info;
}

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

      const info = await inspectAccessToken(accessToken);
      const accountEmail = info.email || body.accountEmail?.trim() || user.email || "";
      const accountName = body.accountName?.trim().slice(0, 120) || user.name || "Conta Google";
      const avatarUrl =
        typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("https://") ? body.avatarUrl : null;
      const expiresInSeconds = Number(info.expires_in);
      const tokenExpiresAt =
        Date.now() + (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3300) * 1000;

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
            tokenExpiresAt,
            refreshable: false,
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
        tokenExpiresAt,
        refreshable: false,
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
  dest.searchParams.set("provider", "google-docs");
  return NextResponse.redirect(dest);
}
