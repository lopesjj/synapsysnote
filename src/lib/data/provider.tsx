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
  Flashcard,
  ImportJob,
  Notebook,
  NotionIntegration,
  GoogleDocsIntegration,
  EvernoteIntegration,
  Page,
} from "@/types/models";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { useAuth } from "@/hooks/use-auth";
import type { DataAdapter } from "./adapter";
import { FirestoreAdapter } from "./firestore-adapter";
import { getLocalAdapter } from "./local-adapter";
import { childrenOf, notebookAncestors } from "./notebook-tree";
import { endOfDay, isCardDueForReview } from "@/lib/flashcards/srs";
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
  trashedDatabases: AppDatabase[];
  importJobs: ImportJob[];
  activeImportJob: ImportJob | null;
  integration: NotionIntegration | null;
  googleDocsIntegration: GoogleDocsIntegration | null;
  evernoteIntegration: EvernoteIntegration | null;
  tags: { name: string; count: number }[];
  flashcards: Flashcard[];
  dueFlashcards: Flashcard[];
  /** false enquanto a primeira carga nao chegou: evita mostrar 'nenhum card'. */
  flashcardsReady: boolean;
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
  setTimeout(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, 0);
}

function stripHeavyPageFields(pages: Page[]): Page[] {
  return pages.map((page) => ({
    ...page,
    blocks: [],
    blocksJson: undefined,
    plainText: "",
    extractedOCRText: "",
    transcriptText: "",
    embedding: null,
  }));
}

function stripHeavyFlashcardFields(cards: Flashcard[]): Flashcard[] {
  // No modo local as imagens sao data URLs de ate 1 MB; no cache elas
  // estourariam a cota do localStorage. As URLs http do Firebase ficam.
  const keepUrl = (url?: string | null) =>
    typeof url === "string" && url.startsWith("data:") ? null : (url ?? null);
  return cards.map((card) => ({
    ...card,
    imageUrl: keepUrl(card.imageUrl),
    frontImageUrl: keepUrl(card.frontImageUrl),
    backImageUrl: keepUrl(card.backImageUrl),
  }));
}

export const TRASH_RETENTION_DAYS: number = 30;

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
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() =>
    readLocalStore<Flashcard[]>(`synapsys.cache.flashcards.${userKey}`, [])
  );
  const [flashcardsAdapter, setFlashcardsAdapter] = useState<DataAdapter | null>(null);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [integration, setIntegration] = useState<NotionIntegration | null>(null);
  const [googleDocsIntegration, setGoogleDocsIntegration] = useState<GoogleDocsIntegration | null>(null);
  const [evernoteIntegration, setEvernoteIntegration] = useState<EvernoteIntegration | null>(null);
  const [loadedAdapter, setLoadedAdapter] = useState<DataAdapter | null>(null);
  const [dayStamp, setDayStamp] = useState(() => endOfDay());

  const adapter = useMemo<DataAdapter>(() => {
    if (isFirebaseConfigured() && user && user.uid !== "demo-user") {
      return new FirestoreAdapter(workspaceIdFor(user.uid), user.uid);
    }
    return getLocalAdapter();
  }, [user]);

  // No primeiro render a autenticacao ainda pode nao ter resolvido, entao o
  // initializer acima leu o cache da chave "default". Quando a identidade chega,
  // relemos o cache do usuario certo. Ajustar o estado durante o render (e nao
  // em um efeito) faz o React descartar esta saida e re-renderizar na hora, sem
  // pintar a tela vazia no meio do caminho.
  const [cachedForKey, setCachedForKey] = useState(userKey);
  if (cachedForKey !== userKey) {
    setCachedForKey(userKey);
    if (user?.uid) {
      const cachedNbs = readLocalStore<Notebook[]>(`synapsys.cache.notebooks.${user.uid}`, []);
      const cachedPgs = readLocalStore<Page[]>(`synapsys.cache.pages.${user.uid}`, []);
      const cachedFcs = readLocalStore<Flashcard[]>(`synapsys.cache.flashcards.${user.uid}`, []);
      // Cache vazio nao apaga o que ja esta em tela.
      if (cachedNbs.length > 0) setNotebooks(cachedNbs);
      if (cachedPgs.length > 0) setPages(cachedPgs);
      if (cachedFcs.length > 0) setFlashcards(cachedFcs);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const init = async () => {
      try {
        await adapter.ensureWorkspace();
      } catch {}
      if (cancelled) return;

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
          writeLocalStore(`synapsys.cache.pages.${userKey}`, stripHeavyPageFields(next));
        }),
        adapter.subscribeDatabases((next) => {
          if (cancelled) return;
          setDatabases(next);
        }),
        adapter.subscribeFlashcards((next) => {
          if (cancelled) return;
          setFlashcards(next);
          setFlashcardsAdapter(adapter);
          writeLocalStore(`synapsys.cache.flashcards.${userKey}`, stripHeavyFlashcardFields(next));
        }),
        adapter.subscribeImportJobs((next) => {
          if (cancelled) return;
          setImportJobs(next);
        }),
        adapter.subscribeIntegration((next) => {
          if (cancelled) return;
          setIntegration(next);
        }),
        ...(adapter.subscribeCloudIntegration
          ? [
              adapter.subscribeCloudIntegration("google-docs", (next) => {
                if (cancelled) return;
                setGoogleDocsIntegration(next as GoogleDocsIntegration | null);
              }),
              adapter.subscribeCloudIntegration("evernote", (next) => {
                if (cancelled) return;
                setEvernoteIntegration(next as EvernoteIntegration | null);
              }),
            ]
          : [])
      );
    };

    void init();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [adapter, userKey]);

  // Sem isto o contador de cards vencidos ficaria congelado no dia em que a aba
  // foi aberta, ate que algum dado do workspace mudasse.
  useEffect(() => {
    const delay = Math.max(1000, dayStamp - Date.now() + 1000);
    const timer = window.setTimeout(() => setDayStamp(endOfDay()), delay);
    return () => window.clearTimeout(timer);
  }, [dayStamp]);

  const ready = loadedAdapter === adapter || notebooks.length > 0 || pages.length > 0;
  // Com cache em maos ja da para desenhar: so esperamos quando nao ha nada.
  const flashcardsReady = flashcardsAdapter === adapter || flashcards.length > 0;

  const value = useMemo<WorkspaceContextValue>(() => {
    const livePages = pages.filter((p) => !p.deletedAt);
    const trashedPages = pages
      .filter((p) => p.deletedAt)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

    const livePageById = new Map(livePages.map((p) => [p.id, p]));
    // pageTitle/notebookId sao gravados no card na criacao; renomear ou mover a
    // nota depois nao reescreve os cards, entao o valor vivo manda.
    const liveFlashcards = flashcards.flatMap((card) => {
      const page = livePageById.get(card.pageId);
      if (!page) return [];
      const title = page.title || card.pageTitle;
      const notebookId = page.notebookId ?? null;
      if (title === card.pageTitle && notebookId === card.notebookId) return [card];
      return [{ ...card, pageTitle: title, notebookId }];
    });

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
      trashedDatabases: databases.filter((d) => Boolean(d.deletedAt)),
      importJobs,
      activeImportJob,
      integration,
      googleDocsIntegration,
      evernoteIntegration,
      flashcards: liveFlashcards,
      dueFlashcards: liveFlashcards.filter((card) => isCardDueForReview(card, dayStamp)),
      flashcardsReady,
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
  }, [
    adapter,
    databases,
    dayStamp,
    flashcards,
    flashcardsReady,
    importJobs,
    integration,
    googleDocsIntegration,
    evernoteIntegration,
    notebooks,
    pages,
    ready,
  ]);


  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace precisa estar dentro de <WorkspaceProvider>");
  return ctx;
}
