import { ApiError, jsonError } from "@/lib/api/errors";
import { assessRecaptchaToken, verifyRecaptchaSecret } from "@/lib/recaptcha/assess";

export const runtime = "nodejs";

/**
 * POST /api/auth/recaptcha
 *
 * Classic siteverify first, then Enterprise CreateAssessment.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      throw new ApiError(400, "Confirme que você não é um robô.");
    }

    if (await verifyRecaptchaSecret(token)) {
      return Response.json({ ok: true, provider: "classic" });
    }

    await assessRecaptchaToken(token);
    return Response.json({ ok: true, provider: "enterprise" });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}
