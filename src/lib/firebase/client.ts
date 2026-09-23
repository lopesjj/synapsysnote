"use client";


import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from "firebase/app-check";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { isRememberActive } from "@/lib/auth/remember";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  terminate,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import {
  getFirebaseRegion,
  getFirebaseWebConfig,
  isFirebaseConfigured,
  firebaseEmulatorsEnabled,
} from "./config";

export { isFirebaseConfigured } from "./config";

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Unset NEXT_PUBLIC_USE_LOCAL_DEMO or copy .env.example to .env.local."
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(getFirebaseWebConfig() as FirebaseOptions);
    startAppCheck(app);
  }
  return app;
}

function startAppCheck(instance: FirebaseApp) {
  const siteKey = process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY;
  if (!siteKey || typeof window === "undefined" || firebaseEmulatorsEnabled()) return;
  try {
    initializeAppCheck(instance, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("App Check indisponível:", error);
  }
}

export function getDb(): Firestore {
  if (firestore) return firestore;
  const instance = getFirebaseApp();
  try {
    setLogLevel("error");
    firestore = initializeFirestore(instance, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    firestore = initializeFirestore(instance, {
      localCache: memoryLocalCache(),
      ignoreUndefinedProperties: true,
      experimentalAutoDetectLongPolling: true,
    });
  }
  if (firebaseEmulatorsEnabled()) connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  return firestore;
}

export async function resetFirestoreCache(): Promise<void> {
  const current = firestore;
  if (!current) return;
  firestore = null;
  await terminate(current).catch(() => undefined);
  await clearIndexedDbPersistence(current).catch(() => undefined);
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  void setPersistence(auth, isRememberActive() ? browserLocalPersistence : browserSessionPersistence);
  if (firebaseEmulatorsEnabled()) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (storage) return storage;
  storage = getStorage(getFirebaseApp());
  if (firebaseEmulatorsEnabled()) connectStorageEmulator(storage, "127.0.0.1", 9199);
  return storage;
}

export function getFirebaseFunctions(): Functions {
  if (functions) return functions;
  functions = getFunctions(getFirebaseApp(), getFirebaseRegion());
  if (firebaseEmulatorsEnabled()) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return functions;
}
