"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  EditorWidthPreference,
  NotesDensityPreference,
  NotesLayoutPreference,
  NotesSortPreference,
  SupportedLanguage,
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
  collapseSidebar: () => void;
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
  setUiZoom: (value: number) => void;
  setAutoCollapseSidebar: (value: boolean) => void;
  setLanguage: (value: SupportedLanguage) => void;
  hydratePreferences: (value: Partial<UiPreferences>) => void;
}

export const SIDEBAR_MIN_WIDTH = 232;
export const SIDEBAR_MAX_WIDTH = 420;
export const EDITOR_FONT_SIZE_MIN = 14;
export const EDITOR_FONT_SIZE_MAX = 22;
export const UI_ZOOM_MIN = 0.9;
export const UI_ZOOM_MAX = 1.1;
export const UI_ZOOM_MOBILE_MAX = 1.05;
export const UI_ZOOM_STEPS = [0.9, 0.95, 1.0, 1.05, 1.1] as const;

const DEFAULT_PREFERENCES: UiPreferences = {
  language: "pt",
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
  uiZoom: 1.0,
  autoCollapseSidebar: true,
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
      collapseSidebar: () => set({ sidebarCollapsed: true, mobileSidebarOpen: false }),
      closeMenu: () => {
        const next: Partial<UiState> = { mobileSidebarOpen: false };
        if (get().autoCollapseSidebar) {
          next.sidebarCollapsed = true;
        }
        set(next);
      },
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
      setUiZoom: (value) =>
        set({ uiZoom: Math.round(clamp(value, UI_ZOOM_MIN, UI_ZOOM_MAX) * 100) / 100 }),
      setAutoCollapseSidebar: (value) => set({ autoCollapseSidebar: value }),
      setLanguage: (value) => set({ language: value }),
      hydratePreferences: (value) => {
        const next = pickPreferences(value);
        const isNotePage =
          typeof window !== "undefined" && window.location.pathname.startsWith("/home/p/");
        const shouldAutoCollapse = next.autoCollapseSidebar ?? get().autoCollapseSidebar ?? true;
        if (isNotePage && shouldAutoCollapse) {
          next.sidebarCollapsed = true;
        }
        next.sidebarWidth = SIDEBAR_MIN_WIDTH;
        set(next);
      },
    }),
    {
      name: "synapsys.ui.v1",
      version: 7,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<UiPreferences>;
        const isNotePage =
          typeof window !== "undefined" && window.location.pathname.startsWith("/home/p/");
        const shouldAutoCollapse = state.autoCollapseSidebar ?? true;
        return {
          ...state,
          sidebarCollapsed: (isNotePage && shouldAutoCollapse) ? true : (state.sidebarCollapsed ?? false),
          sidebarWidth: SIDEBAR_MIN_WIDTH,
          uiZoom: state.uiZoom ?? 1.0,
          autoCollapseSidebar: shouldAutoCollapse,
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
      if (isNotePage && store.autoCollapseSidebar) {
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
