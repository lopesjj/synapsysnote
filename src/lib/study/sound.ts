"use client";

import type { TimerSound } from "@/types/study";

type Note = { frequency: number; at: number; length: number; wave: OscillatorType; gain: number };

const PATTERNS: Record<Exclude<TimerSound, "none">, Note[]> = {
  chime: [
    { frequency: 1046.5, at: 0, length: 1.1, wave: "sine", gain: 0.28 },
    { frequency: 1318.5, at: 0.16, length: 1.1, wave: "sine", gain: 0.24 },
    { frequency: 1568, at: 0.32, length: 1.6, wave: "sine", gain: 0.22 },
  ],
  bell: [
    { frequency: 880, at: 0, length: 2.2, wave: "sine", gain: 0.3 },
    { frequency: 1320, at: 0, length: 1.6, wave: "sine", gain: 0.12 },
    { frequency: 2217, at: 0, length: 0.9, wave: "sine", gain: 0.06 },
    { frequency: 880, at: 0.9, length: 2.2, wave: "sine", gain: 0.22 },
  ],
  soft: [
    { frequency: 523.25, at: 0, length: 0.9, wave: "triangle", gain: 0.26 },
    { frequency: 659.25, at: 0.28, length: 1.2, wave: "triangle", gain: 0.22 },
  ],
  digital: [
    { frequency: 1200, at: 0, length: 0.09, wave: "square", gain: 0.1 },
    { frequency: 1200, at: 0.16, length: 0.09, wave: "square", gain: 0.1 },
    { frequency: 1200, at: 0.32, length: 0.09, wave: "square", gain: 0.1 },
    { frequency: 1600, at: 0.55, length: 0.18, wave: "square", gain: 0.1 },
  ],
};

type LiveNote = { osc: OscillatorNode; gain: GainNode };

let context: AudioContext | null = null;
let output: GainNode | null = null;
let keepAlive: LiveNote | null = null;
let live: LiveNote[] = [];
let pendingKind: Exclude<TimerSound, "none"> | null = null;
let pendingListener: (() => void) | null = null;

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function userActivated(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive);
}

function ensureContext(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!context || context.state === "closed") {
    try {
      context = new Ctor({ latencyHint: "interactive" });
    } catch {
      context = new Ctor();
    }
    output = null;
    keepAlive = null;
    live = [];
  }
  return context;
}

function master(ctx: AudioContext): GainNode {
  if (!output) {
    output = ctx.createGain();
    output.gain.value = 1;
    output.connect(ctx.destination);
  }
  return output;
}

function preferPlayback(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session || session.type === "playback") return;
  try {
    session.type = "playback";
  } catch {
    return;
  }
}

function stopNotes() {
  const now = context?.currentTime ?? 0;
  for (const note of live) {
    try {
      note.gain.gain.cancelScheduledValues(now);
      note.gain.gain.setValueAtTime(Math.max(note.gain.gain.value, 0.0001), now);
      note.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      note.osc.stop(now + 0.04);
    } catch {
      try {
        note.osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
  }
  live = [];
}

function emit(ctx: AudioContext, kind: Exclude<TimerSound, "none">) {
  stopNotes();
  const start = ctx.currentTime + 0.04;
  const bus = master(ctx);
  for (const note of PATTERNS[kind]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const begin = start + note.at;
    const end = begin + Math.max(note.length, 0.05);
    const attack = Math.min(0.02, note.length * 0.35);
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, begin);
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.exponentialRampToValueAtTime(Math.max(note.gain, 0.0002), begin + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(bus);
    oscillator.start(begin);
    oscillator.stop(end + 0.05);
    const entry = { osc: oscillator, gain };
    live.push(entry);
    oscillator.onended = () => {
      live = live.filter((item) => item !== entry);
    };
  }
}

function clearPendingListener() {
  if (!pendingListener || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", pendingListener, true);
  window.removeEventListener("keydown", pendingListener, true);
  pendingListener = null;
}

function queuePending(kind: Exclude<TimerSound, "none">) {
  pendingKind = kind;
  if (pendingListener || typeof window === "undefined") return;
  pendingListener = () => {
    unlockTimerAudio();
    resumeTimerAudio();
  };
  window.addEventListener("pointerdown", pendingListener, true);
  window.addEventListener("keydown", pendingListener, true);
}

function flushPending() {
  const ctx = context;
  const kind = pendingKind;
  if (!ctx || !kind || ctx.state !== "running") return;
  pendingKind = null;
  clearPendingListener();
  emit(ctx, kind);
}

export function unlockTimerAudio(): AudioContext | null {
  const ctx = ensureContext();
  if (!ctx) return null;
  preferPlayback();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(master(ctx));
  try {
    source.start(0);
  } catch {
    /* the context is not ready yet */
  }
  return ctx;
}

export function holdTimerAudio(): void {
  const ctx = context;
  if (!ctx || keepAlive) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 30;
  gain.gain.value = 0.0004;
  osc.connect(gain).connect(master(ctx));
  try {
    osc.start();
    keepAlive = { osc, gain };
  } catch {
    keepAlive = null;
  }
}

export function releaseTimerAudio(): void {
  if (!keepAlive) return;
  try {
    keepAlive.osc.stop();
    keepAlive.osc.disconnect();
    keepAlive.gain.disconnect();
  } catch {
    /* already stopped */
  }
  keepAlive = null;
}

export function primeTimerAudio(): void {
  const ctx = unlockTimerAudio();
  if (!ctx) return;
  holdTimerAudio();
  if (!keepAlive && ctx.state === "suspended") void ctx.resume().then(() => holdTimerAudio()).catch(() => undefined);
}

export function resumeTimerAudio(): void {
  const ctx = context;
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(flushPending).catch(() => undefined);
    return;
  }
  flushPending();
}

export function playTimerSound(kind: TimerSound) {
  if (kind === "none") {
    pendingKind = null;
    clearPendingListener();
    return;
  }
  const ctx = unlockTimerAudio();
  if (!ctx) return;
  const activationKnown = "userActivation" in navigator;
  if (ctx.state !== "running" && activationKnown && !userActivated()) {
    queuePending(kind);
    void ctx.resume().then(flushPending).catch(() => undefined);
    return;
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  pendingKind = null;
  clearPendingListener();
  emit(ctx, kind);
}
