"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const key = new PluginKey("synapsysDragAutoScroll");

/**
 * Encontra o contêiner com rolagem ativa pai do editor,
 * subindo a árvore DOM até achar overflow-y auto/scroll ou o elemento de documento.
 */
function findScrollContainer(element: HTMLElement | null): HTMLElement {
  let current = element?.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export const DragAutoScroll = Extension.create({
  name: "dragAutoScroll",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        view(view) {
          let isDragging = false;
          let scrollSpeed = 0;
          let rafId: number | null = null;
          let lastClientX = 0;
          let lastClientY = 0;

          // Margem a partir do topo e da base para começar a rolar (em pixels)
          const SCROLL_ZONE_PX = 100;
          const MIN_SPEED = 4;
          const MAX_SPEED = 28;

          const scrollStep = () => {
            if (!isDragging || scrollSpeed === 0) {
              rafId = null;
              return;
            }

            const container = findScrollContainer(view.dom as HTMLElement);
            if (container === document.documentElement || container === document.body) {
              window.scrollBy({ top: scrollSpeed, behavior: "instant" });
            } else {
              container.scrollTop += scrollSpeed;
            }

            // Dispara um evento dragover sintético para que o ProseMirror atualize a
            // posição da linha de inserção (caret de drop) enquanto a página se move sob o cursor
            try {
              const target = document.elementFromPoint(lastClientX, lastClientY) || view.dom;
              const syntheticDragOver = new DragEvent("dragover", {
                clientX: lastClientX,
                clientY: lastClientY,
                bubbles: true,
                cancelable: true,
              });
              target.dispatchEvent(syntheticDragOver);
            } catch {
              // Navegadores sem suporte a instanciação sintética de DragEvent
            }

            rafId = requestAnimationFrame(scrollStep);
          };

          const ensureLoopRunning = () => {
            if (!rafId && isDragging && scrollSpeed !== 0) {
              rafId = requestAnimationFrame(scrollStep);
            }
          };

          const stopLoop = () => {
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            scrollSpeed = 0;
          };

          const handleDragStart = () => {
            isDragging = true;
          };

          const handleDragOver = (event: DragEvent) => {
            isDragging = true;
            lastClientX = event.clientX;
            lastClientY = event.clientY;

            const container = findScrollContainer(view.dom as HTMLElement);
            const isDoc = container === document.documentElement || container === document.body;
            const rect = isDoc
              ? { top: 0, bottom: window.innerHeight, height: window.innerHeight }
              : container.getBoundingClientRect();

            const topBoundary = rect.top + SCROLL_ZONE_PX;
            const bottomBoundary = rect.bottom - SCROLL_ZONE_PX;

            // Se o cursor estiver na zona superior (acima do topBoundary)
            if (event.clientY < topBoundary && event.clientY >= rect.top - 40) {
              const distance = Math.max(0, topBoundary - event.clientY);
              const factor = Math.min(1, distance / SCROLL_ZONE_PX);
              scrollSpeed = -Math.round(MIN_SPEED + factor * (MAX_SPEED - MIN_SPEED));
              ensureLoopRunning();
            }
            // Se o cursor estiver na zona inferior (abaixo do bottomBoundary)
            else if (event.clientY > bottomBoundary && event.clientY <= rect.bottom + 40) {
              const distance = Math.max(0, event.clientY - bottomBoundary);
              const factor = Math.min(1, distance / SCROLL_ZONE_PX);
              scrollSpeed = Math.round(MIN_SPEED + factor * (MAX_SPEED - MIN_SPEED));
              ensureLoopRunning();
            }
            // Na zona neutra central
            else {
              scrollSpeed = 0;
              stopLoop();
            }
          };

          const handleDragEnd = () => {
            isDragging = false;
            stopLoop();
          };

          // Escuta eventos globais de drag para cobrir tanto o drag nativo da imagem
          // quanto o drag handle lateral de blocos
          window.addEventListener("dragstart", handleDragStart, { capture: true });
          window.addEventListener("dragover", handleDragOver, { capture: true, passive: true });
          window.addEventListener("dragend", handleDragEnd, { capture: true });
          window.addEventListener("drop", handleDragEnd, { capture: true });

          return {
            destroy() {
              stopLoop();
              window.removeEventListener("dragstart", handleDragStart, { capture: true });
              window.removeEventListener("dragover", handleDragOver, { capture: true });
              window.removeEventListener("dragend", handleDragEnd, { capture: true });
              window.removeEventListener("drop", handleDragEnd, { capture: true });
            },
          };
        },
      }),
    ];
  },
});
