"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query owns the *pull-based* reads: version history, the Notion tree
 * and anything else fetched on demand. The realtime document streams stay on
 * the adapter's `onSnapshot` subscriptions inside `WorkspaceProvider`, because
 * a push channel already keeps them fresher than any polling cache could.
 *
 * The client is created inside state so each browser session gets exactly one
 * instance and server renders never share a cache between requests.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reads here are explicit user actions (open history, load tree);
            // refetching them on every window focus would only add latency.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Centralised key factory — keeps invalidation call sites honest. */
export const queryKeys = {
  versions: (workspaceId: string, pageId: string) =>
    ["versions", workspaceId, pageId] as const,
  notionTree: (workspaceId: string) => ["notion-tree", workspaceId] as const,
  userProfile: (uid: string) => ["user-profile", uid] as const,
};
