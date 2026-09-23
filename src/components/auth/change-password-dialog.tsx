"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n/translations";
import { authErrorText } from "@/lib/auth/error-message";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Input } from "@/components/ui/primitives";

function PasswordIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 text-ink"
      aria-hidden="true"
    >
      <rect width="16" height="11" x="4" y="11" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" />
      <path d="M12 16.5v2" />
    </svg>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
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
    if (nextPassword.length < 8) {
      toast.error(t("password_min_length"));
      return;
    }
    if (nextPassword !== confirm) {
      toast.error(t("passwords_dont_match"));
      return;
    }
    if (hasPassword && nextPassword === currentPassword) {
      toast.error(t("new_password_must_differ"));
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, nextPassword);
      toast.success(hasPassword ? t("password_changed_success") : t("password_added_success"));
      close(false);
    } catch (error) {
      toast.error(authErrorText(error, t, "password_change_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell open={open} onOpenChange={close} closeAriaLabel={t("btn_close")} className="max-w-md">
      <DialogHeader
        icon={<PasswordIcon />}
        title={t("change_password")}
        description={
          isDemo
            ? t("change_password_desc_demo")
            : hasPassword
              ? t("change_password_desc_has_password")
              : t("change_password_desc_add_password")
        }
      />

      {!isDemo ? (
        <form onSubmit={submit}>
          <div className="space-y-3.5 px-5 py-4">
            {hasPassword ? (
              <AuthField label={t("current_password")}>
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
            <AuthField label={t("new_password")}>
              <Input
                type="password"
                required
                minLength={8}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </AuthField>
            <AuthField label={t("confirm_new_password")}>
              <Input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </AuthField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t("btn_cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("btn_save_password")}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <DialogFooter>
          <Button type="button" variant="primary" className="ml-auto" onClick={() => close(false)}>
            {t("btn_close")}
          </Button>
        </DialogFooter>
      )}
    </DialogShell>
  );
}
