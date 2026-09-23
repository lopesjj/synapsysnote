"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { LegalTrigger } from "@/components/legal/legal-links";
import { interpolateNodes } from "@/components/legal/legal-text";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { recordLegalAcceptance } from "@/lib/data/user-profile";
import { useTranslation } from "@/lib/i18n/translations";
import { LEGAL_FACTS, LEGAL_UPDATED_AT } from "@/lib/legal/entity";

const LEGAL_LINK_CLASS =
  "font-medium text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:decoration-current";

export function LegalReacceptForm() {
  const { t, textDir, language } = useTranslation();
  const { user, signOut } = useAuth();
  const { complete } = useUserProfile();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const updatedOn = new Date(`${LEGAL_UPDATED_AT}T12:00:00`).toLocaleDateString(
    language === "pt" ? "pt-BR" : language
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accepted || !user) return;
    setBusy(true);
    try {
      await recordLegalAcceptance(user.uid);
      await complete();
    } catch {
      toast.error(t("legal_reaccept_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">
        {t("legal_reaccept_title")}
      </p>
      <p dir={textDir} className="text-start mt-1 text-[13px] leading-relaxed text-muted">
        {t("legal_reaccept_text", { date: updatedOn })}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-relaxed text-muted">
          <Checkbox
            checked={accepted}
            onCheckedChange={(value) => setAccepted(value === true)}
            aria-required
            className="mt-[3px]"
          />
          <span dir={textDir} className="text-start">
            {interpolateNodes(t("legal_accept_registration", { age: LEGAL_FACTS.minimumAge }), {
              terms: (
                <LegalTrigger doc="terms" className={LEGAL_LINK_CLASS}>
                  {t("legal_consent_terms")}
                </LegalTrigger>
              ),
              privacy: (
                <LegalTrigger doc="privacy" className={LEGAL_LINK_CLASS}>
                  {t("legal_consent_privacy")}
                </LegalTrigger>
              ),
            })}
          </span>
        </label>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !accepted}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {t("continue_action")}
        </Button>
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled={busy} onClick={() => void signOut()}>
          {t("logout")}
        </Button>
      </form>
    </>
  );
}
