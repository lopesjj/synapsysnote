"use client";

import { Fragment, createElement, useCallback, type ReactNode } from "react";
import { formatTranslation, pluralFormIndex, useTranslation } from "@/lib/i18n/translations";
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

/**
 * Como `studyTranslate`, mas devolve pedaços: os parâmetros presentes em `nodes`
 * entram como elementos (para destacar números no meio da frase). As formas de
 * plural continuam vindo dos valores numéricos de `params`.
 */
export function studyTranslateParts(
  language: string,
  key: StudyKey,
  params: Record<string, string | number>,
  nodes: Record<string, ReactNode>
): ReactNode[] {
  const dict = STUDY_DICTIONARIES[language] ?? STUDY_DICTIONARIES.pt;
  const template = (dict[key] || STUDY_DICTIONARIES.pt[key] || key).replace(/\{([A-Za-z0-9_]+)\|([^{}]*)\}/g, (match, name: string, forms: string) => {
    const value = Number(params[name]);
    if (!Number.isFinite(value)) return match;
    const options = forms.split("|");
    return options[pluralFormIndex(language, value, options.length)] ?? options[options.length - 1];
  });
  return template.split(/(\{[A-Za-z0-9_]+\})/).map((piece, index) => {
    const name = /^\{([A-Za-z0-9_]+)\}$/.exec(piece)?.[1];
    if (!name) return piece;
    if (name in nodes) return createElement(Fragment, { key: index }, nodes[name]);
    return name in params ? String(params[name]) : piece;
  });
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
