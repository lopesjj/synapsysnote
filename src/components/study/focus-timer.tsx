"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, FileText, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useStudy } from "@/lib/study/provider";
import { useLiveNote, usePlanMetrics } from "@/lib/study/hooks";
import { useRouter } from "@/lib/i18n/navigation";
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
import { clockLabel, splitDuration } from "@/lib/study/format";
import { dayKeyOf, minuteOfDay } from "@/lib/study/dates";
import { playTimerSound } from "@/lib/study/sound";
import { setTitlePrefix } from "@/lib/document-title";
import { TIMER_SOUNDS } from "@/lib/study/defaults";
import type { StudySettings } from "@/types/study";
import { SubjectDot } from "./ui";

const PHASE_KEY: Record<PomodoroPhase, StudyKey> = {
  focus: "timer_phase_focus",
  short: "timer_phase_short",
  long: "timer_phase_long",
};

const MODE_KEY: Record<TimerMode, StudyKey> = {
  stopwatch: "timer_mode_stopwatch",
  countdown: "timer_mode_countdown",
  pomodoro: "timer_mode_pomodoro",
};

function phaseMs(phase: PomodoroPhase, settings: StudySettings): number {
  const minutes = phase === "focus" ? settings.pomodoroFocus : phase === "short" ? settings.pomodoroShort : settings.pomodoroLong;
  return minutes * 60_000;
}

function targetMs(timer: TimerState, settings: StudySettings): number | null {
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
  store.resetTimer({ subjectId: timer.subjectId, topicId: timer.topicId });
  store.setTimerOpen(false);
  if (seconds < 60) {
    toast.info(message);
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

export function FocusEngine() {
  const { settings } = useStudy();
  const { st } = useStudyT();
  const status = useStudyUi((state) => state.timer.status);

  useEffect(() => {
    if (status !== "running") return;
    const tick = () => {
      const store = useStudyUi.getState();
      const timer = store.timer;
      if (timer.status !== "running") return;
      const now = Date.now();
      if (timer.mode === "countdown") {
        if (timerElapsedMs(timer, now) >= timer.countdownMs) {
          store.setTimer({ status: "paused", elapsedMs: timer.countdownMs, startedAt: null, finished: true });
          playTimerSound(settings.timerSound);
          toast.success(st("timer_countdown_done"));
          store.setTimerOpen(true);
        }
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
      if (changed) {
        playTimerSound(settings.timerSound);
        store.setTimer({ phase, focusRounds: rounds, focusMs, elapsedMs: 0, startedAt: now - elapsed });
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [settings, st, status]);

  return null;
}

function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function dialSize(): number {
  return Math.round(Math.max(236, Math.min(400, window.innerWidth - 56, window.innerHeight - 330)));
}

function useDialSize(): number {
  return useSyncExternalStore(subscribeViewport, dialSize, () => 340);
}

const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))";

function DialHead({ tone }: { tone: string }) {
  return (
    <span
      className="absolute left-1/2 top-[-3px] size-[9px] -translate-x-1/2 rounded-full"
      style={{ backgroundColor: tone, boxShadow: `0 0 0 4px color-mix(in oklab, ${tone} 18%, transparent), 0 0 18px ${tone}` }}
    />
  );
}

function DialOrbit({ tone, startSeconds }: { tone: string; startSeconds: number }) {
  const [delay] = useState(startSeconds % 60);
  return (
    <div className="synapsys-orbit absolute inset-0" style={{ animationDelay: `-${delay}s` }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(from 0turn, transparent 0turn 0.58turn, ${tone} 1turn)`, WebkitMaskImage: RING_MASK, maskImage: RING_MASK }}
      />
      <DialHead tone={tone} />
    </div>
  );
}

function Dial({
  size,
  tone,
  progress,
  orbit,
  orbitKey,
  seconds,
}: {
  size: number;
  tone: string;
  progress: number | null;
  orbit: "running" | "paused" | null;
  orbitKey: string;
  seconds: number;
}) {
  const value = progress === null ? null : Math.max(0, Math.min(1, progress));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--border)]" />
      <div className="absolute inset-[16px] rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_55%,transparent)]" />
      {value !== null && value > 0 ? (
        <>
          <div
            className="absolute inset-0 rounded-full transition-[background] duration-500"
            style={{ background: `conic-gradient(${tone} ${value}turn, transparent 0)`, WebkitMaskImage: RING_MASK, maskImage: RING_MASK }}
          />
          <div className="absolute inset-0" style={{ transform: `rotate(${value}turn)` }}>
            <DialHead tone={tone} />
          </div>
        </>
      ) : null}
      {orbit === "running" ? <DialOrbit key={orbitKey} tone={tone} startSeconds={seconds} /> : null}
      {orbit === "paused" ? (
        <div className="absolute inset-0" style={{ transform: `rotate(${(seconds % 60) / 60}turn)` }}>
          <div
            className="absolute inset-0 rounded-full opacity-60"
            style={{ background: `conic-gradient(from 0turn, transparent 0turn 0.58turn, ${tone} 1turn)`, WebkitMaskImage: RING_MASK, maskImage: RING_MASK }}
          />
          <DialHead tone={tone} />
        </div>
      ) : null}
    </div>
  );
}

function ClockFace({ seconds, size, muted }: { seconds: number; size: number; muted: boolean }) {
  const { h, m, s } = splitDuration(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span
      className={cn("flex items-baseline font-extralight tabular-nums leading-none tracking-[-0.05em] transition-colors", muted ? "text-muted" : "text-ink")}
      style={{ fontSize: Math.round(size * 0.2) }}
      aria-label={clockLabel(seconds, true)}
    >
      <span className={cn(h === 0 && "text-faint")}>{pad(h)}</span>
      <span className="mx-[0.02em] -translate-y-[0.06em] text-faint">:</span>
      <span>{pad(m)}</span>
      <span className="mx-[0.02em] -translate-y-[0.06em] text-faint">:</span>
      <span>{pad(s)}</span>
    </span>
  );
}

function SideControl({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="group flex w-20 flex-col items-center gap-2 text-muted transition hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--surface)] shadow-[0_0_0_1px_var(--border)] transition group-hover:shadow-[0_0_0_1px_var(--border-strong)] group-active:scale-95 [&_svg]:size-[18px]">
        {children}
      </span>
      <span className="text-[11.5px] font-medium">{label}</span>
    </button>
  );
}

export function FocusOverlay() {
  const { st, duration } = useStudyT();
  const open = useStudyUi((state) => state.timerOpen);
  const timer = useStudyUi((state) => state.timer);
  const { settings, planSubjects, subjectById, actions } = useStudy();
  const metrics = usePlanMetrics();
  const liveNote = useLiveNote();
  const router = useRouter();
  const now = useNow(open && timer.status === "running");
  const size = useDialSize();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector("[role=menu]")) return;
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        useStudyUi.getState().setTimerOpen(false);
      } else if (event.code === "Space" && !typing) {
        event.preventDefault();
        const current = useStudyUi.getState().timer;
        if (current.status === "running") pauseTimer();
        else if (!(current.finished && current.mode === "countdown")) startTimer();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const elapsed = timerElapsedMs(timer, now);
  const target = targetMs(timer, settings);
  const shownMs = target !== null ? Math.max(0, target - elapsed) : elapsed;
  const shownSeconds = target !== null ? Math.ceil(shownMs / 1000) : Math.floor(shownMs / 1000);
  const idle = timer.status === "idle";
  const running = timer.status === "running";
  const subject = subjectById(timer.subjectId);
  const topic = subject?.topics.find((entry) => entry.id === timer.topicId);
  const materialNote = liveNote(timer.pageId);
  const hasTime = focusSeconds(timer, now) > 0;
  const countdownDone = timer.finished && timer.mode === "countdown";
  const resting = timer.mode === "pomodoro" && timer.phase !== "focus";
  const tone = resting || countdownDone ? "var(--success)" : "var(--accent)";
  const todayTotal = metrics.todaySeconds + focusSeconds(timer, now);

  const setMode = (mode: TimerMode) => {
    if (!idle || mode === timer.mode) return;
    useStudyUi.getState().setTimer({ mode, phase: "focus", elapsedMs: 0, focusMs: 0, focusRounds: 0, finished: false });
  };

  const setCountdown = (ms: number) =>
    useStudyUi.getState().setTimer({ countdownMs: Math.max(5 * 60_000, Math.min(6 * 3600_000, ms)), finished: false });
  const shiftCountdown = (minutes: number) => setCountdown(useStudyUi.getState().timer.countdownMs + minutes * 60_000);

  const discard = () => {
    if (hasTime && !window.confirm(st("timer_discard_confirm"))) return;
    useStudyUi.getState().resetTimer();
  };

  const roundLabel =
    timer.mode === "pomodoro"
      ? st("timer_round", {
          n: timer.phase === "focus" ? (timer.focusRounds % settings.pomodoroRounds) + 1 : ((Math.max(1, timer.focusRounds) - 1) % settings.pomodoroRounds) + 1,
          total: settings.pomodoroRounds,
        })
      : "";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="focus-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[95] flex flex-col overflow-y-auto bg-[var(--canvas)]"
          role="dialog"
          aria-modal="true"
          aria-label={st("nav_focus")}
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
            <div role="tablist" aria-label={st("nav_focus")} className="flex items-center gap-0.5 rounded-full bg-[var(--surface)] p-1 shadow-[0_0_0_1px_var(--border)]">
              {(["stopwatch", "countdown", "pomodoro"] as const).map((mode) => {
                const active = timer.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={!idle && !active}
                    onClick={() => setMode(mode)}
                    className={cn(
                      "h-8 rounded-full px-3.5 text-[12.5px] font-medium transition disabled:opacity-35",
                      active ? "bg-[var(--surface-2)] text-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {st(MODE_KEY[mode])}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={st("timer_sound")}
                    title={st("timer_sound")}
                    className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                  >
                    <Volume2 className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuLabel>{st("timer_sound")}</MenuLabel>
                  {TIMER_SOUNDS.map((sound) => (
                    <MenuItem
                      key={sound}
                      onSelect={(event) => {
                        event.preventDefault();
                        void actions.updateSettings({ timerSound: sound });
                        playTimerSound(sound);
                      }}
                    >
                      <Check className={cn(settings.timerSound === sound ? "!text-[var(--accent)]" : "opacity-0")} />
                      {st(`sound_${sound}` as StudyKey)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <button
                type="button"
                aria-label={st("timer_minimize")}
                title={st("timer_minimize")}
                onClick={() => useStudyUi.getState().setTimerOpen(false)}
                className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                <Minimize2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-4">
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="group flex max-w-[min(32rem,90vw)] items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition hover:bg-[var(--surface-hover)]"
                >
                  {subject ? <SubjectDot color={subject.color} /> : null}
                  <span className={cn("truncate", subject ? "font-medium text-ink" : "text-muted")}>
                    {subject ? subject.name : st("timer_pick_subject")}
                    {topic ? <span className="font-normal text-muted"> · {topic.name}</span> : null}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
                </button>
              </MenuTrigger>
              <MenuContent align="center" className="max-h-80 w-72 overflow-y-auto">
                <MenuItem onSelect={() => useStudyUi.getState().setTimer({ subjectId: null, topicId: null, pageId: null })}>
                  <span className="size-2 rounded-full border border-[var(--border-strong)]" />
                  {st("timer_no_subject")}
                </MenuItem>
                {planSubjects.length ? <MenuSeparator /> : null}
                {planSubjects.map((entry) => (
                  <MenuItem key={entry.id} onSelect={() => useStudyUi.getState().setTimer({ subjectId: entry.id, topicId: null, pageId: null })}>
                    <SubjectDot color={entry.color} />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {entry.id === timer.subjectId ? <Check className="!text-[var(--accent)]" /> : null}
                  </MenuItem>
                ))}
                {subject && subject.topics.length ? (
                  <>
                    <MenuSeparator />
                    <MenuLabel>{subject.name}</MenuLabel>
                    {subject.topics.map((entry) => (
                      <MenuItem key={entry.id} onSelect={() => useStudyUi.getState().setTimer({ topicId: entry.id, pageId: null })}>
                        <span className={cn("size-1.5 rounded-full", entry.id === timer.topicId ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]")} />
                        <span className="truncate">{entry.name}</span>
                      </MenuItem>
                    ))}
                  </>
                ) : null}
              </MenuContent>
            </Menu>

            {materialNote ? (
              <button
                type="button"
                onClick={() => {
                  useStudyUi.getState().setTimerOpen(false);
                  router.push(`/home/p/${materialNote.id}`);
                }}
                className="mt-1 inline-flex max-w-[min(28rem,86vw)] items-center gap-1.5 text-[12px] text-muted transition hover:text-[var(--accent)]"
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{materialNote.title || st("material_note_badge")}</span>
              </button>
            ) : null}

            <div className="relative isolate mt-6 flex items-center justify-center" style={{ width: size, height: size }}>
              <div
                aria-hidden
                className={cn("pointer-events-none absolute inset-[-42%] -z-10 rounded-full transition-[background] duration-700", running && "synapsys-breathe")}
                style={{ background: `radial-gradient(circle, color-mix(in oklab, ${tone} ${running ? 20 : 10}%, transparent) 0%, transparent 62%)` }}
              />
              <Dial
                size={size}
                tone={tone}
                progress={target !== null ? elapsed / target : null}
                orbit={target === null && !idle ? (running ? "running" : "paused") : null}
                orbitKey={String(timer.startedAt ?? "paused")}
                seconds={elapsed / 1000}
              />
              <div className="flex flex-col items-center">
                <span className="mb-3 h-5 text-[13px] font-medium" style={{ color: tone }}>
                  {timer.mode === "pomodoro" ? st(PHASE_KEY[timer.phase]) : countdownDone ? st("timer_countdown_done") : ""}
                </span>
                <ClockFace seconds={shownSeconds} size={size} muted={!running && !idle} />
                <div className="mt-4 flex h-8 items-center">
                  {timer.mode === "pomodoro" ? (
                    <span className="text-[12.5px] tabular-nums text-muted">
                      {roundLabel}
                      {timer.focusMs > 0 ? ` · ${st("timer_focus_total", { time: clockLabel(focusSeconds(timer, now), true) })}` : ""}
                    </span>
                  ) : timer.mode === "countdown" && idle ? (
                    <div className="flex items-center gap-1" aria-label={st("timer_countdown_length")}>
                      <button
                        type="button"
                        aria-label="-5"
                        onClick={() => shiftCountdown(-5)}
                        className="flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      {[25, 50, 90].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setCountdown(minutes * 60_000)}
                          className={cn(
                            "h-7 rounded-full px-2.5 text-[12px] tabular-nums transition",
                            timer.countdownMs === minutes * 60_000 ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-muted hover:text-ink"
                          )}
                        >
                          {minutes} min
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="+5"
                        onClick={() => shiftCountdown(5)}
                        className="flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[12.5px] tabular-nums text-muted">{st("home_chip_studied", { time: duration(todayTotal) })}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-start justify-center gap-6 sm:gap-10">
              <SideControl label={st("timer_discard")} onClick={discard} disabled={idle && !hasTime && !isTimerArmed(timer)}>
                <RotateCcw />
              </SideControl>
              <button
                type="button"
                onClick={() => (running ? pauseTimer() : startTimer())}
                disabled={countdownDone}
                className="flex size-[4.5rem] items-center justify-center rounded-full text-[var(--accent-contrast)] transition hover:brightness-110 active:scale-95 disabled:opacity-35"
                style={{ backgroundColor: tone, boxShadow: `0 14px 30px -14px ${tone}` }}
                aria-label={running ? st("timer_pause") : idle ? st("timer_start") : st("timer_resume")}
              >
                {running ? <Pause className="size-7" strokeWidth={1.75} /> : <Play className="size-7 translate-x-[2px]" strokeWidth={1.75} />}
              </button>
              <SideControl label={st("timer_finish_short")} onClick={() => finishFocus(settings, st("timer_too_short"))} disabled={!hasTime}>
                <Square className="!size-4" />
              </SideControl>
            </div>

            <div className="mt-8 flex flex-col items-center gap-1.5 text-center">
              <p className="text-[12.5px] text-muted">{st("timer_tagline")}</p>
              <p className="hidden text-[11.5px] text-faint sm:block">{st("timer_keyboard_hint")}</p>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
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
            {subject ? <SubjectDot color={subject.color} /> : null}
            <span className="truncate">
              {subject ? subject.name : st("timer_no_subject")}
              {topic ? <span className="text-faint"> · {topic.name}</span> : null}
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
            onClick={() => useStudyUi.getState().resetTimer({ subjectId: null, topicId: null })}
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
