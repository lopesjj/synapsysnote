"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { useUiStore } from "@/lib/store/ui-store";
import type { FeatureKey } from "./definitions";
import {
  guestEntitlements,
  normalizePlanRecord,
  resolveEntitlements,
  type AccountPlanRecord,
  type Entitlements,
} from "./entitlements";
import { PlanError, toPlanError } from "./errors";
import { planErrorText, planTranslate } from "./i18n";

const CACHE_PREFIX = "synapsys.cache.plan.";
const LOAD_TIMEOUT_MS = 8000;

interface PlanState {
  uid: string | null;
  guest: boolean;
  record: AccountPlanRecord | null;
  loaded: boolean;
  clockOffset: number;
  tick: number;
  dialogOpen: boolean;
  adminOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  setAdminOpen: (open: boolean) => void;
}

export const usePlanStore = create<PlanState>()((set) => ({
  uid: null,
  guest: false,
  record: null,
  loaded: false,
  clockOffset: 0,
  tick: Date.now(),
  dialogOpen: false,
  adminOpen: false,
  setDialogOpen: (open) => set({ dialogOpen: open }),
  setAdminOpen: (open) => set({ adminOpen: open }),
}));

export function readCachedPlan(uid: string): AccountPlanRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${uid}`);
    return raw ? normalizePlanRecord(JSON.parse(raw), uid) : null;
  } catch {
    return null;
  }
}

export function writeCachedPlan(uid: string, record: AccountPlanRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${uid}`, JSON.stringify(record));
  } catch {}
}

export function planNow(): number {
  return Date.now() + usePlanStore.getState().clockOffset;
}

export function currentEntitlements(): Entitlements {
  const state = usePlanStore.getState();
  if (state.guest) return guestEntitlements();
  return resolveEntitlements(state.record, planNow());
}

export function useEntitlements(): Entitlements {
  const guest = usePlanStore((state) => state.guest);
  const record = usePlanStore((state) => state.record);
  const clockOffset = usePlanStore((state) => state.clockOffset);
  const tick = usePlanStore((state) => state.tick);
  return useMemo(
    () => (guest ? guestEntitlements() : resolveEntitlements(record, tick + clockOffset)),
    [clockOffset, guest, record, tick]
  );
}

export function usePlanNow(): number {
  const clockOffset = usePlanStore((state) => state.clockOffset);
  const tick = usePlanStore((state) => state.tick);
  return tick + clockOffset;
}

export function usePlanLoaded(): boolean {
  return usePlanStore((state) => state.loaded);
}

export function waitForPlan(): Promise<void> {
  if (usePlanStore.getState().loaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      resolve();
    }, LOAD_TIMEOUT_MS);
    unsubscribe = usePlanStore.subscribe((state) => {
      if (!state.loaded) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

const notified = new WeakSet<object>();

export function openPlanDialog() {
  useUiStore.getState().setMobileSidebarOpen(false);
  usePlanStore.getState().setDialogOpen(true);
}

export function describePlanError(error: unknown): string | null {
  const planError = typeof error === "string" ? toPlanError(new Error(error)) : toPlanError(error);
  if (!planError) return null;
  const language = useUiStore.getState().language || "pt";
  return planErrorText(planError, language, currentEntitlements().features.archive);
}

export function notifyPlanError(error: unknown): boolean {
  const planError = toPlanError(error);
  if (!planError) return false;
  if (error && typeof error === "object") {
    if (notified.has(error)) return true;
    notified.add(error);
  }
  const language = useUiStore.getState().language || "pt";
  toast.error(planErrorText(planError, language, currentEntitlements().features.archive), {
    id: `plan:${planError.message}`,
    action: { label: planTranslate(language, "view_plans"), onClick: openPlanDialog },
  });
  return true;
}

export function planFailure(error: PlanError): PlanError {
  notifyPlanError(error);
  return error;
}

export function planAllows(feature: FeatureKey): boolean {
  return currentEntitlements().features[feature];
}

export function assertPlanWritable(): Entitlements {
  const entitlements = currentEntitlements();
  if (entitlements.readOnly) throw planFailure(PlanError.readOnly());
  return entitlements;
}

export function assertPlanFeature(feature: FeatureKey): Entitlements {
  const entitlements = currentEntitlements();
  if (!entitlements.features[feature]) {
    throw planFailure(entitlements.readOnly ? PlanError.readOnly() : PlanError.feature(feature));
  }
  return entitlements;
}

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (!toPlanError(event.reason)) return;
    event.preventDefault();
    notifyPlanError(event.reason);
  });
}
