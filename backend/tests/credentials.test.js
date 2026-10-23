// Dependency-free tests for Firebase credential loading. Run: node tests/credentials.test.js
const assert = require("node:assert/strict");
const test = require("node:test");
const { loadFirebaseCredentials, resolveProjectId } = require("../src/database/credentials");

const FAKE_KEY = "-----BEGIN PRIVATE KEY-----\nFAKEFAKE\n-----END PRIVATE KEY-----\n";
const sa = { project_id: "mata-store-eg", client_email: "svc@mata-store-eg.iam.gserviceaccount.com", private_key: FAKE_KEY };

test("no variables -> null (falls back to Application Default Credentials)", () => {
  assert.equal(loadFirebaseCredentials({}), null);
  assert.equal(resolveProjectId({}), "mata-store-eg");
});
test("raw JSON service account", () => {
  const c = loadFirebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa) });
  assert.deepEqual(c, { projectId: "mata-store-eg", clientEmail: sa.client_email, privateKey: FAKE_KEY });
});
test("base64 JSON service account", () => {
  const c = loadFirebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(sa)).toString("base64") });
  assert.equal(c.clientEmail, sa.client_email);
});
test("JSON whose private key has literal backslash-n sequences is repaired", () => {
  const c = loadFirebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...sa, private_key: FAKE_KEY.replace(/\n/g, "\\n") }) });
  assert.equal(c.privateKey, FAKE_KEY);
});
test("separate variables, with escaped newlines in the key", () => {
  const c = loadFirebaseCredentials({ FIREBASE_PROJECT_ID: "p1", FIREBASE_CLIENT_EMAIL: sa.client_email, FIREBASE_PRIVATE_KEY: FAKE_KEY.replace(/\n/g, "\\n") });
  assert.deepEqual(c, { projectId: "p1", clientEmail: sa.client_email, privateKey: FAKE_KEY });
});
test("FIREBASE_PROJECT_ID overrides project_id in the JSON", () => {
  assert.equal(loadFirebaseCredentials({ FIREBASE_PROJECT_ID: "other", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa) }).projectId, "other");
});
test("errors are clear and never contain credential values", () => {
  assert.throws(() => loadFirebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: "{not json SECRETVALUE" }), (e) => /not valid JSON/.test(e.message) && !/SECRETVALUE/.test(e.message));
  assert.throws(() => loadFirebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "x" }) }), /client_email and private_key/);
  assert.throws(() => loadFirebaseCredentials({ FIREBASE_CLIENT_EMAIL: "a@b.c" }), /both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY/);
});
