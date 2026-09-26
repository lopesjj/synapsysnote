"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COOKIE_PREFERENCES_SECTION } from "@/components/legal/legal-article";
import { LEGAL_FACTS } from "@/lib/legal/entity";
import { preloadLegalBundle } from "@/lib/legal/load";
import { useLegalStore } from "@/lib/legal/store";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import type { SupportedLanguage } from "@/types/models";

/**
 * Aviso discreto, sem bloquear a página. Recusar tem o mesmo peso de aceitar,
 * como pede o guia de cookies da ANPD, e nada opcional é gravado antes da
 * escolha.
 */
export function CookieBanner() {
  const { t, language, textDir } = useTranslation();
  const consent = useLegalStore((state) => state.consent);
  const legalOpen = useLegalStore((state) => state.open);
  const saveConsent = useLegalStore((state) => state.saveConsent);
  const openDoc = useLegalStore((state) => state.openDoc);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const visible = consent === null && !legalOpen;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.section
          key="cookie-banner"
          role="region"
          aria-label={t("cookie_preferences")}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-3 bottom-3 z-50 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/95 p-3.5 shadow-[var(--shadow-float)] backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:end-5 sm:start-auto sm:w-[360px] sm:p-4"
        >
          <div className="flex items-start gap-2.5">
            <Cookie className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <p dir={textDir} className="text-[12px] leading-relaxed text-ink/85 sm:text-[12.5px]">
              {t("cookie_banner_text", { days: LEGAL_FACTS.geoDays })}
            </p>
            <button
              type="button"
              onClick={() => saveConsent({ functional: false })}
              aria-label={t("btn_close")}
              className="-me-1 -mt-1 shrink-0 rounded-md p-1 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" size="sm" className="h-7 px-2.5 text-[11.5px] sm:h-8 sm:px-3 sm:text-[12px]" onClick={() => saveConsent({ functional: false })}>
              {t("cookie_reject")}
            </Button>
            <Button variant="primary" size="sm" className="h-7 px-2.5 text-[11.5px] sm:h-8 sm:px-3 sm:text-[12px]" onClick={() => saveConsent({ functional: true })}>
              {t("cookie_accept")}
            </Button>
            <button
              type="button"
              onPointerEnter={() => preloadLegalBundle(language as SupportedLanguage)}
              onClick={() => openDoc("cookies", COOKIE_PREFERENCES_SECTION)}
              className="ms-auto text-[11.5px] text-muted underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:text-ink hover:decoration-current sm:text-[12px]"
            >
              {t("cookie_customize")}
            </button>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
