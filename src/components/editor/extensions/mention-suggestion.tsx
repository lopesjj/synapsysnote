"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { Instance as TippyInstance } from "tippy.js";
import { FileText } from "lucide-react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-popup";
import { ensureSuggestionPopup } from "./suggestion-tippy";

export interface MentionCandidate {
  id: string;
  title: string;
  icon?: string;
  breadcrumb?: string;
}

/**
 * `@` mentions. Selecting a page inserts a mention node; the editor writes the
 * referenced ids to `outgoingLinks` on save, which is what produces the
 * bidirectional backlinks panel.
 */
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
          icon: candidate.icon ? <span className="text-sm">{candidate.icon}</span> : <FileText />,
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
