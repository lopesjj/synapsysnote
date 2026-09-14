import { NextResponse, type NextRequest } from "next/server";

const LOGIN_HOST = (
  process.env.NEXT_PUBLIC_LOGIN_ORIGIN
    ? new URL(process.env.NEXT_PUBLIC_LOGIN_ORIGIN).hostname
    : "synapsysnt.com.br"
)
  .toLowerCase()
  .replace(/^www\./, "");
const WWW_LOGIN_HOST = `www.${LOGIN_HOST}`;
const APP_HOST = (
  process.env.NEXT_PUBLIC_APP_ORIGIN
    ? new URL(process.env.NEXT_PUBLIC_APP_ORIGIN).hostname
    : "app.synapsysnt.com.br"
).toLowerCase();

function getHostname(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    return forwardedHost.split(",")[0].trim().split(":")[0].toLowerCase();
  }
  const host = request.headers.get("host");
  if (host) {
    return host.split(":")[0].toLowerCase();
  }
  return request.nextUrl.hostname.toLowerCase();
}

function redirectToHost(request: NextRequest, host: string, pathname = request.nextUrl.pathname) {
  const search = request.nextUrl.search || "";
  const url = new URL(`https://${host}${pathname}${search}`);
  return NextResponse.redirect(url);
}

function appPath(pathname: string): string | null {
  if (pathname === "/home" || pathname.startsWith("/home/")) return pathname;
  if (pathname === "/app") return "/home";
  if (pathname.startsWith("/app/")) return `/home${pathname.slice("/app".length)}`;
  return null;
}

export function proxy(request: NextRequest) {
  const hostname = getHostname(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get("synapsys_session")?.value);

  if (hostname === WWW_LOGIN_HOST) {
    const destination = appPath(pathname);
    if (destination) {
      return redirectToHost(request, APP_HOST, destination);
    }
    if (pathname === "/" && hasSession) {
      return redirectToHost(request, APP_HOST, "/home");
    }
    return redirectToHost(request, LOGIN_HOST, pathname);
  }

  if (hostname === LOGIN_HOST) {
    const destination = appPath(pathname);
    if (destination) {
      return redirectToHost(request, APP_HOST, destination);
    }
    if (pathname === "/" && hasSession) {
      return redirectToHost(request, APP_HOST, "/home");
    }
    return NextResponse.next();
  }

  if (hostname === APP_HOST && (pathname === "/" || pathname.startsWith("/auth/"))) {
    if (pathname === "/" && hasSession) {
      const search = request.nextUrl.search || "";
      const url = new URL(`https://${APP_HOST}/home${search}`);
      return NextResponse.redirect(url);
    }
    return redirectToHost(request, LOGIN_HOST, pathname);
  }

  if (pathname === "/" && hasSession) {
    const search = request.nextUrl.search || "";
    const url = new URL(`https://${APP_HOST}/home${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export { proxy as middleware };
export default proxy;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
