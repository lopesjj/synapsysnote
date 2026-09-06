import { isSplitHosts } from "@/lib/domains";
import { createAuthError } from "@/lib/auth/errors";

let skipHydrate = false;

export function suppressSessionHydrate() {
  skipHydrate = true;
}

async function firebaseAuth() {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  return getFirebaseAuth();
}

export async function persistCrossHostSession(remember: boolean) {
  if (!isSplitHosts()) return;
  const auth = await firebaseAuth();
  const user = auth.currentUser;
  if (!user) return;
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, remember }),
  });
  if (!response.ok) {
    throw createAuthError("session");
  }
}

export async function hydrateFromSessionCookie(): Promise<boolean> {
  if (skipHydrate || !isSplitHosts()) return false;
  const response = await fetch("/api/auth/session/token", { credentials: "include" });
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => ({}))) as { token?: string };
  if (!payload.token) return false;

  const [{ signInWithCustomToken }, auth] = await Promise.all([
    import("firebase/auth"),
    firebaseAuth(),
  ]);
  await signInWithCustomToken(auth, payload.token);
  return true;
}

export async function clearCrossHostSession() {
  if (!isSplitHosts()) return;
  let response: Response;
  try {
    response = await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
  } catch {
    throw createAuthError("session");
  }
  if (!response.ok) throw createAuthError("session");
}
