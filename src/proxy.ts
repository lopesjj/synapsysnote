import { NextResponse, type NextRequest } from "next/server";

/**
 * Send the marketing/login host and the app host to the right surfaces.
 * API routes stay on whichever host called them.
 */
export function proxy(request: NextRequest) {
  const host = request.nextUrl.host;
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Direciona o domínio raiz synapsysnt.com.br para o subdomínio do aplicativo app.synapsysnt.com.br
  if (host === "synapsysnt.com.br" || host === "www.synapsysnt.com.br") {
    return NextResponse.redirect(`https://app.synapsysnt.com.br${pathname}${search}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
