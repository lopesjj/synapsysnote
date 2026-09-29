"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useStudy } from "@/lib/study/provider";
import { useStudyT, type StudyKey } from "@/lib/study/i18n";
import { BUILT_IN_CATEGORIES, REVIEW_INTERVAL_PRESETS, SUBJECT_COLORS, TIMER_SOUNDS } from "@/lib/study/defaults";
import { availableTimeZones, capitalizeFirst, orderedWeekdays, weekdayLabel, zoneOffsetLabel } from "@/lib/study/dates";
import { playTimerSound } from "@/lib/study/sound";
import type { StudyCategory, StudySettings, TimerSound } from "@/types/study";

function Block({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-faint">{title}</h4>
        {hint ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(String(value));
  }
  return (
    <label className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2">
      <span className="text-[12.5px] text-ink">{label}</span>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => {
          const next = Math.min(max, Math.max(min, Number(draft) || min));
          setDraft(String(next));
          if (next !== value) onCommit(next);
        }}
        className="h-7 w-14 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-center text-[12.5px] tabular-nums text-ink outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

export function StudyPreferencesSection() {
  const { st, locale } = useStudyT();
  const { settings, actions, sessions, reviews } = useStudy();
  const [customInterval, setCustomInterval] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const zones = useMemo(
    () => availableTimeZones().map((zone) => ({ zone, label: `(${zoneOffsetLabel(zone)}) ${zone.replace(/_/g, " ")}` })),
    []
  );
  const deviceZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const update = (patch: Partial<StudySettings>) => {
    void actions.updateSettings(patch).catch(() => toast.error(st("error_generic")));
  };

  const toggleWeekday = (weekday: number) => {
    const set = new Set(settings.studyWeekdays);
    if (set.has(weekday)) set.delete(weekday);
    else set.add(weekday);
    update({ studyWeekdays: [...set].sort() });
  };

  const toggleInterval = (days: number) => {
    const set = new Set(settings.reviewIntervals);
    if (set.has(days)) set.delete(days);
    else set.add(days);
    update({ reviewIntervals: [...set].sort((a, b) => a - b) });
  };

  const deleteInterval = async (days: number) => {
    if (!window.confirm(st("prefs_interval_delete_confirm", { count: days }))) return;
    try {
      await actions.deleteReviewInterval(days);
      toast.success(st("prefs_interval_deleted"));
    } catch {
      toast.error(st("error_generic"));
    }
  };

  const intervals = [...new Set([...REVIEW_INTERVAL_PRESETS, ...settings.reviewIntervals])].sort((a, b) => a - b);

  const renameCategory = (category: StudyCategory, name: string) => {
    update({ categories: settings.categories.map((entry) => (entry.id === category.id ? { ...entry, name: name.slice(0, 60) } : entry)) });
  };

  const categoryLabel = (category: StudyCategory) =>
    category.name || ((BUILT_IN_CATEGORIES as readonly string[]).includes(category.id) ? st(`cat_${category.id}` as StudyKey) : category.id);

  return (
    <div className="space-y-7">
      <Block title={st("prefs_days")} hint={st("prefs_days_hint")}>
        <div className="flex flex-wrap gap-1.5">
          {orderedWeekdays(settings.weekStartsOn).map((weekday) => {
            const active = settings.studyWeekdays.includes(weekday);
            return (
              <button
                key={weekday}
                type="button"
                aria-pressed={active}
                onClick={() => toggleWeekday(weekday)}
                className={cn(
                  "h-8 min-w-[3.25rem] rounded-[var(--radius-sm)] border px-2.5 text-[12.5px] font-medium transition",
                  active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-muted hover:border-[var(--border-strong)] hover:text-ink"
                )}
              >
                {capitalizeFirst(weekdayLabel(weekday, locale, "short").replace(".", ""))}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pt-1 text-[12.5px] text-muted">
          <span>{st("prefs_week_start")}</span>
          <div className="inline-flex rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {([0, 1] as const).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => update({ weekStartsOn: day })}
                className={cn(
                  "h-6 rounded-[6px] px-2.5 text-[12px] font-medium transition",
                  settings.weekStartsOn === day ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted hover:text-ink"
                )}
              >
                {capitalizeFirst(weekdayLabel(day, locale, "long"))}
              </button>
            ))}
          </div>
        </div>
      </Block>

      <Block title={st("prefs_performance")} hint={st("prefs_performance_hint", { low: settings.performanceLow, high: settings.performanceHigh })}>
        <div className="relative h-2.5 overflow-hidden rounded-full">
          <div className="absolute inset-y-0 left-0" style={{ width: `${settings.performanceLow}%`, backgroundColor: "var(--band-low)" }} />
          <div
            className="absolute inset-y-0"
            style={{ left: `${settings.performanceLow}%`, width: `${settings.performanceHigh - settings.performanceLow}%`, backgroundColor: "var(--band-mid)" }}
          />
          <div className="absolute inset-y-0 right-0" style={{ left: `${settings.performanceHigh}%`, backgroundColor: "var(--band-high)" }} />
        </div>
        <div className="flex justify-between text-[11px] tabular-nums text-faint">
          <span>0%</span>
          <span>{st("band_low")} · {st("band_mid")} · {st("band_high")}</span>
          <span>100%</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NumberField label={st("prefs_low")} value={settings.performanceLow} min={1} max={settings.performanceHigh - 1} onCommit={(value) => update({ performanceLow: value })} />
          <NumberField label={st("prefs_high")} value={settings.performanceHigh} min={settings.performanceLow + 1} max={100} onCommit={(value) => update({ performanceHigh: value })} />
        </div>
      </Block>

      <Block title={st("prefs_reviews")} hint={st("prefs_reviews_hint")}>
        <div className="flex flex-wrap gap-1.5">
          {intervals.map((days) => {
            const active = settings.reviewIntervals.includes(days);
            const isCustom = !(REVIEW_INTERVAL_PRESETS as readonly number[]).includes(days);
            const hasReviews = reviews.some((r) => r.intervalDays === days);
            const canDelete = isCustom || (active && hasReviews);
            return (
              <div
                key={days}
                className={cn(
                  "group inline-flex h-7 items-center rounded-full border text-[12px] tabular-nums transition",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                    : "border-[var(--border)] text-muted hover:text-ink"
                )}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterval(days)}
                  className={cn("h-full px-2.5 transition", canDelete && "pr-1")}
                >
                  {st("review_interval", { count: days })}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteInterval(days);
                    }}
                    aria-label={`${st("delete")} ${st("review_interval", { count: days })}`}
                    className={cn(
                      "flex h-full items-center pr-2 pl-0.5 text-muted transition hover:text-[var(--danger)]",
                      !isCustom && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                    title={st("delete")}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const days = Number(customInterval);
              if (!Number.isInteger(days) || days < 1 || days > 730) return;
              update({ reviewIntervals: [...new Set([...settings.reviewIntervals, days])].sort((a, b) => a - b) });
              setCustomInterval("");
            }}
          >
            <input
              inputMode="numeric"
              value={customInterval}
              onChange={(event) => setCustomInterval(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder={st("prefs_reviews_custom")}
              aria-label={st("prefs_reviews_custom")}
              className="h-7 w-16 rounded-full border border-dashed border-[var(--border-strong)] bg-transparent px-2.5 text-center text-[12px] tabular-nums text-ink outline-none focus:border-[var(--accent)]"
            />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label={st("add")} disabled={!customInterval}>
              <Plus />
            </Button>
          </form>
        </div>
        <label className="flex items-start justify-between gap-4 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2.5">
          <span>
            <span className="block text-[12.5px] font-medium text-ink">{st("prefs_auto_reviews")}</span>
            <span className="block text-[11.5px] text-muted">{st("prefs_auto_reviews_hint")}</span>
          </span>
          <Switch checked={settings.autoReviews} onCheckedChange={(value) => update({ autoReviews: value })} />
        </label>
      </Block>

      <Block title={st("prefs_categories")} hint={st("prefs_categories_hint")}>
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {settings.categories.map((category) => {
            const builtIn = (BUILT_IN_CATEGORIES as readonly string[]).includes(category.id);
            const used = sessions.some((session) => session.categoryId === category.id);
            return (
              <li key={category.id} className="flex items-center gap-2 px-3 py-1.5">
                <label className="relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-full" style={{ backgroundColor: category.color }}>
                  <select
                    aria-label={st("subject_color")}
                    value={category.color}
                    onChange={(event) =>
                      update({ categories: settings.categories.map((entry) => (entry.id === category.id ? { ...entry, color: event.target.value } : entry)) })
                    }
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {SUBJECT_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  defaultValue={categoryLabel(category)}
                  key={`${category.id}:${category.name}`}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    const fallback = builtIn ? st(`cat_${category.id}` as StudyKey) : "";
                    if (!value && !builtIn) {
                      event.target.value = categoryLabel(category);
                      return;
                    }
                    const nextName = value === fallback ? "" : value;
                    if (nextName !== category.name) renameCategory(category, nextName);
                  }}
                  className="h-7 min-w-0 flex-1 rounded-[6px] bg-transparent px-1.5 text-[12.5px] text-ink outline-none focus:bg-[var(--surface-2)]"
                />
                {builtIn && category.name ? (
                  <Button variant="ghost" size="icon-sm" aria-label={st("prefs_category_reset")} onClick={() => renameCategory(category, "")}>
                    <RotateCcw />
                  </Button>
                ) : null}
                {!builtIn ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={st("delete")}
                    onClick={() => {
                      if (used) {
                        toast.error(st("prefs_category_in_use"));
                        return;
                      }
                      update({ categories: settings.categories.filter((entry) => entry.id !== category.id) });
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newCategory.trim();
            if (!name) return;
            update({
              categories: [
                ...settings.categories,
                { id: `c_${nanoid(8)}`, name: name.slice(0, 60), color: SUBJECT_COLORS[settings.categories.length % SUBJECT_COLORS.length] },
              ],
            });
            setNewCategory("");
          }}
        >
          <Input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder={st("prefs_category_placeholder")} />
          <Button type="submit" variant="secondary" disabled={!newCategory.trim()}>
            <Plus />
            {st("prefs_category_add")}
          </Button>
        </form>
      </Block>

      <Block title={st("prefs_pomodoro")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NumberField label={st("prefs_pomodoro_focus")} value={settings.pomodoroFocus} min={5} max={120} onCommit={(value) => update({ pomodoroFocus: value })} />
          <NumberField label={st("prefs_pomodoro_short")} value={settings.pomodoroShort} min={1} max={60} onCommit={(value) => update({ pomodoroShort: value })} />
          <NumberField label={st("prefs_pomodoro_long")} value={settings.pomodoroLong} min={1} max={90} onCommit={(value) => update({ pomodoroLong: value })} />
          <NumberField label={st("prefs_pomodoro_rounds")} value={settings.pomodoroRounds} min={2} max={8} onCommit={(value) => update({ pomodoroRounds: value })} />
        </div>
      </Block>

      <Block title={st("prefs_sound")}>
        <div className="flex flex-wrap gap-1.5">
          {TIMER_SOUNDS.map((sound: TimerSound) => (
            <button
              key={sound}
              type="button"
              aria-pressed={settings.timerSound === sound}
              onClick={() => {
                update({ timerSound: sound });
                playTimerSound(sound);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-[12.5px] transition",
                settings.timerSound === sound ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "border-[var(--border)] text-muted hover:text-ink"
              )}
            >
              {sound !== "none" ? <Volume2 className="size-3.5" /> : null}
              {st(`sound_${sound}` as StudyKey)}
            </button>
          ))}
        </div>
      </Block>

      <Block title={st("prefs_timezone")} hint={st("prefs_timezone_hint")}>
        <div className="relative max-w-md">
          <select
            value={settings.timeZone}
            onChange={(event) => update({ timeZone: event.target.value })}
            className="h-9 w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-[13px] text-ink outline-none focus:border-[var(--accent)]"
          >
            <option value="auto">{st("prefs_timezone_auto", { zone: deviceZone })}</option>
            {zones.map((entry) => (
              <option key={entry.zone} value={entry.zone}>
                {entry.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
        </div>
      </Block>
    </div>
  );
}
