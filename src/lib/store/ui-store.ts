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

/**
 * Global interface state.
 *
 * Everything the *chrome* needs to know but no server ever owns lives here:
 * sidebar geometry, Zen mode, how the note list is laid out and the reader's
 * typography. Workspace documents stay in `WorkspaceProvider` (realtime
 * adapter subscriptions) and remote reads go through TanStack Query — this
 * store deliberately holds no note content.
 *
 * Durable slices are persisted to localStorage so a reload restores the exact
 * workspace the user left, and `useUserPreferencesSync` mirrors them to
 * `users/{uid}.preferences` so the same layout follows them across devices.
 */

export type NotesLayout = NotesLayoutPreference;
export type NotesSortKey = NotesSortPreference;
export type NotesDensity = NotesDensityPreference;
export type EditorWidth = EditorWidthPreference;

/**
 * Slice that is persisted locally and mirrored to `users/{uid}.preferences`.
 * `Required` over the model type guarantees a concrete value for every key the
 * profile may omit, so no component has to handle `undefined`.
 */
export type UiPreferences = Required<Omit<UserPreferences, "theme">>;

interface UiState extends UiPreferences {
  /* Transient — intentionally never persisted. */
  zenMode: boolean;
  mobileSidebarOpen: boolean;
  paletteOpen: boolean;
  importOpen: boolean;
  zipImportOpen: boolean;
  preferencesOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setSidebarWidth: (value: number) => void;
  toggleZenMode: () => void;
  setZenMode: (value: boolean) => void;
  setMobileSidebarOpen: (value: boolean) => void;
  setPaletteOpen: (value: boolean) => void;
  setImportOpen: (value: boolean) => void;
  setZipImportOpen: (value: boolean) => void;
  setPreferencesOpen: (value: boolean) => void;
  setNotesLayout: (value: NotesLayout) => void;
  setNotesSort: (value: NotesSortKey) => void;
  toggleNotesSortDirection: () => void;
  setNotesDensity: (value: NotesDensity) => void;
  setEditorFontId: (value: string) => void;
  setEditorFontSize: (value: number) => void;
  setEditorWidth: (value: EditorWidth) => void;
  setShowSaveIndicator: (value: boolean) => void;
  /** Applies a preference set loaded from the user profile without re-persisting a partial object. */
  hydratePreferences: (value: Partial<UiPreferences>) => void;
}

export const SIDEBAR_MIN_WIDTH = 216;
export const SIDEBAR_MAX_WIDTH = 420;
export const EDITOR_FONT_SIZE_MIN = 14;
export const EDITOR_FONT_SIZE_MAX = 22;

const DEFAULT_PREFERENCES: UiPreferences = {
  sidebarCollapsed: false,
  sidebarWidth: 268,
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

/** Strips unknown keys so a stale profile document can never widen the store. */
export function pickPreferences(source: Partial<UiPreferences>): Partial<UiPreferences> {
  const result: Partial<UiPreferences> = {};
  for (const key of PREFERENCE_KEYS) {
    if (source[key] !== undefined) {
      // Index-signature assignment across a heterogeneous record needs the cast.
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
      zipImportOpen: false,
      preferencesOpen: false,

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setSidebarWidth: (value) =>
        set({ sidebarWidth: Math.round(clamp(value, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)) }),
      toggleZenMode: () => set({ zenMode: !get().zenMode }),
      setZenMode: (value) => set({ zenMode: value }),
      setMobileSidebarOpen: (value) => set({ mobileSidebarOpen: value }),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      setImportOpen: (value) => set({ importOpen: value }),
      setZipImportOpen: (value) => set({ zipImportOpen: value }),
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
      hydratePreferences: (value) => set(pickPreferences(value)),
    }),
    {
      name: "synapsys.ui.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => pickPreferences(state) as UiPreferences,
      /**
       * Rehydration is deferred to `<UiStoreHydrator>` so the first client
       * render matches the prerendered HTML instead of tripping React's
       * hydration diff on a persisted layout.
       */
      skipHydration: true,
    }
  )
);

/** Applies the persisted preferences after mount. Render once, near the root. */
export function useRehydrateUiStore(): void {
  useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);
}

/** Read the durable slice without subscribing (used by the profile mirror). */
export function currentPreferences(): UiPreferences {
  return pickPreferences(useUiStore.getState()) as UiPreferences;
}

export { DEFAULT_PREFERENCES };
