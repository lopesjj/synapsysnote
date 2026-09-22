"use client";

import { useEffect } from "react";
import { useLocale, usePathname, useRouter } from "@/lib/i18n/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { appHref, isLoginHost, isSplitHosts, loginHref, navigateTo } from "@/lib/domains";

export function HomeHostGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { user, loading } = useAuth();
  const shouldRedirect = isSplitHosts() && isLoginHost();

  useEffect(() => {
    if (!shouldRedirect) return;
    if (user) {
      navigateTo(appHref(pathname || "/home", locale), router, "replace");
    } else if (!loading) {
      navigateTo(loginHref("/"), undefined, "replace");
    }
  }, [loading, locale, pathname, router, shouldRedirect, user]);

  if (shouldRedirect) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  return children;
}
