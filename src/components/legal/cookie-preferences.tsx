"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import { LEGAL_FACTS } from "@/lib/legal/entity";
import { useLegalStore } from "@/lib/legal/store";
import type { TextDirection } from "@/lib/i18n/locale";
import { useTranslation } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

function Row({
  title,
  description,
  control,
  dir,
}: {
  title: string;
  description: string;
  control: ReactNode;
  dir: TextDirection;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div dir={dir} className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      <div dir={dir} className="shrink-0 pt-0.5 text-[12.5px] text-faint">{control}</div>
    </div>
  );
}

export function CookiePreferences({ id, className }: { id?: string; className?: string }) {
  const { t, textDir } = useTranslation();
  const consent = useLegalStore((state) => state.consent);
  const saveConsent = useLegalStore((state) => state.saveConsent);
  const [functional, setFunctional] = useState(consent?.functional ?? false);
  const [syncedConsent, setSyncedConsent] = useState(consent);

  if (syncedConsent !== consent) {
    setSyncedConsent(consent);
    setFunctional(consent?.functional ?? false);
  }

  const dirty = !consent || consent.functional !== functional;

  const save = () => {
    saveConsent({ functional });
    toast.success(t("cookie_saved"));
  };

  return (
    <section
      id={id}
      dir="ltr"
      aria-labelledby="cookie-preferences-title"
      className={cn(
        "scroll-mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] px-5 pt-5 sm:px-6",
        className
      )}
    >
      <h2 id="cookie-preferences-title" dir={textDir} className="text-[15px] font-semibold text-ink">
        {t("cookie_your_choices")}
      </h2>
      <p dir={textDir} className="mt-1 text-[13px] leading-relaxed text-muted">{t("cookie_your_choices_desc")}</p>

      <div className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
        <Row dir={textDir} title={t("cookie_cat_essential")} description={t("cookie_cat_essential_desc")} control={t("cookie_always_on")} />
        <Row
          dir={textDir}
          title={t("cookie_cat_functional")}
          description={t("cookie_cat_functional_desc", { days: LEGAL_FACTS.geoDays })}
          control={
            <span dir="ltr" className="flex">
              <Switch checked={functional} onCheckedChange={setFunctional} aria-label={t("cookie_cat_functional")} />
            </span>
          }
        />
        <Row dir={textDir} title={t("cookie_cat_analytics")} description={t("cookie_cat_analytics_desc")} control={t("cookie_not_used")} />
        <Row dir={textDir} title={t("cookie_cat_ads")} description={t("cookie_cat_ads_desc")} control={t("cookie_not_used")} />
      </div>

      <div className="flex justify-end border-t border-[var(--border)] py-4">
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty}>
          {t("cookie_save")}
        </Button>
      </div>
    </section>
  );
}
