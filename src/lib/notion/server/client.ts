import "server-only";

import { Client } from "@notionhq/client";
import { adminDb } from "@/lib/firebase/admin";
import { decryptToken } from "@/lib/crypto/token-cipher";
import { ApiError } from "@/lib/api/errors";

export async function getNotionClient(workspaceId: string): Promise<Client> {
  const ref = adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("integrations")
    .doc("notion");

  const [integration, secret] = await Promise.all([
    ref.get(),
    ref.collection("secure").doc("token").get(),
  ]);

  if (!integration.exists || integration.get("connected") !== true) {
    throw new ApiError(404, "A integração com o Notion não está conectada.");
  }

  const cipher = secret.get("accessTokenCipher") as string | undefined;
  if (!cipher) {
    throw new ApiError(400, "Token do Notion ausente. Reconecte a integração.");
  }

  try {
    return new Client({
      auth: decryptToken(cipher),
      notionVersion: "2022-06-28",
    });
  } catch {
    throw new ApiError(401, "Token do Notion inválido ou corrompido. Reconecte a integração.");
  }
}

export function integrationRef(workspaceId: string) {
  return adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("integrations")
    .doc("notion");
}

export function importJobRef(workspaceId: string, jobId: string) {
  return adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("import_jobs")
    .doc(jobId);
}

export function pagesRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("pages");
}

export function databasesRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("databases");
}

export function notebooksRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("notebooks");
}

export function workspaceRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId);
}
