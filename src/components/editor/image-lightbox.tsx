"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useImageLightboxStore } from "@/lib/store/image-lightbox-store";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function ImageLightbox() {
  const { isOpen, images, currentIndex, closeLightbox, nextImage, prevImage } =
    useImageLightboxStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Os refs sao a fonte de verdade durante um gesto. Eventos de toque chegam
  // mais rapido do que o React confirma o estado, entao ler o valor renderizado
  // fazia o gesto trabalhar com dados de um frame atras: ao soltar um dedo do
  // pinca a imagem voltava para uma posicao antiga e so entao seguia o dedo.
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  const applyZoom = useCallback((value: number) => {
    zoomRef.current = value;
    setZoom(value);
  }, []);

  const applyPan = useCallback((value: { x: number; y: number }) => {
    panRef.current = value;
    setPan(value);
  }, []);

  const touchDataRef = useRef<{
    mode: "pinch" | "pan";
    initialDist: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    startCenterX: number;
    startCenterY: number;
    startTouchX: number;
    startTouchY: number;
  } | null>(null);

  const lastTapRef = useRef<number>(0);

  const resetTransform = useCallback(() => {
    applyZoom(1);
    applyPan({ x: 0, y: 0 });
  }, [applyPan, applyZoom]);

  useEffect(() => {
    if (isOpen) {
      resetTransform();
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      requestAnimationFrame(() => {
        containerRef.current?.focus();
      });
    }
  }, [isOpen, currentIndex, resetTransform]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextImage();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevImage();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoom(Math.min(MAX_ZOOM, Number((zoomRef.current + ZOOM_STEP).toFixed(2))));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        {
          const next = Math.max(MIN_ZOOM, Number((zoomRef.current - ZOOM_STEP).toFixed(2)));
          if (next <= 1) applyPan({ x: 0, y: 0 });
          applyZoom(next);
        }
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetTransform();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, applyPan, applyZoom, closeLightbox, nextImage, prevImage, resetTransform]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const next = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Number((zoomRef.current + delta).toFixed(2)))
      );
      if (next <= 1) applyPan({ x: 0, y: 0 });
      applyZoom(next);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchDataRef.current = {
          mode: "pinch",
          initialDist: dist,
          initialZoom: zoomRef.current,
          initialPan: { ...panRef.current },
          startCenterX: (t1.clientX + t2.clientX) / 2,
          startCenterY: (t1.clientY + t2.clientY) / 2,
          startTouchX: 0,
          startTouchY: 0,
        };
        setIsDragging(true);
        return;
      }

      if (event.touches.length === 1) {
        const now = Date.now();
        const touch = event.touches[0];

        if (now - lastTapRef.current < 300) {
          event.preventDefault();
          if (zoomRef.current > 1) {
            resetTransform();
          } else {
            applyZoom(2.5);
            applyPan({ x: 0, y: 0 });
          }
          lastTapRef.current = 0;
          touchDataRef.current = null;
          return;
        }
        lastTapRef.current = now;

        if (zoomRef.current > 1) {
          touchDataRef.current = {
            mode: "pan",
            initialDist: 0,
            initialZoom: zoomRef.current,
            initialPan: { ...panRef.current },
            startCenterX: 0,
            startCenterY: 0,
            startTouchX: touch.clientX,
            startTouchY: touch.clientY,
          };
          setIsDragging(true);
        }
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchDataRef.current) return;

      if (event.touches.length === 2 && touchDataRef.current.mode === "pinch") {
        event.preventDefault();
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        if (touchDataRef.current.initialDist > 0) {
          const factor = dist / touchDataRef.current.initialDist;
          const nextZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, Number((touchDataRef.current.initialZoom * factor).toFixed(2)))
          );
          applyZoom(nextZoom);

          const currentCenterX = (t1.clientX + t2.clientX) / 2;
          const currentCenterY = (t1.clientY + t2.clientY) / 2;
          const deltaX = currentCenterX - touchDataRef.current.startCenterX;
          const deltaY = currentCenterY - touchDataRef.current.startCenterY;

          if (nextZoom <= 1) {
            applyPan({ x: 0, y: 0 });
          } else {
            applyPan({
              x: touchDataRef.current.initialPan.x + deltaX,
              y: touchDataRef.current.initialPan.y + deltaY,
            });
          }
        }
        return;
      }

      if (event.touches.length === 1 && touchDataRef.current.mode === "pan") {
        if (zoomRef.current > 1) {
          event.preventDefault();
          const touch = event.touches[0];
          const deltaX = touch.clientX - touchDataRef.current.startTouchX;
          const deltaY = touch.clientY - touchDataRef.current.startTouchY;
          applyPan({
            x: touchDataRef.current.initialPan.x + deltaX,
            y: touchDataRef.current.initialPan.y + deltaY,
          });
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 1 && touchDataRef.current?.mode === "pinch") {
        const touch = event.touches[0];
        if (zoomRef.current > 1) {
          touchDataRef.current = {
            mode: "pan",
            initialDist: 0,
            initialZoom: zoomRef.current,
            initialPan: { ...panRef.current },
            startCenterX: 0,
            startCenterY: 0,
            startTouchX: touch.clientX,
            startTouchY: touch.clientY,
          };
        } else {
          touchDataRef.current = null;
          setIsDragging(false);
        }
        return;
      }

      if (event.touches.length === 0) {
        touchDataRef.current = null;
        setIsDragging(false);
        if (zoomRef.current < 1) {
          applyZoom(1);
          applyPan({ x: 0, y: 0 });
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isOpen, applyPan, applyZoom, resetTransform]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (zoomRef.current <= 1) return;
    if (event.button !== 0) return;
    event.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    applyPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const zoomIn = () => {
    applyZoom(Math.min(MAX_ZOOM, Number((zoomRef.current + ZOOM_STEP).toFixed(2))));
  };

  const zoomOut = () => {
    const next = Math.max(MIN_ZOOM, Number((zoomRef.current - ZOOM_STEP).toFixed(2)));
    if (next <= 1) applyPan({ x: 0, y: 0 });
    applyZoom(next);
  };

  if (!mounted || !isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex select-none items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 outline-none touch-none"
      style={{ touchAction: "none" }}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        className="absolute inset-0 cursor-default"
        onClick={(event) => {
          if (event.target === event.currentTarget && zoom <= 1) {
            closeLightbox();
          }
        }}
      />

      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between text-white pointer-events-none">
        {images.length > 1 ? (
          <div className="pointer-events-auto flex items-center rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium backdrop-blur-md border border-white/10 shadow-lg text-white/80">
            {currentIndex + 1} de {images.length}
          </div>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={closeLightbox}
          title="Fechar (Esc)"
          aria-label="Fechar"
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md border border-white/10 transition hover:bg-white/20 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={prevImage}
            title="Imagem anterior (Seta esquerda)"
            aria-label="Imagem anterior"
            className="absolute left-4 z-20 flex size-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md border border-white/10 transition hover:bg-white/20 hover:scale-105 hover:text-white"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={nextImage}
            title="Próxima imagem (Seta direita)"
            aria-label="Próxima imagem"
            className="absolute right-4 z-20 flex size-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md border border-white/10 transition hover:bg-white/20 hover:scale-105 hover:text-white"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      ) : null}

      <div
        className={cn(
          "relative flex max-h-full max-w-full items-center justify-center p-4 touch-none",
          zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        )}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <img
          src={currentImage.url}
          alt={currentImage.name || "Imagem ampliada"}
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? "none" : "transform 150ms ease-out",
          }}
          className="max-h-[85vh] max-w-[90vw] rounded-md object-contain shadow-2xl pointer-events-auto touch-none"
        />
      </div>

      <div className="absolute bottom-5 z-20 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-white backdrop-blur-md border border-white/10 shadow-2xl">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= MIN_ZOOM}
          title="Diminuir zoom (-)"
          aria-label="Diminuir zoom"
          className="flex size-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Minus className="size-4" />
        </button>

        <button
          type="button"
          onClick={resetTransform}
          title="Redefinir zoom (0)"
          aria-label="Redefinir zoom"
          className="px-2 text-xs font-mono font-medium text-white/90 hover:text-white"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= MAX_ZOOM}
          title="Aumentar zoom (+)"
          aria-label="Aumentar zoom"
          className="flex size-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus className="size-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-white/20" />

        <button
          type="button"
          onClick={resetTransform}
          title="Restaurar tamanho original"
          aria-label="Restaurar tamanho original"
          className="flex size-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
}
