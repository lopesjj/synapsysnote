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
import {
  adoptLegacySession,
  clearRemembered,
  isRememberActive,
  isRememberExpired,
  markRemembered,
} from "@/lib/auth/remember";

async function applyAuthPersistence(remember: boolean) {
  const [{ setPersistence, browserLocalPersistence, browserSessionPersistence }, auth] = await Promise.all([
    import("firebase/auth"),
    firebaseAuth(),
  ]);
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  markRemembered(remember);
}
import { completeUserRegistration } from "@/lib/data/user-profile";

function toAppUser(fbUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData: { providerId: string }[];
}): AppUser {
  return {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    displayName: fbUser.displayName ?? "",
    photoURL: fbUser.photoURL,
    providers: fbUser.providerData.map((entry) => entry.providerId),
  };
}

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
  signInWithProvider: (provider: OAuthProviderId, remember?: boolean) => Promise<AppUser>;
  signInWithEmail: (email: string, password: string, remember?: boolean) => Promise<AppUser>;
  signUpWithEmail: (name: string, email: string, password: string, phone: string) => Promise<AppUser>;
  completeRegistration: (input: { name: string; email: string; phone: string }) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  verifyResetCode: (oobCode: string) => Promise<string>;
  confirmPasswordReset: (oobCode: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<void>;
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
    if (isRememberExpired()) writeDemoUser(null);
    if (!configured) return;
    let cancelled = false;
    let unsub = () => {};
    void (async () => {
      const [{ onAuthStateChanged, signOut }, auth] = await Promise.all([
        import("firebase/auth"),
        firebaseAuth(),
      ]);
      if (cancelled) return;
      if (isRememberExpired()) {
        await signOut(auth);
        clearRemembered();
        writeDemoUser(null);
      } else if (auth.currentUser && !isRememberActive()) {
        adoptLegacySession();
      }
      unsub = onAuthStateChanged(auth, (fbUser) => {
        setFirebaseUser(fbUser ? toAppUser(fbUser) : null);
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

      async signInWithProvider(providerId, remember = true) {
        if (!configured) {
          writeDemoUser(DEMO_USER);
          markRemembered(remember);
          return DEMO_USER;
        }
        await applyAuthPersistence(remember);

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
          const next = toAppUser(credential.user);
          setFirebaseUser(next);
          return next;
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async signInWithEmail(email, password, remember = true) {
        if (!configured) {
          const next = { ...DEMO_USER, email, displayName: email.split("@")[0] };
          writeDemoUser(next);
          markRemembered(remember);
          return next;
        }
        await applyAuthPersistence(remember);
        const [{ signInWithEmailAndPassword }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          const next = toAppUser(cred.user);
          setFirebaseUser(next);
          return next;
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async signUpWithEmail(name, email, password, phone) {
        if (!configured) {
          const next = { ...DEMO_USER, email, displayName: name };
          writeDemoUser(next);
          markRemembered(true);
          await completeUserRegistration({
            uid: next.uid,
            email,
            displayName: name,
            phone,
            providers: next.providers,
          });
          return next;
        }
        await applyAuthPersistence(true);
        const [{ createUserWithEmailAndPassword, updateProfile }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          // Written before the first render of /app so the greeting has a name.
          await updateProfile(cred.user, { displayName: name });
          const next = { ...toAppUser(cred.user), displayName: name };
          await completeUserRegistration({
            uid: next.uid,
            email,
            displayName: name,
            phone,
            photoURL: next.photoURL,
            providers: next.providers,
          });
          setFirebaseUser(next);
          return next;
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async completeRegistration({ name, email, phone }) {
        if (!configured) {
          const next = { ...(firebaseUser ?? DEMO_USER), email, displayName: name };
          writeDemoUser(next);
          await completeUserRegistration({
            uid: next.uid,
            email,
            displayName: name,
            phone,
            providers: next.providers,
          });
          return;
        }

        const [{ updateProfile, updateEmail }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        const current = auth.currentUser;
        if (!current) throw createAuthError("unknown");

        await updateProfile(current, { displayName: name });
        if (email && email !== (current.email ?? "")) {
          try {
            await updateEmail(current, email);
          } catch {
            // Profile still stores the confirmed address; Auth email stays if the
            // provider requires a fresh login to change it.
          }
        }

        const next = { ...toAppUser(current), email: email || current.email || "", displayName: name };
        await completeUserRegistration({
          uid: next.uid,
          email: next.email,
          displayName: name,
          phone,
          photoURL: next.photoURL,
          providers: next.providers,
        });
        setFirebaseUser(next);
      },

      async resetPassword(email) {
        if (!configured) {
          throw new Error("A redefinição de senha precisa do Firebase.");
        }
        const [{ sendPasswordResetEmail }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        auth.languageCode = "pt";
        try {
          await sendPasswordResetEmail(auth, email.trim(), {
            url: `${window.location.origin}/?reset=ok`,
          });
        } catch (error) {
          const mapped = toAuthError(error);
          // Do not reveal whether the address has an account.
          if (mapped.reason === "invalid-credentials") return;
          throw mapped;
        }
      },

      async verifyResetCode(oobCode) {
        if (!configured) {
          throw new Error("A redefinição de senha precisa do Firebase.");
        }
        const [{ verifyPasswordResetCode }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        try {
          return await verifyPasswordResetCode(auth, oobCode);
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async confirmPasswordReset(oobCode, password) {
        if (!configured) {
          throw new Error("A redefinição de senha precisa do Firebase.");
        }
        const [{ confirmPasswordReset }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        try {
          await confirmPasswordReset(auth, oobCode, password);
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async changePassword(currentPassword, nextPassword) {
        const { changeFirebasePassword } = await import("@/lib/auth/change-password");
        await changeFirebasePassword(currentPassword, nextPassword);
      },

      async continueAsGuest() {
        writeDemoUser(DEMO_USER);
        markRemembered(true);
      },

      async signOut() {
        if (configured) {
          const [{ signOut }, auth] = await Promise.all([import("firebase/auth"), firebaseAuth()]);
          await signOut(auth);
        }
        writeDemoUser(null);
        clearRemembered();
      },
    }),
    [configured, firebaseUser, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
