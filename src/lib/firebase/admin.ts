import "server-only";

/**
 * ETAPA 2 — Firebase Admin SDK (server-only).
 *
 * Used by the Notion OAuth callback route, which must persist encrypted tokens
 * under /workspaces/{id}/integrations/notion — a path the security rules close
 * to every client.
 *
 * Credentials resolve in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  (inline JSON, ideal for Vercel)
 *   2. GOOGLE_APPLICATION_CREDENTIALS (file path, ideal for Cloud Run / local)
 *   3. Application Default Credentials (Cloud Functions / GCE metadata)
 */

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const ADMIN_APP = "synapsys-admin";

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_PROJECT_ID
  );
}

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (raw) {
    const parsed = JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return initializeApp(
      {
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          // Vercel-style env vars escape newlines.
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        }),
        storageBucket,
      },
      ADMIN_APP
    );
  }

  try {
    return initializeApp({ storageBucket }, ADMIN_APP);
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
  } catch {
    // settings() can only run once per app instance
  }
  adminFirestore = db;
  return db;
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminBucket() {
  return getStorage(getAdminApp()).bucket();
}

/** Verifies the `Authorization: Bearer <idToken>` header of an API route. */
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
