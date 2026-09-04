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
import { createAuthError, toAuthError } from "@/lib/auth/errors";

async function firebaseAuth() {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  return getFirebaseAuth();
}

export type OAuthProviderId = "google" | "github";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  /** Provider ids linked to the account (`password`, `google.com`, `github.com`). */
  providers: string[];
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  /** "firebase" when credentials are present, "demo" for the local fallback. */
  mode: "firebase" | "demo";
  signInWithProvider: (provider: OAuthProviderId) => Promise<void>;
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
  providers: ["demo"],
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
                providers: fbUser.providerData.map((entry) => entry.providerId),
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

  // A signed-in Firebase account always wins; the demo user is the fallback so
  // "explore without an account" keeps working even on a configured deployment
  // (the data provider then routes writes to the local adapter).
  const user = configured ? firebaseUser ?? demoUser : demoUser;
  const loading = configured ? firebaseLoading && !demoUser : false;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode: configured ? "firebase" : "demo",

      async signInWithProvider(providerId) {
        if (!configured) {
          writeDemoUser(DEMO_USER);
          return;
        }

        const [
          { GoogleAuthProvider, GithubAuthProvider, signInWithPopup, getAdditionalUserInfo, deleteUser, signOut },
          auth,
        ] = await Promise.all([import("firebase/auth"), firebaseAuth()]);

        const provider =
          providerId === "github" ? new GithubAuthProvider() : new GoogleAuthProvider();
        if (providerId === "google") {
          provider.setCustomParameters({ prompt: "select_account" });
        } else {
          provider.addScope("user:email");
        }

        try {
          const credential = await signInWithPopup(auth, provider);

          /**
           * Federated sign-in must not silently provision accounts: the product
           * rule is that an e-mail has to exist in Authentication before any
           * OAuth provider can be used with it. Firebase creates the account as
           * part of the popup, so the only reliable signal is `isNewUser` — when
           * it is set we roll the account back and refuse the session.
           */
          if (getAdditionalUserInfo(credential)?.isNewUser) {
            try {
              await deleteUser(credential.user);
            } catch {
              // Deletion can require a fresh token; signing out still denies access.
              await signOut(auth);
            }
            throw createAuthError("oauth-unregistered");
          }
        } catch (error) {
          throw toAuthError(error);
        }
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
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
          throw toAuthError(error);
        }
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
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          // Written before the first render of /app so the greeting has a name.
          await updateProfile(cred.user, { displayName: name });
          setFirebaseUser((previous) =>
            previous ? { ...previous, displayName: name } : previous
          );
        } catch (error) {
          throw toAuthError(error);
        }
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
