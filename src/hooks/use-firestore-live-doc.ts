"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";

export interface LiveDocState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** True while the value comes from the offline cache and has pending writes. */
  fromCache: boolean;
  hasPendingWrites: boolean;
}

const IDLE: LiveDocState<never> = {
  data: null,
  loading: false,
  error: null,
  fromCache: false,
  hasPendingWrites: false,
};

/**
 * ETAPA 2 — `useFirestoreLiveDoc`
 *
 * Thin `onSnapshot` wrapper that also surfaces Firestore's metadata, which is
 * what powers the "Salvo · Offline · Sincronizando" indicator in the editor
 * header. Returns an inert state when Firebase is not configured so the same
 * component tree renders in the local demo.
 */
export function useFirestoreLiveDoc<T = DocumentData>(
  path: string[] | null,
  transform?: (data: DocumentData, id: string) => T
): LiveDocState<T> {
  const key = path?.join("/") ?? null;
  const configured = isFirebaseConfigured();
  const [state, setState] = useState<LiveDocState<T>>({
    ...IDLE,
    loading: Boolean(key) && configured,
  });

  useEffect(() => {
    if (!key || !configured) return;
    const segments = key.split("/");
    const [first, ...rest] = segments;
    const ref = doc(getDb(), first, ...rest);

    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snapshot) => {
        const raw = snapshot.data();
        setState({
          data: raw ? ((transform ? transform(raw, snapshot.id) : (raw as T)) as T) : null,
          loading: false,
          error: null,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        });
      },
      (error) => setState({ data: null, loading: false, error, fromCache: false, hasPendingWrites: false })
    );

    return unsubscribe;
    // `transform` is intentionally excluded: callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, key]);

  if (!key || !configured) return IDLE;
  return state;
}
