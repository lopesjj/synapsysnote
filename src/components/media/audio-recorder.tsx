"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AudioLines, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/primitives";
import { formatDuration } from "@/lib/utils";
import { localizeErrorMessage, useTranslation } from "@/lib/i18n/translations";
import { prepareAudioAttachment } from "@/lib/media/compress-attachment";

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

const SPEECH_LANG_MAP: Record<string, string> = {
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

export function AudioRecorder({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (blob: Blob, durationSeconds: number, transcript?: string) => Promise<void>;
}) {
  const { t, language } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array.from({ length: 40 }, () => 0.08));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const openTimestamp = useRef(0);
  const transcriptRef = useRef("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const cleanup = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    if (tick.current) clearInterval(tick.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    void audioContext.current?.close();
    raf.current = null;
    tick.current = null;
    stream.current = null;
    audioContext.current = null;
    recorder.current = null;
  };

  const resetUi = () => {
    setRecording(false);
    setSeconds(0);
    setError(null);
    setLevels(Array.from({ length: 40 }, () => 0.08));
  };

  const close = (next: boolean) => {
    if (!next) {
      cleanup();
      resetUi();
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (open) {
      openTimestamp.current = Date.now();
    }
    cleanup();
    resetUi();
    return () => {
      cleanup();
    };
  }, [open]);

  const startRecording = async () => {
    if (!open) return;
    if (Date.now() - openTimestamp.current < 450) return;
    if (recording || recorder.current) return;
    setError(null);
    transcriptRef.current = "";
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];

      let mimeType = "";
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
        "audio/ogg;codecs=opus",
      ];
      if (typeof MediaRecorder.isTypeSupported === "function") {
        for (const candidate of candidates) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            mimeType = candidate;
            break;
          }
        }
      }
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: 28000 };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      const instance = new MediaRecorder(media, recorderOptions);
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.start(250);
      recorder.current = instance;
      setRecording(true);
      setSeconds(0);

      const SpeechRec =
        typeof window !== "undefined"
          ? (window as unknown as SpeechWindow).SpeechRecognition ||
            (window as unknown as SpeechWindow).webkitSpeechRecognition
          : null;

      if (liveTranscription && SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = false;
          rec.lang = SPEECH_LANG_MAP[language] || "pt-BR";
          rec.onresult = (event: SpeechResultEvent) => {
            let full = "";
            for (let i = 0; i < event.results.length; i++) {
              full += (event.results[i][0]?.transcript || "") + " ";
            }
            transcriptRef.current = full.trim();
          };
          rec.start();
          recognitionRef.current = rec;
        } catch {}
      }

      tick.current = setInterval(() => setSeconds((prev) => prev + 1), 1000);

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const context = new AudioCtx();
          if (context.state === "suspended") {
            void context.resume().catch(() => {});
          }
          audioContext.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(media).connect(analyser);
          const buffer = new Uint8Array(analyser.frequencyBinCount);

          const sample = () => {
            analyser.getByteFrequencyData(buffer);
            const average = buffer.reduce((sum, value) => sum + value, 0) / buffer.length / 255;
            setLevels((prev) => [...prev.slice(1), Math.max(0.08, Math.min(1, average * 2.2))]);
            raf.current = requestAnimationFrame(sample);
          };
          sample();
        }
      } catch {}
    } catch {
      setError(t("mic_access_error"));
    }
  };

  const stopAndSave = async () => {
    const instance = recorder.current;
    if (!instance) return;
    const duration = seconds;

    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }

    const capturedTranscript = transcriptRef.current.trim();

    const rawBlob = await new Promise<Blob>((resolve) => {
      instance.onstop = () => resolve(new Blob(chunks.current, { type: instance.mimeType }));
      instance.stop();
    });

    cleanup();
    resetUi();
    setSaving(true);
    try {
      const blob = await prepareAudioAttachment(rawBlob);
      await onSave(blob, duration, capturedTranscript);
      close(false);
      toast.success(t("voice_note_saved"));
    } catch (err) {
      toast.error(
        localizeErrorMessage(err instanceof Error ? err.message : null, t) ||
          t("voice_note_save_error")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell open={open} onOpenChange={close} className="max-w-md">
      <DialogHeader
        icon={<AudioLines className="size-4" />}
        title={t("voice_note")}
        description={t("voice_note_desc")}
      />

      <div
        className="flex flex-col items-center gap-5 px-5 py-8"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !recording && Date.now() - openTimestamp.current < 500) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className="flex h-16 items-end gap-[3px]">
          {levels.map((level, index) => (
            <motion.span
              key={index}
              animate={{ height: `${level * 100}%` }}
              transition={{ duration: 0.12 }}
              className="w-[3px] rounded-full bg-[var(--accent)]"
              style={{ opacity: recording ? 0.35 + level * 0.65 : 0.2 }}
            />
          ))}
        </div>

        <p className="font-mono text-3xl tabular-nums tracking-tight text-ink">
          {formatDuration(seconds)}
        </p>

        {error ? <p className="max-w-xs text-center text-[12px] text-[var(--danger)]">{error}</p> : null}

        {!recording ? (
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
            <Checkbox
              checked={liveTranscription}
              onCheckedChange={(val) => setLiveTranscription(val === true)}
            />
            <span>{t("voice_note_live_transcribe")}</span>
          </label>
        ) : null}

        {!recording ? (
          <Button type="button" variant="primary" size="lg" onClick={startRecording} disabled={saving}>
            <Mic /> {t("start_recording")}
          </Button>
        ) : (
          <Button type="button" variant="danger" size="lg" onClick={stopAndSave} disabled={saving}>
            <Square /> {t("stop_and_save")}
          </Button>
        )}
      </div>

      <DialogFooter className="justify-end">
        <Button type="button" variant="ghost" onClick={() => close(false)}>
          {t("btn_close")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
