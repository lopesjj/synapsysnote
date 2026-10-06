"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { normalizePlanRecord, type AccountPlanRecord } from "@/lib/plans/entitlements";
import { readCachedPlan, usePlanStore, writeCachedPlan } from "@/lib/plans/client";

const TICK_MS = 30_000;

export function PlanSync() {
  const { user, mode } = useAuth();
  const uid = user?.uid ?? null;
  const guest = Boolean(uid) && (mode === "demo" || uid === "demo-user" || !isFirebaseConfigured());

  useEffect(() => {
    if (!uid) {
      usePlanStore.setState({ uid: null, guest: false, record: null, loaded: false });
      return;
    }
    if (guest) {
      usePlanStore.setState({ uid, guest: true, record: null, loaded: true });
      return;
    }

    const cached = readCachedPlan(uid);
    usePlanStore.setState({ uid, guest: false, record: cached, loaded: Boolean(cached) });

    let cancelled = false;
    let ensuring = false;
    let settled = false;
    let unsubscribe = () => {};

    const apply = (record: AccountPlanRecord | null) => {
      if (cancelled || !record) return;
      usePlanStore.setState({ record, loaded: true });
      writeCachedPlan(uid, record);
    };

    const ensure = async () => {
      if (ensuring) return;
      ensuring = true;
      try {
        const { firebaseJson } = await import("@/lib/firebase/auth-headers");
        const response = await firebaseJson<{ record?: unknown; now?: number }>("/api/account/plan", { method: "POST" });
        if (cancelled) return;
        if (typeof response.now === "number") usePlanStore.setState({ clockOffset: response.now - Date.now() });
        apply(normalizePlanRecord(response.record, uid));
      } catch {
        if (!cancelled && !usePlanStore.getState().loaded) usePlanStore.setState({ loaded: true });
      } finally {
        ensuring = false;
        settled = true;
      }
    };

    void ensure();

    void (async () => {
      const [{ doc, onSnapshot }, { getDb }] = await Promise.all([
        import("firebase/firestore"),
        import("@/lib/firebase/client"),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(getDb(), "account_plans", uid),
        (snap) => {
          if (snap.exists()) apply(normalizePlanRecord(snap.data(), uid));
          else if (!snap.metadata.fromCache && settled) void ensure();
        },
        () => undefined
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [guest, uid]);

  useEffect(() => {
    const refresh = () => usePlanStore.setState({ tick: Date.now() });
    refresh();
    const timer = window.setInterval(refresh, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return null;
}
