import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { GEO_COUNTRY_COOKIE } from "@/lib/i18n/locale";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return new NextResponse(null, { status: 403, headers: NO_STORE });
  }

  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  response.cookies.set(GEO_COUNTRY_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  return response;
}
