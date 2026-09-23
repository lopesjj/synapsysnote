"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  completeUserRegistration,
  recordLegalAcceptance,
  updateUserProfile,
} from "@/lib/data/user-profile";
import { useUiStore } from "@/lib/store/ui-store";
import {
  clearCrossHostSession,
  hydrateFromSessionCookie,
  persistCrossHostSession,
  suppressSessionHydrate,
} from "@/lib/auth/cross-host-session";
import { isSplitHosts, loginHref, resolveUrl } from "@/lib/domains";
import { isCustomAvatar } from "@/lib/data/user-avatar";
import { forgetUserLanguage } from "@/lib/i18n/locale-cookies";
import { forgetAccessSession, reportAccess } from "@/lib/auth/access-log-client";
import type { SupportedLanguage } from "@/types/models";

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
    photoURL: isCustomAvatar(fbUser.photoURL) ? fbUser.photoURL : null,
    providers: fbUser.providerData.map((entry) => entry.providerId),
  };
}

async function firebaseAuth() {
  const { getFirebaseAuth } = await import("@/lib/firebase/client");
  return getFirebaseAuth();
}

export type OAuthProviderId = "google";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  providers: string[];
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  loggingOut: boolean;
  mode: "firebase" | "demo";
  signInWithProvider: (provider: OAuthProviderId, remember?: boolean) => Promise<AppUser>;
  signInWithEmail: (email: string, password: string, remember?: boolean) => Promise<AppUser>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
    phone: string,
    language: SupportedLanguage,
    legalAcceptedVersion?: string
  ) => Promise<AppUser>;
  completeRegistration: (input: {
    name: string;
    email: string;
    phone: string;
    language: SupportedLanguage;
    legalAcceptedVersion?: string;
  }) => Promise<{ emailVerificationSent: boolean; emailChangeFailed: boolean }>;
  resetPassword: (email: string, language?: SupportedLanguage) => Promise<void>;
  verifyResetCode: (oobCode: string) => Promise<string>;
  confirmPasswordReset: (oobCode: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<void>;
  updateAuthPhoto: (photoURL: string | null) => Promise<void>;
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

function hasLogoutIntent(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("logout") === "1";
}

function hasSessionSyncFailureIntent(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("session") === "sync_failed";
}

function clearLogoutIntent(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
}

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

const CACHED_USER_KEY = "synapsys.auth_user";
const AUTH_ACTIVE_KEY = "synapsys.auth_active";
const SIGNED_OUT_PREFIXES = [
  "synapsys.cache.",
  "synapsys.bootstrapped.",
  "synapsys.trash_purge_cooldown.",
  "synapsys.profile.v1.",
];
const SIGNED_OUT_SESSION_KEYS = [
  "synapsys.session.openNotebooks",
  "synapsys.session.expandedPages",
  "synapsys_open_notebooks",
  "synapsys_expanded_pages",
];

function clearSignedOutStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of SIGNED_OUT_SESSION_KEYS) window.sessionStorage.removeItem(key);
  } catch {}
  try {
    const storage = window.localStorage;
    const cacheKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && SIGNED_OUT_PREFIXES.some((prefix) => key.startsWith(prefix))) cacheKeys.push(key);
    }
    for (const key of cacheKeys) storage.removeItem(key);
  } catch {}
  void import("@/lib/firebase/client")
    .then(({ resetFirestoreCache }) => resetFirestoreCache())
    .catch(() => undefined);
  try {
    if (window.indexedDB && typeof window.indexedDB.databases === "function") {
      void window.indexedDB.databases().then((dbs) => {
        for (const dbInfo of dbs) {
          if (dbInfo.name && (dbInfo.name.includes("firestore") || dbInfo.name.startsWith("synapsys"))) {
            window.indexedDB.deleteDatabase(dbInfo.name);
          }
        }
      }).catch(() => {});
    }
  } catch {}
  forgetAccessSession();
}

export function hasActiveSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      window.localStorage.getItem(AUTH_ACTIVE_KEY) ||
      window.localStorage.getItem(CACHED_USER_KEY)
    );
  } catch {
    return false;
  }
}

function readCachedUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    if (isRememberExpired()) {
      window.localStorage.removeItem(CACHED_USER_KEY);
      window.localStorage.removeItem(AUTH_ACTIVE_KEY);
      return null;
    }
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AppUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
      window.localStorage.setItem(AUTH_ACTIVE_KEY, "1");
    } else {
      window.localStorage.removeItem(CACHED_USER_KEY);
      window.localStorage.removeItem(AUTH_ACTIVE_KEY);
    }
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const queryClient = useQueryClient();
  const demoUser = useSyncExternalStore(subscribeDemo, readDemoUser, () => null);

  const [firebaseUser, setFirebaseUser] = useState<AppUser | null>(() => readCachedUser());
  const [firebaseLoading, setFirebaseLoading] = useState(() => configured && !readCachedUser());
  const [loggingOut, setLoggingOut] = useState(false);
  const interactiveSignIn = useRef(false);

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
      if (hasLogoutIntent() || (hasSessionSyncFailureIntent() && isSplitHosts())) {
        suppressSessionHydrate();
        await clearCrossHostSession().catch(() => {});
        await signOut(auth).catch(() => {});
        clearRemembered();
        writeDemoUser(null);
        writeCachedUser(null);
        queryClient.clear();
        clearSignedOutStorage();
        if (!cancelled) {
          setFirebaseUser(null);
          setFirebaseLoading(false);
          clearLogoutIntent();
        }
        return;
      }
      if (isRememberExpired()) {
        suppressSessionHydrate();
        await clearCrossHostSession().catch(() => {});
        await signOut(auth);
        clearRemembered();
        writeDemoUser(null);
        clearSignedOutStorage();
      } else if (auth.currentUser && !isRememberActive()) {
        adoptLegacySession();
      }
      let hydrating = false;
      unsub = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          if (interactiveSignIn.current) return;
          const nextUser = toAppUser(fbUser);
          writeCachedUser(nextUser);
          setFirebaseUser(nextUser);
          setFirebaseLoading(false);
          void reportAccess("session");
          return;
        }
        if (hydrating) return;
        hydrating = true;
        void hydrateFromSessionCookie()
          .then((ok) => {
            if (!ok && !cancelled) {
              if (hasActiveSessionHint()) clearSignedOutStorage();
              writeCachedUser(null);
              setFirebaseUser(null);
              setFirebaseLoading(false);
            }
          })
          .catch(() => {
            if (!cancelled) {
              writeCachedUser(null);
              setFirebaseUser(null);
              setFirebaseLoading(false);
            }
          })
          .finally(() => {
            hydrating = false;
          });
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [configured, queryClient]);

  const user = configured ? firebaseUser ?? demoUser : demoUser;
  const loading = configured ? firebaseLoading && !demoUser : false;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      loggingOut,
      mode: configured ? "firebase" : "demo",

      async signInWithProvider(providerId, remember = true) {
        setLoggingOut(false);
        if (!configured) {
          writeDemoUser(DEMO_USER);
          markRemembered(remember);
          return DEMO_USER;
        }
        await applyAuthPersistence(remember);
        interactiveSignIn.current = true;

        const [
          { GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo, deleteUser, signOut },
          auth,
        ] = await Promise.all([import("firebase/auth"), firebaseAuth()]);

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        let authenticated = false;
        try {
          const credential = await signInWithPopup(auth, provider);
          authenticated = true;

          if (getAdditionalUserInfo(credential)?.isNewUser) {
            try {
              await deleteUser(credential.user);
            } catch {
              await signOut(auth);
            }
            throw createAuthError("oauth-unregistered");
          }
          const next = toAppUser(credential.user);
          await persistCrossHostSession(remember);
          writeCachedUser(next);
          setFirebaseUser(next);
          // Com os dois dominios o login e registrado pelo servidor ao criar a sessao.
          if (!isSplitHosts()) void reportAccess("login");
          return next;
        } catch (error) {
          if (authenticated) {
            suppressSessionHydrate();
            await clearCrossHostSession().catch(() => {});
            await signOut(auth).catch(() => {});
            writeCachedUser(null);
            setFirebaseUser(null);
          }
          throw toAuthError(error);
        } finally {
          interactiveSignIn.current = false;
        }
      },

      async signInWithEmail(email, password, remember = true) {
        setLoggingOut(false);
        if (!configured) {
          const next = { ...DEMO_USER, email, displayName: email.split("@")[0] };
          writeDemoUser(next);
          markRemembered(remember);
          return next;
        }
        await applyAuthPersistence(remember);
        interactiveSignIn.current = true;
        const [{ signInWithEmailAndPassword, signOut }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        let authenticated = false;
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          authenticated = true;
          const next = toAppUser(cred.user);
          await persistCrossHostSession(remember);
          writeCachedUser(next);
          setFirebaseUser(next);
          // Com os dois dominios o login e registrado pelo servidor ao criar a sessao.
          if (!isSplitHosts()) void reportAccess("login");
          return next;
        } catch (error) {
          if (authenticated) {
            suppressSessionHydrate();
            await clearCrossHostSession().catch(() => {});
            await signOut(auth).catch(() => {});
            writeCachedUser(null);
            setFirebaseUser(null);
          }
          throw toAuthError(error);
        } finally {
          interactiveSignIn.current = false;
        }
      },

      async signUpWithEmail(name, email, password, phone, language, legalAcceptedVersion) {
        setLoggingOut(false);
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
            language,
          });
          if (legalAcceptedVersion) await recordLegalAcceptance(next.uid);
          useUiStore.getState().setLanguage(language);
          return next;
        }
        await applyAuthPersistence(true);
        const [{ createUserWithEmailAndPassword, updateProfile }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(cred.user, { displayName: name });
          const next = { ...toAppUser(cred.user), displayName: name };
          await completeUserRegistration({
            uid: next.uid,
            email,
            displayName: name,
            phone,
            photoURL: next.photoURL,
            providers: next.providers,
            language,
          });
          if (legalAcceptedVersion) {
            // Se falhar, o app pede o aceite de novo na entrada.
            await recordLegalAcceptance(next.uid).catch(() => {});
          }
          await persistCrossHostSession(true);
          writeCachedUser(next);
          setFirebaseUser(next);
          useUiStore.getState().setLanguage(language);
          if (!isSplitHosts()) void reportAccess("login");
          return next;
        } catch (error) {
          throw toAuthError(error);
        }
      },

      async completeRegistration({ name, email, phone, language, legalAcceptedVersion }) {
        if (!configured) {
          const next = { ...(firebaseUser ?? DEMO_USER), email, displayName: name };
          writeDemoUser(next);
          const profile = await completeUserRegistration({
            uid: next.uid,
            email,
            displayName: name,
            phone,
            providers: next.providers,
            language,
          });
          if (legalAcceptedVersion) await recordLegalAcceptance(next.uid);
          useUiStore.getState().setLanguage(profile.preferences?.language ?? language);
          return { emailVerificationSent: false, emailChangeFailed: false };
        }

        const [{ updateProfile, verifyBeforeUpdateEmail }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        const current = auth.currentUser;
        if (!current) throw createAuthError("unknown");

        await updateProfile(current, { displayName: name });

        // `updateEmail` falha com a protecao contra enumeracao de e-mails ativa e o
        // erro era engolido, deixando o perfil com um e-mail diferente do login.
        // A troca agora so vale depois que a pessoa confirma o novo endereco.
        let emailVerificationSent = false;
        let emailChangeFailed = false;
        const requestedEmail = email.trim();
        if (requestedEmail && requestedEmail.toLowerCase() !== (current.email ?? "").toLowerCase()) {
          try {
            await verifyBeforeUpdateEmail(current, requestedEmail);
            emailVerificationSent = true;
          } catch {
            emailChangeFailed = true;
          }
        }

        const next = { ...toAppUser(current), displayName: name };
        const profile = await completeUserRegistration({
          uid: next.uid,
          email: current.email ?? "",
          displayName: name,
          phone,
          photoURL: next.photoURL,
          providers: next.providers,
          language,
        });
        if (legalAcceptedVersion) await recordLegalAcceptance(next.uid);
        await persistCrossHostSession(true);
        setFirebaseUser(next);
        useUiStore.getState().setLanguage(profile.preferences?.language ?? language);
        if (!isSplitHosts()) void reportAccess("login");
        return { emailVerificationSent, emailChangeFailed };
      },

      async resetPassword(email, language = "pt") {
        if (!configured) {
          throw new Error("A redefinição de senha precisa do Firebase.");
        }
        const [{ sendPasswordResetEmail }, auth] = await Promise.all([
          import("firebase/auth"),
          firebaseAuth(),
        ]);
        auth.languageCode = language;
        try {
          const resetUrl = new URL(resolveUrl(loginHref("/", language), window.location.origin));
          resetUrl.searchParams.set("reset", "ok");
          await sendPasswordResetEmail(auth, email.trim(), {
            url: resetUrl.toString(),
          });
        } catch (error) {
          const mapped = toAuthError(error);
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
        const auth = await firebaseAuth();
        if (!auth.currentUser) return;
        const next = toAppUser(auth.currentUser);
        setFirebaseUser(next);
        void updateUserProfile(next.uid, { providers: next.providers }).catch(() => {});
      },

      async updateAuthPhoto(photoURL) {
        if (!configured || !firebaseUser || firebaseUser.uid === "demo-user") {
          const next = { ...(firebaseUser ?? DEMO_USER), photoURL };
          writeDemoUser(next);
          setFirebaseUser(next);
          return;
        }
        try {
          const [{ updateProfile }, auth] = await Promise.all([
            import("firebase/auth"),
            firebaseAuth(),
          ]);
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { photoURL });
          }
        } catch {}
        const next = { ...firebaseUser, photoURL };
        writeCachedUser(next);
        setFirebaseUser(next);
      },

      async signOut() {
        setLoggingOut(true);
        try {
          await clearCrossHostSession();
          suppressSessionHydrate();
          if (configured) {
            const [{ signOut }, auth] = await Promise.all([import("firebase/auth"), firebaseAuth()]);
            await signOut(auth).catch(() => {});
          }
          writeCachedUser(null);
          writeDemoUser(null);
          setFirebaseUser(null);
          clearRemembered();
          queryClient.clear();
          forgetUserLanguage();
          clearSignedOutStorage();
        } finally {
          setLoggingOut(false);
        }
      },
    }),
    [configured, firebaseUser, loading, loggingOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
