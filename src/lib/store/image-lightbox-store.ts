"use client";

import { create } from "zustand";

export interface LightboxImage {
  url: string;
  name?: string;
}

interface ImageLightboxState {
  isOpen: boolean;
  images: LightboxImage[];
  currentIndex: number;
  openLightbox: (images: LightboxImage[], initialIndex?: number) => void;
  closeLightbox: () => void;
  nextImage: () => void;
  prevImage: () => void;
  setImageIndex: (index: number) => void;
}

export const useImageLightboxStore = create<ImageLightboxState>((set) => ({
  isOpen: false,
  images: [],
  currentIndex: 0,
  openLightbox: (images, initialIndex = 0) => {
    const validIndex = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
    set({
      isOpen: true,
      images,
      currentIndex: validIndex,
    });
  },
  closeLightbox: () => {
    set({ isOpen: false });
  },
  nextImage: () => {
    set((state) => {
      if (state.images.length <= 1) return state;
      const nextIndex = (state.currentIndex + 1) % state.images.length;
      return { currentIndex: nextIndex };
    });
  },
  prevImage: () => {
    set((state) => {
      if (state.images.length <= 1) return state;
      const prevIndex = (state.currentIndex - 1 + state.images.length) % state.images.length;
      return { currentIndex: prevIndex };
    });
  },
  setImageIndex: (index) => {
    set((state) => {
      const validIndex = Math.max(0, Math.min(index, Math.max(0, state.images.length - 1)));
      return { currentIndex: validIndex };
    });
  },
}));
