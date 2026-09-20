import type { TranslationKey } from "@/lib/i18n/translations";
import type { IntervalLabels } from "./srs";

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string;

export function intervalLabels(t: Translate): IntervalLabels {
  return {
    minutes: (value) => t("interval_minutes", { count: value }),
    day: t("interval_day"),
    days: (value) => t("interval_days", { count: value }),
    month: t("interval_month"),
    months: (value) => t("interval_months", { count: value }),
    year: t("interval_year"),
    years: (value) => t("interval_years", { count: value }),
  };
}

export function formatDuration(totalSeconds: number, t: Translate): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return t("duration_seconds", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest === 0
      ? t("duration_minutes", { count: minutes })
      : t("duration_minutes_seconds", { minutes, seconds: rest });
  }
  const hours = Math.floor(minutes / 60);
  return t("duration_hours_minutes", { hours, minutes: minutes % 60 });
}
