"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavHistory } from "@/lib/store/nav-history";

export function useWorkspaceNavHistory(): void {
  const pathname = usePathname();
  const record = useNavHistory((state) => state.record);

  useEffect(() => {
    if (!pathname.startsWith("/home")) return;
    record(pathname);
  }, [pathname, record]);
}

export function useNavArrows() {
  const router = useRouter();
  const index = useNavHistory((state) => state.index);
  const stackLength = useNavHistory((state) => state.stack.length);

  const goBack = () => {
    const href = useNavHistory.getState().back();
    if (href) router.push(href);
  };

  const goForward = () => {
    const href = useNavHistory.getState().forward();
    if (href) router.push(href);
  };

  return {
    canBack: index > 0,
    canForward: index >= 0 && index < stackLength - 1,
    goBack,
    goForward,
  };
}
