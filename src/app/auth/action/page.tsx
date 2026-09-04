"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SynapsysLockup } from "@/components/brand/logo";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";

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
    if (password.length < 6) {
      toast.error("Use uma senha com pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(oobCode, password);
      toast.success("Senha redefinida. Entre com a nova senha.");
      router.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível redefinir a senha");
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
              <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">Link inválido</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Este link expirou ou já foi usado. Peça outro em Esqueci a senha.
              </p>
              <Button asChild variant="primary" size="lg" className="mt-5 w-full">
                <Link href="/">Voltar ao login</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">Nova senha</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {email ? `Redefinindo a senha de ${email}.` : "Escolha uma senha nova."}
              </p>
              <form onSubmit={submit} className="mt-5 space-y-3.5">
                <AuthField label="Nova senha">
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </AuthField>
                <AuthField label="Confirmar senha">
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </AuthField>
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Salvar senha
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
