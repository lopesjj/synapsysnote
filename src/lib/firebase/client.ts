"use client";

/**
 * Firebase client SDK bootstrap.
 *
 * Import this module only from authenticated app surfaces. The landing page
 * must not pull it in — use `@/lib/firebase/config` for the public flag.
 */

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
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
  }
  return app;
}

/**
 * Firestore with native offline persistence. `persistentMultipleTabManager`
 * keeps several browser tabs consistent while still serving cached reads when
 * the network drops.
 */
export function getDb(): Firestore {
  if (firestore) return firestore;
  const instance = getFirebaseApp();
  try {
    firestore = initializeFirestore(instance, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    firestore = initializeFirestore(instance, { localCache: memoryLocalCache() });
  }
  if (firebaseEmulatorsEnabled()) connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  return firestore;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  void setPersistence(auth, browserLocalPersistence);
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
