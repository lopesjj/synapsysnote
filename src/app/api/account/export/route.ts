import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { accountExportStream } from "@/lib/account/account-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const running = new Set<string>();

export async function GET(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    const user = await requireUser(request);
    if (running.has(user.uid)) throw new ApiError(429, "Uma exportação já está em andamento.");
    running.add(user.uid);

    const source = accountExportStream(user.uid);
    const reader = source.getReader();
    const release = () => running.delete(user.uid);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            release();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          release();
          controller.error(error);
        }
      },
      cancel(reason) {
        release();
        return reader.cancel(reason);
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="synapsys-note-dados-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
