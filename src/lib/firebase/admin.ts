import "server-only";


import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const ADMIN_APP = "synapsys-admin";

export interface ServiceAccountCredentials {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function readJsonFile(path: string): ServiceAccountCredentials | null {
  try {
    const resolved = isAbsolute(path) ? path : resolve(/*turbopackIgnore: true*/ process.cwd(), path);
    if (!existsSync(resolved)) return null;
    return JSON.parse(readFileSync(resolved, "utf-8")) as ServiceAccountCredentials;
  } catch {
    return null;
  }
}

export function resolveServiceAccountCredentials(): ServiceAccountCredentials | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    if (raw.startsWith("{")) {
      try {
        return JSON.parse(raw) as ServiceAccountCredentials;
      } catch (err) {
        console.error("[firebase-admin] Falha ao analisar FIREBASE_SERVICE_ACCOUNT_JSON:", err);
      }
    }
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      if (decoded.trim().startsWith("{")) {
        return JSON.parse(decoded) as ServiceAccountCredentials;
      }
    } catch {}
    const fromPath = readJsonFile(raw);
    if (fromPath) return fromPath;
  }

  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credsPath) {
    const fromPath = readJsonFile(credsPath);
    if (fromPath) return fromPath;
    console.error("[firebase-admin] Falha ao carregar GOOGLE_APPLICATION_CREDENTIALS:", credsPath);
  }

  // Chave baixada do console e deixada na raiz do projeto: so para scripts e
  // desenvolvimento local. Em producao a credencial vem do secret (ou do ADC).
  if (process.env.NODE_ENV === "production") return null;
  try {
    const root = /*turbopackIgnore: true*/ process.cwd();
    const matched = readdirSync(root).find((f) => f.includes("firebase-adminsdk") && f.endsWith(".json"));
    if (matched) return readJsonFile(resolve(root, matched));
  } catch {}

  return null;
}

export function isAdminConfigured(): boolean {
  return Boolean(
    resolveServiceAccountCredentials() ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP);
  if (existing) return existing;

  const creds = resolveServiceAccountCredentials();
  const projectId =
    creds?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "synapsysnote";
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;

  if (creds?.client_email && creds?.private_key) {
    return initializeApp(
      {
        credential: cert({
          projectId: creds.project_id || projectId,
          clientEmail: creds.client_email,
          privateKey: creds.private_key.replace(/\\n/g, "\n"),
        }),
        storageBucket,
        projectId,
      },
      ADMIN_APP
    );
  }

  try {
    return initializeApp({ projectId, storageBucket }, ADMIN_APP);
  } catch {
    return getApp(ADMIN_APP);
  }
}

let adminFirestore: Firestore | null = null;

export function adminDb(): Firestore {
  if (adminFirestore) return adminFirestore;
  const db = getFirestore(getAdminApp());
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {}
  adminFirestore = db;
  return db;
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminBucket() {
  const app = getAdminApp();
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "synapsysnote.firebasestorage.app";
  return getStorage(app).bucket(bucketName);
}

export async function verifyBearer(request: Request): Promise<{ uid: string; email?: string } | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(header.slice(7));
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
