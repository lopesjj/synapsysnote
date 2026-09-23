"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SynapsysLockup } from "@/components/brand/logo";
import { SiteLanguageSwitcher } from "@/components/i18n/site-language-switcher";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/translations";
import { authErrorText } from "@/lib/auth/error-message";

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
          <Loader2 className="size-5 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <AuthActionForm />
    </Suspense>
  );
}

function AuthActionForm() {
  const { t, textDir } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { confirmPasswordReset, verifyResetCode } = useAuth();

  const mode = params.get("mode");
  const oobCode = params.get("oobCode") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const hasResetLink = mode === "resetPassword" && Boolean(oobCode);
  const [checking, setChecking] = useState(hasResetLink);
  const [invalid, setInvalid] = useState(!hasResetLink);

  useEffect(() => {
    if (!hasResetLink) {
      setChecking(false);
      setInvalid(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const address = await verifyResetCode(oobCode);
        if (!cancelled) setEmail(address);
      } catch {
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasResetLink, oobCode, verifyResetCode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error(t("password_min_length"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("passwords_dont_match"));
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(oobCode, password);
      toast.success(t("password_reset_success"));
      router.replace("/");
    } catch (error) {
      toast.error(authErrorText(error, t, "password_reset_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[var(--canvas)]">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
        <SiteLanguageSwitcher />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex select-none justify-center">
          <SynapsysLockup size={64} />
        </div>

        <div className="lux-gradient rounded-[var(--radius-xl)] border border-[var(--border)] p-6 shadow-[var(--shadow-float)]">
          {checking ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-[var(--accent)]" />
            </div>
          ) : invalid ? (
            <>
              <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">{t("reset_link_invalid_title")}</p>
              <p dir={textDir} className="text-start mt-2 text-[13px] leading-relaxed text-muted">
                {t("reset_link_invalid_desc")}
              </p>
              <Button asChild variant="primary" size="lg" className="mt-5 w-full">
                <Link href="/">{t("back_to_login")}</Link>
              </Button>
            </>
          ) : (
            <>
              <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">{t("reset_new_password_title")}</p>
              <p dir={textDir} className="text-start mt-1 text-[13px] leading-relaxed text-muted">
                {email ? t("resetting_for_email", { email: `\u2068${email}\u2069` }) : t("choose_new_password")}
              </p>
              <form onSubmit={submit} className="mt-5 space-y-3.5">
                <AuthField label={t("new_password_label")}>
                  <Input
                    type="password"
                    dir="ltr"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </AuthField>
                <AuthField label={t("confirm_password_label")}>
                  <Input
                    type="password"
                    dir="ltr"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </AuthField>
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {t("save_password_btn")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
