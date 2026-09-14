"use client";

import { create } from "zustand";
import { convertTextToLibrasGlosa, type LibrasToken } from "@/lib/accessibility/libras-glosa";

export type LibrasSpeed = 0.5 | 1 | 1.5 | 2;

interface LibrasState {
  isOpen: boolean;
  isMinimized: boolean;
  isPlaying: boolean;
  speed: LibrasSpeed;
  sourceTitle: string;
  sourceAudioUrl?: string;
  tokens: LibrasToken[];
  currentTokenIndex: number;
  currentCharIndex: number;

  openWithText: (
    text: string,
    meta?: { title?: string; audioUrl?: string; autoPlay?: boolean }
  ) => void;
  updateText: (text: string) => void;
  close: () => void;
  toggleMinimize: () => void;
  setMinimized: (value: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  replay: () => void;
  setSpeed: (speed: LibrasSpeed) => void;
  seekToToken: (index: number) => void;
  stepTick: () => void;
}

export const useLibrasStore = create<LibrasState>((set, get) => ({
  isOpen: false,
  isMinimized: false,
  isPlaying: false,
  speed: 1,
  sourceTitle: "",
  sourceAudioUrl: undefined,
  tokens: [],
  currentTokenIndex: 0,
  currentCharIndex: 0,

  openWithText: (text, meta) => {
    const tokens = convertTextToLibrasGlosa(text);
    const autoPlay = meta?.autoPlay !== false;
    set({
      isOpen: true,
      isMinimized: false,
      isPlaying: autoPlay && tokens.length > 0,
      sourceTitle: meta?.title || "Interpretação em Libras",
      sourceAudioUrl: meta?.audioUrl,
      tokens,
      currentTokenIndex: 0,
      currentCharIndex: 0,
    });
  },

  updateText: (text) => {
    const tokens = convertTextToLibrasGlosa(text);
    set((state) => ({
      tokens,
      isPlaying:
        state.isPlaying ||
        (state.isOpen && tokens.length > 0 && state.currentTokenIndex < tokens.length),
    }));
  },

  close: () => {
    set({
      isOpen: false,
      isPlaying: false,
      currentTokenIndex: 0,
      currentCharIndex: 0,
    });
  },

  toggleMinimize: () => {
    set((state) => ({ isMinimized: !state.isMinimized }));
  },

  setMinimized: (value) => {
    set({ isMinimized: value });
  },

  play: () => {
    const { tokens, currentTokenIndex } = get();
    if (tokens.length === 0) return;
    if (currentTokenIndex >= tokens.length) {
      set({ currentTokenIndex: 0, currentCharIndex: 0, isPlaying: true });
    } else {
      set({ isPlaying: true });
    }
  },

  pause: () => {
    set({ isPlaying: false });
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  next: () => {
    const { tokens, currentTokenIndex } = get();
    if (currentTokenIndex < tokens.length - 1) {
      set({ currentTokenIndex: currentTokenIndex + 1, currentCharIndex: 0 });
    } else {
      set({ isPlaying: false });
    }
  },

  prev: () => {
    const { currentTokenIndex } = get();
    if (currentTokenIndex > 0) {
      set({ currentTokenIndex: currentTokenIndex - 1, currentCharIndex: 0 });
    } else {
      set({ currentCharIndex: 0 });
    }
  },

  replay: () => {
    set({
      currentTokenIndex: 0,
      currentCharIndex: 0,
      isPlaying: true,
    });
  },

  setSpeed: (speed) => {
    set({ speed });
  },

  seekToToken: (index) => {
    const { tokens } = get();
    if (index >= 0 && index < tokens.length) {
      set({ currentTokenIndex: index, currentCharIndex: 0 });
    }
  },

  stepTick: () => {
    const { tokens, currentTokenIndex, currentCharIndex, isPlaying } = get();
    if (!isPlaying || tokens.length === 0) return;

    const currentToken = tokens[currentTokenIndex];
    if (!currentToken) {
      set({ isPlaying: false });
      return;
    }

    if (currentToken.isConceptSign) {
      if (currentTokenIndex < tokens.length - 1) {
        set({ currentTokenIndex: currentTokenIndex + 1, currentCharIndex: 0 });
      } else {
        set({ isPlaying: false });
      }
      return;
    }

    if (currentCharIndex < currentToken.characters.length - 1) {
      set({ currentCharIndex: currentCharIndex + 1 });
    } else if (currentTokenIndex < tokens.length - 1) {
      set({ currentTokenIndex: currentTokenIndex + 1, currentCharIndex: 0 });
    } else {
      set({ isPlaying: false });
    }
  },
}));
