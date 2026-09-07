"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  EditorWidthPreference,
  NotesDensityPreference,
  NotesLayoutPreference,
  NotesSortPreference,
  UserPreferences,
} from "@/types/models";


export type NotesLayout = NotesLayoutPreference;
export type NotesSortKey = NotesSortPreference;
export type NotesDensity = NotesDensityPreference;
export type EditorWidth = EditorWidthPreference;

export type UiPreferences = Required<Omit<UserPreferences, "theme">>;

interface UiState extends UiPreferences {
  zenMode: boolean;
  mobileSidebarOpen: boolean;
  paletteOpen: boolean;
  importOpen: boolean;
  preferencesOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  closeMenu: () => void;
  openMenu: () => void;
  setSidebarWidth: (value: number) => void;
  toggleZenMode: () => void;
  setZenMode: (value: boolean) => void;
  setMobileSidebarOpen: (value: boolean) => void;
  setPaletteOpen: (value: boolean) => void;
  setImportOpen: (value: boolean) => void;
  setPreferencesOpen: (value: boolean) => void;
  setNotesLayout: (value: NotesLayout) => void;
  setNotesSort: (value: NotesSortKey) => void;
  toggleNotesSortDirection: () => void;
  setNotesDensity: (value: NotesDensity) => void;
  setEditorFontId: (value: string) => void;
  setEditorFontSize: (value: number) => void;
  setEditorWidth: (value: EditorWidth) => void;
  setShowSaveIndicator: (value: boolean) => void;
  hydratePreferences: (value: Partial<UiPreferences>) => void;
}

export const SIDEBAR_MIN_WIDTH = 232;
export const SIDEBAR_MAX_WIDTH = 420;
export const EDITOR_FONT_SIZE_MIN = 14;
export const EDITOR_FONT_SIZE_MAX = 22;

const DEFAULT_PREFERENCES: UiPreferences = {
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_MIN_WIDTH,
  notesLayout: "split",
  notesSort: "updated",
  notesSortDirection: "desc",
  notesDensity: "comfortable",
  editorFontId: "geist",
  editorFontSize: 16,
  editorWidth: "normal",
  showSaveIndicator: true,
};

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof UiPreferences)[];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pickPreferences(source: Partial<UiPreferences>): Partial<UiPreferences> {
  const result: Partial<UiPreferences> = {};
  for (const key of PREFERENCE_KEYS) {
    if (source[key] !== undefined) {
      (result as Record<string, unknown>)[key] = source[key];
    }
  }
  return result;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,

      zenMode: false,
      mobileSidebarOpen: false,
      paletteOpen: false,
      importOpen: false,
      preferencesOpen: false,

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      closeMenu: () => set({ mobileSidebarOpen: false, sidebarCollapsed: true }),
      openMenu: () => set({ sidebarCollapsed: false }),
      setSidebarWidth: (value) =>
        set({ sidebarWidth: Math.round(clamp(value, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)) }),
      toggleZenMode: () => set({ zenMode: !get().zenMode }),
      setZenMode: (value) => set({ zenMode: value }),
      setMobileSidebarOpen: (value) => set({ mobileSidebarOpen: value }),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      setImportOpen: (value) => set({ importOpen: value }),
      setPreferencesOpen: (value) => set({ preferencesOpen: value }),
      setNotesLayout: (value) => set({ notesLayout: value }),
      setNotesSort: (value) => set({ notesSort: value }),
      toggleNotesSortDirection: () =>
        set({ notesSortDirection: get().notesSortDirection === "asc" ? "desc" : "asc" }),
      setNotesDensity: (value) => set({ notesDensity: value }),
      setEditorFontId: (value) => set({ editorFontId: value }),
      setEditorFontSize: (value) =>
        set({ editorFontSize: Math.round(clamp(value, EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX)) }),
      setEditorWidth: (value) => set({ editorWidth: value }),
      setShowSaveIndicator: (value) => set({ showSaveIndicator: value }),
      hydratePreferences: (value) => {
        const next = pickPreferences(value);
        const isNotePage =
          typeof window !== "undefined" && window.location.pathname.startsWith("/home/p/");
        if (isNotePage) {
          next.sidebarCollapsed = true;
        }
        next.sidebarWidth = SIDEBAR_MIN_WIDTH;
        set(next);
      },
    }),
    {
      name: "synapsys.ui.v1",
      version: 6,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<UiPreferences>;
        const isNotePage =
          typeof window !== "undefined" && window.location.pathname.startsWith("/home/p/");
        return {
          ...state,
          sidebarCollapsed: isNotePage ? true : (state.sidebarCollapsed ?? false),
          sidebarWidth: SIDEBAR_MIN_WIDTH,
        };
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => pickPreferences(state) as UiPreferences,
      skipHydration: true,
    }
  )
);

export function useRehydrateUiStore(): void {
  useEffect(() => {
    void Promise.resolve(useUiStore.persist.rehydrate()).then(() => {
      const store = useUiStore.getState();
      const isNotePage =
        typeof window !== "undefined" && window.location.pathname.startsWith("/home/p/");
      if (isNotePage) {
        store.setSidebarCollapsed(true);
      }
      store.setSidebarWidth(SIDEBAR_MIN_WIDTH);
    });
  }, []);
}

export function currentPreferences(): UiPreferences {
  return pickPreferences(useUiStore.getState()) as UiPreferences;
}

export { DEFAULT_PREFERENCES };
