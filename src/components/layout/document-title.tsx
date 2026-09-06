"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { formatTabTitle } from "@/lib/document-title";

function pathSegment(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const id = rest.split("/")[0];
  return id ? decodeURIComponent(id) : null;
}

function titleForRoute(
  pathname: string,
  search: string,
  pages: { id: string; title: string }[],
  notebooks: { id: string; name: string }[],
  databases: { id: string; name: string }[]
): string | null {
  const params = new URLSearchParams(search);

  const pageId = pathSegment(pathname, "/home/p/");
  if (pageId) {
    const page = pages.find((candidate) => candidate.id === pageId);
    return page ? formatTabTitle(page.title || "Sem título") : null;
  }

  const notebookId = pathSegment(pathname, "/home/n/");
  if (notebookId) {
    const notebook = notebooks.find((candidate) => candidate.id === notebookId);
    return notebook ? formatTabTitle(notebook.name || "Sem nome") : null;
  }

  const databaseId = pathSegment(pathname, "/home/db/");
  if (databaseId) {
    const database = databases.find((candidate) => candidate.id === databaseId);
    return database ? formatTabTitle(database.name || "Base") : null;
  }

  const tag = pathSegment(pathname, "/home/tag/");
  if (tag) return formatTabTitle(`#${tag}`);

  if (pathname === "/home/trash") return formatTabTitle("Lixeira");
  if (pathname === "/home/integrations") return formatTabTitle("Integrações");

  if (pathname === "/home/notes") {
    if (params.get("favorites") === "1") return formatTabTitle("Favoritos");
    const notebook = notebooks.find((candidate) => candidate.id === params.get("notebook"));
    return formatTabTitle(notebook?.name || "Todas as notas");
  }

  if (pathname.startsWith("/home")) return formatTabTitle("Início");
  return formatTabTitle();
}

export function useDocumentTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pages, notebooks, databases } = useWorkspace();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const title = useMemo(
    () => titleForRoute(pathname, search, pages, notebooks, databases),
    [pathname, search, pages, notebooks, databases]
  );
  const lastTitleRef = useRef(formatTabTitle("Início"));
  if (title) lastTitleRef.current = title;
  const resolved = title ?? lastTitleRef.current;

  useLayoutEffect(() => {
    const apply = () => {
      if (document.title !== resolved) document.title = resolved;
    };
    apply();
    // Next replaces the <title> node on navigation. Watch the head so we
    // keep the suffix after the pipe instead of falling back to the app name.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [resolved]);
}

export function DocumentTitle() {
  useDocumentTitle();
  return null;
}
