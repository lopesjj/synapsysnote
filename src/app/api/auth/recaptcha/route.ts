import { ApiError, jsonError } from "@/lib/api/errors";
import { assessRecaptchaToken, getRecaptchaSecretKey, verifyRecaptchaSecret } from "@/lib/recaptcha/assess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      throw new ApiError(400, "Confirme que você não é um robô.");
    }

    const secretKey = getRecaptchaSecretKey();
    if (secretKey) {
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
