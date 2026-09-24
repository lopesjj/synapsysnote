
export const SYNAPSYS_FIREBASE_WEB = {
  apiKey: "AIzaSyCohAmoFuvjw-OXao3a_9yn0b-H22reprw",
  authDomain: "synapsysnt.com.br",
  projectId: "synapsysnote",
  storageBucket: "synapsysnote.firebasestorage.app",
  messagingSenderId: "391599702512",
  appId: "1:391599702512:web:f1948d41d3f63ad340dd35",
  measurementId: "G-2ED1GY38CC",
} as const;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || SYNAPSYS_FIREBASE_WEB.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || SYNAPSYS_FIREBASE_WEB.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || SYNAPSYS_FIREBASE_WEB.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || SYNAPSYS_FIREBASE_WEB.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || SYNAPSYS_FIREBASE_WEB.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || SYNAPSYS_FIREBASE_WEB.appId,
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || SYNAPSYS_FIREBASE_WEB.measurementId,
};

export function isFirebaseConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_DEMO === "true") return false;
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export function getFirebaseWebConfig() {
  return firebaseConfig;
}

export function getFirebaseRegion() {
  return process.env.NEXT_PUBLIC_FIREBASE_REGION || "southamerica-east1";
}

export function firebaseEmulatorsEnabled() {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}
