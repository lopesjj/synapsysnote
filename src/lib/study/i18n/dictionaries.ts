"use client";

import { pt, type StudyStrings } from "./pt";

/**
 * Só o idioma em uso vai para o navegador. Os dez dicionários juntos pesam
 * ~138 KB comprimidos; um sozinho, ~14 KB — e eles iam no mesmo pedaço do
 * layout, ou seja, em toda página do app, inclusive nas de notas.
 *
 * O português fica estático: é o idioma padrão e o dicionário de origem, de
 * onde sai a chave que faltar em qualquer outro.
 */
const LOADERS: Record<string, () => Promise<StudyStrings>> = {
  en: () => import("./en").then((module) => module.en),
  es: () => import("./es").then((module) => module.es),
  fr: () => import("./fr").then((module) => module.fr),
  it: () => import("./it").then((module) => module.it),
  de: () => import("./de").then((module) => module.de),
  ru: () => import("./ru").then((module) => module.ru),
  ja: () => import("./ja").then((module) => module.ja),
  zh: () => import("./zh").then((module) => module.zh),
  ar: () => import("./ar").then((module) => module.ar),
};

const cache = new Map<string, StudyStrings>([["pt", pt]]);
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Dicionário já disponível; enquanto o do idioma não chega, vale o português. */
export function studyDictionary(language: string): StudyStrings {
  return cache.get(language) ?? pt;
}

export function studyDictionaryReady(language: string): boolean {
  return cache.has(language) || !LOADERS[language];
}

/** Dispara o carregamento do idioma. Chamar de novo não lê de novo. */
export function loadStudyDictionary(language: string): void {
  if (cache.has(language) || inflight.has(language)) return;
  const loader = LOADERS[language];
  if (!loader) return;
  inflight.set(
    language,
    loader()
      .then((dictionary) => {
        cache.set(language, dictionary);
      })
      .catch(() => {
        // Falhou o pedido do pedaço (rede caiu, deploy trocou): o português
        // segue valendo e a próxima tentativa pode dar certo.
      })
      .finally(() => {
        inflight.delete(language);
        for (const listener of [...listeners]) listener();
      })
  );
}

export function subscribeStudyDictionaries(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Versão do cache: muda a cada dicionário que entra, para o React repintar. */
export function studyDictionaryVersion(): number {
  return cache.size;
}
