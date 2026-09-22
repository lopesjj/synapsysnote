import type { SupportedLanguage } from "@/types/models";
import { localizePath } from "@/lib/i18n/locale";

function trimOrigin(value: string | undefined): string {
  return value?.trim().replace(/\/$/, "") ?? "";
}

export const LOGIN_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_LOGIN_ORIGIN) || "https://synapsysnt.com.br";
export const APP_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN) || "https://app.synapsysnt.com.br";

export function isSplitHosts(): boolean {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }
  }
  return Boolean(LOGIN_ORIGIN && APP_ORIGIN && LOGIN_ORIGIN !== APP_ORIGIN);
}

export function cookieParentDomain(): string | undefined {
  if (process.env.NODE_ENV !== "production") return undefined;
  if (!isSplitHosts()) return undefined;
  try {
    const loginHost = new URL(LOGIN_ORIGIN).hostname.replace(/^www\./, "");
    const appHost = new URL(APP_ORIGIN).hostname;
    if (appHost.endsWith(`.${loginHost}`) || loginHost === appHost) {
      return `.${loginHost}`;
    }
  } catch {}
  return undefined;
}

export function loginHref(path = "/", language?: SupportedLanguage): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const localized = language ? localizePath(normalized, language) : normalized;
  return isSplitHosts() ? `${LOGIN_ORIGIN}${localized}` : localized;
}

export function appHref(path = "/home", language?: SupportedLanguage): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const localized = language ? localizePath(normalized, language) : normalized;
  return isSplitHosts() ? `${APP_ORIGIN}${localized}` : localized;
}

export function resolveUrl(href: string, fallbackOrigin: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return new URL(href, fallbackOrigin).toString();
}

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

export function isAppHost(hostname = currentHostname()): boolean {
  if (!isSplitHosts()) return false;
  try {
    const appHost = new URL(APP_ORIGIN).hostname.toLowerCase();
    const current = hostname.toLowerCase();
    return current === appHost;
  } catch {
    return false;
  }
}

export function isLoginHost(hostname = currentHostname()): boolean {
  if (!isSplitHosts()) return false;
  try {
    const loginHost = new URL(LOGIN_ORIGIN).hostname.toLowerCase().replace(/^www\./, "");
    const current = hostname.toLowerCase().replace(/^www\./, "");
    return current === loginHost;
  } catch {
    return false;
  }
}

export function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function navigateTo(
  href: string,
  router?: { push: (path: string) => void; replace: (path: string) => void },
  mode: "push" | "replace" = "push"
) {
  if (typeof window === "undefined") return;
  const absolute = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  const url = new URL(absolute);
  if (url.origin !== window.location.origin) {
    if (mode === "replace") window.location.replace(absolute);
    else window.location.assign(absolute);
    return;
  }
  const local = `${url.pathname}${url.search}${url.hash}`;
  if (router) {
    router[mode](local);
    return;
  }
  if (mode === "replace") window.location.replace(local);
  else window.location.assign(local);
}
