"use client";

import { Fragment, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, Minus, Plus, RotateCcw, Settings } from "lucide-react";
import { toast } from "sonner";
import type { FlashcardSettings } from "@/types/models";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import {
  DEFAULT_FLASHCARD_SETTINGS,
  calculateNextReview,
  formatInterval,
} from "@/lib/flashcards/srs";
import { intervalLabels } from "@/lib/flashcards/labels";
import {
  notificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/flashcards/notifications";

interface FlashcardsSettingsModalProps {
  open: boolean;
  settings: FlashcardSettings;
  onSave: (settings: FlashcardSettings) => void;
  onOpenChange: (open: boolean) => void;
}

const QUICK_GOALS = [10, 20, 30, 50, 100];

const PACE_OPTIONS = [
  {
    value: 0.8,
    labelKey: "settings_interval_frequent",
    descKey: "settings_pace_frequent_desc",
  },
  {
    value: 1.0,
    labelKey: "settings_interval_normal",
    descKey: "settings_pace_normal_desc",
  },
  {
    value: 1.3,
    labelKey: "settings_interval_spaced",
    descKey: "settings_pace_spaced_desc",
  },
] as const;

export function FlashcardsSettingsModal({
  open,
  settings,
  onSave,
  onOpenChange,
}: FlashcardsSettingsModalProps) {
  const { t } = useTranslation();
  const closeLabel = t("close");

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-[31.5rem]"
      closeAriaLabel={closeLabel}
    >
      <SettingsForm settings={settings} onSave={onSave} onOpenChange={onOpenChange} />
    </DialogShell>
  );
}

function SectionLabel({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <span
      className={cn(
        "block text-[11px] font-semibold uppercase tracking-[0.08em]",
        tone === "danger" ? "text-[var(--danger)]" : "text-faint"
      )}
    >
      {children}
    </span>
  );
}

function SettingsForm({
  settings,
  onSave,
  onOpenChange,
}: Omit<FlashcardsSettingsModalProps, "open">) {
  const { t } = useTranslation();
  const { adapter, flashcards, notebooks, pages } = useWorkspace();

  const [dailyGoal, setDailyGoal] = useState(
    settings.dailyGoal || DEFAULT_FLASHCARD_SETTINGS.dailyGoal
  );
  const [pace, setPace] = useState(
    settings.intervalModifier || DEFAULT_FLASHCARD_SETTINGS.intervalModifier
  );
  const [notificationsOn, setNotificationsOn] = useState(Boolean(settings.enableNotifications));
  const [notificationTime, setNotificationTime] = useState(
    settings.notificationTime || DEFAULT_FLASHCARD_SETTINGS.notificationTime
  );

  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationPermission()
  );

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetScope, setResetScope] = useState<string>("all");

  const labels = useMemo(() => intervalLabels(t), [t]);

  const projection = useMemo(() => {
    let state = { repetition: 0, interval: 1, easeFactor: 2.5 };
    const steps: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = calculateNextReview(state, "good", pace);
      steps.push(formatInterval(result.interval, labels));
      state = {
        repetition: result.repetition,
        interval: result.interval,
        easeFactor: result.easeFactor,
      };
    }
    return steps;
  }, [labels, pace]);

  const notebookByPage = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of pages) map.set(item.id, item.notebookId ?? "unfiled");
    return map;
  }, [pages]);

  const resetOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of flashcards) {
      const key = notebookByPage.get(card.pageId) ?? "unfiled";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const options = [{ id: "all", label: t("reset_scope_all"), count: flashcards.length }];
    for (const notebook of notebooks) {
      const count = counts.get(notebook.id) ?? 0;
      if (count > 0) options.push({ id: notebook.id, label: notebook.name, count });
    }
    const unfiled = counts.get("unfiled") ?? 0;
    if (unfiled > 0) options.push({ id: "unfiled", label: t("unfiled"), count: unfiled });
    return options;
  }, [flashcards, notebookByPage, notebooks, t]);

  const activeReset = resetOptions.find((option) => option.id === resetScope) ?? resetOptions[0];
  const resetCount = activeReset?.count ?? 0;
  const activePace = PACE_OPTIONS.find((option) => option.value === pace) ?? PACE_OPTIONS[1];

  const adjustGoal = (delta: number) => {
    setDailyGoal((prev) => Math.max(5, Math.min(200, (Number(prev) || 20) + delta)));
  };

  const toggleNotifications = async (checked: boolean) => {
    if (!checked) {
      setNotificationsOn(false);
      return;
    }

    const state = await requestNotificationPermission();
    setPermission(state);

    // Sem permissão (ou sem suporte) do navegador o lembrete ainda chega como
    // aviso dentro do app, então a preferência continua valendo; o bloqueio
    // aparece explicado logo abaixo do horário.
    setNotificationsOn(true);
    if (state === "granted") toast.success(t("notifications_enabled_toast"));
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const effectiveScope = activeReset?.id ?? "all";
      const scope =
        effectiveScope === "all"
          ? undefined
          : {
              cardIds: flashcards
                .filter((card) => (notebookByPage.get(card.pageId) ?? "unfiled") === effectiveScope)
                .map((card) => card.id),
            };
      const count = await adapter.resetFlashcardsProgress(scope);
      if (count === 0) toast.info(t("reset_progress_empty"));
      else toast.success(t("reset_progress_done", { count }));
      setConfirmingReset(false);
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setResetting(false);
    }
  };

  const handleSave = () => {
    onSave({
      dailyGoal: Math.max(5, Math.min(200, Number(dailyGoal) || 20)),
      intervalModifier: pace,
      enableNotifications: notificationsOn,
      notificationTime,
    });
    toast.success(t("saved"));
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader
        title={t("configure_reviews")}
        description={t("configure_reviews_desc")}
        icon={<Settings className="size-4" />}
        iconClassName="rounded-xl border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface-2)] text-[var(--accent)] shadow-2xs"
      />

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section className="space-y-2.5">
          <SectionLabel>{t("settings_section_goal")}</SectionLabel>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/40">
            <div className="flex items-center justify-center gap-6 px-4 py-5 sm:gap-8">
              <button
                type="button"
                onClick={() => adjustGoal(-5)}
                disabled={dailyGoal <= 5}
                aria-label={t("decrease")}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted shadow-2xs transition hover:border-[var(--border-strong)] hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-30"
              >
                <Minus className="size-4" />
              </button>

              <div className="flex flex-col items-center">
                <input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={200}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() =>
                    setDailyGoal((prev) => Math.max(5, Math.min(200, Number(prev) || 20)))
                  }
                  aria-label={t("settings_daily_goal")}
                  className="w-[3.4ch] [appearance:textfield] bg-transparent text-center text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink outline-none tabular-nums [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="mt-2 whitespace-nowrap text-[11.5px] text-muted">
                  {t("cards_per_day_unit")}
                </span>
              </div>

              <button
                type="button"
                onClick={() => adjustGoal(5)}
                disabled={dailyGoal >= 200}
                aria-label={t("increase")}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted shadow-2xs transition hover:border-[var(--border-strong)] hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-30"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5 border-t border-[var(--border)]/70 p-1.5">
              {QUICK_GOALS.map((value) => {
                const isSelected = dailyGoal === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDailyGoal(value)}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-lg border py-1.5 text-[12px] font-medium transition-all tabular-nums",
                      isSelected
                        ? "border-[var(--border-strong)]/50 bg-[var(--surface)] font-semibold text-ink shadow-xs"
                        : "border-transparent text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          <SectionLabel>{t("settings_section_pace")}</SectionLabel>

          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-1">
            {PACE_OPTIONS.map((option) => {
              const isSelected = pace === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPace(option.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-lg py-2 text-[12px] font-medium transition-all",
                    isSelected
                      ? "border border-[var(--border-strong)]/50 bg-[var(--surface)] font-semibold text-ink shadow-xs"
                      : "text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
                  )}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
            <p className="text-[12px] leading-relaxed text-muted">{t(activePace.descKey)}</p>

            <div className="border-t border-[var(--border)]/70 pt-3">
              <div className="mb-2.5">
                <SectionLabel>{t("settings_pace_projection")}</SectionLabel>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {projection.map((step, index) => (
                  <div
                    key={`${step}-${index}`}
                    className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)]/70 bg-[var(--surface)] px-1 py-2 text-center"
                  >
                    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">
                      #{index + 1}
                    </span>
                    <span className="mt-0.5 text-[12px] font-semibold text-ink tabular-nums">
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          <SectionLabel>{t("settings_section_reminders")}</SectionLabel>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 transition-all">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-2xs">
                  <Bell className="size-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[13px] font-medium leading-tight text-ink">
                    {t("settings_notifications")}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
                    {t("settings_notifications_desc")}
                  </span>
                </div>
              </div>
              <Switch
                checked={notificationsOn}
                onCheckedChange={(value) => void toggleNotifications(value)}
                aria-label={t("settings_notifications")}
                className="shrink-0"
              />
            </div>

            {notificationsOn ? (
              <div className="mt-3.5 space-y-2.5 border-t border-[var(--border)]/70 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="flashcards-notification-time"
                    className="text-[12.5px] font-medium text-ink"
                  >
                    {t("settings_notification_time")}
                  </label>
                  <input
                    id="flashcards-notification-time"
                    type="time"
                    required
                    value={notificationTime}
                    onChange={(e) => {
                      // O campo fica vazio enquanto o usuário apaga; guardar
                      // "" desligaria o lembrete sem ninguém perceber.
                      if (e.target.value) setNotificationTime(e.target.value);
                    }}
                    className="h-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12.5px] font-medium text-ink shadow-2xs outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] tabular-nums"
                  />
                </div>

                {permission === "denied" ? (
                  <p className="text-[11.5px] leading-relaxed text-[var(--danger)]">
                    {t("notifications_blocked")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2.5">
          <SectionLabel tone="danger">{t("settings_section_danger")}</SectionLabel>

          <div className="rounded-2xl border border-[color-mix(in_oklab,var(--danger)_18%,transparent)] bg-[color-mix(in_oklab,var(--danger)_4%,transparent)] p-4 transition-all">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--danger)_22%,transparent)] bg-[var(--surface)] text-[var(--danger)] shadow-2xs">
                <RotateCcw className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-tight text-ink">
                  {t("reset_progress")}
                </span>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {t("reset_progress_desc", { count: resetCount })}
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[color-mix(in_oklab,var(--danger)_12%,transparent)] pt-3">
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    disabled={flashcards.length === 0}
                    className="flex h-8.5 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-ink outline-none transition hover:border-[var(--border-strong)] disabled:opacity-45 sm:max-w-[15rem]"
                  >
                    <span className="truncate font-medium">{activeReset?.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-faint">
                      <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums">
                        {resetCount}
                      </span>
                      <ChevronDown className="size-3.5" />
                    </span>
                  </button>
                </MenuTrigger>
                <MenuContent
                  align="start"
                  className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl"
                >
                  {resetOptions.map((option) => (
                    <MenuItem
                      key={option.id}
                      onSelect={() => {
                        setResetScope(option.id);
                        setConfirmingReset(false);
                      }}
                      className="justify-between gap-3 text-[12px]"
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-faint tabular-nums">
                          {option.count}
                        </span>
                        {option.id === activeReset?.id ? (
                          <Check className="size-3.5 text-[var(--accent)]" />
                        ) : null}
                      </span>
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>

              {confirmingReset ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8.5 text-[12px]"
                    disabled={resetting}
                    onClick={() => setConfirmingReset(false)}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8.5 text-[12px] font-semibold shadow-xs"
                    disabled={resetting}
                    onClick={() => void handleReset()}
                  >
                    {resetting ? t("resetting") : t("confirm")}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8.5 border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[var(--surface)] text-[12px] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
                  disabled={resetCount === 0}
                  onClick={() => setConfirmingReset(true)}
                >
                  {t("reset_progress_action")}
                </Button>
              )}
            </div>

            {confirmingReset ? (
              <div className="mt-2.5 rounded-lg bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--danger)]">
                {t("reset_progress_confirm", { count: resetCount })}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <DialogFooter className="justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="h-9 rounded-xl px-4 text-[13px] text-muted hover:text-ink"
        >
          {t("close")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          className="h-9 rounded-xl px-5 text-[13px] font-semibold shadow-sm transition-transform active:scale-[0.98]"
        >
          {t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

