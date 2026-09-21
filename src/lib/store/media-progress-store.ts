"use client";

import { create } from "zustand";

export type MediaProcessingStage = "compress" | "upload";

export interface MediaProcessingState {
  stage: MediaProcessingStage;
  percent: number;
  round?: number;
}

interface MediaProgressStore {
  items: Record<string, MediaProcessingState>;
  setProgress: (key: string, state: MediaProcessingState) => void;
  clearProgress: (key: string) => void;
}

/**
 * Progresso de compressão/upload por bloco de mídia pendente. Fica fora do
 * documento de propósito: atualizar atributos do nó a cada quadro dispararia
 * salvamento automático sem parar.
 */
export const useMediaProgressStore = create<MediaProgressStore>((set) => ({
  items: {},
  setProgress: (key, state) =>
    set((current) => ({ items: { ...current.items, [key]: state } })),
  clearProgress: (key) =>
    set((current) => {
      if (!(key in current.items)) return current;
      const next = { ...current.items };
      delete next[key];
      return { items: next };
    }),
}));
