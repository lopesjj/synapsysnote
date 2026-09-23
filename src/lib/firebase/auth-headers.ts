"use client";

import { getFirebaseAuth } from "./client";
import { isFirebaseConfigured } from "./config";

export async function firebaseAuthHeaders(): Promise<HeadersInit> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Faça login para continuar");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Cabecalho de autorizacao quando ha alguem logado; vazio no modo demo ou antes
 * do login. Para rotas que tambem aceitam o cookie de sessao.
 */
export async function optionalAuthHeader(): Promise<Record<string, string>> {
  try {
    if (!isFirebaseConfigured()) return {};
    const user = getFirebaseAuth().currentUser;
    if (!user) return {};
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

export async function firebaseJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = await firebaseAuthHeaders();
  const response = await fetch(input, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Falha na API (${response.status})`);
  }
  return payload;
}
