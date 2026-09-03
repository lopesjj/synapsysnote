import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/**
 * ETAPA 3.1 — OAuth 2.0 redirect.
 *
 * Sends the browser to Notion's consent screen with a single-use `state` value
 * stored in an httpOnly cookie (CSRF defense). The workspace id travels inside
 * the state so the callback knows where to persist the integration.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "primary";
  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri =
    process.env.NOTION_REDIRECT_URI ?? `${url.origin}/api/notion/callback`;

  if (!clientId) {
    return NextResponse.redirect(
      `${url.origin}/app/integrations?error=${encodeURIComponent(
        "NOTION_CLIENT_ID nao configurado. Veja o README (ETAPA 7)."
      )}`
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ nonce, workspaceId })).toString("base64url");

  const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("owner", "user");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const jar = await cookies();
  jar.set("notion_oauth_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl.toString());
}
