import type { UserPreferences, UserProfile } from "@/types/models";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { isValidPhoneBR } from "@/lib/phone";


const LOCAL_KEY = "synapsys.profile.v1";

export interface ProfileIdentity {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string | null;
  providers?: string[];
}

export function profileNeedsCompletion(
  user: { uid: string; providers: string[] } | null,
  profile: UserProfile | null | undefined
): boolean {
  if (!user || user.uid === "demo-user") return false;
  return !isValidPhoneBR(profile?.phone ?? "");
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
  } catch {
    // Private browsing: preferences stay in memory for this session only.
  }
}

async function profileRef(uid: string) {
  const [{ doc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/client"),
  ]);
  return doc(getDb(), "users", uid);
}

function buildProfile(
  identity: ProfileIdentity,
  previous: Partial<UserProfile> | null,
  now: number,
  completed: boolean
): UserProfile {
  return {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    phone: identity.phone ?? previous?.phone,
    photoURL: identity.photoURL ?? previous?.photoURL ?? null,
    providers: identity.providers ?? previous?.providers ?? [],
    registrationCompleted: completed,
    preferences: previous?.preferences ?? {},
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  if (isLocalProfile(uid)) return readLocal(uid);

  const [{ getDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function ensureUserProfile(identity: ProfileIdentity): Promise<UserProfile> {
  const now = Date.now();

  if (isLocalProfile(identity.uid)) {
    const existing = readLocal(identity.uid);
    const profile = buildProfile(identity, existing, now, true);
    writeLocal(profile);
    return profile;
  }

  const [{ getDoc, setDoc }, ref] = await Promise.all([
    import("firebase/firestore"),
    profileRef(identity.uid),
  ]);

  const snap = await getDoc(ref);
  const previous = snap.exists() ? (snap.data() as Partial<UserProfile>) : null;
  const completed = isValidPhoneBR(identity.phone ?? previous?.phone ?? "");

  const profile = buildProfile(identity, previous, now, completed);

  await setDoc(ref, profile, { merge: true });
  return profile;
}

export async function completeUserRegistration(identity: ProfileIdentity): Promise<UserProfile> {
  const now = Date.now();

  if (isLocalProfile(identity.uid)) {
    const existing = readLocal(identity.uid);
    const profile = buildProfile(identity, existing, now, true);
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
  return profile;
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "displayName" | "photoURL" | "phone" | "providers">>
): Promise<void> {
  if (isLocalProfile(uid)) {
    const existing = readLocal(uid);
    if (existing) writeLocal({ ...existing, ...patch, updatedAt: Date.now() });
    return;
  }

  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  await setDoc(ref, { uid, ...patch, updatedAt: Date.now() }, { merge: true });
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
