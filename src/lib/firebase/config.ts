/**
 * Public Firebase web config. Safe to import from any client component — this
 * file must never import the Firebase SDK, so the landing page stays light.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export function getFirebaseWebConfig() {
  return firebaseConfig;
}

export function getFirebaseRegion() {
  return process.env.NEXT_PUBLIC_FIREBASE_REGION || "us-central1";
}

export function firebaseEmulatorsEnabled() {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}
