"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { formatTabTitle } from "@/lib/document-title";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";

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
  databases: { id: string; name: string }[],
  t: (key: TranslationKey) => string
): string | null {
  const params = new URLSearchParams(search);

  const pageId = pathSegment(pathname, "/home/p/");
  if (pageId) {
    const page = pages.find((candidate) => candidate.id === pageId);
    return page ? formatTabTitle(page.title || t("untitled")) : null;
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

  if (pathname === "/home/trash") return formatTabTitle(t("trash"));
  if (pathname === "/home/integrations") return formatTabTitle(t("integrations"));

  if (pathname === "/home/notes") {
    if (params.get("favorites") === "1") return formatTabTitle(t("favorites"));
    const notebook = notebooks.find((candidate) => candidate.id === params.get("notebook"));
    return formatTabTitle(notebook?.name || t("all_notes"));
  }

  if (pathname.startsWith("/home")) return formatTabTitle(t("home"));
  return formatTabTitle();
}

export function useDocumentTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pages, notebooks, databases } = useWorkspace();
  const { t } = useTranslation();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const title = useMemo(
    () => titleForRoute(pathname, search, pages, notebooks, databases, t),
    [pathname, search, pages, notebooks, databases, t]
  );
  const lastTitleRef = useRef(formatTabTitle(t("home")));
  if (title) lastTitleRef.current = title;
  const resolved = title ?? lastTitleRef.current;

  useLayoutEffect(() => {
    const apply = () => {
      if (document.title !== resolved) document.title = resolved;
    };
    apply();
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
