import { NextResponse, type NextRequest } from "next/server";

const LOGIN_HOST = "synapsysnt.com.br";
const WWW_LOGIN_HOST = "www.synapsysnt.com.br";
const APP_HOST = "app.synapsysnt.com.br";

function redirectToHost(request: NextRequest, host: string, pathname = request.nextUrl.pathname) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

function appPath(pathname: string): string | null {
  if (pathname === "/home" || pathname.startsWith("/home/")) return pathname;
  if (pathname === "/app") return "/home";
  if (pathname.startsWith("/app/")) return `/home${pathname.slice("/app".length)}`;
  return null;
}

/**
 * Keep authentication on the apex and the authenticated workspace on `app`.
 *
 * This is deliberately route-based, rather than session-based: Proxy is not a
 * session authority, and the client completes the Firebase-to-cookie handoff
 * before navigating to the workspace. API routes stay on the calling host so
 * the shared session cookie can be created and cleared normally.
 */
export function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Canonicalize www without sending a login request straight into the app.
  if (hostname === WWW_LOGIN_HOST) {
    return redirectToHost(request, LOGIN_HOST);
  }

  // The apex owns landing, login, password-reset and account-completion
  // routes. Only workspace routes cross to the application subdomain.
  if (hostname === LOGIN_HOST) {
    const destination = appPath(pathname);
    if (destination) return redirectToHost(request, APP_HOST, destination);
    return NextResponse.next();
  }

  // A direct visit to the app root (or a Firebase password action opened on
  // it) must return to the host that owns those flows. This also prevents a
  // stale bookmark from bypassing the cross-host session handoff.
  if (hostname === APP_HOST && (pathname === "/" || pathname.startsWith("/auth/"))) {
    return redirectToHost(request, LOGIN_HOST);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
