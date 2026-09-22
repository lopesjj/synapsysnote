"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/store/ui-store";
import { useLocale, usePathname, useRouter } from "@/lib/i18n/navigation";
import { localizePath } from "@/lib/i18n/locale";
import { rememberUserLanguage } from "@/lib/i18n/locale-cookies";

export function useLocaleUrlSync(preferencesReady: boolean): void {
  const language = useUiStore((state) => state.language) || "pt";
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!preferencesReady) return;
    rememberUserLanguage(language);
    if (language === locale) return;
    const { search, hash } = window.location;
    router.replace(`${localizePath(pathname, language)}${search}${hash}`, { scroll: false });
  }, [language, locale, pathname, preferencesReady, router]);
}
