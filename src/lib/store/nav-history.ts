"use client";

import { create } from "zustand";

const MAX_ENTRIES = 80;

interface NavHistoryState {
  stack: string[];
  index: number;
  skipNextRecord: boolean;
  record: (href: string) => void;
  back: () => string | null;
  forward: () => string | null;
}

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  stack: [],
  index: -1,
  skipNextRecord: false,

  record(href) {
    const { skipNextRecord, stack, index } = get();
    if (skipNextRecord) {
      set({ skipNextRecord: false });
      return;
    }
    if (stack[index] === href) return;
    const next = [...stack.slice(0, index + 1), href].slice(-MAX_ENTRIES);
    set({ stack: next, index: next.length - 1 });
  },

  back() {
    const { stack, index } = get();
    if (index <= 0) return null;
    const next = index - 1;
    set({ index: next, skipNextRecord: true });
    return stack[next] ?? null;
  },

  forward() {
    const { stack, index } = get();
    if (index < 0 || index >= stack.length - 1) return null;
    const next = index + 1;
    set({ index: next, skipNextRecord: true });
    return stack[next] ?? null;
  },
}));
