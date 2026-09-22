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

  const [{ GoogleAuthProvider, signInWithPopup }, { getFirebaseAuth }] = await Promise.all([
    import("firebase/auth"),
    import("@/lib/firebase/client"),
  ]);

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.readonly");
  provider.addScope("https://www.googleapis.com/auth/documents.readonly");
  provider.setCustomParameters({ prompt: "select_account" });

  const credentialResult = await signInWithPopup(getFirebaseAuth(), provider);
  const accessToken = GoogleAuthProvider.credentialFromResult(credentialResult)?.accessToken;
  if (!accessToken) {
    throw new Error("google_access_token_missing");
  }

  const user = credentialResult.user;
  const second = (await connect({
    accessToken,
    accountEmail: user.email || undefined,
    accountName: user.displayName || undefined,
    avatarUrl: user.photoURL || undefined,
  })) as GoogleConnectResponse;

  if (second?.redirectUrl) {
    window.location.href = second.redirectUrl;
    return { redirected: true };
  }

  return {
    redirected: false,
    accountName: second?.connected?.accountName || user.displayName || undefined,
  };
}
