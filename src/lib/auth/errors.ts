
export type AuthErrorReason =
  | "oauth-unregistered"
  | "wrong-provider"
  | "invalid-credentials"
  | "current-password"
  | "email-in-use"
  | "weak-password"
  | "invalid-email"
  | "popup-closed"
  | "too-many-requests"
  | "session"
  | "recent-login"
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
  "weak-password": "Use uma senha com pelo menos 8 caracteres.",
  "invalid-email": "Informe um e-mail válido.",
  "popup-closed": "A janela de login foi fechada antes de concluir.",
  "too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  session: "Não foi possível concluir a sessão. Tente entrar novamente.",
  "recent-login": "Por segurança, entre novamente antes de alterar a senha.",
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
  "auth/password-does-not-meet-requirements": "weak-password",
  "auth/invalid-email": "invalid-email",
  "auth/popup-closed-by-user": "popup-closed",
  "auth/cancelled-popup-request": "popup-closed",
  "auth/account-exists-with-different-credential": "wrong-provider",
  "auth/too-many-requests": "too-many-requests",
  "auth/requires-recent-login": "recent-login",
  "auth/expired-action-code": "expired-reset",
  "auth/invalid-action-code": "invalid-reset",
  "auth/missing-continue-uri": "unknown",
  "auth/network-request-failed": "network",
};

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
