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
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { useAuth } from "@/hooks/use-auth";
import type { DataAdapter } from "./adapter";
import { FirestoreAdapter } from "./firestore-adapter";
import { getLocalAdapter } from "./local-adapter";
import { childrenOf, notebookAncestors } from "./notebook-tree";
import { compareNatural } from "@/lib/utils";


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
  livePages: Page[];
  trashedPages: Page[];
  databases: AppDatabase[];
  importJobs: ImportJob[];
  activeImportJob: ImportJob | null;
  integration: NotionIntegration | null;
  tags: { name: string; count: number }[];
  treeFor: (notebookId: string | null) => PageTreeNode[];
  pageById: (id: string) => Page | undefined;
  notebookById: (id: string) => Notebook | undefined;
  childNotebooks: (parentId: string | null) => Notebook[];
  notebookPath: (notebookId: string) => Notebook[];
  rootNotebooks: Notebook[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function workspaceIdFor(uid: string): string {
  const envId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;
  if (envId && envId !== "primary") return envId;
  return `ws_${uid}`;
}

function readLocalStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStore(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const TRASH_RETENTION_DAYS = 30;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userKey = user?.uid ?? "default";
  const [notebooks, setNotebooks] = useState<Notebook[]>(() =>
    readLocalStore<Notebook[]>(`synapsys.cache.notebooks.${userKey}`, [])
  );
  const [pages, setPages] = useState<Page[]>(() =>
    readLocalStore<Page[]>(`synapsys.cache.pages.${userKey}`, [])
  );
  const [databases, setDatabases] = useState<AppDatabase[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [integration, setIntegration] = useState<NotionIntegration | null>(null);
  const [loadedAdapter, setLoadedAdapter] = useState<DataAdapter | null>(null);

  const adapter = useMemo<DataAdapter>(() => {
    if (isFirebaseConfigured() && user && user.uid !== "demo-user") {
      return new FirestoreAdapter(workspaceIdFor(user.uid), user.uid);
    }
    return getLocalAdapter();
  }, [user]);

  useEffect(() => {
    if (user?.uid) {
      const cachedNbs = readLocalStore<Notebook[]>(`synapsys.cache.notebooks.${user.uid}`, []);
      const cachedPgs = readLocalStore<Page[]>(`synapsys.cache.pages.${user.uid}`, []);
      if (cachedNbs.length > 0) setNotebooks(cachedNbs);
      if (cachedPgs.length > 0) setPages(cachedPgs);
    }
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      adapter.subscribeNotebooks((next) => {
        if (cancelled) return;
        setNotebooks(next);
        writeLocalStore(`synapsys.cache.notebooks.${userKey}`, next);
      }),
      adapter.subscribePages((next) => {
        if (cancelled) return;
        setPages(next);
        setLoadedAdapter(adapter);
        writeLocalStore(`synapsys.cache.pages.${userKey}`, next);
      }),
      adapter.subscribeDatabases((next) => {
        if (cancelled) return;
        setDatabases(next);
      }),
      adapter.subscribeImportJobs((next) => {
        if (cancelled) return;
        setImportJobs(next);
      }),
      adapter.subscribeIntegration((next) => {
        if (cancelled) return;
        setIntegration(next);
      })
    );

    void adapter.ensureWorkspace();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [adapter, userKey]);

  const ready = loadedAdapter === adapter || notebooks.length > 0 || pages.length > 0;

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
      const build = (parentId: string | null, depth: number): PageTreeNode[] =>
        (byParent.get(parentId) ?? [])
          .sort((a, b) => a.order - b.order || compareNatural(a.title, b.title))
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
      notebookById: (id: string) => notebooks.find((notebook) => notebook.id === id),
      childNotebooks: (parentId: string | null) => childrenOf(notebooks, parentId),
      notebookPath: (notebookId: string) => notebookAncestors(notebooks, notebookId),
      rootNotebooks: childrenOf(notebooks, null),
    };
  }, [adapter, databases, importJobs, integration, notebooks, pages, ready]);


  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace precisa estar dentro de <WorkspaceProvider>");
  return ctx;
}
