"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { normalizePlanRecord, type AccountPlanRecord } from "@/lib/plans/entitlements";
import { readCachedPlan, usePlanStore, writeCachedPlan } from "@/lib/plans/client";

const TICK_MS = 30_000;
const PREVIEW_KEY = "synapsys.plan.preview";

/**
 * Só em desenvolvimento: um registro gravado em `synapsys.plan.preview` abre as
 * telas de plano em qualquer estado (teste, vencido, somente leitura) sem tocar
 * na conta. Em produção o bloco não existe.
 */
function previewRecord(uid: string): AccountPlanRecord | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    return raw ? normalizePlanRecord(JSON.parse(raw), uid) : null;
  } catch {
    return null;
  }
}

export function PlanSync() {
  const { user, mode } = useAuth();
  const uid = user?.uid ?? null;
  const guest = Boolean(uid) && (mode === "demo" || uid === "demo-user" || !isFirebaseConfigured());

  useEffect(() => {
    if (!uid) {
      usePlanStore.setState({ uid: null, guest: false, record: null, loaded: false });
      return;
    }
    const preview = previewRecord(uid);
    if (preview) {
      usePlanStore.setState({ uid, guest: false, record: preview, loaded: true, clockOffset: 0 });
      return;
    }

    if (guest) {
      usePlanStore.setState({ uid, guest: true, record: null, loaded: true });
      return;
    }

    // Trocar de idioma remonta este componente (o idioma e um segmento da rota),
    // e o efeito roda de novo com a mesma conta. Zerar o registro aqui abriria
    // uma janela em que a conta vencida volta a parecer gravavel ate a resposta
    // chegar — tempo suficiente para tarjas e botoes bloqueados piscarem.
    const previous = usePlanStore.getState();
    const kept = previous.uid === uid && !previous.guest ? previous.record : null;
    const cached = readCachedPlan(uid) ?? kept;
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
