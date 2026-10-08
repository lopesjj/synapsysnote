"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, FileText, Minimize2, Minus, Pause, Play, Plus, RotateCcw, Square, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useStudy } from "@/lib/study/provider";
import { useLiveNote } from "@/lib/study/hooks";
import { useRouter } from "@/lib/i18n/navigation";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import {
  isTimerArmed,
  pauseTimer,
  startTimer,
  timerElapsedMs,
  useStudyUi,
  type TimerMode,
} from "@/lib/study/ui-store";
import { dismissPriority, useDismissLayer } from "@/lib/dismiss-layer";
import { clockLabel, maskClock, parseDurationInput, splitDuration } from "@/lib/study/format";
import { playTimerSound } from "@/lib/study/sound";
import { TIMER_SOUNDS } from "@/lib/study/defaults";
import { SubjectDot } from "./ui";
import { ExamMark, MODE_KEY, PHASE_KEY, finishFocus, focusSeconds, targetMs, useNow } from "./focus-timer";

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

const COUNTDOWN_MIN_MS = 60_000;
const COUNTDOWN_MAX_MS = 6 * 3_600_000;

function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] >= "0" && text[index] <= "9") {
      seen += 1;
      if (seen === digits) return index + 1;
    }
  }
  return text.length;
}

function CountdownEntry({ seconds, size, onCommit }: { seconds: number; size: number; onCommit: (ms: number) => void }) {
  const { st } = useStudyT();
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const keepSelection = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? clockLabel(seconds, true);

  useLayoutEffect(() => {
    const input = ref.current;
    if (caret.current === null || !input || document.activeElement !== input) return;
    input.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <input
      ref={ref}
      dir="ltr"
      inputMode="numeric"
      autoComplete="off"
      aria-label={st("timer_countdown_length")}
      value={value}
      onFocus={(event) => {
        setDraft(clockLabel(seconds, true));
        event.currentTarget.select();
        keepSelection.current = true;
      }}
      onMouseUp={(event) => {
        if (!keepSelection.current) return;
        keepSelection.current = false;
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        keepSelection.current = false;
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const raw = input.value;
        const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
        const masked = maskClock(raw, inputType.startsWith("delete"));
        const position = input.selectionStart ?? raw.length;
        caret.current =
          masked === value ? null : position >= raw.length ? masked.length : caretAfterDigits(masked, raw.slice(0, position).replace(/\D/g, "").length);
        setDraft(masked);
      }}
      onBlur={() => {
        keepSelection.current = false;
        const parsed = parseDurationInput(draft ?? "");
        setDraft(null);
        if (parsed === null || parsed <= 0) return;
        onCommit(parsed * 1000);
      }}
      className="w-[8.2ch] max-w-[calc(100vw-3rem)] bg-transparent text-center font-extralight tabular-nums leading-none tracking-[-0.05em] text-ink outline-none [field-sizing:content]"
      style={{ fontSize: Math.round(size * 0.2) }}
    />
  );
}

function ClockFace({ seconds, size, muted }: { seconds: number; size: number; muted: boolean }) {
  const { h, m, s } = splitDuration(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span
      className={cn("flex items-center font-extralight tabular-nums leading-none tracking-[-0.05em] transition-colors", muted ? "text-muted" : "text-ink")}
      style={{ fontSize: Math.round(size * 0.2) }}
      aria-label={clockLabel(seconds, true)}
    >
      <span className={cn(h === 0 && "text-faint")}>{pad(h)}</span>
      <span className="mx-[0.02em] text-faint">:</span>
      <span>{pad(m)}</span>
      <span className="mx-[0.02em] text-faint">:</span>
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
  const { st } = useStudyT();
  const open = useStudyUi((state) => state.timerOpen);
  const timer = useStudyUi((state) => state.timer);
  useDismissLayer(open, dismissPriority.timer, () => {
    useStudyUi.getState().setTimerOpen(false);
  });
  const { settings, planSubjects, subjectById, actions, planReadOnly } = useStudy();
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
      if (event.code === "Space" && !typing) {
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
  const topicListRef = useRef<HTMLDivElement>(null);
  const scrollTopicsRef = useRef(false);
  useEffect(() => {
    if (!scrollTopicsRef.current) return;
    scrollTopicsRef.current = false;
    topicListRef.current?.scrollIntoView({ block: "nearest" });
  }, [timer.subjectId]);
  const materialNote = liveNote(timer.pageId);
  const hasTime = focusSeconds(timer, now) > 0;
  const countdownDone = timer.finished && timer.mode === "countdown";
  const resting = timer.mode === "pomodoro" && timer.phase !== "focus";
  const tone = resting || countdownDone ? "var(--success)" : "var(--accent)";

  const setMode = (mode: TimerMode) => {
    if (!idle || mode === timer.mode) return;
    useStudyUi.getState().setTimer({ mode, phase: "focus", elapsedMs: 0, focusMs: 0, focusRounds: 0, finished: false });
  };

  const setCountdown = (ms: number) =>
    useStudyUi.getState().setTimer({ countdownMs: Math.max(COUNTDOWN_MIN_MS, Math.min(COUNTDOWN_MAX_MS, ms)), finished: false });
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
            <div role="tablist" aria-label={st("nav_focus")} className="flex max-w-[calc(100vw-5.25rem)] items-center gap-0.5 overflow-x-auto rounded-full bg-[var(--surface)] p-1 shadow-[0_0_0_1px_var(--border)] sm:max-w-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                      "h-7 shrink-0 rounded-full px-2.5 text-[11.5px] font-medium transition whitespace-nowrap disabled:opacity-35 sm:h-8 sm:px-3.5 sm:text-[12.5px]",
                      active ? "bg-[var(--surface-2)] text-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {st(MODE_KEY[mode])}
                  </button>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center gap-1">
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
                        playTimerSound(sound);
                        void actions.updateSettings({ timerSound: sound });
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
            {planReadOnly ? (
              <span className="flex max-w-[min(32rem,90vw)] items-center gap-2 px-3 py-1.5 text-[13px]">
                {timer.examMode ? <ExamMark /> : subject ? <SubjectDot color={subject.color} /> : null}
                <span className={cn("truncate", timer.examMode || subject ? "font-medium text-ink" : "text-muted")}>
                  {timer.examMode ? st("timer_exam") : subject ? subject.name : st("timer_no_subject")}
                  {!timer.examMode && topic ? <span className="font-normal text-muted"> · {topic.name}</span> : null}
                </span>
              </span>
            ) : (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="group flex max-w-[min(32rem,90vw)] items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition hover:bg-[var(--surface-hover)]"
                >
                  {timer.examMode ? <ExamMark /> : subject ? <SubjectDot color={subject.color} /> : null}
                  <span className={cn("truncate", timer.examMode || subject ? "font-medium text-ink" : "text-muted")}>
                    {timer.examMode ? st("timer_exam") : subject ? subject.name : st("timer_pick_subject")}
                    {!timer.examMode && topic ? <span className="font-normal text-muted"> · {topic.name}</span> : null}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
                </button>
              </MenuTrigger>
              <MenuContent align="center" collisionPadding={16} className="max-h-[min(20rem,70dvh)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto">
                <MenuItem onSelect={() => useStudyUi.getState().setTimer({ subjectId: null, topicId: null, pageId: null, examMode: false })}>
                  <span className="size-2 rounded-full border border-[var(--border-strong)]" />
                  {st("timer_no_subject")}
                </MenuItem>
                <MenuItem onSelect={() => useStudyUi.getState().setTimer({ subjectId: null, topicId: null, pageId: null, reviewId: null, examMode: true })}>
                  <ExamMark />
                  <span className="min-w-0 flex-1 truncate">{st("timer_exam")}</span>
                  {timer.examMode ? <Check className="!text-[var(--accent)]" /> : null}
                </MenuItem>
                {planSubjects.length ? <MenuSeparator /> : null}
                {planSubjects.map((entry) => (
                  <MenuItem
                    key={entry.id}
                    className="min-h-11 sm:min-h-0"
                    onSelect={(event) => {
                      if (entry.id === timer.subjectId && !timer.examMode) return;
                      event.preventDefault();
                      scrollTopicsRef.current = true;
                      useStudyUi.getState().setTimer({ subjectId: entry.id, topicId: null, pageId: null, examMode: false });
                    }}
                  >
                    <SubjectDot color={entry.color} />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {entry.id === timer.subjectId ? <Check className="!text-[var(--accent)]" /> : null}
                  </MenuItem>
                ))}
                {subject && subject.topics.length ? (
                  <div ref={topicListRef}>
                    <MenuSeparator />
                    <MenuLabel>{subject.name}</MenuLabel>
                    {subject.topics.map((entry) => (
                      <MenuItem key={entry.id} className="min-h-11 sm:min-h-0" onSelect={() => useStudyUi.getState().setTimer({ topicId: entry.id, pageId: null })}>
                        <span className={cn("size-1.5 rounded-full", entry.id === timer.topicId ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]")} />
                        <span className="truncate">{entry.name}</span>
                      </MenuItem>
                    ))}
                  </div>
                ) : null}
              </MenuContent>
            </Menu>
            )}

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

            <div className="mt-6 flex flex-col items-center">
            <div className="relative isolate" style={{ width: size, height: size }}>
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {timer.mode === "countdown" && idle ? (
                  <div className="pointer-events-auto">
                    <CountdownEntry seconds={Math.round(timer.countdownMs / 1000)} size={size} onCommit={setCountdown} />
                  </div>
                ) : (
                  <ClockFace seconds={shownSeconds} size={size} muted={!running && !idle} />
                )}
              </div>
              {timer.mode === "pomodoro" || countdownDone ? (
                <span className="absolute left-1/2 top-[16%] -translate-x-1/2 whitespace-nowrap text-[13px] font-medium" style={{ color: tone }}>
                  {timer.mode === "pomodoro" ? st(PHASE_KEY[timer.phase]) : st("timer_countdown_done")}
                </span>
              ) : null}
            </div>
              {timer.mode === "pomodoro" || (timer.mode === "countdown" && idle) ? (
                <div className="mt-4 flex h-8 max-w-[calc(100vw-2rem)] items-center justify-center">
                  {timer.mode === "pomodoro" ? (
                    <span className="truncate text-[12.5px] tabular-nums text-muted">
                      {roundLabel}
                      {timer.focusMs > 0 ? ` · ${st("timer_focus_total", { time: clockLabel(focusSeconds(timer, now), true) })}` : ""}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1" aria-label={st("timer_countdown_length")}>
                      <button
                        type="button"
                        aria-label="-5"
                        onClick={() => shiftCountdown(-5)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      {[25, 50, 90].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setCountdown(minutes * 60_000)}
                          className={cn(
                            "h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[12px] tabular-nums transition",
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
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
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

