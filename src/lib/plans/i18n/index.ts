"use client";

import { useCallback } from "react";
import { formatTranslation, useTranslation } from "@/lib/i18n/translations";
import { intlLocale } from "@/lib/study/format";
import type { PlanId } from "../definitions";
import type { PlanErrorDetail } from "../errors";
import type { PlanStatus } from "../entitlements";
import { pt, type PlanStrings } from "./pt";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { de } from "./de";
import { ru } from "./ru";
import { ja } from "./ja";
import { zh } from "./zh";
import { ar } from "./ar";

export type PlanKey = keyof typeof pt;
export type PlanT = (key: PlanKey, params?: Record<string, string | number>) => string;

export const PLAN_DICTIONARIES: Record<string, PlanStrings> = { pt, en, es, fr, it, de, ru, ja, zh, ar };

export function planTranslate(language: string, key: PlanKey, params?: Record<string, string | number>): string {
  const dict = PLAN_DICTIONARIES[language] ?? pt;
  return formatTranslation(dict[key] || pt[key] || key, language, params);
}

const PLAN_NAME_KEYS: Record<PlanId | "guest", PlanKey> = {
  free: "plan_free",
  basic: "plan_basic",
  pro: "plan_pro",
  ultra: "plan_ultra",
  owner: "plan_owner",
  guest: "plan_guest",
};

const STATUS_NAME_KEYS: Record<PlanStatus, PlanKey> = {
  trial: "status_name_trial",
  active: "status_name_active",
  trial_ended: "status_name_trial_ended",
  expired: "status_name_expired",
  owner: "status_name_owner",
  guest: "status_name_guest",
};

export function planNameKey(plan: PlanId | "guest"): PlanKey {
  return PLAN_NAME_KEYS[plan];
}

export function statusNameKey(status: PlanStatus): PlanKey {
  return STATUS_NAME_KEYS[status];
}

export function planErrorText(detail: PlanErrorDetail, language: string, canArchive: boolean): string {
  const t = (key: PlanKey, params?: Record<string, string | number>) => planTranslate(language, key, params);
  if (detail.code === "read_only") return t("error_read_only");
  if (detail.code === "feature" && detail.feature) {
    const key = `error_feature_${detail.feature}` as PlanKey;
    return t(key);
  }
  if (detail.code === "limit" && detail.violation) {
    const { key, limit } = detail.violation;
    const hint = t(canArchive ? "limit_hint_archive" : "limit_hint");
    if (key === "subnotesPerNote" && limit === 0) return `${t("error_limit_subnotes_none")} ${hint}`;
    return `${t(`error_limit_${key}` as PlanKey, { limit })} ${hint}`;
  }
  return t("error_unavailable");
}

export function formatPlanDate(timestamp: number, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(timestamp)
  );
}

export function usePlanT() {
  const { language, textDir } = useTranslation();
  const tp = useCallback<PlanT>((key, params) => planTranslate(language, key, params), [language]);
  const date = useCallback((timestamp: number) => formatPlanDate(timestamp, language), [language]);
  return { tp, language, textDir, date };
}
