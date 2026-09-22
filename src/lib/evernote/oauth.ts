import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";

export const EVERNOTE_OAUTH_COOKIE = "evernote_oauth_state";
export const EVERNOTE_MCP_RESOURCE = "https://mcp.evernote.com";
export const EVERNOTE_MCP_ENDPOINT = "https://mcp.evernote.com/mcp";
export const EVERNOTE_LOGIN_URL = "https://www.evernote.com/Login.action";
export const EVERNOTE_SCOPES = "read";

const PROTECTED_RESOURCE_METADATA = `${EVERNOTE_MCP_RESOURCE}/.well-known/oauth-protected-resource`;
const FALLBACK_ISSUER = "https://accounts.evernote.com";

export interface EvernoteOauthState {
  nonce: string;
  workspaceId: string;
  uid: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
}

export function encodeEvernoteOauthState(state: EvernoteOauthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeEvernoteOauthState(raw: string): EvernoteOauthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as EvernoteOauthState;
    if (!parsed.nonce || !parsed.workspaceId || !parsed.uid || !parsed.verifier) return null;
    if (!parsed.clientId || !parsed.redirectUri) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

let metadataCache: { value: AuthorizationServerMetadata; at: number } | null = null;

export async function discoverAuthorizationServer(): Promise<AuthorizationServerMetadata> {
  if (metadataCache && Date.now() - metadataCache.at < 3_600_000) return metadataCache.value;

  const issuers: string[] = [];
  try {
    const response = await fetch(PROTECTED_RESOURCE_METADATA, { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { authorization_servers?: string[] };
      for (const issuer of payload.authorization_servers ?? []) issuers.push(issuer);
    }
  } catch {}
  if (!issuers.includes(FALLBACK_ISSUER)) issuers.push(FALLBACK_ISSUER);

  for (const issuer of issuers) {
    const base = issuer.replace(/\/$/, "");
    for (const suffix of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
      try {
        const response = await fetch(`${base}${suffix}`, { cache: "no-store" });
        if (!response.ok) continue;
        const payload = (await response.json()) as AuthorizationServerMetadata;
        if (payload.authorization_endpoint && payload.token_endpoint) {
          metadataCache = { value: payload, at: Date.now() };
          return payload;
        }
      } catch {}
    }
  }

  throw new ApiError(502, "Não foi possível descobrir o servidor de autorização do Evernote.");
}

function clientDocId(redirectUri: string): string {
  return `evernote_${createHash("sha256").update(redirectUri).digest("hex").slice(0, 24)}`;
}

async function registerClient(
  metadata: AuthorizationServerMetadata,
  redirectUri: string
): Promise<string> {
  if (!metadata.registration_endpoint) {
    throw new ApiError(502, "O Evernote não expôs o endpoint de registro de clientes OAuth.");
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Synapsys Note",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: EVERNOTE_SCOPES,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    client_id?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.client_id) {
    throw new ApiError(
      502,
      payload.error_description || payload.error || "Falha ao registrar o aplicativo no Evernote."
    );
  }

  return payload.client_id;
}

export async function resolveClientId(
  metadata: AuthorizationServerMetadata,
  redirectUri: string
): Promise<string> {
  if (!isAdminConfigured()) return registerClient(metadata, redirectUri);

  const ref = adminDb().collection("oauthClients").doc(clientDocId(redirectUri));
  const snapshot = await ref.get();
  const cached = snapshot.exists ? (snapshot.get("clientId") as string | undefined) : undefined;
  if (cached) return cached;

  const clientId = await registerClient(metadata, redirectUri);
  await ref.set({ clientId, provider: "evernote", redirectUri, createdAt: Date.now() });
  return clientId;
}

export function buildAuthorizeUrl(input: {
  metadata: AuthorizationServerMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(input.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", EVERNOTE_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", EVERNOTE_MCP_RESOURCE);
  return url.toString();
}

export interface EvernoteTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number | null;
  scope?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function requestToken(
  metadata: AuthorizationServerMetadata,
  body: Record<string, string>
): Promise<EvernoteTokenSet> {
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new ApiError(
      response.status === 400 ? 401 : 502,
      payload.error_description || payload.error || "Falha na troca de tokens com o Evernote."
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : null,
    scope: payload.scope,
  };
}

export async function exchangeAuthorizationCode(input: {
  metadata: AuthorizationServerMetadata;
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<EvernoteTokenSet> {
  return requestToken(input.metadata, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
    resource: EVERNOTE_MCP_RESOURCE,
  });
}

export async function refreshAccessToken(input: {
  metadata: AuthorizationServerMetadata;
  refreshToken: string;
  clientId: string;
}): Promise<EvernoteTokenSet> {
  return requestToken(input.metadata, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    resource: EVERNOTE_MCP_RESOURCE,
  });
}

export interface EvernoteUserInfo {
  username?: string;
  displayName?: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export async function fetchUserInfo(
  metadata: AuthorizationServerMetadata,
  accessToken: string
): Promise<EvernoteUserInfo> {
  if (!metadata.userinfo_endpoint) return {};
  try {
    const response = await fetch(metadata.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email : null;
    const name =
      typeof payload.name === "string"
        ? payload.name
        : typeof payload.given_name === "string"
          ? payload.given_name
          : undefined;
    const username =
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : email
          ? email.split("@")[0]
          : undefined;
    return {
      username,
      displayName: name,
      email,
      avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return {};
  }
}

export async function revokeToken(
  metadata: AuthorizationServerMetadata,
  clientId: string,
  token: string
): Promise<void> {
  if (!metadata.revocation_endpoint) return;
  try {
    await fetch(metadata.revocation_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, client_id: clientId }),
    });
  } catch {}
}
