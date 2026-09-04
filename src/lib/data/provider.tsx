"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppDatabase,
  ImportJob,
  Notebook,
  NotionIntegration,
  Page,
} from "@/types/models";
import { toast } from "sonner";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { useAuth } from "@/hooks/use-auth";
import type { DataAdapter } from "./adapter";
import { FirestoreAdapter } from "./firestore-adapter";
import { getLocalAdapter } from "./local-adapter";

/**
 * Single place where the app binds to a storage backend. Components consume
 * `useWorkspace()` and never learn whether they are talking to Firestore or to
 * the local demo store.
 */

export interface PageTreeNode {
  page: Page;
  children: PageTreeNode[];
  depth: number;
}

interface WorkspaceContextValue {
  adapter: DataAdapter;
  ready: boolean;
  mode: "firestore" | "local";
  notebooks: Notebook[];
  pages: Page[];
  /** Pages excluding the trash. */
  livePages: Page[];
  trashedPages: Page[];
  databases: AppDatabase[];
  importJobs: ImportJob[];
  activeImportJob: ImportJob | null;
  integration: NotionIntegration | null;
  tags: { name: string; count: number }[];
  treeFor: (notebookId: string | null) => PageTreeNode[];
  pageById: (id: string) => Page | undefined;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function workspaceIdFor(uid: string): string {
  const envId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;
  if (envId && envId !== "primary") return envId;
  return `ws_${uid}`;
}

/** Trash retention required by the spec. */
export const TRASH_RETENTION_DAYS = 30;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [databases, setDatabases] = useState<AppDatabase[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [integration, setIntegration] = useState<NotionIntegration | null>(null);
  /** Which adapter has already delivered its first page snapshot. */
  const [loadedAdapter, setLoadedAdapter] = useState<DataAdapter | null>(null);

  const adapter = useMemo<DataAdapter>(() => {
    if (isFirebaseConfigured() && user && user.uid !== "demo-user") {
      return new FirestoreAdapter(workspaceIdFor(user.uid), user.uid);
    }
    return getLocalAdapter();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    void (async () => {
      try {
        await adapter.ensureWorkspace();
      } catch (error) {
        console.error("ensureWorkspace", error);
        toast.error(
          "Não foi possível abrir seu workspace. Publique as regras mais recentes de firestore.rules e recarregue."
        );
        if (!cancelled) setLoadedAdapter(adapter);
        return;
      }
      if (cancelled) return;
      unsubs.push(
        adapter.subscribeNotebooks(setNotebooks),
        adapter.subscribePages((next) => {
          setPages(next);
          setLoadedAdapter(adapter);
        }),
        adapter.subscribeDatabases(setDatabases),
        adapter.subscribeImportJobs(setImportJobs),
        adapter.subscribeIntegration(setIntegration)
      );
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [adapter]);

  const ready = loadedAdapter === adapter;

  const value = useMemo<WorkspaceContextValue>(() => {
    const livePages = pages.filter((p) => !p.deletedAt);
    const trashedPages = pages
      .filter((p) => p.deletedAt)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

    const tagCounts = new Map<string, number>();
    for (const page of livePages) {
      for (const tag of page.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    const treeFor = (notebookId: string | null): PageTreeNode[] => {
      const scope = livePages.filter((p) =>
        notebookId === null ? true : p.notebookId === notebookId
      );
      const byParent = new Map<string | null, Page[]>();
      for (const page of scope) {
        const key = page.parentPageId && scope.some((p) => p.id === page.parentPageId)
          ? page.parentPageId
          : null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(page);
      }
      // `order` is what sidebar drag-and-drop writes, so it has to win; title
      // is only the tie-breaker for pages that have never been reordered.
      const build = (parentId: string | null, depth: number): PageTreeNode[] =>
        (byParent.get(parentId) ?? [])
          .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR"))
          .map((page) => ({ page, depth, children: build(page.id, depth + 1) }));
      return build(null, 0);
    };

    const activeImportJob =
      importJobs.find((job) =>
        ["pending", "discovering", "running"].includes(job.status)
      ) ?? null;

    return {
      adapter,
      ready,
      mode: adapter.mode,
      notebooks,
      pages,
      livePages,
      trashedPages,
      databases,
      importJobs,
      activeImportJob,
      integration,
      tags: [...tagCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      treeFor,
      pageById: (id: string) => pages.find((p) => p.id === id),
    };
  }, [adapter, databases, importJobs, integration, notebooks, pages, ready]);


  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace precisa estar dentro de <WorkspaceProvider>");
  return ctx;
}
