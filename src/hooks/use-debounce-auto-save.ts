"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options<T> {
  /** Idle time before a write is issued. */
  delay?: number;
  /** Hard ceiling: flush even while the user keeps typing. */
  maxWait?: number;
  onSave: (value: T) => Promise<void>;
  onError?: (error: unknown) => void;
}

/**
 * ETAPA 2 — `useDebounceAutoSave`
 *
 * Editor persistence primitive. Coalesces keystrokes into one write, guarantees
 * a flush every `maxWait` ms during long typing bursts, and flushes on unmount
 * and on `visibilitychange` so navigating away never drops the last edit.
 */
export function useDebounceAutoSave<T>({
  delay = 500,
  maxWait = 4000,
  onSave,
  onError,
}: Options<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    timer.current = null;
    maxTimer.current = null;

    const value = pending.current;
    if (value === null) return;
    pending.current = null;

    setStatus("saving");
    try {
      await saveRef.current(value);
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (error) {
      setStatus("error");
      onError?.(error);
    }
  }, [onError]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = value;
      setStatus("dirty");

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);

      if (!maxTimer.current) {
        maxTimer.current = setTimeout(() => void flush(), maxWait);
      }
    },
    [delay, flush, maxWait]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, status, lastSavedAt, isDirty: status === "dirty" };
}
