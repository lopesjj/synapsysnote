"use client";

import type { ReactNode } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function WizardFooter({ steps, children }: { steps?: ReactNode; children: ReactNode }) {
  return (
    <DialogFooter
      className={cn(
        "flex-col items-stretch gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-3.5",
        !steps && "sm:justify-end"
      )}
    >
      {steps ? (
        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted">{steps}</div>
      ) : null}
      <div className="flex w-full items-stretch gap-2 *:min-w-0 sm:w-auto sm:shrink-0 sm:items-center max-sm:*:h-auto max-sm:*:min-h-10 max-sm:*:flex-1 max-sm:*:whitespace-normal max-sm:*:py-2 max-sm:*:text-center max-sm:*:leading-tight">
        {children}
      </div>
    </DialogFooter>
  );
}

export function WizardSteps({ current, label, total = 3 }: { current: number; label: string; total?: number }) {
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              index < current ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
            )}
          />
        ))}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
}
