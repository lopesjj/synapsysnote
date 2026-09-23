"use client";

import type { ReactNode } from "react";
import { COOKIE_PREFERENCES_SECTION } from "@/components/legal/legal-article";
import { interpolateNodes } from "@/components/legal/legal-text";
import { LEGAL_ENTITY } from "@/lib/legal/entity";
import { preloadLegalBundle } from "@/lib/legal/load";
import { useLegalStore } from "@/lib/legal/store";
import type { LegalDocId } from "@/lib/legal/types";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import type { SupportedLanguage } from "@/types/models";
import { cn } from "@/lib/utils";

export function LegalTrigger({
  doc,
  section,
  className,
  children,
}: {
  doc: LegalDocId;
  section?: string;
  className?: string;
  children: ReactNode;
}) {
  const { language } = useTranslation();
  const openDoc = useLegalStore((state) => state.openDoc);
  return (
    <button
      type="button"
      onPointerEnter={() => preloadLegalBundle(language as SupportedLanguage)}
      onFocus={() => preloadLegalBundle(language as SupportedLanguage)}
      onClick={() => openDoc(doc, section ?? null)}
      className={className}
    >
      {children}
    </button>
  );
}

/** Linha de aceite sob o formulário de login. */
export function LegalConsentNotice({ className }: { className?: string }) {
  const { t, textDir } = useTranslation();
  const link =
    "font-medium text-muted underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:text-ink hover:decoration-current";
  return (
    <p dir={textDir} className={cn("text-center text-[11.5px] leading-relaxed text-faint", className)}>
      {interpolateNodes(t("legal_consent_notice"), {
        terms: (
          <LegalTrigger doc="terms" className={link}>
            {t("legal_consent_terms")}
          </LegalTrigger>
        ),
        privacy: (
          <LegalTrigger doc="privacy" className={link}>
            {t("legal_consent_privacy")}
          </LegalTrigger>
        ),
      })}
    </p>
  );
}

const FOOTER_LINKS: { doc: LegalDocId; label: TranslationKey }[] = [
  { doc: "terms", label: "legal_terms" },
  { doc: "privacy", label: "legal_privacy" },
  { doc: "cookies", label: "legal_cookies_short" },
];

export function LegalFooter({ className }: { className?: string }) {
  const { t, textDir } = useTranslation();
  const link = "rounded-[var(--radius-xs)] px-1.5 py-1 text-muted transition hover:text-ink";

  return (
    <footer className={cn("relative mx-auto w-full max-w-6xl px-6 pb-6", className)}>
      <div className="flex flex-col items-center gap-3 border-t border-[var(--border)] pt-5 text-[12px] sm:flex-row sm:justify-between">
        <p dir={textDir} className="text-faint">
          <bdi dir="ltr">
            © {new Date().getFullYear()} {LEGAL_ENTITY.brand}
          </bdi>
          <span aria-hidden className="mx-2">·</span>
          {t("legal_rights_reserved")}
        </p>
        <nav aria-label={t("legal_center")} className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          {FOOTER_LINKS.map((item, index) => (
            <span key={item.doc} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden className="text-[var(--border-strong)]">·</span> : null}
              <LegalTrigger doc={item.doc} className={link}>
                {t(item.label)}
              </LegalTrigger>
            </span>
          ))}
          <span aria-hidden className="text-[var(--border-strong)]">·</span>
          <LegalTrigger
            doc="cookies"
            section={COOKIE_PREFERENCES_SECTION}
            className={link}
          >
            {t("cookie_preferences")}
          </LegalTrigger>
        </nav>
      </div>
    </footer>
  );
}
