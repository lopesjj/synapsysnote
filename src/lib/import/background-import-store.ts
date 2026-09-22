"use client";

import { create } from "zustand";
import type { ImportedNoteResult } from "./run-import";
import type { ImportProvider } from "./parse-file";

export type BackgroundImportWizard = "evernote" | "google-docs" | "file";

export type BackgroundImportStatus = "running" | "done" | "canceled";

export interface BackgroundImportRun {
  key: string;
  provider: string;
  wizard: BackgroundImportWizard;
  fileProvider: ImportProvider | null;
  status: BackgroundImportStatus;
  canceled: boolean;
  processedNotes: number;
  totalNotes: number;
  processedFiles: number;
  totalFiles: number;
  currentTitle: string;
  results: ImportedNoteResult[] | null;
  startedAt: number;
}

export interface BackgroundImportInit {
  provider: string;
  wizard: BackgroundImportWizard;
  fileProvider?: ImportProvider | null;
  totalNotes: number;
  totalFiles?: number;
  currentTitle?: string;
}

interface BackgroundImportStore {
  runs: Record<string, BackgroundImportRun>;
  begin: (key: string, init: BackgroundImportInit) => void;
  patch: (key: string, patch: Partial<BackgroundImportRun>) => void;
  finish: (key: string, results: ImportedNoteResult[]) => void;
  cancel: (key: string) => void;
  clear: (key: string) => void;
}

export const EVERNOTE_IMPORT_KEY = "evernote";
export const GOOGLE_DOCS_IMPORT_KEY = "google-docs";

export function fileImportKey(provider: ImportProvider): string {
  return `file:${provider}`;
}

export const useBackgroundImportStore = create<BackgroundImportStore>((set) => ({
  runs: {},

  begin: (key, init) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [key]: {
          key,
          provider: init.provider,
          wizard: init.wizard,
          fileProvider: init.fileProvider ?? null,
          status: "running",
          canceled: false,
          processedNotes: 0,
          totalNotes: init.totalNotes,
          processedFiles: 0,
          totalFiles: init.totalFiles ?? 0,
          currentTitle: init.currentTitle ?? "",
          results: null,
          startedAt: Date.now(),
        },
      },
    })),

  patch: (key, patch) =>
    set((state) => {
      const current = state.runs[key];
      if (!current) return state;
      return { runs: { ...state.runs, [key]: { ...current, ...patch } } };
    }),

  finish: (key, results) =>
    set((state) => {
      const current = state.runs[key];
      if (!current) return state;
      return {
        runs: {
          ...state.runs,
          [key]: {
            ...current,
            status: current.canceled ? "canceled" : "done",
            currentTitle: "",
            results,
          },
        },
      };
    }),

  cancel: (key) =>
    set((state) => {
      const current = state.runs[key];
      if (!current || current.status !== "running") return state;
      return { runs: { ...state.runs, [key]: { ...current, canceled: true } } };
    }),

  clear: (key) =>
    set((state) => {
      if (!state.runs[key]) return state;
      const runs = { ...state.runs };
      delete runs[key];
      return { runs };
    }),
}));

export function isBackgroundImportCanceled(key: string): boolean {
  return useBackgroundImportStore.getState().runs[key]?.canceled ?? false;
}

export function isBackgroundImportRunning(key: string): boolean {
  return useBackgroundImportStore.getState().runs[key]?.status === "running";
}

export function backgroundImportPercent(run: BackgroundImportRun | undefined): number {
  if (!run) return 0;
  if (run.results) return 100;
  const units = run.totalNotes + run.totalFiles;
  if (!units) return 0;
  const done = run.processedNotes + run.processedFiles;
  return Math.min(99, Math.max(1, Math.round((done / units) * 100)));
}

export function firstRunningBackgroundImport(
  runs: Record<string, BackgroundImportRun>
): BackgroundImportRun | null {
  for (const run of Object.values(runs)) {
    if (run.status === "running") return run;
  }
  return null;
}
