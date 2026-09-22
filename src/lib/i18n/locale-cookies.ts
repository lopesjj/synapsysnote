import type { SupportedLanguage } from "@/types/models";
import { cookieParentDomain } from "@/lib/domains";
import {
  LOCALE_COOKIE_MAX_AGE,
  SITE_LANG_COOKIE,
  USER_LANG_COOKIE,
  isSupportedLanguage,
} from "./locale";

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const domain = cookieParentDomain();
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${maxAge}`,
    "samesite=lax",
  ];
  if (domain) parts.push(`domain=${domain}`);
  if (window.location.protocol === "https:") parts.push("secure");
  document.cookie = parts.join("; ");
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export function rememberSiteLanguage(language: SupportedLanguage) {
  writeCookie(SITE_LANG_COOKIE, language, LOCALE_COOKIE_MAX_AGE);
}

export function rememberUserLanguage(language: SupportedLanguage) {
  if (readCookie(USER_LANG_COOKIE) === language) return;
  writeCookie(USER_LANG_COOKIE, language, LOCALE_COOKIE_MAX_AGE);
}

export function forgetUserLanguage() {
  writeCookie(USER_LANG_COOKIE, "", 0);
}

export function readUserLanguage(): SupportedLanguage | null {
  const value = readCookie(USER_LANG_COOKIE);
  return isSupportedLanguage(value) ? value : null;
}
