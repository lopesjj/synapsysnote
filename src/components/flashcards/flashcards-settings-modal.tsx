"use client";

import { useState } from "react";
import { Bell, Check, Clock, Minus, Plus, Sliders, Target, X } from "lucide-react";
import { toast } from "sonner";
import type { FlashcardSettings } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/translations";
import { DEFAULT_FLASHCARD_SETTINGS } from "@/lib/flashcards/srs";

interface FlashcardsSettingsModalProps {
  settings: FlashcardSettings;
  onSave: (settings: FlashcardSettings) => Promise<void>;
  onClose: () => void;
}

const QUICK_GOALS = [10, 20, 30, 50];

export function FlashcardsSettingsModal({
  settings,
  onSave,
  onClose,
}: FlashcardsSettingsModalProps) {
  const { t } = useTranslation();
  const [dailyGoal, setDailyGoal] = useState(settings.dailyGoal || DEFAULT_FLASHCARD_SETTINGS.dailyGoal);
  const [intervalModifier, setIntervalModifier] = useState(
    settings.intervalModifier || DEFAULT_FLASHCARD_SETTINGS.intervalModifier
  );
  const [enableNotifications, setEnableNotifications] = useState(
    Boolean(settings.enableNotifications)
  );
  const [notificationTime, setNotificationTime] = useState(
    settings.notificationTime || DEFAULT_FLASHCARD_SETTINGS.notificationTime
  );
  const [saving, setSaving] = useState(false);

  const handleToggleNotifications = async (checked: boolean) => {
    if (checked) {
      if (typeof window !== "undefined" && "Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error(t("notifications_permission_denied"));
          setEnableNotifications(false);
          return;
        }
        toast.success(t("notifications_enabled_toast"));
        setEnableNotifications(true);
      } else {
        setEnableNotifications(checked);
      }
    } else {
      setEnableNotifications(false);
    }
  };

  const adjustGoal = (delta: number) => {
    setDailyGoal((prev) => Math.max(5, Math.min(200, (Number(prev) || 20) + delta)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        dailyGoal: Math.max(5, Math.min(200, Number(dailyGoal) || 20)),
        intervalModifier,
        enableNotifications,
        notificationTime,
      });
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-3 sm:p-5 overflow-y-auto select-none">
      <div className="relative w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--canvas)] p-5 sm:p-7 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.5)] my-auto pb-safe">
        <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/20 shadow-xs">
              <Sliders className="size-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-ink tracking-tight">
                {t("configure_reviews")}
              </h3>
              <p className="text-xs text-muted">
                {t("preferences_description")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-2xl hover:bg-[var(--surface-hover)] text-muted hover:text-ink transition cursor-pointer"
            aria-label={t("close")}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 text-xs sm:text-sm">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-ink flex items-center gap-2">
                <Target className="size-4 text-[var(--accent)]" />
                <span>{t("settings_daily_goal")}</span>
              </label>
              <span className="text-[11px] font-mono font-bold text-muted bg-[var(--canvas)] px-2.5 py-0.5 rounded-full border border-[var(--border)]">
                {dailyGoal} cards/dia
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-1">
                <button
                  type="button"
                  onClick={() => adjustGoal(-5)}
                  disabled={dailyGoal <= 5}
                  className="size-9 rounded-xl flex items-center justify-center hover:bg-[var(--surface)] text-muted hover:text-ink disabled:opacity-30 transition cursor-pointer"
                  aria-label="Diminuir"
                >
                  <Minus className="size-4" />
                </button>
                <Input
                  type="number"
                  min={5}
                  max={200}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                  className="w-16 border-0 text-center font-black text-ink text-base h-9 bg-transparent focus:ring-0 shadow-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => adjustGoal(5)}
                  disabled={dailyGoal >= 200}
                  className="size-9 rounded-xl flex items-center justify-center hover:bg-[var(--surface)] text-muted hover:text-ink disabled:opacity-30 transition cursor-pointer"
                  aria-label="Aumentar"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                {QUICK_GOALS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDailyGoal(q)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      dailyGoal === q
                        ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                        : "bg-[var(--canvas)] text-muted hover:text-ink border-[var(--border)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="font-bold text-ink flex items-center gap-2">
              <Clock className="size-4 text-[var(--accent)]" />
              <span>{t("settings_interval_modifier")}</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setIntervalModifier(0.8)}
                className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer group ${
                  intervalModifier === 0.8
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--canvas)] border border-[var(--border)] text-muted">
                    0.8x
                  </span>
                  {intervalModifier === 0.8 ? (
                    <div className="size-4.5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  ) : null}
                </div>
                <div className="font-bold text-xs text-ink group-hover:text-[var(--accent)] transition">
                  {t("settings_interval_frequent")}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIntervalModifier(1.0)}
                className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer group ${
                  intervalModifier === 1.0
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--canvas)] border border-[var(--border)] text-muted">
                    1.0x
                  </span>
                  {intervalModifier === 1.0 ? (
                    <div className="size-4.5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  ) : null}
                </div>
                <div className="font-bold text-xs text-ink group-hover:text-[var(--accent)] transition">
                  {t("settings_interval_normal")}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIntervalModifier(1.3)}
                className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer group ${
                  intervalModifier === 1.3
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--canvas)] border border-[var(--border)] text-muted">
                    1.3x
                  </span>
                  {intervalModifier === 1.3 ? (
                    <div className="size-4.5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  ) : null}
                </div>
                <div className="font-bold text-xs text-ink group-hover:text-[var(--accent)] transition">
                  {t("settings_interval_spaced")}
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <Bell className="size-4.5" />
                </div>
                <div>
                  <span className="block font-bold text-ink text-xs sm:text-sm">
                    {t("settings_notifications")}
                  </span>
                  <span className="block text-[11px] text-muted leading-relaxed mt-0.5">
                    {t("settings_notifications_desc")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enableNotifications}
                onClick={() => void handleToggleNotifications(!enableNotifications)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enableNotifications ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enableNotifications ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {enableNotifications ? (
              <div className="pt-3 border-t border-[var(--border)]/60 flex items-center justify-between gap-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs text-muted font-semibold">
                  <Clock className="size-3.5 text-muted" />
                  <span>{t("settings_notification_time")}</span>
                </div>
                <input
                  type="time"
                  value={notificationTime}
                  onChange={(e) => setNotificationTime(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-mono font-bold text-ink outline-none focus:border-[var(--accent)] transition"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-[var(--border)]/70">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl text-xs sm:text-sm h-10 px-4 cursor-pointer font-bold"
          >
            {t("close")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-2xl text-xs sm:text-sm h-10 px-5 font-extrabold shadow-md bg-gradient-to-r from-[var(--accent)] to-sky-600 cursor-pointer"
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
