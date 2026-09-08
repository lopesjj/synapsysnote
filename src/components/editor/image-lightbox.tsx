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

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetTransform();
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
        setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((z) => {
          const next = Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2)));
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
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
  }, [isOpen, closeLightbox, nextImage, prevImage, resetTransform]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((currentZoom) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((currentZoom + delta).toFixed(2))));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (zoom <= 1) return;
    if (event.button !== 0) return;
    event.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const zoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
  };

  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  if (!mounted || !isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex select-none items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
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
          "relative flex max-h-full max-w-full items-center justify-center p-4",
          zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        )}
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
          className="max-h-[85vh] max-w-[90vw] rounded-md object-contain shadow-2xl pointer-events-auto"
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
