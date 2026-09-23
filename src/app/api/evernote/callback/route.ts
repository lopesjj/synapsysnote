import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureWorkspace } from "@/lib/api/session";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";
import { appHref, resolveUrl } from "@/lib/domains";
import {
  decodeEvernoteOauthState,
  discoverAuthorizationServer,
  exchangeAuthorizationCode,
  fetchUserInfo,
  unpackEvernoteCookie,
  EVERNOTE_OAUTH_COOKIE,
} from "@/lib/evernote/oauth";
import { saveEvernoteConnection } from "@/lib/evernote/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = (query: { error?: string; connected?: string }) => {
    const dest = new URL(resolveUrl(appHref("/home/integrations"), url.origin));
    if (query.error) {
      dest.searchParams.set("error", query.error);
      dest.searchParams.set("provider", "evernote");
    }
    if (query.connected) dest.searchParams.set("connected", query.connected);
    return dest;
  };
  const fail = (code: string) => NextResponse.redirect(destination({ error: code }));

  const jar = await cookies();
  const stored = unpackEvernoteCookie(jar.get(EVERNOTE_OAUTH_COOKIE)?.value);
  jar.set(EVERNOTE_OAUTH_COOKIE, "", sharedCookieOptions(0));

  const oauthError = url.searchParams.get("error");
  if (oauthError) return fail(oauthError);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("evernote_incomplete_response");
  if (!stored || stored.state !== state) return fail("evernote_state_mismatch");

  const parsed = decodeEvernoteOauthState(state);
  if (!parsed) return fail("evernote_invalid_state");

  try {
    const metadata = await discoverAuthorizationServer();
    const tokens = await exchangeAuthorizationCode({
      metadata,
      code,
      verifier: stored.verifier,
      clientId: parsed.clientId,
      redirectUri: parsed.redirectUri,
    });

    await ensureWorkspace({ uid: parsed.uid }, parsed.workspaceId);
    const user = await fetchUserInfo(metadata, tokens.accessToken);

    await saveEvernoteConnection({
      workspaceId: parsed.workspaceId,
      uid: parsed.uid,
      clientId: parsed.clientId,
      tokens,
      user,
    });
  } catch (error) {
    console.warn("[evernote-callback] conexão falhou", error);
    return fail("evernote_connection_failed");
  }

  return NextResponse.redirect(destination({ connected: "evernote" }));
}
