"use client";

import { useCallback } from "react";
import { formatTranslation, useTranslation } from "@/lib/i18n/translations";
import { intlLocale, splitDuration } from "../format";
import { pt } from "./pt";
import { STUDY_DICTIONARIES } from "./dictionaries";

export type StudyKey = keyof typeof pt;
export type StudyDictionary = Record<StudyKey, string>;
export type StudyT = (key: StudyKey, params?: Record<string, string | number>) => string;

export function studyTranslate(
  language: string,
  key: StudyKey,
  params?: Record<string, string | number>
): string {
  const dict = STUDY_DICTIONARIES[language] ?? STUDY_DICTIONARIES.pt;
  const template = dict[key] || STUDY_DICTIONARIES.pt[key] || key;
  return formatTranslation(template, language, params);
}

export function durationText(seconds: number, st: StudyT): string {
  const { h, m } = splitDuration(seconds);
  if (h === 0) return st("dur_min", { m });
  if (m === 0) return st("dur_h", { h });
  return st("dur_hm", { h, m });
}

export function useStudyT() {
  const { language, textDir } = useTranslation();
  const st = useCallback<StudyT>((key, params) => studyTranslate(language, key, params), [language]);
  const duration = useCallback((seconds: number) => durationText(seconds, st), [st]);
  return { st, language, textDir, locale: intlLocale(language), duration };
}
