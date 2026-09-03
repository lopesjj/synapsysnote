"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";

async function firebaseAuth() {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  return getFirebaseAuth();
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  /** "firebase" when credentials are present, "demo" for the local fallback. */
  mode: "firebase" | "demo";
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_KEY = "synapsys.demo-user";
const DEMO_EVENT = "synapsys:demo-user";

const DEMO_USER: AppUser = {
  uid: "demo-user",
  email: "voce@synapsys.note",
  displayName: "Você",
  photoURL: null,
};

/** `useSyncExternalStore` requires a stable snapshot reference between store updates. */
let demoSnapshotRaw: string | null = null;
let demoSnapshot: AppUser | null = null;

function readDemoUser(): AppUser | null {
  try {
    const stored = window.localStorage.getItem(DEMO_KEY);
    if (stored === demoSnapshotRaw) return demoSnapshot;
    demoSnapshotRaw = stored;
    demoSnapshot = stored ? (JSON.parse(stored) as AppUser) : null;
    return demoSnapshot;
  } catch {
    demoSnapshotRaw = null;
    demoSnapshot = null;
    return null;
  }
}

function subscribeDemo(callback: () => void) {
  window.addEventListener(DEMO_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DEMO_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function writeDemoUser(next: AppUser | null) {
  if (next) window.localStorage.setItem(DEMO_KEY, JSON.stringify(next));
  else window.localStorage.removeItem(DEMO_KEY);
  demoSnapshotRaw = next ? JSON.stringify(next) : null;
  demoSnapshot = next;
  window.dispatchEvent(new Event(DEMO_EVENT));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const demoUser = useSyncExternalStore(subscribeDemo, readDemoUser, () => null);

  const [firebaseUser, setFirebaseUser] = useState<AppUser | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let unsub = () => {};
    void (async () => {
      const [{ onAuthStateChanged }, auth] = await Promise.all([
        import("firebase/auth"),
        firebaseAuth(),
      ]);
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (fbUser) => {
        setFirebaseUser(
          fbUser
            ? {
                uid: fbUser.uid,
                email: fbUser.email ?? "",
                displayName: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Sem nome",
                photoURL: fbUser.photoURL,
              }
            : null
        );
        setFirebaseLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [configured]);

  const user = configured ? firebaseUser : demoUser;
  const loading = configured ? firebaseLoading : false;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode: configured ? "firebase" : "demo",
      async signInWithGoogle() {
        if (!configured) {
          writeDemoUser(DEMO_USER);
          return;
        }
        const [{ GoogleAuthProvider, signInWithPopup }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(auth, provider);
      },
      async signInWithEmail(email, password) {
        if (!configured) {
          writeDemoUser({ ...DEMO_USER, email, displayName: email.split("@")[0] });
          return;
        }
        const [{ signInWithEmailAndPassword }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signUpWithEmail(name, email, password) {
        if (!configured) {
          writeDemoUser({ ...DEMO_USER, email, displayName: name });
          return;
        }
        const [{ createUserWithEmailAndPassword, updateProfile }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
      },
      async continueAsGuest() {
        writeDemoUser(DEMO_USER);
      },
      async signOut() {
        if (configured) {
          const [{ signOut }, auth] = await Promise.all([import("firebase/auth"), firebaseAuth()]);
          await signOut(auth);
        }
        writeDemoUser(null);
      },
    }),
    [configured, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
