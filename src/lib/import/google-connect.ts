"use client";

import type { GoogleDocsIntegration } from "@/types/models";

export type GoogleConnectResponse = {
  redirectUrl?: string;
  requiresPopup?: boolean;
  connected?: GoogleDocsIntegration;
};

export type GoogleConnectFn = (input?: {
  accessToken?: string;
  accountEmail?: string;
  accountName?: string;
  avatarUrl?: string;
}) => Promise<GoogleConnectResponse | { connected: GoogleDocsIntegration } | { redirectUrl?: string }>;

export interface GoogleConnectResult {
  redirected: boolean;
  accountName?: string;
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents.readonly";

function errorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/**
 * Pede ao Google um token de leitura dos documentos sem trocar a conta logada.
 *
 * `signInWithPopup` fazia login com a conta escolhida no pop-up: escolher outra
 * conta Google tirava a pessoa da propria conta (ou criava uma nova). Aqui:
 * - quem entrou com Google reautentica a mesma conta, agora com os escopos;
 * - quem entrou com e-mail e senha vincula a conta Google so para obter o
 *   token, e o vinculo e desfeito logo depois.
 */
async function requestDriveToken() {
  const [{ GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup, unlink }, { getFirebaseAuth }] =
    await Promise.all([import("firebase/auth"), import("@/lib/firebase/client")]);

  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("guest_account_required");

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.addScope(DOCS_SCOPE);
  provider.setCustomParameters({ prompt: "select_account" });

  const hasGoogle = current.providerData.some((entry) => entry.providerId === "google.com");
  try {
    const result = hasGoogle
      ? await reauthenticateWithPopup(current, provider)
      : await linkWithPopup(current, provider);
    const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    const googleProfile = result.user.providerData.find((entry) => entry.providerId === "google.com");

    if (!hasGoogle) {
      // O vinculo so existia para pegar o token; o token continua valendo.
      await unlink(current, "google.com").catch(() => undefined);
    }

    if (!accessToken) throw new Error("google_access_token_missing");
    return {
      accessToken,
      accountEmail: googleProfile?.email ?? undefined,
      accountName: googleProfile?.displayName ?? undefined,
      avatarUrl: googleProfile?.photoURL ?? undefined,
    };
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/user-mismatch") throw new Error("google_account_mismatch");
    if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
      throw new Error("google_account_in_use");
    }
    throw error;
  }
}

export async function connectGoogleDocsAccount(
  connect: GoogleConnectFn
): Promise<GoogleConnectResult> {
  const first = (await connect()) as GoogleConnectResponse;

  if (first?.redirectUrl) {
    window.location.href = first.redirectUrl;
    return { redirected: true };
  }

  if (first?.connected) {
    return { redirected: false, accountName: first.connected.accountName };
  }

  const token = await requestDriveToken();
  const second = (await connect(token)) as GoogleConnectResponse;

  if (second?.redirectUrl) {
    window.location.href = second.redirectUrl;
    return { redirected: true };
  }

  return {
    redirected: false,
    accountName: second?.connected?.accountName || token.accountName,
  };
}
