"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { Loader2, RotateCcw, RotateCw, ZoomIn, ZoomOut, Crop } from "lucide-react";
import { DialogShell, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/translations";

interface AvatarCropDialogProps {
  open: boolean;
  imageFile: File | null;
  onClose: () => void;
  onApply: (blob: Blob) => Promise<void> | void;
}

const VIEWPORT_SIZE = 320;
const CROP_RADIUS = 120;
const OUTPUT_SIZE = 512;

export function AvatarCropDialog({
  open,
  imageFile,
  onClose,
  onApply,
}: AvatarCropDialogProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!imageFile || !open) {
      setImage(null);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };
    img.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile, open]);

  const getBaseScale = useCallback((img: HTMLImageElement, rot: number) => {
    const isRotated = rot % 180 !== 0;
    const w = isRotated ? img.height : img.width;
    const h = isRotated ? img.width : img.height;
    const minDim = Math.min(w, h);
    return (CROP_RADIUS * 2) / minDim;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = VIEWPORT_SIZE * dpr;
    canvas.height = VIEWPORT_SIZE * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

    const cx = VIEWPORT_SIZE / 2;
    const cy = VIEWPORT_SIZE / 2;
    const baseScale = getBaseScale(image, rotation);
    const totalScale = baseScale * zoom;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(offset.x, offset.y);
    ctx.scale(totalScale, totalScale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    ctx.beginPath();
    ctx.rect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
    ctx.arc(cx, cy, CROP_RADIUS, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, CROP_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (isDragging) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, CROP_RADIUS, 0, Math.PI * 2);
      ctx.clip();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      const step = (CROP_RADIUS * 2) / 3;

      ctx.beginPath();
      ctx.moveTo(cx - CROP_RADIUS + step, cy - CROP_RADIUS);
      ctx.lineTo(cx - CROP_RADIUS + step, cy + CROP_RADIUS);
      ctx.moveTo(cx - CROP_RADIUS + step * 2, cy - CROP_RADIUS);
      ctx.lineTo(cx - CROP_RADIUS + step * 2, cy + CROP_RADIUS);

      ctx.moveTo(cx - CROP_RADIUS, cy - CROP_RADIUS + step);
      ctx.lineTo(cx + CROP_RADIUS, cy - CROP_RADIUS + step);
      ctx.moveTo(cx - CROP_RADIUS, cy - CROP_RADIUS + step * 2);
      ctx.lineTo(cx + CROP_RADIUS, cy - CROP_RADIUS + step * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }, [getBaseScale, image, isDragging, offset.x, offset.y, rotation, zoom]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialOffset({ ...offset });
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const rad = (-rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    setOffset({
      x: initialOffset.x + rx,
      y: initialOffset.y + ry,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setInitialOffset({ ...offset });
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    const rad = (-rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    setOffset({
      x: initialOffset.x + rx,
      y: initialOffset.y + ry,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoom((prev) => Math.min(3, Math.max(1, Math.round((prev + delta) * 100) / 100)));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handleApply = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = OUTPUT_SIZE;
      offscreen.height = OUTPUT_SIZE;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const factor = OUTPUT_SIZE / (CROP_RADIUS * 2);
      const cx = OUTPUT_SIZE / 2;
      const cy = OUTPUT_SIZE / 2;
      const baseScale = getBaseScale(image, rotation);
      const totalScale = baseScale * zoom * factor;

      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(offset.x * factor, offset.y * factor);
      ctx.scale(totalScale, totalScale);
      ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        offscreen.toBlob((b) => resolve(b), "image/webp", 0.92);
      });

      if (blob) {
        await onApply(blob);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell open={open} onOpenChange={(o) => !o && onClose()} className="max-w-[390px]">
      <DialogHeader
        title={t("avatar_crop_title")}
        description={t("avatar_crop_description")}
        icon={<Crop className="size-4 text-[var(--accent)]" />}
      />

      <div className="flex flex-col items-center p-5 select-none">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-black/95 shadow-inner">
          <canvas
            ref={canvasRef}
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            className={`block touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          />
        </div>

        <div className="mt-4 flex w-full items-center justify-between gap-3 px-1">
          <div className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.1) * 100) / 100))}
              aria-label="Diminuir zoom"
              className="p-1 text-muted hover:text-ink transition"
            >
              <ZoomOut className="size-4" />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              aria-label={t("avatar_crop_zoom")}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--surface-3)] accent-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100))}
              aria-label="Aumentar zoom"
              className="p-1 text-muted hover:text-ink transition"
            >
              <ZoomIn className="size-4" />
            </button>
            <span className="w-11 text-right text-[11px] font-mono font-medium text-muted">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1 border-l border-[var(--border)] pl-3">
            <button
              type="button"
              onClick={handleRotate}
              title={t("avatar_crop_rotate")}
              aria-label={t("avatar_crop_rotate")}
              className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-2)] hover:text-ink transition"
            >
              <RotateCw className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              title={t("avatar_crop_reset")}
              aria-label={t("avatar_crop_reset")}
              className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-2)] hover:text-ink transition"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t("avatar_crop_cancel")}
        </Button>
        <Button variant="primary" onClick={handleApply} disabled={busy || !image}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("avatar_crop_apply")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
