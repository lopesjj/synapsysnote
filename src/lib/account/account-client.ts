"use client";

import { firebaseAuthHeaders } from "@/lib/firebase/auth-headers";
import { createAuthError, toAuthError } from "@/lib/auth/errors";

async function currentUser() {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  const user = getFirebaseAuth().currentUser;
  if (!user) throw createAuthError("recent-login");
  return user;
}

export async function usesPassword(): Promise<boolean> {
  const user = await currentUser();
  return user.providerData.some((provider) => provider.providerId === "password");
}

export async function reauthenticate(password?: string): Promise<void> {
  const [{ EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup }, user] =
    await Promise.all([import("firebase/auth"), currentUser()]);
  try {
    if (password && user.email) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account", login_hint: user.email ?? "" });
      await reauthenticateWithPopup(user, provider);
    }
    await user.getIdToken(true);
  } catch (error) {
    throw toAuthError(error);
  }
}

async function failure(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(payload.error || `Falha na API (${response.status})`);
}

const EXPORT_TIMEOUT_MS = 60 * 60 * 1000;

export async function downloadAccountData(): Promise<void> {
  const [{ httpsCallable }, { getDownloadURL, ref }, { getFirebaseFunctions, getFirebaseStorage }] = await Promise.all([
    import("firebase/functions"),
    import("firebase/storage"),
    import("@/lib/firebase/client"),
  ]);
  await currentUser();
  const exportAccount = httpsCallable<void, { path: string }>(getFirebaseFunctions(), "exportAccountData", {
    timeout: EXPORT_TIMEOUT_MS,
  });
  const { data } = await exportAccount();
  const url = await getDownloadURL(ref(getFirebaseStorage(), data.path));
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function revokeAllSessions(): Promise<void> {
  const headers = await firebaseAuthHeaders();
  const response = await fetch("/api/account/sessions", { method: "DELETE", headers });
  if (!response.ok) throw await failure(response);
}

export async function deleteMyAccount(): Promise<void> {
  const headers = await firebaseAuthHeaders();
  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers,
    body: JSON.stringify({ confirm: true }),
  });
  if (!response.ok) throw await failure(response);
}
