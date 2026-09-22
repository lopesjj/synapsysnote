"use client";

import { Check, ChevronDown } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { SUPPORTED_LANGUAGES, getLanguageDefinition } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/locale";
import { rememberSiteLanguage } from "@/lib/i18n/locale-cookies";
import { useLocale, usePathname, useRouter } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n/translations";
import type { SupportedLanguage } from "@/types/models";
import { cn } from "@/lib/utils";

function GlobeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M1.9 8h12.2M8 1.75c1.7 1.75 2.55 3.83 2.55 6.25S9.7 12.5 8 14.25M8 1.75C6.3 3.5 5.45 5.58 5.45 8S6.3 12.5 8 14.25"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteLanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const current = getLanguageDefinition(locale);

  const choose = (code: SupportedLanguage) => {
    rememberSiteLanguage(code);
    if (code === locale) return;
    const { search, hash } = window.location;
    router.replace(`${localizePath(pathname, code)}${search}${hash}`, { scroll: false });
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={t("site_language_label")}
        className={cn(
          "group inline-flex h-8 items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] ps-2.5 pe-2 text-[12px] text-muted backdrop-blur-sm transition",
          "hover:border-[var(--border-strong)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 data-[state=open]:border-[var(--border-strong)] data-[state=open]:text-ink",
          className
        )}
      >
        <GlobeGlyph className="size-3.5 shrink-0 opacity-80" />
        <span className="hidden sm:inline" dir="auto">
          {current.nativeName}
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] sm:hidden">{current.code}</span>
        <ChevronDown className="size-3 opacity-60 transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </MenuTrigger>
      <MenuContent align="end" className="w-[212px] p-1">
        <MenuLabel>{t("site_language_label")}</MenuLabel>
        {SUPPORTED_LANGUAGES.map((language) => {
          const active = language.code === locale;
          return (
            <MenuItem
              key={language.code}
              onSelect={() => choose(language.code)}
              lang={language.code}
              className={cn("justify-between", active && "text-ink")}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-3.5 items-center justify-center",
                    active ? "text-[var(--accent)] [&_svg]:!text-[var(--accent)]" : "opacity-0"
                  )}
                >
                  <Check strokeWidth={2.25} />
                </span>
                <span dir="auto" className={cn(active && "font-medium")}>
                  {language.nativeName}
                </span>
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{language.code}</span>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
