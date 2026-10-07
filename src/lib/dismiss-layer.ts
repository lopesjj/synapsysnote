"use client";

import { useEffect, useRef } from "react";

export const dismissPriority = {
  sidebar: 60,
  scratchpad: 90,
  timer: 95,
  palette: 100,
  modal: 110,
  lightbox: 200,
} as const;

type DismissLayer = {
  priority: number;
  seq: number;
  close: () => void | false;
};

const layers: DismissLayer[] = [];
let sequence = 0;
let installed = false;

function topLayer(): DismissLayer | null {
  let top: DismissLayer | null = null;
  for (const layer of layers) {
    if (!top || layer.priority > top.priority || (layer.priority === top.priority && layer.seq > top.seq)) {
      top = layer;
    }
  }
  return top;
}

export function hasOpenDismissLayer(): boolean {
  return layers.length > 0;
}

export function isTransientEscapeTarget(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[role='menu'], [data-radix-popper-content-wrapper]"));
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.repeat) return;
  if (isTransientEscapeTarget()) return;
  const top = topLayer();
  if (!top) return;
  if (top.close() === false) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function installDismissListener() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", onEscape, true);
}

installDismissListener();

export function useDismissLayer(open: boolean, priority: number, close: () => void | false) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    installDismissListener();
    const layer: DismissLayer = {
      priority,
      seq: ++sequence,
      close: () => closeRef.current(),
    };
    layers.push(layer);
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
    };
  }, [open, priority]);
}
