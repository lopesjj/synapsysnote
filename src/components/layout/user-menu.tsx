"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  Minimize2,
  Moon,
  Plug,
  Settings,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { loginHref, navigateTo } from "@/lib/domains";
import { useUserProfile } from "@/hooks/use-user-profile";
import { currentPreferences, useUiStore } from "@/lib/store/ui-store";
import { saveUserPreferences } from "@/lib/data/user-profile";
import { useTheme } from "@/components/theme-provider";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuShortcut, MenuTrigger } from "@/components/ui/menu";
import { cn, isMac } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import { isCustomAvatar } from "@/lib/data/user-avatar";

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
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const { user, signOut, mode } = useAuth();
  const { profile } = useUserProfile();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const displayName = profile?.displayName || user?.displayName || t("account");
  const email = user?.email ?? "";
  const rawPhotoURL = isCustomAvatar(profile?.photoURL)
    ? profile?.photoURL
    : isCustomAvatar(user?.photoURL)
    ? user?.photoURL
    : null;

  useEffect(() => {
    setImageError(false);
  }, [rawPhotoURL]);

  const photoURL = imageError ? null : rawPhotoURL;
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const planLabel = mode === "demo" || user?.uid === "demo-user" ? t("guest") : t("plan_pro");

  const avatar = photoURL ? (
    <img
      src={photoURL}
      alt=""
      width={36}
      height={36}
      onError={() => setImageError(true)}
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
            aria-label={t("open_account_menu")}
            className={cn("flex size-9 items-center justify-center", TRIGGER_CLASS)}
          >
            {avatar}
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("open_account_menu")}
            className={cn("flex h-9 w-full items-center gap-2.5 text-left", TRIGGER_CLASS)}
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
              <img
                src={photoURL}
                alt=""
                width={44}
                height={44}
                onError={() => setImageError(true)}
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
          <MenuItem
            onSelect={() => {
              useUiStore.getState().setMobileSidebarOpen(false);
              useUiStore.getState().setPreferencesOpen(true);
            }}
          >
            <Settings className="size-4" /> {t("preferences")}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              useUiStore.getState().setMobileSidebarOpen(false);
              setChangePasswordOpen(true);
            }}
          >
            <KeyRound /> {t("change_password")}
          </MenuItem>
          <MenuItem onSelect={() => router.push("/home/integrations")}>
            <Plug /> {t("integrations")}
          </MenuItem>
          <MenuItem onSelect={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {t("theme")}: {theme === "dark" ? t("light") : t("dark")}
          </MenuItem>
          <MenuItem onSelect={() => useUiStore.getState().toggleZenMode()}>
            <Minimize2 /> {t("focus_mode")}
            <MenuShortcut>{isMac() ? "⌘⇧F" : "Ctrl ⇧ F"}</MenuShortcut>
          </MenuItem>
        </div>

        <div className="border-t border-[var(--border)] p-1">
          <MenuItem
            destructive
            onSelect={async () => {
              try {
                if (user?.uid) {
                  const prefs = { ...currentPreferences(), theme };
                  await saveUserPreferences(user.uid, prefs).catch(() => {});
                }
                await signOut();
                navigateTo(loginHref("/?logout=1"), router, "replace");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("logout"));
              }
            }}
          >
            <LogOut /> {t("logout")}
          </MenuItem>
        </div>
      </MenuContent>
    </Menu>
    <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </>
  );
}
