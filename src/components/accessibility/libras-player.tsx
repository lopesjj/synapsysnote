"use client";

import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Hand,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { LibrasHandSign } from "@/lib/accessibility/libras-dictionary";
import { useLibrasStore, type LibrasSpeed } from "@/lib/store/libras-store";
import { useUiStore } from "@/lib/store/ui-store";
import { useTranslation } from "@/lib/i18n/translations";

export function LibrasPlayer() {
  const { t } = useTranslation();
  const libras = useUiStore((state) => state.libras);
  const isOpen = useLibrasStore((state) => state.isOpen);
  const isMinimized = useLibrasStore((state) => state.isMinimized);
  const isPlaying = useLibrasStore((state) => state.isPlaying);
  const speed = useLibrasStore((state) => state.speed);
  const sourceTitle = useLibrasStore((state) => state.sourceTitle);
  const sourceAudioUrl = useLibrasStore((state) => state.sourceAudioUrl);
  const tokens = useLibrasStore((state) => state.tokens);
  const currentTokenIndex = useLibrasStore((state) => state.currentTokenIndex);
  const currentCharIndex = useLibrasStore((state) => state.currentCharIndex);

  const close = useLibrasStore((state) => state.close);
  const toggleMinimize = useLibrasStore((state) => state.toggleMinimize);
  const togglePlay = useLibrasStore((state) => state.togglePlay);
  const next = useLibrasStore((state) => state.next);
  const prev = useLibrasStore((state) => state.prev);
  const replay = useLibrasStore((state) => state.replay);
  const setSpeed = useLibrasStore((state) => state.setSpeed);
  const seekToToken = useLibrasStore((state) => state.seekToToken);
  const stepTick = useLibrasStore((state) => state.stepTick);

  const activeToken = tokens[currentTokenIndex];
  const activeChar = activeToken
    ? activeToken.isConceptSign
      ? activeToken.glosa
      : activeToken.characters[currentCharIndex] || activeToken.glosa[0] || "REST"
    : "REST";

  const tokenListRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current || !sourceAudioUrl) return;
    if (isPlaying) {
      audioRef.current.playbackRate = speed;
      void audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, sourceAudioUrl, speed]);

  const handleReplay = () => {
    replay();
    if (audioRef.current && sourceAudioUrl) {
      audioRef.current.currentTime = 0;
      if (isPlaying) {
        void audioRef.current.play().catch(() => {});
      }
    }
  };

  useEffect(() => {
    if (!isPlaying) return;

    let delayMs = 380;
    if (activeToken?.isConceptSign) {
      delayMs = 1100;
    } else if (activeToken) {
      delayMs = 320;
    }

    const timer = setTimeout(() => {
      stepTick();
    }, delayMs / speed);

    return () => clearTimeout(timer);
  }, [isPlaying, currentTokenIndex, currentCharIndex, speed, activeToken, stepTick]);

  useEffect(() => {
    if (!tokenListRef.current) return;
    const activeEl = tokenListRef.current.querySelector<HTMLElement>("[data-active-token='true']");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentTokenIndex]);

  useEffect(() => {
    if (!libras && isOpen) {
      close();
    }
  }, [libras, isOpen, close]);

  if (!isOpen || !libras) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-4 right-2 sm:right-4 z-60 pointer-events-none select-none max-w-[calc(100vw-16px)]">
      {sourceAudioUrl ? (
        <audio
          ref={audioRef}
          src={sourceAudioUrl}
          playsInline
          preload="metadata"
          className="hidden"
          aria-hidden="true"
        />
      ) : null}
      <AnimatePresence mode="wait">
        {isMinimized ? (
          <motion.div
            key="minimized"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-1.5 sm:px-3.5 sm:py-2 shadow-[var(--shadow-float)] backdrop-blur-md"
          >
            <button
              type="button"
              onClick={toggleMinimize}
              className="flex items-center gap-2 text-ink hover:text-[var(--accent)] transition-colors focus:outline-none"
              aria-label={t("expand_libras")}
            >
              <div className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] animate-pulse">
                <Hand className="size-3.5" />
              </div>
              <span className="text-[12.5px] font-semibold tracking-tight">Libras</span>
              {activeToken ? (
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-mono font-bold text-[var(--accent)] max-w-[100px] truncate">
                  {activeToken.glosa}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full p-1 text-muted hover:text-ink hover:bg-[var(--surface-hover)] transition-colors"
              aria-label={isPlaying ? t("pause") : t("play")}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={toggleMinimize}
              className="rounded-full p-1 text-muted hover:text-ink hover:bg-[var(--surface-hover)] transition-colors"
              aria-label={t("maximize")}
            >
              <Maximize2 className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={close}
              className="rounded-full p-1 text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
              aria-label={t("btn_close")}
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="pointer-events-auto flex w-[calc(100vw-16px)] sm:w-[360px] max-w-[360px] max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3.5 py-2.5 bg-[var(--surface-2)]/60">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-6.5 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white shadow-xs">
                  <Hand className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink leading-none truncate">
                    {t("libras_interpreter")}
                  </p>
                  <p className="text-[10px] text-muted truncate mt-0.5 leading-none">
                    {sourceTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {sourceAudioUrl ? (
                  <div className="flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    <Volume2 className="size-3" />
                    <span>{t("audio")}</span>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={toggleMinimize}
                  className="rounded-lg p-1 text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition-colors"
                  aria-label={t("minimize")}
                >
                  <Minimize2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1 text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  aria-label={t("btn_close")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="relative flex flex-col items-center justify-center py-3.5 sm:py-5 px-3 sm:px-4 bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)]/30">
              <div className="relative flex size-32 sm:size-40 items-center justify-center rounded-2xl border border-[var(--border)]/70 bg-gradient-to-b from-amber-500/5 via-[var(--surface-2)]/60 to-[var(--surface-2)]/90 shadow-inner overflow-hidden">
                <div className="absolute inset-2 rounded-full bg-amber-500/10 blur-xl pointer-events-none" />
                <LibrasHandSign glyph={activeChar} size={112} />
                
                <div className="absolute top-2 right-2 flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]/95 px-1.5 py-0.5 shadow-xs backdrop-blur-xs">
                  <span className="font-mono text-[13px] font-bold text-[var(--accent)]">
                    {activeChar}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 sm:mt-3 flex items-center justify-center">
                <span className="text-[13px] sm:text-[14px] font-bold tracking-wider text-ink font-mono uppercase bg-[var(--accent-soft)]/60 text-[var(--accent)] px-3 py-1 rounded-full border border-[var(--accent)]/30">
                  {activeToken ? activeToken.glosa : "..."}
                </span>
              </div>
            </div>

            <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div className="flex items-center justify-between text-[10.5px] font-medium text-faint mb-1.5 px-0.5">
                <span>{t("libras_gloss")}</span>
                <span>
                  {tokens.length > 0 ? `${currentTokenIndex + 1}/${tokens.length}` : "0/0"}
                </span>
              </div>

              <div
                ref={tokenListRef}
                className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none scroll-smooth touch-pan-x"
              >
                {tokens.length === 0 ? (
                  <span className="text-[11.5px] text-muted py-1">{t("no_text_loaded")}</span>
                ) : (
                  tokens.map((token, idx) => {
                    const isCurrent = idx === currentTokenIndex;
                    return (
                      <button
                        key={token.id}
                        type="button"
                        data-active-token={isCurrent}
                        onClick={() => seekToToken(idx)}
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-[11px] font-mono font-semibold transition-all select-none",
                          isCurrent
                            ? "bg-[var(--accent)] text-white shadow-xs scale-105"
                            : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink border border-[var(--border)]"
                        )}
                      >
                        {token.glosa}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Tooltip label={t("libras_repeat_from_start")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleReplay}
                      className="rounded-lg text-muted hover:text-ink"
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </Tooltip>

                  <Tooltip label={t("libras_prev_sign")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={prev}
                      disabled={currentTokenIndex === 0}
                      className="rounded-lg text-muted hover:text-ink"
                    >
                      <SkipBack className="size-3.5" />
                    </Button>
                  </Tooltip>

                  <Button
                    variant="primary"
                    size="icon-sm"
                    onClick={togglePlay}
                    className="size-8.5 rounded-full shadow-xs"
                    aria-label={isPlaying ? t("pause") : t("play")}
                  >
                    {isPlaying ? (
                      <Pause className="size-4 fill-current" />
                    ) : (
                      <Play className="size-4 fill-current ml-0.5" />
                    )}
                  </Button>

                  <Tooltip label={t("libras_next_sign")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={next}
                      disabled={currentTokenIndex >= tokens.length - 1}
                      className="rounded-lg text-muted hover:text-ink"
                    >
                      <SkipForward className="size-3.5" />
                    </Button>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                  {([0.5, 1, 1.5, 2] as LibrasSpeed[]).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSpeed(val)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10.5px] font-mono font-medium transition-colors",
                        speed === val
                          ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                          : "text-muted hover:text-ink hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      {val}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
