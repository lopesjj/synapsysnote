"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Input } from "@/components/ui/primitives";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, mode, changePassword } = useAuth();
  const isDemo = mode === "demo" || user?.uid === "demo-user" || user?.providers.includes("demo");
  const hasPassword = user?.providers.includes("password") ?? false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setCurrentPassword("");
      setNextPassword("");
      setConfirm("");
    }
    onOpenChange(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (nextPassword.length < 6) {
      toast.error("Use uma senha com pelo menos 6 caracteres.");
      return;
    }
    if (nextPassword !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (hasPassword && nextPassword === currentPassword) {
      toast.error("A nova senha precisa ser diferente da atual.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, nextPassword);
      toast.success(hasPassword ? "Senha alterada." : "Senha adicionada. Você já pode entrar das duas formas.");
      close(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell open={open} onOpenChange={close} className="max-w-md">
      <DialogHeader
        icon={<KeyRound className="size-4" />}
        title="Alterar senha"
        description={
          isDemo
            ? "No modo demonstração não existe senha no Firebase."
            : hasPassword
              ? "Informe a senha atual e escolha uma nova."
              : "Adicione uma senha para também poder entrar com e-mail e senha. A conta continuará sendo a mesma."
        }
      />

      {!isDemo ? (
        <form onSubmit={submit}>
          <div className="space-y-3.5 px-5 py-4">
            {hasPassword ? (
              <AuthField label="Senha atual">
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </AuthField>
            ) : null}
            <AuthField label="Nova senha">
              <Input
                type="password"
                required
                minLength={6}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </AuthField>
            <AuthField label="Confirmar nova senha">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Salvar senha
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <DialogFooter>
          <Button type="button" variant="primary" className="ml-auto" onClick={() => close(false)}>
            Fechar
          </Button>
        </DialogFooter>
      )}
    </DialogShell>
  );
}
