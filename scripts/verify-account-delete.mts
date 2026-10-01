import assert from "node:assert/strict";
import { isAdminConfigured } from "../src/lib/firebase/admin";

if (!isAdminConfigured()) {
  console.log("Firebase Admin não configurado — pulando verify-account-delete.");
  process.exit(0);
}

import { workspacesOf } from "../src/lib/account/account-server";
import { POST } from "../src/app/api/account/delete/route";

const dummyUid = "test_verify_nonexistent_" + Date.now();
const { owned, member } = await workspacesOf(dummyUid);
assert.ok(Array.isArray(owned));
assert.ok(Array.isArray(member));
assert.equal(owned.length, 0);
assert.equal(member.length, 0);

const reqMissingOrigin = new Request("http://localhost:43127/api/account/delete", {
  method: "POST",
  headers: {
    "sec-fetch-site": "cross-site",
    origin: "http://evil-attacker.com",
  },
});
const resForbidden = await POST(reqMissingOrigin);
assert.equal(resForbidden.status, 403);

const reqNoAuth = new Request("http://localhost:43127/api/account/delete", {
  method: "POST",
  headers: {
    "sec-fetch-site": "same-origin",
  },
});
const resNoAuth = await POST(reqNoAuth);
assert.equal(resNoAuth.status, 401);

const reqBadToken = new Request("http://localhost:43127/api/account/delete", {
  method: "POST",
  headers: {
    "sec-fetch-site": "same-origin",
    authorization: "Bearer invalid-token-12345",
  },
});
const resBadToken = await POST(reqBadToken);
assert.equal(resBadToken.status, 401);

console.log("Verificação do fluxo de exclusão de conta concluída com sucesso.");
