"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Maximize2, Pause, Play, Square, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import {
  isTimerArmed,
  pauseTimer,
  startTimer,
  timerElapsedMs,
  useStudyUi,
  type PomodoroPhase,
  type TimerMode,
  type TimerState,
} from "@/lib/study/ui-store";
import { clockLabel } from "@/lib/study/format";
import { dayKeyOf, minuteOfDay } from "@/lib/study/dates";
import { holdTimerAudio, playTimerSound, releaseTimerAudio, resumeTimerAudio, unlockTimerAudio } from "@/lib/study/sound";
import { setTitlePrefix } from "@/lib/document-title";
import type { StudySettings } from "@/types/study";
import { SubjectDot } from "./ui";

export function ExamMark() {
  return <ClipboardCheck aria-hidden className="size-3.5 shrink-0 text-[var(--accent)]" />;
}

export const PHASE_KEY: Record<PomodoroPhase, StudyKey> = {
  focus: "timer_phase_focus",
  short: "timer_phase_short",
  long: "timer_phase_long",
};

export const MODE_KEY: Record<TimerMode, StudyKey> = {
  stopwatch: "timer_mode_stopwatch",
  countdown: "timer_mode_countdown",
  pomodoro: "timer_mode_pomodoro",
};

function phaseMs(phase: PomodoroPhase, settings: StudySettings): number {
  const minutes = phase === "focus" ? settings.pomodoroFocus : phase === "short" ? settings.pomodoroShort : settings.pomodoroLong;
  return minutes * 60_000;
}

export function targetMs(timer: TimerState, settings: StudySettings): number | null {
  if (timer.mode === "countdown") return timer.countdownMs;
  if (timer.mode === "pomodoro") return phaseMs(timer.phase, settings);
  return null;
}

export function displaySeconds(timer: TimerState, settings: StudySettings, now = Date.now()): number {
  const elapsed = timerElapsedMs(timer, now);
  const target = targetMs(timer, settings);
  const shown = target !== null ? Math.max(0, target - elapsed) : elapsed;
  return target !== null ? Math.ceil(shown / 1000) : Math.floor(shown / 1000);
}

export function focusSeconds(timer: TimerState, now = Date.now()): number {
  const elapsed = timerElapsedMs(timer, now);
  if (timer.mode === "pomodoro") return Math.round((timer.focusMs + (timer.phase === "focus" ? elapsed : 0)) / 1000);
  if (timer.mode === "countdown") return Math.round(Math.min(elapsed, timer.countdownMs) / 1000);
  return Math.round(elapsed / 1000);
}

export function useNow(active: boolean, interval = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [active, interval]);
  return now;
}

export function finishFocus(settings: StudySettings, message: string) {
  const store = useStudyUi.getState();
  const timer = store.timer;
  const seconds = focusSeconds(timer);
  const started = timer.firstStartedAt ?? Date.now();
  const wasExam = timer.examMode;
  store.resetTimer({ subjectId: wasExam ? null : timer.subjectId, topicId: wasExam ? null : timer.topicId, examMode: false });
  store.setTimerOpen(false);
  if (seconds < 60) {
    toast.info(message);
    return;
  }
  if (wasExam) {
    store.openExam({ durationSec: seconds, day: dayKeyOf(started, settings.timeZone) });
    return;
  }
  store.openLog({
    durationSec: seconds,
    subjectId: timer.subjectId,
    topicId: timer.topicId,
    reviewId: timer.reviewId,
    pageId: timer.pageId ?? null,
    day: dayKeyOf(started, settings.timeZone),
    startMinute: minuteOfDay(started, settings.timeZone),
    categoryId: timer.reviewId ? "review" : undefined,
    source: "timer",
  });
}

type ScreenWakeLock = { release: () => Promise<void> };

function requestScreenWake(): Promise<ScreenWakeLock | null> {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<ScreenWakeLock> } }).wakeLock;
  if (!wakeLock || document.visibilityState !== "visible") return Promise.resolve(null);
  return wakeLock.request("screen").catch(() => null);
}

export function FocusEngine() {
  const { settings } = useStudy();
  const { st } = useStudyT();
  const status = useStudyUi((state) => state.timer.status);
  const timerSound = settings.timerSound;
  const pomodoroFocus = settings.pomodoroFocus;
  const pomodoroShort = settings.pomodoroShort;
  const pomodoroLong = settings.pomodoroLong;
  const pomodoroRounds = settings.pomodoroRounds;

  useEffect(() => {
    if (status !== "running") {
      releaseTimerAudio();
      return;
    }
    const cue = () => {
      const timer = useStudyUi.getState().timer;
      if (timer.mode === "stopwatch" || timerSound === "none") {
        releaseTimerAudio();
        return;
      }
      holdTimerAudio();
    };
    cue();
    let wake: ScreenWakeLock | null = null;
    let dropped = false;
    const lockScreen = () => {
      const timer = useStudyUi.getState().timer;
      if (dropped || timer.mode === "stopwatch" || timerSound === "none") return;
      void requestScreenWake().then((sentinel) => {
        if (dropped || !sentinel) {
          void sentinel?.release();
          return;
        }
        wake = sentinel;
      });
    };
    lockScreen();
    const tick = () => {
      const store = useStudyUi.getState();
      const timer = store.timer;
      if (timer.status !== "running") return;
      const now = Date.now();
      if (timer.mode === "countdown") {
        if (timerElapsedMs(timer, now) < timer.countdownMs) return;
        store.setTimer({ status: "paused", elapsedMs: timer.countdownMs, startedAt: null, finished: true });
        playTimerSound(timerSound);
        toast.success(st("timer_countdown_done"));
        store.setTimerOpen(true);
        return;
      }
      if (timer.mode !== "pomodoro") return;
      let elapsed = timerElapsedMs(timer, now);
      let phase = timer.phase;
      let rounds = timer.focusRounds;
      let focusMs = timer.focusMs;
      let changed = false;
      let guard = 0;
      while (elapsed >= phaseMs(phase, settings) && guard < 50) {
        guard += 1;
        const length = phaseMs(phase, settings);
        elapsed -= length;
        const ended = phase;
        if (phase === "focus") {
          focusMs += length;
          rounds += 1;
          phase = rounds % settings.pomodoroRounds === 0 ? "long" : "short";
        } else {
          phase = "focus";
        }
        changed = true;
        if (guard === 1) toast.info(st("timer_phase_done", { phase: st(PHASE_KEY[ended]) }));
      }
      if (!changed) return;
      playTimerSound(timerSound);
      store.setTimer({ phase, focusRounds: rounds, focusMs, elapsedMs: 0, startedAt: now - elapsed });
      cue();
    };
    let deadline = 0;
    const arm = () => {
      const timer = useStudyUi.getState().timer;
      if (timer.status !== "running") return;
      const target = targetMs(timer, settings);
      if (target === null) return;
      const remaining = Math.max(0, target - timerElapsedMs(timer));
      window.clearTimeout(deadline);
      deadline = window.setTimeout(tick, remaining);
    };
    tick();
    arm();
    const interval = window.setInterval(() => {
      tick();
      arm();
    }, 1000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      resumeTimerAudio();
      cue();
      lockScreen();
      tick();
      arm();
    };
    const onGesture = () => {
      const timer = useStudyUi.getState().timer;
      if (timer.status === "running" && timer.mode !== "stopwatch" && timerSound !== "none") {
        unlockTimerAudio();
        holdTimerAudio();
      }
      resumeTimerAudio();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      dropped = true;
      window.clearTimeout(deadline);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      void wake?.release();
    };
  }, [pomodoroFocus, pomodoroLong, pomodoroRounds, pomodoroShort, settings, st, status, timerSound]);

  return null;
}

export function TimerTitle() {
  const timer = useStudyUi((state) => state.timer);
  const { settings } = useStudy();
  const running = timer.status === "running";
  const now = useNow(running, 1000);
  const label = running ? clockLabel(displaySeconds(timer, settings, now), true) : null;

  useEffect(() => {
    setTitlePrefix(label);
  }, [label]);

  useEffect(() => () => setTitlePrefix(null), []);

  return null;
}

/** O relógio do rodapé aparece com sessão em andamento, pausada ou preparada, e some com o relógio aberto. */
export function useFocusPillVisible(): boolean {
  return useStudyUi((state) => !state.timerOpen && (state.timer.status !== "idle" || isTimerArmed(state.timer)));
}

/**
 * Relógio do rodapé. Aparece com uma sessão em andamento, pausada ou preparada
 * para uma revisão; nesse último caso o botão "Iniciar" pulsa, porque o tempo
 * só começa a contar quando a pessoa dá o play. Enquanto ele está na tela, a
 * área rolável ganha espaço embaixo (ver `app-shell`) para ele não cobrir o fim
 * da página.
 */
export function FocusPill() {
  const { st } = useStudyT();
  const timer = useStudyUi((state) => state.timer);
  const visible = useFocusPillVisible();
  const { settings, subjectById } = useStudy();
  const armed = isTimerArmed(timer);
  const running = timer.status === "running";
  const now = useNow(running && visible, 1000);
  const label = useMemo(() => clockLabel(displaySeconds(timer, settings, now), true), [now, settings, timer]);
  if (!visible) return null;
  const subject = subjectById(timer.subjectId);
  const topic = subject?.topics.find((entry) => entry.id === timer.topicId);
  const isExam = Boolean(timer.examMode && !subject && !timer.reviewId);
  const status = armed
    ? st("timer_armed_hint")
    : !running
      ? st("sidebar_focus_paused")
      : timer.mode === "pomodoro"
        ? st(PHASE_KEY[timer.phase])
        : st(MODE_KEY[timer.mode]);
  const iconButton =
    "flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink [&_svg]:size-4";

  return (
    <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[45] w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 md:bottom-5">
      <div
        className={cn(
          "flex items-center gap-3 rounded-[18px] border bg-[var(--surface)] p-2 pe-2.5 shadow-[var(--shadow-float)]",
          armed ? "border-[color-mix(in_oklab,var(--accent)_45%,var(--border))]" : "border-[var(--border)]"
        )}
      >
        {running ? (
          <button
            type="button"
            onClick={pauseTimer}
            className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent)] transition hover:brightness-110 active:scale-95"
            aria-label={st("timer_pause")}
            title={st("timer_pause")}
          >
            <Pause className="size-[18px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={startTimer}
            className="relative flex h-11 shrink-0 items-center gap-2 rounded-[13px] bg-[var(--accent)] pe-4 ps-3.5 text-[13.5px] font-semibold text-[var(--accent-contrast)] shadow-[0_10px_24px_-12px_var(--accent)] transition hover:brightness-110 active:scale-[0.97]"
          >
            {armed ? <span aria-hidden className="synapsys-armed pointer-events-none absolute inset-0 rounded-[13px] border-2 border-[var(--accent)]" /> : null}
            <Play className="size-4 fill-current" />
            {armed ? st("timer_start") : st("timer_resume")}
          </button>
        )}
        <button
          type="button"
          onClick={() => useStudyUi.getState().setTimerOpen(true)}
          className="flex min-w-0 flex-1 flex-col items-start text-start"
          aria-label={st("timer_open")}
        >
          <span className="flex w-full min-w-0 items-baseline gap-2">
            <span className={cn("font-mono text-[18px] font-semibold leading-6 tabular-nums tracking-[-0.02em]", running ? "text-ink" : "text-muted")}>
              {label}
            </span>
            <span className={cn("min-w-0 truncate text-[12px] font-medium", armed ? "text-[var(--accent)]" : "text-faint")}>{status}</span>
          </span>
          <span className="flex w-full min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted">
            {isExam ? <ExamMark /> : subject ? <SubjectDot color={subject.color} /> : null}
            <span className="truncate">
              {isExam ? st("timer_exam") : subject ? subject.name : st("timer_no_subject")}
              {!isExam && topic ? <span className="text-faint"> · {topic.name}</span> : null}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => useStudyUi.getState().setTimerOpen(true)}
          className={cn(iconButton, "max-sm:hidden")}
          aria-label={st("timer_open")}
          title={st("timer_open")}
        >
          <Maximize2 />
        </button>
        {armed ? (
          <button
            type="button"
            onClick={() => useStudyUi.getState().resetTimer({ subjectId: null, topicId: null, examMode: false })}
            className={iconButton}
            aria-label={st("cancel")}
            title={st("cancel")}
          >
            <X />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => finishFocus(settings, st("timer_too_short"))}
            className={cn(iconButton, "[&_svg]:size-3.5")}
            aria-label={st("timer_stop")}
            title={st("timer_stop")}
          >
            <Square />
          </button>
        )}
      </div>
    </div>
  );
}
