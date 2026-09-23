import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { adminDb } from "@/lib/firebase/admin";
import { LEGAL_VERSION } from "@/lib/legal/entity";

export const runtime = "nodejs";

/**
 * Aceite dos Termos e da Politica. Gravado pelo servidor, com a hora do
 * servidor: as regras do Firestore nao deixam o navegador escrever esses
 * campos, entao o registro serve de prova do aceite.
 */
export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const user = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { version?: string };
    if (body.version !== LEGAL_VERSION) {
      throw new ApiError(409, "Versão dos documentos desatualizada. Recarregue a página.");
    }

    const acceptedAt = Date.now();
    await adminDb()
      .collection("users")
      .doc(user.uid)
      .set(
        { uid: user.uid, legalAcceptedVersion: LEGAL_VERSION, legalAcceptedAt: acceptedAt },
        { merge: true }
      );
    return Response.json({ ok: true, version: LEGAL_VERSION, acceptedAt });
  } catch (error) {
    return jsonError(error);
  }
}
