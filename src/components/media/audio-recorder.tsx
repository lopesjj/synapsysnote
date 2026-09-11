"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AudioLines, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/translations";
import { prepareAudioAttachment } from "@/lib/media/compress-attachment";

export function AudioRecorder({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (blob: Blob, durationSeconds: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
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

  const cleanup = () => {
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
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const instance = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 28000 });
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.start(250);
      recorder.current = instance;
      setRecording(true);
      setSeconds(0);

      tick.current = setInterval(() => setSeconds((prev) => prev + 1), 1000);

      const context = new AudioContext();
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

    const rawBlob = await new Promise<Blob>((resolve) => {
      instance.onstop = () => resolve(new Blob(chunks.current, { type: instance.mimeType }));
      instance.stop();
    });

    cleanup();
    resetUi();
    setSaving(true);
    try {
      const blob = await prepareAudioAttachment(rawBlob);
      await onSave(blob, duration);
      close(false);
      toast.success(t("voice_note_saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("voice_note_save_error"));
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
