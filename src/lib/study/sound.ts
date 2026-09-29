"use client";

import type { TimerSound } from "@/types/study";

type Note = { frequency: number; at: number; length: number; wave: OscillatorType; gain: number };

const PATTERNS: Record<Exclude<TimerSound, "none">, Note[]> = {
  chime: [
    { frequency: 1046.5, at: 0, length: 1.1, wave: "sine", gain: 0.22 },
    { frequency: 1318.5, at: 0.16, length: 1.1, wave: "sine", gain: 0.2 },
    { frequency: 1568, at: 0.32, length: 1.6, wave: "sine", gain: 0.18 },
  ],
  bell: [
    { frequency: 880, at: 0, length: 2.2, wave: "sine", gain: 0.24 },
    { frequency: 1320, at: 0, length: 1.6, wave: "sine", gain: 0.1 },
    { frequency: 2217, at: 0, length: 0.9, wave: "sine", gain: 0.05 },
    { frequency: 880, at: 0.9, length: 2.2, wave: "sine", gain: 0.18 },
  ],
  soft: [
    { frequency: 523.25, at: 0, length: 0.9, wave: "triangle", gain: 0.2 },
    { frequency: 659.25, at: 0.28, length: 1.2, wave: "triangle", gain: 0.18 },
  ],
  digital: [
    { frequency: 1200, at: 0, length: 0.09, wave: "square", gain: 0.06 },
    { frequency: 1200, at: 0.16, length: 0.09, wave: "square", gain: 0.06 },
    { frequency: 1200, at: 0.32, length: 0.09, wave: "square", gain: 0.06 },
    { frequency: 1600, at: 0.55, length: 0.18, wave: "square", gain: 0.06 },
  ],
};

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

export function playTimerSound(kind: TimerSound) {
  if (kind === "none") return;
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.02;
  for (const note of PATTERNS[kind]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start + note.at);
    oscillator.stop(start + note.at + note.length + 0.05);
  }
}
