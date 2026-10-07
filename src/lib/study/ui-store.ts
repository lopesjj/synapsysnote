"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { primeTimerAudio } from "./sound";

export type StudyModule = "notes" | "study";
export type TimerMode = "stopwatch" | "countdown" | "pomodoro";
export type TimerStatus = "idle" | "running" | "paused";
export type PomodoroPhase = "focus" | "short" | "long";

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  startedAt: number | null;
  elapsedMs: number;
  countdownMs: number;
  phase: PomodoroPhase;
  focusRounds: number;
  focusMs: number;
  firstStartedAt: number | null;
  subjectId: string | null;
  topicId: string | null;
  reviewId: string | null;
  pageId: string | null;
  /** Relógio marcando um simulado: sem disciplina, e ao parar abre o novo simulado. */
  examMode: boolean;
  finished: boolean;
}

export interface LogPrefill {
  subjectId?: string | null;
  topicId?: string | null;
  durationSec?: number;
  categoryId?: string;
  reviewId?: string | null;
  day?: string;
  startMinute?: number | null;
  pageId?: string | null;
  source?: "manual" | "timer";
}

export interface ExamPrefill {
  durationSec?: number;
  day?: string;
}

export type GoalSubjectSort = "syllabus" | "coverage" | "accuracy" | "reviews";

export interface ScheduleLayers {
  plan: boolean;
  reviews: boolean;
  tasks: boolean;
}

const IDLE_TIMER: TimerState = {
  mode: "stopwatch",
  status: "idle",
  startedAt: null,
  elapsedMs: 0,
  countdownMs: 50 * 60_000,
  phase: "focus",
  focusRounds: 0,
  focusMs: 0,
  firstStartedAt: null,
  subjectId: null,
  topicId: null,
  reviewId: null,
  pageId: null,
  examMode: false,
  finished: false,
};

interface StudyUiState {
  module: StudyModule;
  timer: TimerState;
  timerOpen: boolean;
  logOpen: boolean;
  logPrefill: LogPrefill | null;
  logEditId: string | null;
  examOpen: boolean;
  examPrefill: ExamPrefill | null;
  padOpen: boolean;
  scheduleView: "week" | "month";
  scheduleLayers: ScheduleLayers;
  goalsArchivedOpen: boolean;
  browsePlanId: string | null;
  goalSubjectSort: GoalSubjectSort;
  /** Planejamento da página inicial mostrando só o que falta fazer no dia. */
  homePendingOnly: boolean;
  /** Nome digitado no estado vazio de Objetivos, levado para a criação (não persiste). */
  newGoalDraft: string;
  /** Conquistas cuja comemoração já foi vista e guardada na vitrine. */
  celebrated: string[];
  setModule: (module: StudyModule) => void;
  setTimer: (patch: Partial<TimerState>) => void;
  resetTimer: (keep?: Partial<TimerState>) => void;
  setTimerOpen: (open: boolean) => void;
  openLog: (prefill?: LogPrefill | null, editId?: string | null) => void;
  closeLog: () => void;
  openExam: (prefill?: ExamPrefill | null) => void;
  closeExam: () => void;
  setPadOpen: (open: boolean) => void;
  setScheduleView: (view: "week" | "month") => void;
  setScheduleLayer: (layer: keyof ScheduleLayers, value: boolean) => void;
  setGoalsArchivedOpen: (open: boolean) => void;
  setBrowsePlanId: (id: string | null) => void;
  setGoalSubjectSort: (sort: GoalSubjectSort) => void;
  setHomePendingOnly: (value: boolean) => void;
  setNewGoalDraft: (name: string) => void;
}

export const useStudyUi = create<StudyUiState>()(
  persist(
    (set, get) => ({
      module: "notes",
      timer: IDLE_TIMER,
      timerOpen: false,
      logOpen: false,
      logPrefill: null,
      logEditId: null,
      examOpen: false,
      examPrefill: null,
      padOpen: false,
      scheduleView: "week",
      scheduleLayers: { plan: true, reviews: true, tasks: true },
      goalsArchivedOpen: false,
      browsePlanId: null,
      goalSubjectSort: "syllabus",
      homePendingOnly: false,
      newGoalDraft: "",
      celebrated: [],
      setModule: (module) => set({ module }),
      setTimer: (patch) => set({ timer: { ...get().timer, ...patch } }),
      resetTimer: (keep) =>
        set({
          timer: {
            ...IDLE_TIMER,
            mode: get().timer.mode,
            countdownMs: get().timer.countdownMs,
            subjectId: get().timer.subjectId,
            topicId: get().timer.topicId,
            examMode: get().timer.examMode,
            ...keep,
          },
        }),
      setTimerOpen: (open) => set({ timerOpen: open }),
      openLog: (prefill, editId) =>
        set({ logOpen: true, logPrefill: prefill ?? null, logEditId: editId ?? null }),
      closeLog: () => set({ logOpen: false, logPrefill: null, logEditId: null }),
      openExam: (prefill) => set({ examOpen: true, examPrefill: prefill ?? null }),
      closeExam: () => set({ examOpen: false, examPrefill: null }),
      setPadOpen: (open) => set({ padOpen: open }),
      setScheduleView: (view) => set({ scheduleView: view }),
      setScheduleLayer: (layer, value) => set({ scheduleLayers: { ...get().scheduleLayers, [layer]: value } }),
      setGoalsArchivedOpen: (open) => set({ goalsArchivedOpen: open }),
      setBrowsePlanId: (id) => set({ browsePlanId: id }),
      setGoalSubjectSort: (sort) => set({ goalSubjectSort: sort }),
      setHomePendingOnly: (value) => set({ homePendingOnly: value }),
      setNewGoalDraft: (name) => set({ newGoalDraft: name }),
    }),
    {
      name: "synapsys.study.ui.v1",
      version: 5,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<StudyUiState> & { lastNotesRoute?: string; lastStudyRoute?: string };
        if (version < 2 && state.scheduleLayers) state.scheduleLayers = { ...state.scheduleLayers, tasks: true };
        if (state.scheduleLayers) {
          const { plan = true, reviews = true, tasks = true } = state.scheduleLayers;
          state.scheduleLayers = { plan, reviews, tasks };
        }
        if (!Array.isArray(state.celebrated)) state.celebrated = [];
        if (state.timer && typeof state.timer.examMode !== "boolean") state.timer = { ...state.timer, examMode: false };
        delete state.lastNotesRoute;
        delete state.lastStudyRoute;
        return state as StudyUiState;
      },
      partialize: (state) => ({
        module: state.module,
        timer: state.timer,
        scheduleView: state.scheduleView,
        scheduleLayers: state.scheduleLayers,
        goalsArchivedOpen: state.goalsArchivedOpen,
        browsePlanId: state.browsePlanId,
        goalSubjectSort: state.goalSubjectSort,
        homePendingOnly: state.homePendingOnly,
        celebrated: state.celebrated,
      }),
    }
  )
);

export function timerElapsedMs(timer: TimerState, now = Date.now()): number {
  return timer.elapsedMs + (timer.status === "running" && timer.startedAt ? Math.max(0, now - timer.startedAt) : 0);
}

export function startTimer() {
  const store = useStudyUi.getState();
  const timer = store.timer;
  if (timer.status === "running") return;
  if (timer.mode !== "stopwatch") primeTimerAudio();
  const now = Date.now();
  store.setTimer({
    status: "running",
    startedAt: now,
    firstStartedAt: timer.firstStartedAt ?? now,
    elapsedMs: timer.mode === "countdown" && timer.finished ? 0 : timer.elapsedMs,
    finished: false,
  });
}

export function pauseTimer() {
  const store = useStudyUi.getState();
  const timer = store.timer;
  if (timer.status !== "running") return;
  store.setTimer({ status: "paused", elapsedMs: timerElapsedMs(timer), startedAt: null });
}

export function isTimerActive(timer: TimerState): boolean {
  return timer.status !== "idle";
}

/** Sessão de revisão preparada e ainda parada: o relógio espera a pessoa dar o play. */
export function isTimerArmed(timer: TimerState): boolean {
  return timer.status === "idle" && Boolean(timer.reviewId);
}

/**
 * Abre o relógio para uma sessão nova, sem disciplina escolhida. Uma sessão em
 * andamento, pausada ou já preparada para uma revisão continua como está.
 */
export function openBlankTimer() {
  const store = useStudyUi.getState();
  if (store.timer.status === "idle" && !isTimerArmed(store.timer)) store.resetTimer({ subjectId: null, topicId: null, examMode: false });
  store.setTimerOpen(true);
}

export function hydrateStudyUiSync(): void {
  if (typeof window === "undefined" || useStudyUi.persist.hasHydrated()) return;
  try {
    const raw = window.localStorage.getItem("synapsys.study.ui.v1");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: unknown; version?: number };
      const options = useStudyUi.persist.getOptions();
      const migrated = options.migrate ? options.migrate(parsed.state, parsed.version ?? 0) : parsed.state;
      if (migrated && typeof migrated === "object" && !(migrated instanceof Promise)) {
        useStudyUi.setState(migrated as Partial<StudyUiState>);
      }
    }
  } catch {
    return;
  }
}

export function isStudyPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && (pathname === "/home/study" || pathname.startsWith("/home/study/")));
}

if (typeof window !== "undefined") {
  window.addEventListener("synapsys:signed-out", () => {
    useStudyUi.setState({
      module: "notes",
      timer: IDLE_TIMER,
      timerOpen: false,
      logOpen: false,
      logPrefill: null,
      logEditId: null,
      examOpen: false,
      examPrefill: null,
      padOpen: false,
    });
    try {
      window.localStorage.removeItem("synapsys.study.ui.v1");
    } catch {}
  });
}
