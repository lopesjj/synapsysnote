import type { TranslationKey } from "@/lib/i18n/translations";
import { RecaptchaError } from "@/lib/recaptcha";
import { AuthError } from "./errors";

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function authErrorText(error: unknown, t: Translate, fallback: TranslationKey): string {
  if (error instanceof AuthError) {
    return t(`auth_error_${error.reason.replace(/-/g, "_")}` as TranslationKey);
  }
  if (error instanceof RecaptchaError) {
    return t(error.reason === "missing" ? "recaptcha_required" : "recaptcha_failed");
  }
  return t(fallback);
}
