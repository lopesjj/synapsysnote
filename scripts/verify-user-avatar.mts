import assert from "node:assert/strict";
import { extractUserAvatarStoragePath } from "../src/lib/data/user-avatar";

const testUid = "usr_test_12345";
const otherUid = "usr_other_99999";

const directPath = `users/${testUid}/avatar_1710000000_abc123.webp`;
assert.equal(
  extractUserAvatarStoragePath(directPath, testUid),
  directPath
);

const encodedStorageUrl = `https://firebasestorage.googleapis.com/v0/b/synapsysnote.firebasestorage.app/o/users%2F${testUid}%2Favatar_1710000000_abc123.webp?alt=media&token=fake-token-123`;
assert.equal(
  extractUserAvatarStoragePath(encodedStorageUrl, testUid),
  directPath
);

const otherUserUrl = `https://firebasestorage.googleapis.com/v0/b/synapsysnote.firebasestorage.app/o/users%2F${otherUid}%2Favatar_1710000000_abc123.webp?alt=media&token=fake-token-123`;
assert.equal(
  extractUserAvatarStoragePath(otherUserUrl, testUid),
  null
);

assert.equal(
  extractUserAvatarStoragePath("https://lh3.googleusercontent.com/a/ACg8ocI-sample", testUid),
  null
);
assert.equal(
  extractUserAvatarStoragePath("https://avatars.githubusercontent.com/u/1234567?v=4", testUid),
  null
);
assert.equal(extractUserAvatarStoragePath("", testUid), null);
assert.equal(extractUserAvatarStoragePath(null, testUid), null);
assert.equal(extractUserAvatarStoragePath(undefined, testUid), null);

function computeAvatarOrphanToDelete(
  oldPhotoUrl: string | null | undefined,
  newPhotoUrl: string | null | undefined,
  uid: string
): string | null {
  if (!oldPhotoUrl || oldPhotoUrl === newPhotoUrl) return null;
  return extractUserAvatarStoragePath(oldPhotoUrl, uid);
}

const oldStorageAvatar = `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2F${testUid}%2Favatar_old.webp?alt=media`;
const newStorageAvatar = `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2F${testUid}%2Favatar_new.webp?alt=media`;

assert.equal(
  computeAvatarOrphanToDelete(oldStorageAvatar, newStorageAvatar, testUid),
  `users/${testUid}/avatar_old.webp`
);

assert.equal(
  computeAvatarOrphanToDelete(oldStorageAvatar, null, testUid),
  `users/${testUid}/avatar_old.webp`
);

assert.equal(
  computeAvatarOrphanToDelete("https://lh3.googleusercontent.com/photo", newStorageAvatar, testUid),
  null
);

assert.equal(
  computeAvatarOrphanToDelete(oldStorageAvatar, oldStorageAvatar, testUid),
  null
);

import { isCustomAvatar } from "../src/lib/data/user-avatar";

assert.equal(isCustomAvatar(null), false);
assert.equal(isCustomAvatar(undefined), false);
assert.equal(isCustomAvatar(""), false);
assert.equal(isCustomAvatar("   "), false);
assert.equal(isCustomAvatar("https://lh3.googleusercontent.com/a/ACg8ocI-sample"), false);
assert.equal(isCustomAvatar("https://avatars.githubusercontent.com/u/1234567?v=4"), false);
assert.equal(isCustomAvatar("https://www.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50"), false);
assert.equal(isCustomAvatar(newStorageAvatar), true);
assert.equal(isCustomAvatar("data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA="), true);

console.log("Todos os testes de armazenamento e deleção de órfãos de avatar passaram com sucesso!");
