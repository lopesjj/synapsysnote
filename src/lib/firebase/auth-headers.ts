"use client";

import { getFirebaseAuth } from "./client";

export async function firebaseAuthHeaders(): Promise<HeadersInit> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Faça login para continuar");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
