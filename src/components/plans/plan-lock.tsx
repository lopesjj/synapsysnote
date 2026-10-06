"use client";

import type { ReactElement } from "react";
import { Lock } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";
import type { PlanGate } from "@/lib/plans/gates";
import { cn } from "@/lib/utils";

export function PlanLockBadge({ gate, className }: { gate: PlanGate; className?: string }) {
  if (gate.allowed) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-faint",
        className
      )}
    >
      <Lock className="size-3" aria-hidden />
      {gate.badge ? <span className="truncate">{gate.badge}</span> : null}
    </span>
  );
}

export function PlanLockIcon({ gate, className }: { gate: PlanGate; className?: string }) {
  if (gate.allowed) return null;
  return <Lock className={cn("size-3 shrink-0 text-faint", className)} aria-hidden />;
}

export function GateTooltip({
  gate,
  label,
  shortcut,
  side,
  children,
}: {
  gate: PlanGate;
  label?: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  if (gate.allowed) {
    return label ? (
      <Tooltip label={label} shortcut={shortcut} side={side}>
        {children}
      </Tooltip>
    ) : (
      children
    );
  }
  return (
    <Tooltip label={gate.reason ?? label ?? ""} side={side}>
      <span
        tabIndex={0}
        aria-label={gate.reason ?? label}
        className="inline-flex cursor-not-allowed rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 [&>*]:pointer-events-none"
      >
        {children}
      </span>
    </Tooltip>
  );
}
