"use client";

import { useEffect, type ReactNode } from "react";
import type { SupportedLanguage } from "@/types/models";
import { PageLanguageContext } from "@/lib/i18n/translations";
import { HTML_LANG } from "@/lib/i18n/locale";

export function PublicLocaleProvider({
  language,
  children,
}: {
  language: SupportedLanguage;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.setAttribute("lang", HTML_LANG[language]);
  }, [language]);

  return <PageLanguageContext.Provider value={language}>{children}</PageLanguageContext.Provider>;
}
