import type { SupportedLanguage } from "@/types/models";
import type { LegalBundle } from "./types";

type Loader = () => Promise<{ default: LegalBundle }>;

/**
 * Cada idioma vira um chunk separado: a página de login não carrega texto
 * jurídico até alguém abrir um documento (ou passar o mouse no link).
 */
export const LEGAL_LOADERS: Record<SupportedLanguage, Loader> = {
  pt: () => import("./documents/pt"),
  en: () => import("./documents/en"),
  es: () => import("./documents/es"),
  fr: () => import("./documents/fr"),
  it: () => import("./documents/it"),
  de: () => import("./documents/de"),
  ru: () => import("./documents/ru"),
  ja: () => import("./documents/ja"),
  zh: () => import("./documents/zh"),
  ar: () => import("./documents/ar"),
};

const cache = new Map<SupportedLanguage, Promise<LegalBundle>>();

export function loadLegalBundle(language: SupportedLanguage): Promise<LegalBundle> {
  let pending = cache.get(language);
  if (!pending) {
    const loader = LEGAL_LOADERS[language] ?? LEGAL_LOADERS.en;
    pending = loader().then((module) => module.default);
    pending.catch(() => cache.delete(language));
    cache.set(language, pending);
  }
  return pending;
}

export function preloadLegalBundle(language: SupportedLanguage) {
  void loadLegalBundle(language).catch(() => {});
}
