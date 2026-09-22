const SITE_KEY = "6LeOwqstAAAAAA43X5fUN0Ym5YI2Oq84kqxNPkVJ";

export function getRecaptchaSiteKey() {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || SITE_KEY;
}

export class RecaptchaError extends Error {
  readonly reason: "missing" | "failed";

  constructor(reason: "missing" | "failed", message: string) {
    super(message);
    this.name = "RecaptchaError";
    this.reason = reason;
  }
}

export function isRecaptchaEnabled() {
  return Boolean(getRecaptchaSiteKey());
}

export async function verifyRecaptchaToken(token: string | null) {
  if (!isRecaptchaEnabled()) return;
  if (!token) {
    throw new RecaptchaError("missing", "Confirme que você não é um robô.");
  }

  const response = await fetch("/api/auth/recaptcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new RecaptchaError("failed", payload.error || "Não foi possível validar o reCAPTCHA.");
  }
}
