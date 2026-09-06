import { isFirebaseConfigured } from "@/lib/firebase/config";
import { createAuthError, toAuthError } from "@/lib/auth/errors";

export async function changeFirebasePassword(currentPassword: string, nextPassword: string) {
  if (!isFirebaseConfigured()) {
    throw new Error("A troca de senha precisa do Firebase.");
  }

  const [{ EmailAuthProvider, linkWithCredential, reauthenticateWithCredential, updatePassword }, { getFirebaseAuth }] =
    await Promise.all([import("firebase/auth"), import("@/lib/firebase/client")]);

  const current = getFirebaseAuth().currentUser;
  if (!current?.email) {
    throw new Error("Entre de novo para alterar a senha.");
  }

  try {
    // A Google account has a verified e-mail but no Firebase password. Linking
    // one here keeps the same UID and profile, so later e-mail/password and
    // Google logins are two ways into one account instead of duplicate users.
    if (!current.providerData.some((provider) => provider.providerId === "password")) {
      await linkWithCredential(current, EmailAuthProvider.credential(current.email, nextPassword));
      await current.reload();
      return;
    }

    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
    await updatePassword(current, nextPassword);
    await current.reload();
  } catch (error) {
    const mapped = toAuthError(error);
    if (mapped.reason === "invalid-credentials") throw createAuthError("current-password");
    throw mapped;
  }
}
