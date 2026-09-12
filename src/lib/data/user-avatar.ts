import { deleteObject, getDownloadURL, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { nanoid } from "nanoid";
import { getFirebaseStorage } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { updateUserProfile } from "./user-profile";

export function isCustomAvatar(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string" || !url.trim()) return false;
  const val = url.trim();
  if (val.startsWith("data:image/")) return true;
  if (val.startsWith("users/")) return true;
  if (
    (val.includes("firebasestorage.googleapis.com") || val.includes("firebasestorage.app")) &&
    (val.includes("/o/users%") || val.includes("/o/users/"))
  ) {
    return true;
  }
  return false;
}

export function extractUserAvatarStoragePath(
  url: string | null | undefined,
  uid: string
): string | null {
  if (!url || typeof url !== "string" || !url.trim()) return null;
  const val = url.trim();
  const prefix = `users/${uid}/`;

  if (val.startsWith(prefix)) {
    return val;
  }

  if (val.includes("firebasestorage.googleapis.com") || val.includes("firebasestorage.app")) {
    const match = val.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith(prefix)) return decoded;
      } catch {
        if (match[1].startsWith(prefix)) return match[1];
      }
    }
  }

  return null;
}

export async function deleteUserAvatarStorageFile(
  storage: FirebaseStorage,
  photoURL: string | null | undefined,
  uid: string
): Promise<boolean> {
  const path = extractUserAvatarStoragePath(photoURL, uid);
  if (!path) return false;
  try {
    await deleteObject(ref(storage, path));
    return true;
  } catch {
    return false;
  }
}

export async function uploadUserAvatarFile(
  uid: string,
  blob: Blob
): Promise<{ url: string; storagePath: string }> {
  const storage = getFirebaseStorage();
  const fileId = `avatar_${Date.now()}_${nanoid(6)}.webp`;
  const storagePath = `users/${uid}/${fileId}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: "image/webp" });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function saveUserAvatar(
  uid: string,
  blob: Blob,
  currentPhotoURL?: string | null
): Promise<string> {
  if (!isFirebaseConfigured() || uid === "demo-user") {
    const dataUrl = await blobToDataUrl(blob);
    await updateUserProfile(uid, { photoURL: dataUrl });
    return dataUrl;
  }

  const { url } = await uploadUserAvatarFile(uid, blob);
  await updateUserProfile(uid, { photoURL: url });

  if (currentPhotoURL && currentPhotoURL !== url) {
    await deleteUserAvatarStorageFile(getFirebaseStorage(), currentPhotoURL, uid);
  }

  return url;
}

export async function removeUserAvatar(
  uid: string,
  currentPhotoURL?: string | null
): Promise<void> {
  if (isFirebaseConfigured() && uid !== "demo-user" && currentPhotoURL) {
    await deleteUserAvatarStorageFile(getFirebaseStorage(), currentPhotoURL, uid);
  }
  await updateUserProfile(uid, { photoURL: null });
}
