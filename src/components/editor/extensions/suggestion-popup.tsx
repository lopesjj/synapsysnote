"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SuggestionItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: ReactNode;
  keywords?: string[];
  run: () => void;
}

export interface SuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SuggestionList = forwardRef<SuggestionListHandle, { items: SuggestionItem[]; emptyLabel?: string }>(
  ({ items, emptyLabel = "Nada encontrado" }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((prev) => (prev + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((prev) => (prev - 1 + items.length) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          items[selected]?.run();
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="w-[300px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12.5px] text-muted shadow-[var(--shadow-float)]">
          {emptyLabel}
        </div>
      );
    }

    let lastGroup = "";

    return (
      <div className="max-h-[320px] w-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-float)]">
        {items.map((item, index) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {showGroup ? (
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
                  {item.group}
                </p>
              ) : null}
              <button
                type="button"
                onMouseEnter={() => setSelected(index)}
                onClick={() => item.run()}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-2 py-1.5 text-left transition-colors",
                  index === selected ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] text-muted [&_svg]:size-3.5",
                    index === selected && "border-[var(--accent)]/40 text-[var(--accent)]"
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">{item.title}</span>
                  {item.subtitle ? (
                    <span className="block truncate text-[11px] text-muted">{item.subtitle}</span>
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }
);
SuggestionList.displayName = "SuggestionList";
