"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export const queryKeys = {
  versions: (workspaceId: string, pageId: string) =>
    ["versions", workspaceId, pageId] as const,
  notionTree: (workspaceId: string) => ["notion-tree", workspaceId] as const,
  userProfile: (uid: string) => ["user-profile", uid] as const,
};
