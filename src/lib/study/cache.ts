"use client";

import { STUDY_COLLECTIONS, type StudyCollection, type StudyDoc } from "./backend";

const PREFIX = "synapsys.cache.study.";

const REQUIRED: StudyCollection[] = [
  "study_plans",
  "study_subjects",
  "study_meta",
  "study_sessions",
  "study_exams",
  "study_reviews",
  "study_cycles",
  "study_reminders",
];

type CacheFile = { collections: Partial<Record<StudyCollection, StudyDoc[]>> };

const memory = new Map<string, Partial<Record<StudyCollection, StudyDoc[]>>>();
const timers = new Map<string, number>();
const written = new Set<string>();

function isDoc(value: unknown): value is StudyDoc {
  return Boolean(value) && typeof value === "object" && typeof (value as StudyDoc).id === "string";
}

function complete(collections: Partial<Record<StudyCollection, StudyDoc[]>>) {
  return REQUIRED.every((name) => Array.isArray(collections[name]));
}

function slim(collections: Partial<Record<StudyCollection, StudyDoc[]>>) {
  const next: Partial<Record<StudyCollection, StudyDoc[]>> = {};
  for (const name of STUDY_COLLECTIONS) {
    const docs = collections[name];
    if (!docs) continue;
    if (name === "study_sessions") {
      next[name] = docs.map((doc) => ({ ...doc, comment: "" }));
    } else if (name === "study_stickies") {
      next[name] = docs.map((doc) => ({ ...doc, html: "" }));
    } else {
      next[name] = docs;
    }
  }
  return next;
}

function persist(backendKey: string, collections: Partial<Record<StudyCollection, StudyDoc[]>>) {
  const key = PREFIX + backendKey;
  try {
    window.localStorage.setItem(key, JSON.stringify({ collections } satisfies CacheFile));
    written.add(backendKey);
  } catch {
    try {
      window.localStorage.setItem(key, JSON.stringify({ collections: slim(collections) } satisfies CacheFile));
      written.add(backendKey);
    } catch {}
  }
}

export function readStudyCache(backendKey: string): Partial<Record<StudyCollection, StudyDoc[]>> | null {
  if (typeof window === "undefined" || !backendKey) return null;
  // Trocar de idioma remonta o provedor (o idioma é um segmento da rota). O que
  // já foi carregado nesta sessão volta daqui inteiro e na hora, sem releitura
  // do localStorage — que guarda uma versão enxuta — nem espera pelo Firestore.
  const live = memory.get(backendKey);
  if (live && complete(live)) return { ...live };
  try {
    const raw = window.localStorage.getItem(PREFIX + backendKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheFile;
    const collections = parsed?.collections;
    if (!collections || typeof collections !== "object") return null;
    const clean: Partial<Record<StudyCollection, StudyDoc[]>> = {};
    for (const name of STUDY_COLLECTIONS) {
      const docs = collections[name];
      if (!Array.isArray(docs)) continue;
      clean[name] = docs.filter(isDoc);
    }
    return complete(clean) ? clean : null;
  } catch {
    return null;
  }
}

export function rememberStudyCollection(backendKey: string, name: StudyCollection, docs: StudyDoc[]) {
  if (typeof window === "undefined" || !backendKey) return;
  const current = memory.get(backendKey) ?? {};
  current[name] = docs;
  memory.set(backendKey, current);
  if (!complete(current)) return;
  const snapshot = { ...current };
  const write = () => persist(backendKey, snapshot);
  const pending = timers.get(backendKey);
  if (pending) window.clearTimeout(pending);
  if (!written.has(backendKey)) {
    write();
    return;
  }
  timers.set(
    backendKey,
    window.setTimeout(() => {
      timers.delete(backendKey);
      write();
    }, 400)
  );
}
