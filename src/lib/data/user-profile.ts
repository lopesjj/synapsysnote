import type { SupportedLanguage, UserPreferences, UserProfile } from "@/types/models";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { isValidPhone } from "@/lib/phone";
import { LEGAL_VERSION } from "@/lib/legal/entity";
import { isCustomAvatar } from "./user-avatar";


const LOCAL_KEY = "synapsys.profile.v1";

export interface ProfileIdentity {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string | null;
  providers?: string[];
  language?: SupportedLanguage;
}

export function profileNeedsCompletion(
  user: { uid: string; providers: string[] } | null,
  profile: UserProfile | null | undefined
): boolean {
  if (!user || user.uid === "demo-user") return false;
  return !isValidPhone(profile?.phone ?? "");
}

/** Conta com cadastro completo que ainda nao aceitou a versao atual dos documentos. */
export function legalAcceptanceRequired(
  user: { uid: string } | null,
  profile: UserProfile | null | undefined
): boolean {
  if (!user || user.uid === "demo-user" || !profile) return false;
  return profile.legalAcceptedVersion !== LEGAL_VERSION;
}

function isLocalProfile(uid: string): boolean {
  return !isFirebaseConfigured() || uid === "demo-user";
}

function readLocal(uid: string): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(`${LOCAL_KEY}.${uid}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeLocal(profile: UserProfile): void {
  try {
    window.localStorage.setItem(`${LOCAL_KEY}.${profile.uid}`, JSON.stringify(profile));
  } catch {}
}

async function profileRef(uid: string) {
  const [{ doc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/client"),
  ]);
  return doc(getDb(), "users", uid);
}

/**
 * Perfil gravado pelo navegador. O aceite dos documentos nao entra aqui: so o
 * servidor grava esses campos (ver `recordLegalAcceptance`), e o `merge` do
 * Firestore preserva o que ja estiver la.
 */
function buildProfile(
  identity: ProfileIdentity,
  previous: Partial<UserProfile> | null,
  now: number,
  completed: boolean
): UserProfile {
  const customPhoto = isCustomAvatar(previous?.photoURL)
    ? previous?.photoURL
    : isCustomAvatar(identity.photoURL)
    ? identity.photoURL
    : null;

  return {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName.trim().slice(0, 60),
    phone: identity.phone ?? previous?.phone,
    photoURL: customPhoto,
    providers: identity.providers ?? previous?.providers ?? [],
    registrationCompleted: completed,
    preferences: {
      language: identity.language ?? "pt",
      ...(previous?.preferences ?? {}),
    },
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

function withLegal(profile: UserProfile, previous: Partial<UserProfile> | null): UserProfile {
  return {
    ...profile,
    ...(previous?.legalAcceptedVersion ? { legalAcceptedVersion: previous.legalAcceptedVersion } : {}),
    ...(previous?.legalAcceptedAt ? { legalAcceptedAt: previous.legalAcceptedAt } : {}),
  };
}

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  if (isLocalProfile(uid)) {
    const local = readLocal(uid);
    if (!local) return null;
    return {
      ...local,
      photoURL: isCustomAvatar(local.photoURL) ? local.photoURL : null,
      preferences: {
        language: "pt",
        ...(local.preferences ?? {}),
      },
    };
  }

  const [{ getDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as UserProfile;
  return {
    ...data,
    photoURL: isCustomAvatar(data.photoURL) ? data.photoURL : null,
    preferences: {
      language: "pt",
      ...(data.preferences ?? {}),
    },
  };
}

export async function ensureUserProfile(identity: ProfileIdentity): Promise<UserProfile> {
  const now = Date.now();

  if (isLocalProfile(identity.uid)) {
    const existing = readLocal(identity.uid);
    const profile = withLegal(buildProfile(identity, existing, now, true), existing);
    writeLocal(profile);
    return profile;
  }

  const [{ getDoc, setDoc }, ref] = await Promise.all([
    import("firebase/firestore"),
    profileRef(identity.uid),
  ]);

  const snap = await getDoc(ref);
  const previous = snap.exists() ? (snap.data() as Partial<UserProfile>) : null;
  const completed = isValidPhone(identity.phone ?? previous?.phone ?? "");

  const profile = buildProfile(identity, previous, now, completed);

  await setDoc(ref, profile, { merge: true });
  return withLegal(profile, previous);
}

export async function completeUserRegistration(identity: ProfileIdentity): Promise<UserProfile> {
  const now = Date.now();

  if (isLocalProfile(identity.uid)) {
    const existing = readLocal(identity.uid);
    const profile = withLegal(buildProfile(identity, existing, now, true), existing);
    writeLocal(profile);
    return profile;
  }

  const [{ getDoc, setDoc }, ref] = await Promise.all([
    import("firebase/firestore"),
    profileRef(identity.uid),
  ]);
  const snap = await getDoc(ref);
  const previous = snap.exists() ? (snap.data() as Partial<UserProfile>) : null;
  const profile = buildProfile(identity, previous, now, true);
  await setDoc(ref, profile, { merge: true });
  return withLegal(profile, previous);
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "displayName" | "photoURL" | "phone" | "providers" | "email">>
): Promise<void> {
  const cleanPatch = { ...patch };
  if (typeof cleanPatch.displayName === "string") {
    cleanPatch.displayName = cleanPatch.displayName.trim().slice(0, 60);
  }

  if (isLocalProfile(uid)) {
    const existing = readLocal(uid);
    if (existing) writeLocal({ ...existing, ...cleanPatch, updatedAt: Date.now() });
    return;
  }

  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  await setDoc(ref, { uid, ...cleanPatch, updatedAt: Date.now() }, { merge: true });
}

/**
 * Registra o aceite da versao atual dos Termos e da Politica. Na conta real o
 * registro e feito pelo servidor, com a hora do servidor; falhas sobem para
 * quem chamou mostrar o erro.
 */
export async function recordLegalAcceptance(uid: string): Promise<void> {
  const now = Date.now();
  if (isLocalProfile(uid)) {
    const existing = readLocal(uid);
    if (existing) {
      writeLocal({ ...existing, legalAcceptedVersion: LEGAL_VERSION, legalAcceptedAt: now, updatedAt: now });
    }
    return;
  }

  const { firebaseJson } = await import("@/lib/firebase/auth-headers");
  await firebaseJson("/api/legal/accept", {
    method: "POST",
    body: JSON.stringify({ version: LEGAL_VERSION }),
  });
}

export async function saveUserPreferences(
  uid: string,
  preferences: UserPreferences
): Promise<void> {
  if (isLocalProfile(uid)) {
    const existing = readLocal(uid);
    if (existing) {
      writeLocal({
        ...existing,
        preferences: { ...existing.preferences, ...preferences },
        updatedAt: Date.now(),
      });
    }
    return;
  }

  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  await setDoc(ref, { uid, preferences, updatedAt: Date.now() }, { merge: true });
}
