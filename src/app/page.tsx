"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, hasActiveSessionHint, type OAuthProviderId } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { SynapsysLockup } from "@/components/brand/logo";
import { AuthField } from "@/components/auth/auth-field";
import { CompleteRegistrationForm } from "@/components/auth/complete-registration-form";
import { PhoneField } from "@/components/auth/phone-field";
import { formatTabTitle } from "@/lib/document-title";
import { loadUserProfile, profileNeedsCompletion } from "@/lib/data/user-profile";
import { isValidPhoneBR } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { RecaptchaField } from "@/components/auth/recaptcha-field";
import { verifyRecaptchaToken } from "@/lib/recaptcha";
import { Checkbox, Input } from "@/components/ui/primitives";
import { appHref, isSplitHosts, loginHref, navigateTo } from "@/lib/domains";
import { persistCrossHostSession } from "@/lib/auth/cross-host-session";
import {
  LOGIN_ATTEMPTS_THRESHOLD,
  getFailedLoginAttempts,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from "@/lib/auth/login-attempts";
import { useUiStore } from "@/lib/store/ui-store";

const SIGNUP_ENABLED = false;

export default function LandingPage() {
  const router = useRouter();
  const {
    user,
    loading,
    mode,
    signInWithProvider,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut,
  } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProviderId | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [sessionHint] = useState(() => hasActiveSessionHint());
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
      toast.success("Senha redefinida. Entre com a nova senha.");
      window.history.replaceState({}, "", "/");
    }
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "resetPassword" && params.get("oobCode")) return;
    if (params.get("logout") === "1") return;
    if (isSplitHosts() && params.get("session") === "sync_failed") return;

    if (user && !profileLoading && !needsCompletion) {
      navigateTo(appHref("/home"), router, "replace");
      return;
    }

    if (sessionHint && !user && !loading) {
      return;
    }

    if (sessionHint && loading) {
      navigateTo(appHref("/home"), router, "replace");
    }
  }, [loading, needsCompletion, profileLoading, router, sessionHint, user]);

  const refreshCaptcha = () => {
    setCaptcha(null);
    setCaptchaKey((value) => value + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (isCaptchaRequired) {
        await verifyRecaptchaToken(captcha);
      }
      if (tab === "signup") {
        if (!isValidPhoneBR(phone)) {
          toast.error("Informe um telefone válido com DDD.");
          return;
        }
        await signUpWithEmail((name.trim() || email.split("@")[0]).slice(0, 60), email, password, phone);
        navigateTo(appHref("/home"), router);
        return;
      }
      const signedIn = await signInWithEmail(email, password, remember);
      clearFailedLoginAttempts(email);
      setFailedAttempts(0);
      const existing = await loadUserProfile(signedIn.uid);
      if (existing?.preferences) {
        const { theme: storedTheme, ...layout } = existing.preferences;
        if (Object.keys(layout).length > 0) {
          useUiStore.getState().hydratePreferences(layout);
        }
      }
      if (!profileNeedsCompletion(signedIn, existing)) navigateTo(appHref("/home"), router);
    } catch (error) {
      const isMissingCaptchaError =
        error instanceof Error && error.message.includes("não é um robô");
      if (tab === "signin" && !isMissingCaptchaError) {
        const nextAttempts = recordFailedLoginAttempt(email);
        setFailedAttempts(nextAttempts);
      }
      refreshCaptcha();
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar");
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
      if (existing?.preferences) {
        const { theme: storedTheme, ...layout } = existing.preferences;
        if (Object.keys(layout).length > 0) {
          useUiStore.getState().hydratePreferences(layout);
        }
      }
      if (!profileNeedsCompletion(signedIn, existing)) navigateTo(appHref("/home"), router);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na autenticação", {
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
      await resetPassword(email);
      toast.success("Se este e-mail tiver conta, enviamos um link para redefinir a senha.");
      setTab("signin");
    } catch (error) {
      refreshCaptcha();
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o e-mail");
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

      <div className="relative mx-auto grid min-h-dvh max-w-6xl grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <div className="flex select-none justify-center sm:-translate-x-5 sm:-translate-y-7">
            <SynapsysLockup size={92} />
          </div>

          <p className="mt-10 text-[13px] text-muted">
            Pensado para quem faz concurso público, vestibular ou faculdade.
          </p>

          <h1 className="mt-4 max-w-xl text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[52px]">
            Seu material de estudo,{" "}
            <span className="bg-gradient-to-r from-[var(--accent)] to-[#0ea5e9] bg-clip-text text-transparent">
              num só lugar
            </span>
            .
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
            Organize seus estudos com eficiência, transforme sua rotina em algo
            mais produtivo. Utilize cadernos bem estruturados, mantenha suas
            notas organizadas e crie um planejamento adequado para cada
            disciplina. Defina metas claras, estabeleça prazos realistas e
            acompanhe seu progresso ao longo do tempo.
          </p>
        </div>

        <div className="mx-auto w-full max-w-sm sm:max-w-none lux-gradient rounded-[var(--radius-xl)] border border-[var(--border)] p-6 shadow-[var(--shadow-float)]">
          {user && !profileLoading && needsCompletion ? (
            <CompleteRegistrationForm />
          ) : (user || (sessionHint && loading)) && !needsCompletion ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <Loader2 className="size-6 animate-spin text-[var(--accent)]" />
              <p className="text-[13px] font-medium text-ink">Acessando seu ambiente de estudos...</p>
              <p className="text-[11.5px] text-muted">Redirecionando para a página inicial</p>
            </div>
          ) : tab === "reset" ? (
            <>
              <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">Esqueceu a senha</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Escreva o e-mail de cadastro. Se tiver conta, o link chega aí.
              </p>
              <form onSubmit={sendReset} className="mt-5 space-y-3.5">
                <AuthField label="E-mail">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </AuthField>
                <RecaptchaField key={`reset-${captchaKey}`} onChange={setCaptcha} />
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Enviar link
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("signin");
                    refreshCaptcha();
                  }}
                  className="w-full text-center text-[12.5px] text-muted transition hover:text-ink"
                >
                  Voltar ao login
                </button>
              </form>
            </>
          ) : (
            <>
          <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">
            {tab === "signin" ? "Entre na sua conta" : "Crie sua conta"}
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
                  {value === "signin" ? "Entrar" : "Criar conta"}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {tab === "signup" ? (
              <AuthField label="Nome">
                <Input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder="Como te chamamos?"
                />
              </AuthField>
            ) : null}
            <AuthField label="E-mail">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </AuthField>
            {tab === "signup" ? <PhoneField value={phone} onChange={setPhone} /> : null}
            <AuthField label="Senha">
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </AuthField>

            {tab === "signin" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(value) => setRemember(value === true)}
                  />
                  Mantenha-se conectado
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTab("reset");
                    refreshCaptcha();
                  }}
                  className="text-[12.5px] text-[var(--accent)] transition hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>
            ) : null}

            {isCaptchaRequired ? (
              <RecaptchaField key={`${tab}-${captchaKey}`} onChange={setCaptcha} />
            ) : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {tab === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] text-faint">ou entre com</span>
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

          {mode === "demo" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              Modo demonstração: tudo fica apenas neste navegador.
            </p>
          ) : null}
            </>
          )}
        </div>
      </div>
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

