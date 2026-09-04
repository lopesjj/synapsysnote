import type { UserPreferences, UserProfile } from "@/types/models";
import { isFirebaseConfigured } from "@/lib/firebase/config";

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
  photoURL?: string | null;
  providers?: string[];
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
    const profile: UserProfile = {
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      photoURL: identity.photoURL ?? null,
      providers: identity.providers ?? existing?.providers ?? [],
      preferences: existing?.preferences ?? {},
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSeenAt: now,
    };
    writeLocal(profile);
    return profile;
  }

  const [{ getDoc, setDoc }, ref] = await Promise.all([
    import("firebase/firestore"),
    profileRef(identity.uid),
  ]);

  const snap = await getDoc(ref);
  const previous = snap.exists() ? (snap.data() as Partial<UserProfile>) : null;

  const profile: UserProfile = {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    photoURL: identity.photoURL ?? null,
    providers: identity.providers ?? previous?.providers ?? [],
    preferences: previous?.preferences ?? {},
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
  };

  // merge keeps any field a newer client version may have added.
  await setDoc(ref, profile, { merge: true });
  return profile;
}

/** Patches identity fields (used by the "edit profile" dialog). */
export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "displayName" | "photoURL">>
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
