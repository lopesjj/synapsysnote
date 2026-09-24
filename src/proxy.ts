import { NextResponse, type NextRequest } from "next/server";
import type { SupportedLanguage } from "@/types/models";
import { UNKNOWN_CLIENT_IP, clientIpOf } from "@/lib/api/client-ip";
import {
  DEFAULT_LOCALE,
  GEO_COOKIE_MAX_AGE,
  GEO_COUNTRY_COOKIE,
  SITE_LANG_COOKIE,
  USER_LANG_COOKIE,
  countryFromAcceptLanguage,
  isSupportedLanguage,
  languageForCountry,
  languageFromAcceptLanguage,
  localizePath,
  splitLocale,
} from "@/lib/i18n/locale";
import { CONSENT_COOKIE, allowsFunctionalCookies } from "@/lib/legal/consent";

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

const GEO_HEADERS = [
  "x-client-geo-country",
  "x-gclb-country",
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-appengine-country",
  "x-country-code",
];

const GEO_LOOKUP_TIMEOUT_MS = 900;

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

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

function legacyAppPath(path: string): string {
  if (path === "/app") return "/home";
  if (path.startsWith("/app/")) return `/home${path.slice("/app".length)}`;
  return path;
}

function isAppPath(path: string): boolean {
  return path === "/home" || path.startsWith("/home/");
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip === UNKNOWN_CLIENT_IP) return false;
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^(fc|fd|fe80)/i.test(ip)) return false;
  return true;
}

function validCountry(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

async function lookupCountry(request: NextRequest): Promise<string | null> {
  if (process.env.GEO_LOOKUP === "off") return null;
  const ip = clientIpOf(request);
  if (!isPublicIp(ip)) return null;
  const endpoint = process.env.GEO_LOOKUP_URL || "https://api.country.is/{ip}";
  try {
    const response = await fetch(endpoint.replace("{ip}", encodeURIComponent(ip)), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const country = data.country ?? data.country_code ?? data.countryCode;
    return typeof country === "string" ? validCountry(country) : null;
  } catch {
    return null;
  }
}

interface SiteLanguage {
  language: SupportedLanguage;
  lookedUpCountry: string | null;
}

async function detectSiteLanguage(request: NextRequest, geoCookieAllowed: boolean): Promise<SiteLanguage> {
  const chosen = request.cookies.get(SITE_LANG_COOKIE)?.value;
  if (isSupportedLanguage(chosen)) return { language: chosen, lookedUpCountry: null };

  for (const header of GEO_HEADERS) {
    const language = languageForCountry(validCountry(request.headers.get(header)));
    if (language) return { language, lookedUpCountry: null };
  }

  if (geoCookieAllowed) {
    const cached = languageForCountry(validCountry(request.cookies.get(GEO_COUNTRY_COOKIE)?.value));
    if (cached) return { language: cached, lookedUpCountry: null };

    const country = await lookupCountry(request);
    const fromIp = languageForCountry(country);
    if (fromIp) return { language: fromIp, lookedUpCountry: country };
  }

  const acceptLanguage = request.headers.get("accept-language");
  const language =
    languageForCountry(countryFromAcceptLanguage(acceptLanguage)) ??
    languageFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LOCALE;
  return { language, lookedUpCountry: null };
}

function redirect(
  request: NextRequest,
  host: string | null,
  path: string,
  lookedUpCountry: string | null = null
) {
  const search = request.nextUrl.search || "";
  const url = host ? new URL(`https://${host}${path}${search}`) : new URL(`${path}${search}`, request.nextUrl.origin);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  if (lookedUpCountry) {
    response.cookies.set(GEO_COUNTRY_COOKIE, lookedUpCountry, {
      path: "/",
      maxAge: GEO_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  }
  return response;
}

/**
 * O país detectado pelo IP só fica guardado em cookie com consentimento para
 * cookies funcionais. Sem ele (ou depois de uma recusa), o cookie antigo sai
 * na primeira resposta.
 */
export async function proxy(request: NextRequest) {
  const geoCookieAllowed = allowsFunctionalCookies(request.cookies.get(CONSENT_COOKIE)?.value);
  const response = await route(request, geoCookieAllowed);
  if (!geoCookieAllowed && request.cookies.has(GEO_COUNTRY_COOKIE)) {
    response.cookies.set(GEO_COUNTRY_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}

async function route(request: NextRequest, geoCookieAllowed: boolean) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/.well-known/") || pathname.startsWith("/__/")) return NextResponse.next();

  const { locale, path: rawPath } = splitLocale(pathname);
  if (rawPath.startsWith("/__/")) return NextResponse.next();
  const path = legacyAppPath(rawPath);
  const appRoute = isAppPath(path);

  if (!locale && !appRoute && /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  const hostname = getHostname(request);
  const local = isLocalHost(hostname);
  const isLoginHost = !local && (hostname === LOGIN_HOST || hostname === WWW_LOGIN_HOST);
  const isAppHost = !local && hostname === APP_HOST;
  const sameHost = local ? null : hostname;
  const hasSession = Boolean(request.cookies.get("synapsys_session")?.value);
  const params = request.nextUrl.searchParams;
  const leaving = params.get("logout") === "1" || params.get("session") === "sync_failed";

  const userCookie = request.cookies.get(USER_LANG_COOKIE)?.value;
  const userLanguage = isSupportedLanguage(userCookie) ? userCookie : null;

  let detected: SiteLanguage | null = null;
  const siteLanguage = async () => (detected ??= await detectSiteLanguage(request, geoCookieAllowed));
  const geoCookie = () => (geoCookieAllowed ? detected?.lookedUpCountry ?? null : null);

  if (path === "/" && hasSession && !leaving) {
    const language = userLanguage ?? locale ?? (await siteLanguage()).language;
    return redirect(request, local ? null : APP_HOST, `/${language}/home`, geoCookie());
  }

  if (appRoute) {
    const language = locale ?? userLanguage ?? (await siteLanguage()).language;
    const target = localizePath(path, language);
    if (!local && !isAppHost && (isLoginHost || !locale)) {
      return redirect(request, isLoginHost ? APP_HOST : sameHost, target, geoCookie());
    }
    if (!locale || rawPath !== path) return redirect(request, sameHost, target, geoCookie());
    return NextResponse.next();
  }

  const language = locale ?? (await siteLanguage()).language;
  const target = localizePath(path, language);

  if (hostname === WWW_LOGIN_HOST || (isAppHost && (path === "/" || path.startsWith("/auth/")))) {
    return redirect(request, LOGIN_HOST, target, geoCookie());
  }

  if (!locale) return redirect(request, sameHost, target, geoCookie());

  return NextResponse.next();
}

export { proxy as middleware };
export default proxy;

export const config = {
  matcher: [
    "/((?!api|__/|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons/|brand/|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
