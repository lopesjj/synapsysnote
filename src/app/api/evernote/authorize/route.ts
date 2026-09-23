import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import {
  buildAuthorizeUrl,
  createPkcePair,
  discoverAuthorizationServer,
  encodeEvernoteOauthState,
  packEvernoteCookie,
  resolveClientId,
  EVERNOTE_OAUTH_COOKIE,
} from "@/lib/evernote/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
    if (!body.workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, body.workspaceId);

    const origin = new URL(request.url).origin;
    const redirectUri = process.env.EVERNOTE_REDIRECT_URI ?? `${origin}/api/evernote/callback`;

    const metadata = await discoverAuthorizationServer();
    const clientId = await resolveClientId(metadata, redirectUri);
    const { verifier, challenge } = createPkcePair();

    const state = encodeEvernoteOauthState({
      nonce: randomBytes(16).toString("hex"),
      workspaceId: body.workspaceId,
      uid: user.uid,
      clientId,
      redirectUri,
    });

    const jar = await cookies();
    jar.set(EVERNOTE_OAUTH_COOKIE, packEvernoteCookie(state, verifier), sharedCookieOptions(900));

    return Response.json({
      redirectUrl: buildAuthorizeUrl({ metadata, clientId, redirectUri, state, challenge }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
  dest.searchParams.set("error", "evernote_start_from_app");
  dest.searchParams.set("provider", "evernote");
  return NextResponse.redirect(dest);
}
