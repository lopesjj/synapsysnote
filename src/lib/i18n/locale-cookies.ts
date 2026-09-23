import type { SupportedLanguage } from "@/types/models";
import { readCookie, writeCookie } from "@/lib/browser-cookies";
import {
  LOCALE_COOKIE_MAX_AGE,
  SITE_LANG_COOKIE,
  USER_LANG_COOKIE,
  isSupportedLanguage,
} from "./locale";

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
