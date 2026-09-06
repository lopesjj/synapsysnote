"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  Minimize2,
  Moon,
  Plug,
  Settings,
  Settings2,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { loginHref, navigateTo } from "@/lib/domains";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUiStore } from "@/lib/store/ui-store";
import { useTheme } from "@/components/theme-provider";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuShortcut, MenuTrigger } from "@/components/ui/menu";
import { cn, isMac } from "@/lib/utils";

const AVATAR_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-[14px] font-semibold text-white";

const TRIGGER_CLASS = cn(
  "bg-transparent shadow-none outline-none",
  "hover:bg-transparent hover:shadow-none",
  "data-[state=open]:bg-transparent data-[state=open]:shadow-none",
  "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
);

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { user, signOut, mode } = useAuth();
  const { profile } = useUserProfile();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const displayName = profile?.displayName || user?.displayName || "Conta";
  const email = user?.email ?? "";
  const photoURL = profile?.photoURL ?? user?.photoURL;
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const planLabel = mode === "demo" || user?.uid === "demo-user" ? "Convidado" : "Pro";

  const avatar = photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoURL}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className={AVATAR_CLASS}>{initial}</span>
  );

  return (
    <>
    <Menu>
      <MenuTrigger asChild>
        {collapsed ? (
          <button
            type="button"
            aria-label="Abrir menu da conta"
            className={cn("flex size-9 items-center justify-center", TRIGGER_CLASS)}
          >
            {avatar}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Abrir menu da conta"
            className={cn("flex w-full items-center gap-2.5 px-1 py-0.5 text-left", TRIGGER_CLASS)}
          >
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                {displayName}
              </span>
              <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted">
                {planLabel}
              </span>
            </span>
            <Settings className="size-4 shrink-0 text-ink" strokeWidth={1.75} />
          </button>
        )}
      </MenuTrigger>
      <MenuContent
        align={collapsed ? "center" : "start"}
        side={collapsed ? "right" : "top"}
        sideOffset={8}
        className="w-[min(288px,calc(100vw-24px))] overflow-hidden p-0"
      >
        <div className="relative overflow-hidden px-3.5 pb-3 pt-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]"
          />
          <div className="relative flex items-center gap-3">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoURL}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-full object-cover ring-2 ring-[var(--surface)]"
              />
            ) : (
              <div className={cn(AVATAR_CLASS, "size-11 text-[16px] ring-2 ring-[var(--surface)]")}>
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold leading-tight text-ink">{displayName}</p>
              {email ? (
                <p className="mt-0.5 truncate text-[11.5px] text-muted">{email}</p>
              ) : null}
              <span className="mt-1.5 inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--accent)]">
                {planLabel}
              </span>
            </div>
          </div>
        </div>

        <MenuSeparator />

        <div className="p-1">
          <MenuItem onSelect={() => useUiStore.getState().setPreferencesOpen(true)}>
            <Settings2 /> Preferências
          </MenuItem>
          <MenuItem onSelect={() => setChangePasswordOpen(true)}>
            <KeyRound /> Alterar senha
          </MenuItem>
          <MenuItem onSelect={() => router.push("/home/integrations")}>
            <Plug /> Integrações
          </MenuItem>
          <MenuItem onSelect={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />}
            Tema {theme === "dark" ? "claro" : "escuro"}
          </MenuItem>
          <MenuItem onSelect={() => useUiStore.getState().toggleZenMode()}>
            <Minimize2 /> Modo foco
            <MenuShortcut>{isMac() ? "⌘⇧F" : "Ctrl ⇧ F"}</MenuShortcut>
          </MenuItem>
        </div>

        <div className="border-t border-[var(--border)] p-1">
          <MenuItem
            destructive
            onSelect={async () => {
              try {
                await signOut();
                navigateTo(loginHref("/?logout=1"), router, "replace");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Não foi possível sair da conta");
              }
            }}
          >
            <LogOut /> Sair da conta
          </MenuItem>
        </div>
      </MenuContent>
    </Menu>
    <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </>
  );
}
