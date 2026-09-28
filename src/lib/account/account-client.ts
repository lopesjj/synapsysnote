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

async function handleBlobDownload(response: Response): Promise<void> {
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const name =
    disposition.match(/filename="([^"]+)"/)?.[1] ??
    `synapsys-workspace-${new Date().toISOString().slice(0, 10)}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadAccountData(options?: { workspaceId?: string }): Promise<void> {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  const auth = getFirebaseAuth();
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login para continuar");
  const token = await user.getIdToken();
  const queryParts: string[] = [];
  if (options?.workspaceId) {
    queryParts.push(`workspaceId=${encodeURIComponent(options.workspaceId)}`);
  }
  queryParts.push(`token=${encodeURIComponent(token)}`);
  const endpoint = options?.workspaceId ? "/api/workspace/export" : "/api/account/export";
  const downloadUrl = `${endpoint}?${queryParts.join("&")}`;

  document.cookie = "synapsys_download_started=; Path=/; Max-Age=0";

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", `synapsys-${options?.workspaceId || "workspace"}-${new Date().toISOString().slice(0, 10)}.zip`);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 60_000);

  await new Promise<void>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (document.cookie.includes("synapsys_download_started=1") || Date.now() - start > 15_000) {
        clearInterval(interval);
        document.cookie = "synapsys_download_started=; Path=/; Max-Age=0";
        resolve();
      }
    }, 100);
  });
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
    keepalive: true,
  });
  if (!response.ok) throw await failure(response);
}
