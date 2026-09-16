"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { isValidPhoneBR } from "@/lib/phone";
import { appHref, navigateTo } from "@/lib/domains";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { useUiStore } from "@/lib/store/ui-store";
import { useTranslation } from "@/lib/i18n/translations";
import { AuthField } from "./auth-field";
import { PhoneField } from "./phone-field";

export function CompleteRegistrationForm() {
  const router = useRouter();
  const { t } = useTranslation();
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
      });
      await complete();
      try {
        await firebaseJson("/api/workspace/bootstrap", { method: "POST" });
      } catch {}
      if (!useUiStore.getState().language) {
        useUiStore.getState().setLanguage("pt");
      }
      navigateTo(appHref("/home"), router);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("registration_save_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">{t("complete_registration_title")}</p>
      <p className="mt-1 text-[13px] text-muted">
        {googleAccount
          ? t("complete_registration_google")
          : t("complete_registration_existing")}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {googleAccount ? null : (
          <>
            <AuthField label="Nome">
              <Input
                required
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 60))}
                placeholder="Como te chamamos?"
                autoComplete="name"
              />
            </AuthField>
            <AuthField label="E-mail">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </AuthField>
          </>
        )}
        <PhoneField value={phone} onChange={setPhone} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Continuar
        </Button>
      </form>
    </>
  );
}
