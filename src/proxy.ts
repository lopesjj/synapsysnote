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

export function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (hostname === WWW_LOGIN_HOST) {
    return redirectToHost(request, LOGIN_HOST);
  }

  if (hostname === LOGIN_HOST) {
    const destination = appPath(pathname);
    if (destination) return redirectToHost(request, APP_HOST, destination);
    return NextResponse.next();
  }

  if (hostname === APP_HOST && (pathname === "/" || pathname.startsWith("/auth/"))) {
    return redirectToHost(request, LOGIN_HOST);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
