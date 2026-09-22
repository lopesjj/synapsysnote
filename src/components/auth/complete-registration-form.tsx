"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useRouter } from "@/lib/i18n/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { isValidPhoneBR } from "@/lib/phone";
import { appHref, navigateTo } from "@/lib/domains";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { useTranslation } from "@/lib/i18n/translations";
import { authErrorText } from "@/lib/auth/error-message";
import { rememberUserLanguage } from "@/lib/i18n/locale-cookies";
import { useUiStore } from "@/lib/store/ui-store";
import { AuthField } from "./auth-field";
import { PhoneField } from "./phone-field";

export function CompleteRegistrationForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const siteLanguage = useLocale();
  const { user, completeRegistration } = useAuth();
  const { profile, complete } = useUserProfile();
  const googleAccount = Boolean(user?.providers.includes("google.com"));
  const [name, setName] = useState(user?.displayName || profile?.displayName || "");
  const [email, setEmail] = useState(user?.email || profile?.email || "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidPhoneBR(phone)) {
      toast.error(t("phone_invalid"));
      return;
    }
    setBusy(true);
    try {
      await completeRegistration({
        name: (name.trim() || user?.displayName || email.split("@")[0]).slice(0, 60),
        email: email.trim() || user?.email || "",
        phone,
        language: siteLanguage,
      });
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
      <p dir="auto" className="text-left text-[15px] font-medium tracking-[-0.015em] text-ink">{t("complete_registration_title")}</p>
      <p dir="auto" className="text-left mt-1 text-[13px] text-muted">
        {googleAccount
          ? t("complete_registration_google")
          : t("complete_registration_existing")}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {googleAccount ? null : (
          <>
            <AuthField label={t("field_name")}>
              <Input
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
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {t("continue_action")}
        </Button>
      </form>
    </>
  );
}
