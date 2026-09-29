"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/i18n/navigation";
import { useWorkspace } from "@/lib/data/provider";
import { useStudy } from "@/lib/study/provider";
import { formatTabTitle, subscribeTitlePrefix, withTitlePrefix } from "@/lib/document-title";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { isPlanningName } from "@/components/database/database-i18n";
import { studyTranslate, type StudyKey } from "@/lib/study/i18n";

const STUDY_TITLES: [string, StudyKey][] = [
  ["/home/study/goals/new", "goal_form_new"],
  ["/home/study/goals", "nav_goals"],
  ["/home/study/subjects", "nav_subjects"],
  ["/home/study/syllabus", "nav_syllabus"],
  ["/home/study/schedule", "nav_schedule"],
  ["/home/study/reviews", "nav_reviews"],
  ["/home/study/log", "nav_log"],
  ["/home/study/insights", "nav_insights"],
  ["/home/study/exams", "nav_exams"],
];

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
  t: (key: TranslationKey) => string,
  language: string,
  studyPlans: { id: string; name: string }[],
  studySubjects: { id: string; name: string }[]
): string | null {
  const params = new URLSearchParams(search);

  if (pathname === "/home/study" || pathname.startsWith("/home/study/")) {
    const subjectId = pathSegment(pathname, "/home/study/subjects/");
    if (subjectId) {
      const subject = studySubjects.find((candidate) => candidate.id === subjectId);
      return formatTabTitle(subject?.name || studyTranslate(language, "nav_subjects"));
    }
    const goalId = pathSegment(pathname, "/home/study/goals/");
    if (goalId && goalId !== "new") {
      const plan = studyPlans.find((candidate) => candidate.id === goalId);
      return formatTabTitle(plan?.name || studyTranslate(language, "nav_goals"));
    }
    const match = STUDY_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    return formatTabTitle(studyTranslate(language, match ? match[1] : "nav_overview"));
  }

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
    if (!database) return null;
    const name = isPlanningName(database.name)
      ? t("planning")
      : database.name || t("database_badge");
    return formatTabTitle(name);
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
  const { t, language } = useTranslation();
  const { plans, subjects } = useStudy();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const title = useMemo(
    () => titleForRoute(pathname, search, pages, notebooks, databases, t, language, plans, subjects),
    [pathname, search, pages, notebooks, databases, t, language, plans, subjects]
  );
  const lastTitleRef = useRef(formatTabTitle(t("home")));
  if (title) lastTitleRef.current = title;
  const resolved = title ?? lastTitleRef.current;

  useLayoutEffect(() => {
    const apply = () => {
      const next = withTitlePrefix(resolved);
      if (document.title !== next) document.title = next;
    };
    apply();
    const unsubscribe = subscribeTitlePrefix(apply);
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [resolved]);
}

export function DocumentTitle() {
  useDocumentTitle();
  return null;
}
