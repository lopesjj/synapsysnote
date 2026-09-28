import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { workspaceExportStream } from "@/lib/account/account-server";
import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    let user;
    if (token) {
      const decoded = await adminAuth().verifyIdToken(token);
      user = { uid: decoded.uid, email: decoded.email, name: decoded.name };
    } else {
      user = await requireUser(request);
    }
    const workspaceId = url.searchParams.get("workspaceId") || `ws_${user.uid}`;

    const source = workspaceExportStream(workspaceId, user.uid);
    const reader = source.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="synapsys-${workspaceId}-${stamp}.zip"`,
        "Cache-Control": "no-store",
        "Set-Cookie": "synapsys_download_started=1; Path=/; Max-Age=60; SameSite=Lax",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
