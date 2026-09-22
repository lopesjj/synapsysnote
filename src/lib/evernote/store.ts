import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { decryptToken, encryptToken, tokenPreview } from "@/lib/crypto/token-cipher";
import { ApiError } from "@/lib/api/errors";
import { EvernoteMcpClient } from "./mcp";
import {
  discoverAuthorizationServer,
  refreshAccessToken,
  revokeToken,
  type EvernoteTokenSet,
  type EvernoteUserInfo,
} from "./oauth";

const INTEGRATION_ID = "evernote";

function integrationRef(workspaceId: string) {
  return adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("integrations")
    .doc(INTEGRATION_ID);
}

function secureRef(workspaceId: string) {
  return integrationRef(workspaceId).collection("secure").doc("token");
}

export async function saveEvernoteConnection(input: {
  workspaceId: string;
  uid: string;
  clientId: string;
  tokens: EvernoteTokenSet;
  user: EvernoteUserInfo;
}): Promise<void> {
  if (!isAdminConfigured()) {
    throw new ApiError(503, "Firebase Admin não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON.");
  }

  const username = input.user.username || input.user.email?.split("@")[0] || "evernote";
  const displayName = input.user.displayName || input.user.email || "Conta Evernote";

  const db = adminDb();
  await db.runTransaction(async (tx) => {
    tx.set(
      integrationRef(input.workspaceId),
      {
        id: INTEGRATION_ID,
        provider: INTEGRATION_ID,
        connected: true,
        username,
        displayName,
        accountEmail: input.user.email ?? null,
        avatarUrl: input.user.avatarUrl ?? null,
        scopes: (input.tokens.scope || "read").split(/\s+/).filter(Boolean),
        tokenPreview: tokenPreview(input.tokens.accessToken),
        connectedBy: input.uid,
        connectedAt: FieldValue.serverTimestamp(),
        lastSyncAt: null,
        revokedAt: null,
      },
      { merge: true }
    );

    tx.set(secureRef(input.workspaceId), {
      accessTokenCipher: encryptToken(input.tokens.accessToken),
      ...(input.tokens.refreshToken
        ? { refreshTokenCipher: encryptToken(input.tokens.refreshToken) }
        : {}),
      clientId: input.clientId,
      expiresAt: input.tokens.expiresAt ?? null,
      rotatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function clearEvernoteConnection(workspaceId: string): Promise<void> {
  if (!isAdminConfigured()) return;

  const snapshot = await secureRef(workspaceId).get();
  if (snapshot.exists) {
    const clientId = snapshot.get("clientId") as string | undefined;
    const cipher = snapshot.get("refreshTokenCipher") ?? snapshot.get("accessTokenCipher");
    if (clientId && typeof cipher === "string") {
      try {
        const metadata = await discoverAuthorizationServer();
        await revokeToken(metadata, clientId, decryptToken(cipher));
      } catch {}
    }
  }

  const db = adminDb();
  await db.runTransaction(async (tx) => {
    tx.set(
      integrationRef(workspaceId),
      { connected: false, revokedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.delete(secureRef(workspaceId));
  });
}

export async function markEvernoteSync(workspaceId: string): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    await integrationRef(workspaceId).set(
      { lastSyncAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch {}
}

export async function getEvernoteClient(workspaceId: string): Promise<EvernoteMcpClient> {
  if (!isAdminConfigured()) {
    throw new ApiError(503, "Firebase Admin não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON.");
  }

  const snapshot = await secureRef(workspaceId).get();
  if (!snapshot.exists) {
    throw new ApiError(401, "A conta do Evernote não está conectada.");
  }

  const accessCipher = snapshot.get("accessTokenCipher") as string | undefined;
  const refreshCipher = snapshot.get("refreshTokenCipher") as string | undefined;
  const clientId = snapshot.get("clientId") as string | undefined;
  const expiresAt = snapshot.get("expiresAt") as number | null | undefined;

  if (!accessCipher) {
    throw new ApiError(401, "A conta do Evernote não está conectada.");
  }

  const stillValid = !expiresAt || expiresAt - Date.now() > 60_000;
  if (stillValid) {
    return new EvernoteMcpClient(decryptToken(accessCipher));
  }

  if (!refreshCipher || !clientId) {
    throw new ApiError(401, "A sessão do Evernote expirou. Conecte a conta novamente.");
  }

  const metadata = await discoverAuthorizationServer();
  const refreshed = await refreshAccessToken({
    metadata,
    refreshToken: decryptToken(refreshCipher),
    clientId,
  });

  await secureRef(workspaceId).set(
    {
      accessTokenCipher: encryptToken(refreshed.accessToken),
      ...(refreshed.refreshToken
        ? { refreshTokenCipher: encryptToken(refreshed.refreshToken) }
        : {}),
      expiresAt: refreshed.expiresAt ?? null,
      rotatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await integrationRef(workspaceId).set(
    { tokenPreview: tokenPreview(refreshed.accessToken) },
    { merge: true }
  );

  return new EvernoteMcpClient(refreshed.accessToken);
}
