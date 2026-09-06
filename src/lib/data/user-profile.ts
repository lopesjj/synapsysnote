import type { UserPreferences, UserProfile } from "@/types/models";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { isValidPhoneBR } from "@/lib/phone";

/**
 * `users/{userId}` access layer.
 *
 * Mirrors the two-backend strategy of `DataAdapter`: Firestore when credentials
 * exist, otherwise localStorage so the demo mode keeps working. Profiles are
 * read once per session and written debounced, so a plain module of functions
 * is enough — no realtime subscription is warranted.
 */

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

/** Demo sessions and unconfigured deployments keep the profile in localStorage. */
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

/** Reads `users/{uid}` without creating a document. */
export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  if (isLocalProfile(uid)) return readLocal(uid);

  const [{ getDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/**
 * Loads the profile, creating it on first sign-in.
 *
 * The identity fields are refreshed from the auth provider on every call: when
 * someone renames their Google account the workspace should follow, and the
 * `providers` list is what the UI uses to explain which sign-in methods work.
 */
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

  // merge keeps any field a newer client version may have added.
  await setDoc(ref, profile, { merge: true });
  return profile;
}

/** Writes the complementary sign-up fields and marks the account complete. */
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

/** Patches identity fields (used by the "edit profile" dialog). */
export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "displayName" | "photoURL" | "phone">>
): Promise<void> {
  if (isLocalProfile(uid)) {
    const existing = readLocal(uid);
    if (existing) writeLocal({ ...existing, ...patch, updatedAt: Date.now() });
    return;
  }

  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(uid)]);
  await setDoc(ref, { uid, ...patch, updatedAt: Date.now() }, { merge: true });
}

/**
 * Persists the preference slice.
 *
 * Written as a nested merge so concurrent sessions editing different keys do
 * not clobber each other's values.
 */
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
