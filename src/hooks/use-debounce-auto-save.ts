"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options<T> {
  delay?: number;
  maxWait?: number;
  resetKey?: string;
  onSave: (value: T) => Promise<void>;
  onError?: (error: unknown) => void;
}

function mergePending<T>(current: T | null, next: T): T {
  if (
    current !== null &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    typeof next === "object" &&
    next !== null &&
    !Array.isArray(next)
  ) {
    return { ...(current as Record<string, unknown>), ...(next as Record<string, unknown>) } as T;
  }
  return next;
}

export function useDebounceAutoSave<T>({
  delay = 900,
  maxWait = 6000,
  resetKey,
  onSave,
  onError,
}: Options<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const inflight = useRef(false);
  const retries = useRef(0);
  const lastErrorAt = useRef(0);
  const saveRef = useRef(onSave);
  const errorRef = useRef(onError);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  const clearScheduleTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    timer.current = null;
    maxTimer.current = null;
    retryTimer.current = null;
  };

  const flush = useCallback(async () => {
    if (inflight.current) return;

    const value = pending.current;
    if (value === null) return;

    clearScheduleTimers();
    pending.current = null;
    inflight.current = true;
    setStatus("saving");

    try {
      await saveRef.current(value);
      retries.current = 0;
      inflight.current = false;
      setStatus("saved");
      setLastSavedAt(Date.now());
      if (pending.current !== null) void flush();
    } catch (error) {
      inflight.current = false;
      if (pending.current === null) pending.current = value;
      else pending.current = mergePending(value, pending.current);
      setStatus("error");
      retries.current += 1;

      const now = Date.now();
      if (now - lastErrorAt.current > 8000) {
        lastErrorAt.current = now;
        errorRef.current?.(error);
      }

      if (retries.current <= 5) {
        const wait = Math.min(1000 * 2 ** (retries.current - 1), 8000);
        retryTimer.current = setTimeout(() => void flush(), wait);
      }
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = mergePending(pending.current, value);
      retries.current = 0;
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
    if (resetKeyRef.current === resetKey) return;
    const previousSave = saveRef.current;
    const leftover = pending.current;
    clearScheduleTimers();
    pending.current = null;
    retries.current = 0;
    resetKeyRef.current = resetKey;
    setStatus("idle");
    if (leftover !== null) {
      void previousSave(leftover).catch((error) => errorRef.current?.(error));
    }
  }, [resetKey]);

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
