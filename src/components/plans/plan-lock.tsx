"use client";

import type { ReactElement } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { openPlanDialog } from "@/lib/plans/client";
import type { PlanGate } from "@/lib/plans/gates";
import { usePlanT } from "@/lib/plans/i18n";
import { cn } from "@/lib/utils";

/**
 * Aviso de recurso fora do plano: mesma forma em flashcards, conquistas e
 * arquivo, com atalho para a tela de assinatura.
 */
export function PlanNotice({
  title,
  body,
  className,
}: {
  title?: string | null;
  body: string;
  className?: string;
}) {
  const { tp } = usePlanT();
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]/40 p-3.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-muted">
          <Lock className="size-3.5" />
        </span>
        <div className="min-w-0">
          {title ? <p className="text-[12.5px] font-semibold leading-snug text-ink">{title}</p> : null}
          <p className={cn("text-[12px] leading-relaxed text-muted", title && "mt-0.5")}>{body}</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" className="w-full shrink-0 sm:w-auto" onClick={openPlanDialog}>
        {tp("view_plans")}
      </Button>
    </div>
  );
}

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
