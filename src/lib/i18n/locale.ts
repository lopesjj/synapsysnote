import type { SupportedLanguage } from "@/types/models";

export const LOCALES: readonly SupportedLanguage[] = ["pt", "en", "es", "fr", "it", "de", "ru", "ja", "zh", "ar"];

export const DEFAULT_LOCALE: SupportedLanguage = "pt";
export const FALLBACK_FOREIGN_LOCALE: SupportedLanguage = "en";

export const SITE_LANG_COOKIE = "synapsys_site_lang";
export const USER_LANG_COOKIE = "synapsys_lang";
export const GEO_COUNTRY_COOKIE = "synapsys_geo";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const HTML_LANG: Record<SupportedLanguage, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
  it: "it",
  de: "de",
  ru: "ru",
  ja: "ja",
  zh: "zh-CN",
  ar: "ar",
};

export const RTL_LANGUAGES: readonly SupportedLanguage[] = [];

export type TextDirection = "ltr" | "rtl";

export function textDirection(language: string): TextDirection {
  return (RTL_LANGUAGES as readonly string[]).includes(language) ? "rtl" : "ltr";
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

const COUNTRY_LANGUAGE: Record<string, SupportedLanguage> = {};

function assign(language: SupportedLanguage, countries: string) {
  for (const code of countries.split(" ")) COUNTRY_LANGUAGE[code] = language;
}

assign("pt", "BR PT AO MZ CV GW ST TL MO");
assign("es", "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ");
assign("fr", "FR BE MC LU SN CI CM ML BF NE TD GN BJ TG CG CD GA MG HT RE GP MQ GF NC PF DJ KM");
assign("it", "IT SM VA");
assign("de", "DE AT CH LI");
assign("ru", "RU BY KZ KG TJ");
assign("ja", "JP");
assign("zh", "CN TW HK SG");
assign("ar", "SA AE EG MA DZ TN LY JO LB SY IQ KW QA BH OM YE SD PS MR");

export function languageForCountry(country: string | null | undefined): SupportedLanguage | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return COUNTRY_LANGUAGE[code] ?? FALLBACK_FOREIGN_LOCALE;
}

interface LanguageRange {
  language: string;
  region: string | null;
  quality: number;
}

function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      const [language, ...rest] = tag.toLowerCase().split("-");
      const region = rest.find((subtag) => /^[a-z]{2}$/.test(subtag)) ?? null;
      return { language, region: region ? region.toUpperCase() : null, quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((range) => range.language && range.language !== "*" && range.quality > 0)
    .sort((a, b) => b.quality - a.quality);
}

export function countryFromAcceptLanguage(header: string | null | undefined): string | null {
  return parseAcceptLanguage(header).find((range) => range.region)?.region ?? null;
}

export function languageFromAcceptLanguage(header: string | null | undefined): SupportedLanguage | null {
  for (const range of parseAcceptLanguage(header)) {
    if (isSupportedLanguage(range.language)) return range.language;
  }
  return null;
}

export function splitLocale(pathname: string): { locale: SupportedLanguage | null; path: string } {
  const match = pathname.match(/^\/([^/?#]+)(.*)$/);
  if (match && isSupportedLanguage(match[1])) {
    const rest = match[2];
    return { locale: match[1], path: rest && rest !== "/" ? rest : "/" };
  }
  return { locale: null, path: pathname || "/" };
}

export function stripLocale(pathname: string): string {
  return splitLocale(pathname).path;
}

export function localizePath(path: string, locale: SupportedLanguage): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.startsWith("#")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const cut = normalized.search(/[?#]/);
  const pathname = cut === -1 ? normalized : normalized.slice(0, cut);
  const suffix = cut === -1 ? "" : normalized.slice(cut);
  const bare = stripLocale(pathname);
  return `/${locale}${bare === "/" ? "" : bare}${suffix}`;
}

export function ensureLocalized(path: string, locale: SupportedLanguage): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return splitLocale(path.split(/[?#]/)[0]).locale ? path : localizePath(path, locale);
}
