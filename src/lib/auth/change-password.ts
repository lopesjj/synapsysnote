import { isFirebaseConfigured } from "@/lib/firebase/config";
import { createAuthError, toAuthError } from "@/lib/auth/errors";

export async function changeFirebasePassword(currentPassword: string, nextPassword: string) {
  if (!isFirebaseConfigured()) {
    throw new Error("A troca de senha precisa do Firebase.");
  }

  const [{ EmailAuthProvider, reauthenticateWithCredential, updatePassword }, { getFirebaseAuth }] =
    await Promise.all([import("firebase/auth"), import("@/lib/firebase/client")]);

  const current = getFirebaseAuth().currentUser;
  if (!current?.email) {
    throw new Error("Entre de novo para alterar a senha.");
  }

  try {
    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
    await updatePassword(current, nextPassword);
  } catch (error) {
    const mapped = toAuthError(error);
    if (mapped.reason === "invalid-credentials") throw createAuthError("current-password");
    throw mapped;
  }
}
