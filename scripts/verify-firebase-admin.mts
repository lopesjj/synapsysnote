import assert from "node:assert/strict";
import {
  resolveServiceAccountCredentials,
  isAdminConfigured,
  adminDb,
  adminAuth,
  adminBucket,
} from "../src/lib/firebase/admin";

const creds = resolveServiceAccountCredentials();
assert.ok(creds !== null, "Credenciais da conta de serviço devem ser resolvidas");
assert.equal(creds.project_id, "synapsysnote");
assert.equal(creds.client_email, "firebase-adminsdk-fbsvc@synapsysnote.iam.gserviceaccount.com");
assert.ok(typeof creds.private_key === "string" && creds.private_key.length > 50);

assert.equal(isAdminConfigured(), true);

const db = adminDb();
assert.ok(db !== null);

const auth = adminAuth();
assert.ok(auth !== null);

const bucket = adminBucket();
assert.ok(bucket !== null);
assert.equal(bucket.name, "synapsysnote.firebasestorage.app");

console.log("all firebase admin credentials and services verified successfully");
