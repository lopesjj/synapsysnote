"use client";

import { useEffect, useState } from "react";
import { useLocale, useRouter } from "@/lib/i18n/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type OAuthProviderId } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { SynapsysLockup } from "@/components/brand/logo";
import { AuthField } from "@/components/auth/auth-field";
import { CompleteRegistrationForm } from "@/components/auth/complete-registration-form";
import { PhoneField } from "@/components/auth/phone-field";
import { SiteLanguageSwitcher } from "@/components/i18n/site-language-switcher";
import { LegalConsentNotice, LegalFooter, LegalTrigger } from "@/components/legal/legal-links";
import { interpolateNodes } from "@/components/legal/legal-text";
import { formatTabTitle } from "@/lib/document-title";
import { loadUserProfile, profileNeedsCompletion } from "@/lib/data/user-profile";
import { LEGAL_FACTS, LEGAL_VERSION } from "@/lib/legal/entity";
import { isValidPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { RecaptchaField } from "@/components/auth/recaptcha-field";
import { RecaptchaError, verifyRecaptchaToken } from "@/lib/recaptcha";
import { Checkbox, Input } from "@/components/ui/primitives";
import { appHref, isSplitHosts, navigateTo } from "@/lib/domains";
import {
  LOGIN_ATTEMPTS_THRESHOLD,
  getFailedLoginAttempts,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from "@/lib/auth/login-attempts";
import { authErrorText } from "@/lib/auth/error-message";
import { useUiStore } from "@/lib/store/ui-store";
import { useTranslation } from "@/lib/i18n/translations";
import { rememberUserLanguage } from "@/lib/i18n/locale-cookies";
import type { SupportedLanguage, UserProfile } from "@/types/models";

const SIGNUP_ENABLED = false;

const LEGAL_LINK_CLASS =
  "font-medium text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] transition hover:decoration-current";

type Router = ReturnType<typeof useRouter>;

function workspaceLanguage(profile: UserProfile | null | undefined, fallback: SupportedLanguage) {
  return profile?.preferences?.language ?? fallback;
}

function enterWorkspace(language: SupportedLanguage, router: Router, mode: "push" | "replace" = "push") {
  rememberUserLanguage(language);
  navigateTo(appHref("/home", language), router, mode);
}

export default function LandingPage() {
  const { t, textDir } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const {
    user,
    mode,
    signInWithProvider,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
  } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [signupAccepted, setSignupAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProviderId | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [sessionSyncFailed] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("session") === "sync_failed",
  );
  const needsCompletion = profileNeedsCompletion(user, profile);

  useEffect(() => {
    setFailedAttempts(getFailedLoginAttempts(email));
  }, [email]);

  const isCaptchaRequired =
    tab === "signin"
      ? failedAttempts >= LOGIN_ATTEMPTS_THRESHOLD
      : tab === "signup" || tab === "reset";

  useEffect(() => {
    document.title = formatTabTitle();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "resetPassword" && params.get("oobCode")) {
      router.replace(`/auth/action?${params.toString()}`);
      return;
    }
    if (params.get("reset") === "ok") {
      toast.success(t("password_reset_success"));
      window.history.replaceState({}, "", `/${locale}`);
    }
  }, [locale, router, t]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "resetPassword" && params.get("oobCode")) return;
    if (params.get("logout") === "1") return;
    if (isSplitHosts() && sessionSyncFailed) return;

    if (!sessionSyncFailed && user && !profileLoading && !needsCompletion) {
      enterWorkspace(workspaceLanguage(profile, locale), router, "replace");
    }
  }, [locale, needsCompletion, profile, profileLoading, router, sessionSyncFailed, user]);

  const refreshCaptcha = () => {
    setCaptcha(null);
    setCaptchaKey((value) => value + 1);
  };

  const hydrateFromProfile = (existing: UserProfile | null) => {
    if (!existing?.preferences) return;
    const layout = { ...existing.preferences };
    delete layout.theme;
    if (Object.keys(layout).length > 0) {
      useUiStore.getState().hydratePreferences(layout);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (isCaptchaRequired) {
        await verifyRecaptchaToken(captcha);
      }
      if (tab === "signup") {
        if (!signupAccepted) {
          return;
        }
        if (!isValidPhone(phone)) {
          toast.error(t("phone_invalid"));
          return;
        }
        await signUpWithEmail(
          (name.trim() || email.split("@")[0]).slice(0, 60),
          email,
          password,
          phone,
          locale,
          LEGAL_VERSION
        );
        enterWorkspace(locale, router);
        return;
      }
      const signedIn = await signInWithEmail(email, password, remember);
      clearFailedLoginAttempts(email);
      setFailedAttempts(0);
      const existing = await loadUserProfile(signedIn.uid);
      hydrateFromProfile(existing);
      if (!profileNeedsCompletion(signedIn, existing)) {
        enterWorkspace(workspaceLanguage(existing, locale), router);
      }
    } catch (error) {
      const isMissingCaptchaError = error instanceof RecaptchaError && error.reason === "missing";
      if (tab === "signin" && !isMissingCaptchaError) {
        const nextAttempts = recordFailedLoginAttempt(email);
        setFailedAttempts(nextAttempts);
      }
      refreshCaptcha();
      toast.error(authErrorText(error, t, "login_failed"));
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: OAuthProviderId) => {
    setOauthBusy(provider);
    try {
      const signedIn = await signInWithProvider(provider, remember);
      clearFailedLoginAttempts(signedIn.email || undefined);
      setFailedAttempts(0);
      const existing = await loadUserProfile(signedIn.uid);
      hydrateFromProfile(existing);
      if (!profileNeedsCompletion(signedIn, existing)) {
        enterWorkspace(workspaceLanguage(existing, locale), router);
      }
    } catch (error) {
      toast.error(authErrorText(error, t, "auth_failed"), {
        duration: 7000,
      });
      if (SIGNUP_ENABLED) setTab("signup");
    } finally {
      setOauthBusy(null);
    }
  };

  const sendReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await verifyRecaptchaToken(captcha);
      await resetPassword(email, locale);
      toast.success(t("reset_email_sent"));
      setTab("signin");
    } catch (error) {
      refreshCaptcha();
      toast.error(authErrorText(error, t, "reset_email_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--canvas)]">
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

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-12 px-6 pb-12 pt-20 sm:py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <div className="flex select-none justify-center sm:-translate-x-5 sm:-translate-y-7">
            <SynapsysLockup size={92} />
          </div>

          <p dir={textDir} className="mt-10 text-[13px] text-muted">{t("landing_audience")}</p>

          <h1 dir={textDir} className="mt-4 max-w-xl text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[52px]">
            {t("landing_headline_lead")}
            <span className="bg-gradient-to-r from-[var(--accent)] to-[#0ea5e9] bg-clip-text text-transparent">
              {t("landing_headline_accent")}
            </span>
            {t("landing_headline_tail")}
          </h1>

          <p dir={textDir} className="mt-5 me-auto max-w-lg text-[15px] leading-relaxed text-muted">{t("landing_description")}</p>
        </div>

        <div className="mx-auto w-full max-w-sm sm:max-w-none lux-gradient rounded-[var(--radius-xl)] border border-[var(--border)] p-6 shadow-[var(--shadow-float)]">
          {user && !sessionSyncFailed && !profileLoading && needsCompletion ? (
            <CompleteRegistrationForm />
          ) : user && !sessionSyncFailed && !needsCompletion ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <Loader2 className="size-6 animate-spin text-[var(--accent)]" />
              <p dir={textDir} className="text-[13px] font-medium text-ink">{t("accessing_workspace")}</p>
              <p dir={textDir} className="text-[11.5px] text-muted">{t("redirecting_home")}</p>
            </div>
          ) : tab === "reset" ? (
            <>
              <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">{t("reset_heading")}</p>
              <p dir={textDir} className="text-start mt-1 text-[13px] leading-relaxed text-muted">{t("reset_description")}</p>
              <form onSubmit={sendReset} className="mt-5 space-y-3.5">
                <AuthField label={t("field_email")}>
                  <Input
                    type="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("email_placeholder")}
                    autoComplete="email"
                  />
                </AuthField>
                <RecaptchaField key={`reset-${captchaKey}`} onChange={setCaptcha} />
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {t("send_link")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("signin");
                    refreshCaptcha();
                  }}
                  dir={textDir}
                  className="w-full text-center text-[12.5px] text-muted transition hover:text-ink"
                >
                  {t("back_to_login")}
                </button>
              </form>
            </>
          ) : (
            <>
          <p dir={textDir} className="text-start text-[15px] font-medium tracking-[-0.015em] text-ink">
            {tab === "signin" ? t("signin_heading") : t("signup_heading")}
          </p>

          <div className="mt-4 flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {(["signin", "signup"] as const).map((value) => {
              const blocked = value === "signup" && !SIGNUP_ENABLED;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    if (blocked) return;
                    setTab(value);
                    refreshCaptcha();
                  }}
                  className={`flex-1 rounded-[6px] py-1.5 text-[12.5px] font-medium transition ${
                    tab === value ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted"
                  } ${blocked ? "cursor-not-allowed opacity-45" : ""}`}
                >
                  {value === "signin" ? t("signin_tab") : t("signup_tab")}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {tab === "signup" ? (
              <AuthField label={t("field_name")}>
                <Input
                  dir={textDir}
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder={t("display_name_placeholder")}
                  autoComplete="name"
                />
              </AuthField>
            ) : null}
            <AuthField label={t("field_email")}>
              <Input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email_placeholder")}
                autoComplete="email"
              />
            </AuthField>
            {tab === "signup" ? <PhoneField value={phone} onChange={setPhone} /> : null}
            <AuthField label={t("field_password")}>
              <Input
                type="password"
                dir="ltr"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={tab === "signin" ? "current-password" : "new-password"}
              />
            </AuthField>

            {tab === "signin" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(value) => setRemember(value === true)}
                  />
                  <span dir={textDir} className="text-start">{t("stay_logged_in")}</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTab("reset");
                    refreshCaptcha();
                  }}
                  dir={textDir}
                  className="text-[12.5px] text-[var(--accent)] transition hover:underline"
                >
                  {t("forgot_password")}
                </button>
              </div>
            ) : null}

            {isCaptchaRequired ? (
              <RecaptchaField key={`${tab}-${captchaKey}`} onChange={setCaptcha} />
            ) : null}

            {tab === "signup" ? (
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-relaxed text-muted">
                <Checkbox
                  checked={signupAccepted}
                  onCheckedChange={(value) => setSignupAccepted(value === true)}
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
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy || (tab === "signup" && !signupAccepted)}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {tab === "signin" ? t("signin_tab") : t("signup_tab")}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span dir={textDir} className="text-[11px] text-faint">{t("or_sign_in_with")}</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={oauthBusy !== null}
            onClick={() => void oauth("google")}
          >
            {oauthBusy === "google" ? <Loader2 className="animate-spin" /> : <GoogleGlyph />}
            Google
          </Button>

          <LegalConsentNotice className="mt-4" />

          {mode === "demo" ? (
            <p dir={textDir} className="text-start mt-3 text-[11px] leading-relaxed text-faint">{t("demo_mode_notice")}</p>
          ) : null}
            </>
          )}
        </div>
      </div>

      <LegalFooter />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l-.02.15 3.6 2.8.25.03c2.3-2.1 3.6-5.2 3.6-8.8"
      />
      <path
        fill="#34A853"
        d="M12 24c3.3 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-.14.01-3.7 2.9-.05.14C3.2 21.3 7.3 24 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.1 14.4c-.3-.8-.4-1.6-.4-2.4s.15-1.7.4-2.4V6.6l-3.8.05C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.3 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.8 3c1-2.9 3.7-4.9 6.9-4.9"
      />
    </svg>
  );
}
