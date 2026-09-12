"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { appHref, isLoginHost, isSplitHosts, loginHref, navigateTo } from "@/lib/domains";

export function HomeHostGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const shouldRedirect = isSplitHosts() && isLoginHost();

  useEffect(() => {
    if (!shouldRedirect) return;
    if (user) {
      navigateTo(appHref(pathname || "/home"), router, "replace");
    } else if (!loading) {
      navigateTo(loginHref("/"), router, "replace");
    }
  }, [loading, pathname, router, shouldRedirect, user]);

  if (shouldRedirect) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  return children;
}
