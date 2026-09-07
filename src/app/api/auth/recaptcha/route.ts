import { ApiError, jsonError } from "@/lib/api/errors";
import { assessRecaptchaToken, verifyRecaptchaSecret } from "@/lib/recaptcha/assess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      throw new ApiError(400, "Confirme que você não é um robô.");
    }

    if (process.env.RECAPTCHA_SECRET_KEY) {
      const ok = await verifyRecaptchaSecret(token);
      if (!ok) {
        throw new ApiError(400, "Confirme que você não é um robô.");
      }
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
