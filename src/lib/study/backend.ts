"use client";

import {
  collection,
  doc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  runTransaction,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/firebase/client";

export const STUDY_COLLECTIONS = [
  "study_plans",
  "study_subjects",
  "study_sessions",
  "study_reviews",
  "study_exams",
  "study_cycles",
  "study_reminders",
  "study_stickies",
  "study_meta",
] as const;

export type StudyCollection = (typeof STUDY_COLLECTIONS)[number];

export type StudyDoc = Record<string, unknown> & { id: string };

/**
 * Coleções grandes o bastante para não serem lidas inteiras: tudo nelas pertence
 * a um objetivo, então a assinatura cobre só os objetivos abertos. O histórico
 * dos arquivados entra por `fetch`, quando a pessoa abre o arquivo.
 */
export const SCOPED_COLLECTIONS = ["study_sessions", "study_reviews", "study_exams"] as const;

export type ScopedCollection = (typeof SCOPED_COLLECTIONS)[number];

export function isScopedCollection(name: StudyCollection): name is ScopedCollection {
  return (SCOPED_COLLECTIONS as readonly string[]).includes(name);
}

/**
 * Teto do operador `in` do Firestore. Os planos limitam objetivos abertos a 5,
 * mas a conta do proprietário é ilimitada: acima do teto a assinatura volta a
 * ser da coleção inteira, que é o comportamento correto, só mais caro.
 */
export const MAX_SCOPE_IDS = 30;

export interface TransformResult {
  merge?: Record<string, unknown> | null;
  also?: PlainWrite[];
}

export type PlainWrite =
  | { kind: "set"; collection: StudyCollection; id: string; data: Record<string, unknown> }
  | { kind: "merge"; collection: StudyCollection; id: string; data: Record<string, unknown> }
  | { kind: "delete"; collection: StudyCollection; id: string };

export type StudyWrite =
  | PlainWrite
  | { kind: "transform"; collection: StudyCollection; id: string; apply: (current: StudyDoc | null) => TransformResult };

export interface StudyBackend {
  readonly key: string;
  /**
   * `planIds` restringe a assinatura aos documentos desses objetivos. `null`
   * assina a coleção inteira; uma lista vazia não lê nada.
   */
  subscribe(
    collection: StudyCollection,
    cb: (docs: StudyDoc[]) => void,
    onError?: (error: Error) => void,
    planIds?: readonly string[] | null
  ): () => void;
  /** Leitura única dos documentos de um objetivo, sem deixar assinatura aberta. */
  fetch(collection: ScopedCollection, planId: string): Promise<StudyDoc[]>;
  commit(writes: StudyWrite[]): Promise<void>;
  newId(): string;
}

export function cleanForStorage<T>(value: T, depth = 0): T {
  if (Array.isArray(value)) return value.map((item) => cleanForStorage(item, depth + 1)) as T;
  if (value && typeof value === "object" && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined || (depth === 0 && key === "id")) continue;
      out[key] = cleanForStorage(nested, depth + 1);
    }
    return out as T;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return 0 as T;
  return value;
}

const BATCH_LIMIT = 400;
const TRANSACTION_LIMIT = 450;

class FirestoreStudyBackend implements StudyBackend {
  readonly key: string;

  constructor(private readonly workspaceId: string) {
    this.key = `fs:${workspaceId}`;
  }

  private col(name: StudyCollection) {
    return collection(getDb(), "workspaces", this.workspaceId, name);
  }

  /**
   * `planId in [...]` é filtro de campo único: o índice automático do Firestore
   * já atende, nenhum índice composto precisa ser criado.
   */
  private scoped(name: StudyCollection, planIds: readonly string[] | null | undefined): Query<DocumentData> | null {
    const base = this.col(name);
    if (planIds == null) return base;
    if (!planIds.length) return null;
    if (planIds.length > MAX_SCOPE_IDS) return base;
    return query(base, where("planId", "in", [...planIds]));
  }

  subscribe(
    name: StudyCollection,
    cb: (docs: StudyDoc[]) => void,
    onError?: (error: Error) => void,
    planIds?: readonly string[] | null
  ) {
    const target = this.scoped(name, planIds);
    if (!target) {
      // Nenhum objetivo aberto: nada a ler, mas o provedor precisa saber que a
      // coleção chegou — senão a tela fica presa no carregando.
      queueMicrotask(() => cb([]));
      return () => {};
    }
    return onSnapshot(
      target,
      (snap) => {
        cb(snap.docs.map((entry) => ({ ...(entry.data() as DocumentData), id: entry.id })));
      },
      (error) => onError?.(error)
    );
  }

  async fetch(name: ScopedCollection, planId: string): Promise<StudyDoc[]> {
    const snap = await getDocs(query(this.col(name), where("planId", "==", planId)));
    return snap.docs.map((entry) => ({ ...(entry.data() as DocumentData), id: entry.id }));
  }

  private async batched(writes: PlainWrite[]): Promise<void> {
    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
      const batch = writeBatch(getDb());
      for (const write of writes.slice(start, start + BATCH_LIMIT)) {
        const ref = doc(this.col(write.collection), write.id);
        if (write.kind === "delete") batch.delete(ref);
        else if (write.kind === "merge") batch.set(ref, cleanForStorage(write.data), { merge: true });
        else batch.set(ref, cleanForStorage(write.data));
      }
      await batch.commit();
    }
  }

  async commit(writes: StudyWrite[]): Promise<void> {
    const transforms = writes.filter((write): write is Extract<StudyWrite, { kind: "transform" }> => write.kind === "transform");
    const plain = writes.filter((write): write is PlainWrite => write.kind !== "transform");
    if (!transforms.length) {
      await this.batched(plain);
      return;
    }
    const inline = plain.length + transforms.length * 2 <= TRANSACTION_LIMIT;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      await this.fromCache(transforms, plain);
      return;
    }
    try {
      await this.transact(transforms, plain, inline);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== "unavailable" && code !== "deadline-exceeded") throw error;
      await this.fromCache(transforms, plain);
      return;
    }
    if (!inline) await this.batched(plain);
  }

  private async fromCache(transforms: Extract<StudyWrite, { kind: "transform" }>[], plain: PlainWrite[]): Promise<void> {
    const resolved: PlainWrite[] = [];
    for (const write of transforms) {
      const ref = doc(this.col(write.collection), write.id);
      const snap = await getDocFromCache(ref).catch(() => null);
      const current = snap?.exists() ? ({ ...(snap.data() as DocumentData), id: snap.id } as StudyDoc) : null;
      const result = write.apply(current);
      if (result.merge) resolved.push({ kind: "merge", collection: write.collection, id: write.id, data: result.merge });
      if (result.also) resolved.push(...result.also);
    }
    await this.batched([...plain, ...resolved]);
  }

  private async transact(transforms: Extract<StudyWrite, { kind: "transform" }>[], plain: PlainWrite[], inline: boolean): Promise<void> {
    await runTransaction(getDb(), async (transaction) => {
      const snaps = await Promise.all(transforms.map((write) => transaction.get(doc(this.col(write.collection), write.id))));
      const resolved: PlainWrite[] = [];
      transforms.forEach((write, index) => {
        const snap = snaps[index];
        const current = snap.exists() ? ({ ...(snap.data() as DocumentData), id: snap.id } as StudyDoc) : null;
        const result = write.apply(current);
        if (result.merge) resolved.push({ kind: "merge", collection: write.collection, id: write.id, data: result.merge });
        if (result.also) resolved.push(...result.also);
      });
      for (const write of inline ? [...plain, ...resolved] : resolved) {
        const ref = doc(this.col(write.collection), write.id);
        if (write.kind === "delete") transaction.delete(ref);
        else if (write.kind === "merge") transaction.set(ref, cleanForStorage(write.data), { merge: true });
        else transaction.set(ref, cleanForStorage(write.data));
      }
    });
  }

  newId(): string {
    return doc(this.col("study_sessions")).id;
  }
}

/** Cada inscrito recorta o próprio escopo, então o aviso não carrega documentos. */
type Notify = () => void;

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      out[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

class LocalStudyBackend implements StudyBackend {
  readonly key = "local";
  private cache = new Map<StudyCollection, Map<string, StudyDoc>>();
  private listeners = new Map<StudyCollection, Set<Notify>>();

  private storageKey(name: StudyCollection) {
    return `synapsys.study.local.${name}`;
  }

  private load(name: StudyCollection): Map<string, StudyDoc> {
    let map = this.cache.get(name);
    if (map) return map;
    map = new Map();
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(this.storageKey(name));
        const parsed = raw ? (JSON.parse(raw) as StudyDoc[]) : [];
        for (const entry of parsed) if (entry && typeof entry.id === "string") map.set(entry.id, entry);
      } catch {}
    }
    this.cache.set(name, map);
    return map;
  }

  private persist(name: StudyCollection) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.storageKey(name), JSON.stringify([...this.load(name).values()]));
    } catch {}
  }

  private emit(name: StudyCollection) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener();
  }

  private snapshotOf(name: StudyCollection, planIds?: readonly string[] | null): StudyDoc[] {
    const docs = [...this.load(name).values()].map((entry) => ({ ...entry }));
    if (planIds == null) return docs;
    const allowed = new Set(planIds);
    return docs.filter((entry) => allowed.has(String(entry.planId ?? "")));
  }

  subscribe(
    name: StudyCollection,
    cb: (docs: StudyDoc[]) => void,
    _onError?: (error: Error) => void,
    planIds?: readonly string[] | null
  ) {
    // O filtro vale também aqui: o modo convidado precisa mostrar exatamente o
    // mesmo recorte que o Firestore, senão o que se vê muda com o backend.
    const emitScoped: Notify = () => cb(this.snapshotOf(name, planIds));
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(emitScoped);
    queueMicrotask(() => cb(this.snapshotOf(name, planIds)));
    return () => {
      set?.delete(emitScoped);
    };
  }

  async fetch(name: ScopedCollection, planId: string): Promise<StudyDoc[]> {
    return this.snapshotOf(name, [planId]);
  }

  async commit(writes: StudyWrite[]): Promise<void> {
    const touched = new Set<StudyCollection>();
    const expanded: PlainWrite[] = [];
    for (const write of writes) {
      if (write.kind !== "transform") {
        expanded.push(write);
        continue;
      }
      const current = this.load(write.collection).get(write.id);
      const result = write.apply(current ? { ...current } : null);
      if (result.merge) expanded.push({ kind: "merge", collection: write.collection, id: write.id, data: result.merge });
      if (result.also) expanded.push(...result.also);
    }
    for (const write of expanded) {
      const map = this.load(write.collection);
      touched.add(write.collection);
      if (write.kind === "delete") {
        map.delete(write.id);
      } else if (write.kind === "merge") {
        const current = map.get(write.id) ?? { id: write.id };
        map.set(write.id, { ...deepMerge(current, cleanForStorage(write.data)), id: write.id });
      } else {
        map.set(write.id, { ...cleanForStorage(write.data), id: write.id });
      }
    }
    for (const name of touched) {
      this.persist(name);
      this.emit(name);
    }
  }

  newId(): string {
    return nanoid(20);
  }
}

let localBackend: LocalStudyBackend | null = null;
const firestoreBackends = new Map<string, FirestoreStudyBackend>();

export function studyBackendFor(mode: "firestore" | "local", workspaceId: string): StudyBackend {
  if (mode === "local") {
    if (!localBackend) localBackend = new LocalStudyBackend();
    return localBackend;
  }
  let backend = firestoreBackends.get(workspaceId);
  if (!backend) {
    backend = new FirestoreStudyBackend(workspaceId);
    firestoreBackends.set(workspaceId, backend);
  }
  return backend;
}
