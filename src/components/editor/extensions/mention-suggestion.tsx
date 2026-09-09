"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { Instance as TippyInstance } from "tippy.js";
import { FileText } from "lucide-react";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-popup";
import { ensureSuggestionPopup } from "./suggestion-tippy";

import type { Page, Notebook } from "@/types/models";
import { parentIdOf } from "@/lib/data/notebook-tree";

export interface MentionCandidate {
  id: string;
  title: string;
  icon?: string;
  breadcrumb?: string;
}

export function getMentionCandidates({
  currentPageId,
  currentNotebookId,
  livePages,
  notebooks,
}: {
  currentPageId: string;
  currentNotebookId?: string | null;
  livePages: Page[];
  notebooks: Notebook[];
}): MentionCandidate[] {
  if (!currentNotebookId) {
    return [];
  }

  const notebookMap = new Map(notebooks.map((n) => [n.id, n]));

  // 1. Mostrar só notas do caderno da nota atual (excluindo a própria nota)
  let candidatePages = livePages.filter(
    (page) =>
      page.notebookId === currentNotebookId &&
      page.id !== currentPageId &&
      !page.deletedAt &&
      !page.archived
  );

  // 2. Se não tiver notas do caderno, puxar do caderno pai
  if (candidatePages.length === 0) {
    let cur = notebookMap.get(currentNotebookId);

    while (cur) {
      const pId = parentIdOf(cur);
      if (!pId) break;
      const parentPages = livePages.filter(
        (page) =>
          page.notebookId === pId &&
          page.id !== currentPageId &&
          !page.deletedAt &&
          !page.archived
      );
      if (parentPages.length > 0) {
        candidatePages = parentPages;
        break;
      }
      cur = notebookMap.get(pId);
    }
  }

  // Ordenar por atualização mais recente
  const sorted = [...candidatePages].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );

  return sorted.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    icon: candidate.icon,
    breadcrumb: candidate.notebookId ? notebookMap.get(candidate.notebookId)?.name : undefined,
  }));
}

export function createMentionSuggestion(
  getCandidates: () => MentionCandidate[]
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "@",
    allowSpaces: true,

    items: ({ query }) => {
      const q = query.toLowerCase().trim();
      const all = getCandidates();
      const filtered = q ? all.filter((c) => c.title.toLowerCase().includes(q)) : all;
      return filtered.slice(0, 8);
    },

    render: () => {
      let component: ReactRenderer<SuggestionListHandle> | null = null;
      let popup: TippyInstance | null = null;

      const toItems = (
        candidates: MentionCandidate[],
        command: (attrs: { id: string; label: string }) => void
      ): SuggestionItem[] =>
        candidates.map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          subtitle: candidate.breadcrumb,
          group: "Páginas",
          icon: candidate.icon ? <WorkspaceIcon icon={candidate.icon} fallback="📄" size={14} /> : <FileText />,
          run: () => command({ id: candidate.id, label: candidate.title }),
        }));

      return {
        onStart: (props) => {
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: toItems(props.items as MentionCandidate[], props.command),
              emptyLabel: "Nenhuma página encontrada",
            },
            editor: props.editor,
          });
          popup = ensureSuggestionPopup(
            popup,
            props.clientRect as (() => DOMRect) | null,
            component.element
          );
        },

        onUpdate: (props) => {
          component?.updateProps({
            items: toItems(props.items as MentionCandidate[], props.command),
          });
          if (component) {
            popup = ensureSuggestionPopup(
              popup,
              props.clientRect as (() => DOMRect) | null,
              component.element
            );
          }
        },

        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}
