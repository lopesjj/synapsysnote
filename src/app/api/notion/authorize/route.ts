import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import { encodeOauthState, NOTION_OAUTH_COOKIE } from "@/lib/notion/server/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, body.workspaceId);
    const clientId = process.env.NOTION_CLIENT_ID;
    const origin = new URL(request.url).origin;
    const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${origin}/api/notion/callback`;

    if (!clientId) {
      return Response.json(
        { error: "NOTION_CLIENT_ID não configurado. Veja o README (ETAPA 7)." },
        { status: 503 }
      );
    }

    const state = encodeOauthState({
      nonce: randomBytes(16).toString("hex"),
      workspaceId: body.workspaceId,
      uid: user.uid,
    });

    const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("owner", "user");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);

    const jar = await cookies();
    jar.set(NOTION_OAUTH_COOKIE, state, sharedCookieOptions(600));

    return Response.json({ redirectUrl: authorizeUrl.toString() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
  dest.searchParams.set("error", "notion_start_from_app");
  dest.searchParams.set("provider", "notion");
  return NextResponse.redirect(dest);
}
