"use client";

export type AccessEvent = "login" | "session";

const ACCESS_SESSION_KEY = "synapsys.access.session";

let memorySessionUid: string | null = null;

function readSessionUid(): string | null {
  try {
    return window.sessionStorage.getItem(ACCESS_SESSION_KEY) ?? memorySessionUid;
  } catch {
    return memorySessionUid;
  }
}

function writeSessionUid(uid: string): void {
  memorySessionUid = uid;
  try {
    window.sessionStorage.setItem(ACCESS_SESSION_KEY, uid);
  } catch {}
}

export function forgetAccessSession(): void {
  memorySessionUid = null;
  try {
    window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
  } catch {}
}

export async function reportAccess(event: AccessEvent): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const [{ getFirebaseAuth }, { firebaseAuthHeaders }] = await Promise.all([
      import("@/lib/firebase/client"),
      import("@/lib/firebase/auth-headers"),
    ]);
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;
    if (event === "session" && readSessionUid() === uid) return;
    writeSessionUid(uid);
    await fetch("/api/auth/access", {
      method: "POST",
      headers: await firebaseAuthHeaders(),
      body: JSON.stringify({ event }),
      keepalive: true,
    });
  } catch {}
}
