"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options<T> {
  delay?: number;
  maxWait?: number;
  resetKey?: string;
  onSave: (value: T) => Promise<void>;
  /**
   * Gravacao rapida quando a aba vai fechar: nao ha tempo para o salvamento
   * completo, entao quem usa o hook dispara so a escrita (sem esperar).
   */
  onUnloadSave?: (value: T) => void;
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
  onUnloadSave,
  onError,
}: Options<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const inflight = useRef(false);
  const inflightPromise = useRef<Promise<void> | null>(null);
  const inflightValue = useRef<T | null>(null);
  const retries = useRef(0);
  const lastErrorAt = useRef(0);
  const saveRef = useRef(onSave);
  const unloadSaveRef = useRef(onUnloadSave);
  const errorRef = useRef(onError);
  const resetKeyRef = useRef(resetKey);
  // Muda quando a chave muda (outra nota): um salvamento antigo que falhar
  // depois disso nao volta para a fila, senao iria parar na nota nova.
  const generation = useRef(0);

  // Precisa rodar antes do efeito que atualiza `saveRef`: o que sobrou da
  // nota anterior tem de ser salvo com a funcao dela, nao com a da nota nova.
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    const previousSave = saveRef.current;
    const leftover = pending.current;
    clearScheduleTimers();
    pending.current = null;
    retries.current = 0;
    generation.current += 1;
    resetKeyRef.current = resetKey;
    setStatus("idle");
    if (leftover !== null) {
      void previousSave(leftover).catch((error) => errorRef.current?.(error));
    }
  }, [resetKey]);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    unloadSaveRef.current = onUnloadSave;
  }, [onUnloadSave]);

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

  const flush = useCallback((): Promise<void> => {
    if (inflight.current) return inflightPromise.current ?? Promise.resolve();

    const value = pending.current;
    if (value === null) return Promise.resolve();

    clearScheduleTimers();
    pending.current = null;
    inflight.current = true;
    inflightValue.current = value;
    setStatus("saving");
    const startedIn = generation.current;

    const run = (async () => {
      try {
        await saveRef.current(value);
        retries.current = 0;
        inflight.current = false;
        setStatus("saved");
        setLastSavedAt(Date.now());
        if (pending.current !== null) void flush();
      } catch (error) {
        inflight.current = false;
        if (startedIn !== generation.current) {
          errorRef.current?.(error);
          if (pending.current !== null) void flush();
          return;
        }
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
    })();

    inflightPromise.current = run;
    void run.finally(() => {
      if (inflightPromise.current === run) {
        inflightPromise.current = null;
        inflightValue.current = null;
      }
    });
    return run;
  }, []);

  /**
   * Salva o que estiver pendente e espera terminar, inclusive um salvamento que
   * ja estava em curso. Devolve `false` se ainda sobrou algo sem salvar (erro).
   * Usado antes de acoes que leem a nota do banco (versao, copia, restaurar).
   */
  const flushNow = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (inflightPromise.current) {
        await inflightPromise.current;
        continue;
      }
      if (pending.current === null) return true;
      await flush();
      if (pending.current !== null && !inflight.current) return false;
    }
    return pending.current === null && !inflight.current;
  }, [flush]);

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

  /** Descarta o que estava pendente (a nota foi substituida por outra versao). */
  const discardPending = useCallback(() => {
    clearScheduleTimers();
    pending.current = null;
    retries.current = 0;
    generation.current += 1;
    setStatus("idle");
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    // Fechando ou recarregando a aba: grava direto o que falta (e repete o
    // salvamento em curso). O salvamento normal le a nota antes de escrever e
    // nao terminaria a tempo.
    const onPageHide = () => {
      const unloadSave = unloadSaveRef.current;
      if (!unloadSave) {
        void flush();
        return;
      }
      const value =
        inflight.current && inflightValue.current !== null
          ? pending.current === null
            ? inflightValue.current
            : mergePending(inflightValue.current, pending.current)
          : pending.current;
      if (value === null) return;
      clearScheduleTimers();
      pending.current = null;
      try {
        unloadSave(value);
      } catch {
        pending.current = value;
      }
    };
    // Ainda ha alteracao sem salvar: o navegador pergunta antes de sair. Se a
    // pessoa ficar, o salvamento agendado segue normalmente.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current === null && !inflight.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  return {
    schedule,
    flush,
    flushNow,
    discardPending,
    status,
    lastSavedAt,
    isDirty: status === "dirty",
  };
}
