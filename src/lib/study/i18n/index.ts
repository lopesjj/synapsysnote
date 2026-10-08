"use client";

import { Fragment, createElement, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { formatTranslation, pluralFormIndex, useTranslation } from "@/lib/i18n/translations";
import { intlLocale, splitDuration } from "../format";
import { pt } from "./pt";
import {
  loadStudyDictionary,
  studyDictionary,
  studyDictionaryReady,
  studyDictionaryVersion,
  subscribeStudyDictionaries,
} from "./dictionaries";

export type StudyKey = keyof typeof pt;
export type StudyDictionary = Record<StudyKey, string>;
export type StudyT = (key: StudyKey, params?: Record<string, string | number>) => string;

export function studyTranslate(
  language: string,
  key: StudyKey,
  params?: Record<string, string | number>
): string {
  const dict = studyDictionary(language);
  const template = dict[key] || pt[key] || key;
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
  const dict = studyDictionary(language);
  const template = (dict[key] || pt[key] || key).replace(/\{([A-Za-z0-9_]+)\|([^{}]*)\}/g, (match, name: string, forms: string) => {
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


/**
 * `true` quando o dicionário do idioma já está em memória. Antes disso o texto
 * sai em português, então as telas do módulo esperam por isto.
 */
export function useStudyDictionaryReady(): boolean {
  const { language } = useTranslation();
  loadStudyDictionary(language);
  const version = useSyncExternalStore(subscribeStudyDictionaries, studyDictionaryVersion, () => 0);
  void version;
  return studyDictionaryReady(language);
}

export function useStudyT() {
  const { language, textDir } = useTranslation();
  // Pedir cedo e repintar quando chegar: sem isto o primeiro desenho ficaria
  // em português para quem usa outro idioma.
  loadStudyDictionary(language);
  const version = useSyncExternalStore(subscribeStudyDictionaries, studyDictionaryVersion, () => 0);
  const st = useCallback<StudyT>(
    (key, params) => {
      void version;
      return studyTranslate(language, key, params);
    },
    [language, version]
  );
  const duration = useCallback((seconds: number) => durationText(seconds, st), [st]);
  return { st, language, textDir, locale: intlLocale(language), duration };
}
