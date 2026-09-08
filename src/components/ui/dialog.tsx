"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";


export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogShell({
  open,
  children,
  className,
  onOpenChange,
  showClose = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-90 bg-black/50 backdrop-blur-[2px]"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.99 }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                className={cn(
                  "fixed left-1/2 top-1/2 z-100 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
                  "overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]",
                  className
                )}
              >
                {children}
                {showClose ? (
                  <DialogPrimitive.Close
                    className="absolute right-3.5 top-3.5 rounded-[var(--radius-xs)] p-1.5 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
                    aria-label="Fechar"
                  >
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export function DialogHeader({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 border-b border-[var(--border)] px-5 py-4", className)}>
      {icon ? (
        <div className="mt-0.5 flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
    </div>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3.5",
        className
      )}
    >
      {children}
    </div>
  );
}
