import "server-only";

import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { SYNAPSYS_FIREBASE_WEB } from "@/lib/firebase/config";
import { getRecaptchaSiteKey } from "@/lib/recaptcha";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || SYNAPSYS_FIREBASE_WEB.projectId;
const MIN_SCORE = 0.5;

type Assessment = {
  tokenProperties?: { valid?: boolean; action?: string };
  riskAnalysis?: { score?: number };
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as ServiceAccount;
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!filePath) return null;
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as ServiceAccount;
  return {
    ...parsed,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function googleAuth() {
  const account = loadServiceAccount();
  if (!account) return null;

  return new GoogleAuth({
    credentials: {
      client_email: account.client_email,
      private_key: account.private_key,
    },
    projectId: account.project_id || PROJECT_ID,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
}

export async function assessRecaptchaToken(token: string) {
  const siteKey = getRecaptchaSiteKey();
  const auth = googleAuth();
  if (!auth) {
    throw new Error("reCAPTCHA Enterprise sem credencial do Google Cloud.");
  }

  const client = await Promise.race([
    auth.getClient(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("reCAPTCHA: tempo esgotado ao autenticar.")), 8000)
    ),
  ]);
  const accessToken = await Promise.race([
    client.getAccessToken(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("reCAPTCHA: tempo esgotado ao autenticar.")), 8000)
    ),
  ]);
  if (!accessToken.token) {
    throw new Error("Não foi possível autenticar o reCAPTCHA no Google Cloud.");
  }

  const response = await fetch(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: {
          token,
          siteKey,
        },
      }),
      signal: AbortSignal.timeout(8000),
    }
  );

  const assessment = (await response.json()) as Assessment & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(assessment.error?.message || "Falha ao validar o reCAPTCHA.");
  }

  if (assessment.tokenProperties?.valid === false) {
    throw new Error("Confirme que você não é um robô.");
  }

  const score = assessment.riskAnalysis?.score;
  if (typeof score === "number" && score < MIN_SCORE) {
    throw new Error("Confirme que você não é um robô.");
  }
}

async function siteverify(secret: string, token: string) {
  const payload = new URLSearchParams({ secret, response: token });
  const google = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  const result = (await google.json()) as { success?: boolean; "error-codes"?: string[] };
  if (!result.success) {
    console.warn("[recaptcha] siteverify rejeitado:", result["error-codes"]);
  }
  return Boolean(result.success);
}

export async function verifyRecaptchaSecret(token: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) return false;
  return siteverify(secret, token);
}
