"use client";

import * as React from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";

export function DialogShell({
  open,
  children,
  className,
  onOpenChange,
  showClose = true,
  closeAriaLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  closeAriaLabel?: string;
}) {
  const reducedMotion = useUiStore((state) => state.reducedMotion);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.08 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-90 bg-black/50"
          />
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.985 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative z-100 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg flex-col",
              "overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]",
              className
            )}
          >
            {children}
            {showClose ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-3.5 top-3.5 rounded-[var(--radius-xs)] p-1.5 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                aria-label={closeAriaLabel ?? "Fechar"}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function DialogHeader({
  title,
  description,
  icon,
  iconClassName,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-4", className)}>
      {icon ? (
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-ink shadow-xs",
            iconClassName
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3.5",
        className
      )}
    >
      {children}
    </div>
  );
}
