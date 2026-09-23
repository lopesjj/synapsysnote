"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import { translateTextToTarget } from "@/lib/ai/translate-client";

let politeTimer: ReturnType<typeof setTimeout> | null = null;
let assertiveTimer: ReturnType<typeof setTimeout> | null = null;

export const BCP47_LANG_MAP: Record<string, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  de: "de-DE",
  ru: "ru-RU",
  ja: "ja-JP",
  zh: "zh-CN",
  ar: "ar-SA",
};

export function resolveVoiceLanguage(lang?: string): string {
  if (!lang) {
    if (typeof document !== "undefined" && document.documentElement.lang) {
      const docLang = document.documentElement.lang.toLowerCase();
      if (BCP47_LANG_MAP[docLang]) return BCP47_LANG_MAP[docLang];
      return document.documentElement.lang;
    }
    return "pt-BR";
  }
  const key = lang.toLowerCase().trim();
  if (BCP47_LANG_MAP[key]) return BCP47_LANG_MAP[key];
  return lang;
}

export function findBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const target = resolveVoiceLanguage(langCode).toLowerCase().replace("_", "-");
  const targetPrefix = target.split("-")[0];

  const matchExact = (v: SpeechSynthesisVoice) =>
    v.lang.toLowerCase().replace("_", "-") === target;
  const matchPrefix = (v: SpeechSynthesisVoice) =>
    v.lang.toLowerCase().replace("_", "-").startsWith(targetPrefix);

  const localExact = voices.find((v) => v.localService && matchExact(v));
  if (localExact) return localExact;

  const localPrefix = voices.find((v) => v.localService && matchPrefix(v));
  if (localPrefix) return localPrefix;

  const anyExact = voices.find(matchExact);
  if (anyExact) return anyExact;

  const anyPrefix = voices.find(matchPrefix);
  if (anyPrefix) return anyPrefix;

  return null;
}

export function announceToScreenReader(message: string, assertive = false): void {
  if (typeof document === "undefined" || !message.trim()) return;

  const id = assertive ? "sr-live-assertive" : "sr-live-polite";
  const element = document.getElementById(id);
  if (!element) return;

  if (assertive) {
    if (assertiveTimer) clearTimeout(assertiveTimer);
    element.textContent = "";
    assertiveTimer = setTimeout(() => {
      element.textContent = message.trim();
    }, 50);
  } else {
    if (politeTimer) clearTimeout(politeTimer);
    element.textContent = "";
    politeTimer = setTimeout(() => {
      element.textContent = message.trim();
    }, 50);
  }
}

export interface SpeakOptions {
  rate?: number;
  lang?: string;
  translate?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechQueue: string[] = [];
let speechIndex = 0;
let activeOptions: SpeakOptions | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isExplicitlyStopped = false;

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function splitIntoSpeechChunks(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const chunks: string[] = [];

  for (const line of lines) {
    if (line.length <= 180) {
      chunks.push(line);
      continue;
    }
    const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (sentences && sentences.length > 1) {
      for (const s of sentences) {
        const trimmed = s.trim();
        if (trimmed) chunks.push(trimmed);
      }
    } else {
      chunks.push(line);
    }
  }

  return chunks;
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  isExplicitlyStopped = true;
  clearHeartbeat();
  speechQueue = [];
  speechIndex = 0;
  activeOptions = null;
  activeUtterance = null;
  window.speechSynthesis.cancel();
}

export function pauseSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.resume();
}

export function isSpeaking(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking;
}

export function isPaused(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.paused;
}

function playNextChunk(): void {
  if (isExplicitlyStopped || !window.speechSynthesis || speechIndex >= speechQueue.length) {
    clearHeartbeat();
    activeUtterance = null;
    const onEnd = activeOptions?.onEnd;
    activeOptions = null;
    if (onEnd) onEnd();
    return;
  }

  const chunk = speechQueue[speechIndex];
  const utterance = new SpeechSynthesisUtterance(chunk);
  activeUtterance = utterance;

  const resolvedLang = resolveVoiceLanguage(activeOptions?.lang);
  utterance.lang = resolvedLang;
  utterance.rate = Math.max(0.5, Math.min(2.5, activeOptions?.rate ?? 1.0));

  const matchingVoice = findBestVoiceForLanguage(resolvedLang);
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  if (speechIndex === 0 && activeOptions?.onStart) {
    utterance.onstart = activeOptions.onStart;
  }

  utterance.onend = () => {
    if (isExplicitlyStopped) return;
    speechIndex++;
    playNextChunk();
  };

  utterance.onerror = (e) => {
    if (isExplicitlyStopped) return;
    if (e.error === "interrupted" || e.error === "canceled") return;
    speechIndex++;
    playNextChunk();
  };

  window.speechSynthesis.speak(utterance);
}

function startSpeakingQueue(text: string, options: SpeakOptions = {}): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;

  const clean = text.trim();
  if (!clean) return false;

  stopSpeaking();

  const chunks = splitIntoSpeechChunks(clean);
  if (chunks.length === 0) return false;

  isExplicitlyStopped = false;
  speechQueue = chunks;
  speechIndex = 0;
  activeOptions = options;

  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }
  }, 10000);

  playNextChunk();
  return true;
}

export async function speakTextAsync(text: string, options: SpeakOptions = {}): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;

  const targetLang = options.lang || useUiStore.getState().language || "pt";
  const shouldTranslate = options.translate !== false;

  let textToSpeak = clean;
  if (shouldTranslate) {
    try {
      textToSpeak = await translateTextToTarget(clean, targetLang);
    } catch {}
  }

  if (isExplicitlyStopped) {
    return false;
  }

  return startSpeakingQueue(textToSpeak, { ...options, lang: targetLang });
}

export function speakText(text: string, options: SpeakOptions = {}): boolean {
  const clean = text.trim();
  if (!clean) return false;

  isExplicitlyStopped = false;
  const shouldTranslate = options.translate !== false;

  if (shouldTranslate) {
    void speakTextAsync(text, options);
    return true;
  }

  const targetLang = options.lang || useUiStore.getState().language || "pt";
  return startSpeakingQueue(clean, { ...options, lang: targetLang });
}

export function focusNoteEditor(): boolean {
  if (typeof document === "undefined") return false;
  const editorEl = document.querySelector<HTMLElement>(
    '#synapsys-note-editor, .ProseMirror, [contenteditable="true"], .synapsys-editor'
  );
  if (editorEl) {
    editorEl.focus();
    return true;
  }
  return false;
}

export function focusNoteTitle(): boolean {
  if (typeof document === "undefined") return false;
  const titleInput = document.querySelector<HTMLElement>(
    '#page-title-input, textarea[placeholder*="título"], input[placeholder*="título"], [data-page-title]'
  );
  if (titleInput) {
    titleInput.focus();
    return true;
  }
  return false;
}

export function ScreenReaderLiveRegion() {
  const { t, language } = useTranslation();
  const screenReader = useUiStore((state) => state.screenReader);
  const speechRate = useUiStore((state) => state.speechRate);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const onVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      };
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          const focused = focusNoteEditor();
          if (focused) {
            const message = t("focus_editor_shortcut");
            announceToScreenReader(message);
            if (screenReader) {
              speakText(message, { lang: language, rate: speechRate, translate: false });
            }
          }
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          const focused = focusNoteTitle();
          if (focused) {
            const message = t("focus_title_shortcut");
            announceToScreenReader(message);
            if (screenReader) {
              speakText(message, { lang: language, rate: speechRate, translate: false });
            }
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [language, screenReader, speechRate, t]);

  if (!mounted) return null;

  return (
    <div className="sr-only" aria-hidden="false">
      <div id="sr-live-polite" role="status" aria-live="polite" aria-atomic="true" />
      <div id="sr-live-assertive" role="alert" aria-live="assertive" aria-atomic="true" />
    </div>
  );
}
