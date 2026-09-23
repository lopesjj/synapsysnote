"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useRouter } from "@/lib/i18n/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/primitives";
import { LegalTrigger } from "@/components/legal/legal-links";
import { interpolateNodes } from "@/components/legal/legal-text";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { isValidPhone } from "@/lib/phone";
import { appHref, navigateTo } from "@/lib/domains";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { useTranslation } from "@/lib/i18n/translations";
import { authErrorText } from "@/lib/auth/error-message";
import { rememberUserLanguage } from "@/lib/i18n/locale-cookies";
import { useUiStore } from "@/lib/store/ui-store";
import { LEGAL_FACTS, LEGAL_VERSION } from "@/lib/legal/entity";
import { AuthField } from "./auth-field";
import { PhoneField } from "./phone-field";

const LEGAL_LINK_CLASS =
  "font-medium text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:decoration-current";

export function CompleteRegistrationForm() {
  const router = useRouter();
  const { t, textDir } = useTranslation();
  const siteLanguage = useLocale();
  const { user, completeRegistration } = useAuth();
  const { profile, complete } = useUserProfile();
  const googleAccount = Boolean(user?.providers.includes("google.com"));
  const [name, setName] = useState(user?.displayName || profile?.displayName || "");
  const [email, setEmail] = useState(user?.email || profile?.email || "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accepted) return;
    if (!isValidPhone(phone)) {
      toast.error(t("phone_invalid"));
      return;
    }
    setBusy(true);
    try {
      const requestedEmail = email.trim() || user?.email || "";
      const result = await completeRegistration({
        name: (name.trim() || user?.displayName || email.split("@")[0]).slice(0, 60),
        email: requestedEmail,
        phone,
        language: siteLanguage,
        legalAcceptedVersion: LEGAL_VERSION,
      });
      // Troca de e-mail so vale depois da confirmacao pelo link enviado.
      if (result.emailVerificationSent) {
        toast.success(t("email_change_verification_sent", { email: requestedEmail }), { duration: 9000 });
      } else if (result.emailChangeFailed) {
        toast.error(t("email_change_failed"), { duration: 7000 });
      }
      await complete();
      const language = useUiStore.getState().language || siteLanguage;
      try {
        await firebaseJson("/api/workspace/bootstrap", {
          method: "POST",
          body: JSON.stringify({ language }),
        });
      } catch {}
      rememberUserLanguage(language);
      navigateTo(appHref("/home", language), router);
    } catch (error) {
      toast.error(authErrorText(error, t, "registration_save_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">{t("complete_registration_title")}</p>
      <p dir={textDir} className="text-start mt-1 text-[13px] text-muted">
        {googleAccount
          ? t("complete_registration_google")
          : t("complete_registration_existing")}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {googleAccount ? null : (
          <>
            <AuthField label={t("field_name")}>
              <Input
                dir={textDir}
                required
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 60))}
                placeholder={t("display_name_placeholder")}
                autoComplete="name"
              />
            </AuthField>
            <AuthField label={t("field_email")}>
              <Input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("email_placeholder")}
                autoComplete="email"
              />
            </AuthField>
          </>
        )}
        <PhoneField value={phone} onChange={setPhone} />
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
      </form>
    </>
  );
}
