"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { FlashcardSettings } from "@/types/models";
import {
  DEFAULT_FLASHCARD_SETTINGS,
  FLASHCARD_SETTINGS_STORAGE_KEY,
  readStoredSettings,
  writeStoredSettings,
} from "./srs";

const SETTINGS_EVENT = "synapsys:flashcard-settings";

let cachedRaw: string | null | undefined;
let cachedValue: FlashcardSettings = DEFAULT_FLASHCARD_SETTINGS;

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(SETTINGS_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): FlashcardSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(FLASHCARD_SETTINGS_STORAGE_KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readStoredSettings();
  }
  return cachedValue;
}

function getServerSnapshot(): FlashcardSettings {
  return DEFAULT_FLASHCARD_SETTINGS;
}

function subscribeHydration(): () => void {
  return () => {};
}

export function useFlashcardSettings(): {
  settings: FlashcardSettings;
  saveSettings: (next: FlashcardSettings) => void;
  hydrated: boolean;
} {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );

  const saveSettings = useCallback((next: FlashcardSettings) => {
    writeStoredSettings(next);
  }, []);

  return { settings, saveSettings, hydrated };
}
