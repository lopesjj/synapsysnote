/**
 * Human-readable auth failures.
 *
 * Firebase error codes are stable but not presentable, and the OAuth
 * registration guard raises reasons Firebase has no code for. Everything the
 * sign-in screen can show is funnelled through `AuthError` so the UI never has
 * to pattern-match on provider strings.
 */

export type AuthErrorReason =
  /** OAuth succeeded but the e-mail has no account yet — sign-up is required first. */
  | "oauth-unregistered"
  /** The e-mail exists but was registered with a different provider. */
  | "wrong-provider"
  | "invalid-credentials"
  | "current-password"
  | "email-in-use"
  | "weak-password"
  | "invalid-email"
  | "popup-closed"
  | "too-many-requests"
  | "expired-reset"
  | "invalid-reset"
  | "network"
  | "unknown";

export class AuthError extends Error {
  readonly reason: AuthErrorReason;

  constructor(reason: AuthErrorReason, message: string) {
    super(message);
    this.name = "AuthError";
    this.reason = reason;
  }
}

const MESSAGES: Record<AuthErrorReason, string> = {
  "oauth-unregistered":
    "Este e-mail ainda não tem conta no Synapsys Note. Crie uma conta primeiro e depois entre com o provedor.",
  "wrong-provider":
    "Este e-mail já está cadastrado com outro método de acesso. Entre com o método usado no cadastro.",
  "invalid-credentials": "E-mail ou senha incorretos.",
  "current-password": "Senha atual incorreta.",
  "email-in-use": "Este e-mail já está cadastrado. Faça login.",
  "weak-password": "Use uma senha com pelo menos 6 caracteres.",
  "invalid-email": "Informe um e-mail válido.",
  "popup-closed": "A janela de login foi fechada antes de concluir.",
  "too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "expired-reset": "Este link de redefinição expirou. Peça outro em Esqueci a senha.",
  "invalid-reset": "Este link de redefinição é inválido. Peça outro em Esqueci a senha.",
  network: "Sem conexão com o servidor de autenticação. Verifique sua internet.",
  unknown: "Não foi possível concluir a autenticação. Tente novamente.",
};

const CODE_MAP: Record<string, AuthErrorReason> = {
  "auth/user-not-found": "invalid-credentials",
  "auth/wrong-password": "invalid-credentials",
  "auth/invalid-credential": "invalid-credentials",
  "auth/invalid-login-credentials": "invalid-credentials",
  "auth/email-already-in-use": "email-in-use",
  "auth/weak-password": "weak-password",
  "auth/invalid-email": "invalid-email",
  "auth/popup-closed-by-user": "popup-closed",
  "auth/cancelled-popup-request": "popup-closed",
  "auth/account-exists-with-different-credential": "wrong-provider",
  "auth/too-many-requests": "too-many-requests",
  "auth/expired-action-code": "expired-reset",
  "auth/invalid-action-code": "invalid-reset",
  "auth/missing-continue-uri": "unknown",
  "auth/network-request-failed": "network",
};

/** Normalises anything thrown by the auth flow into a presentable `AuthError`. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  const reason = CODE_MAP[code] ?? "unknown";
  return new AuthError(reason, MESSAGES[reason]);
}

export function authErrorMessage(reason: AuthErrorReason): string {
  return MESSAGES[reason];
}

export function createAuthError(reason: AuthErrorReason): AuthError {
  return new AuthError(reason, MESSAGES[reason]);
}
