// Entry-point and module-graph test. Needs no credentials, no network and no installed packages:
// third-party packages are replaced with small stubs, while ALL project files (api/index.js, app.js,
// every router, middleware and Firebase init) are the real ones, loaded by plain Node CommonJS.
//
// It guards against the production failure "TypeError: argument handler must be a function":
// the stub of express enforces the same rule as Express 5 (every app.use() argument must be a function
// or an array of functions) and records what each route registration received.
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const BACKEND = path.join(ROOT, "backend");

function makeChain() {
  const fn = () => chain;
  const chain = new Proxy(fn, { get: (t, k) => (k === "then" ? undefined : chain), apply: () => chain });
  return chain;
}

function loadFresh({ env = {}, firebase = {} } = {}) {
  const saved = { ...process.env };
  for (const key of ["VERCEL", "FIREBASE_SERVICE_ACCOUNT_JSON", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_PROJECT_ID", "GOOGLE_APPLICATION_CREDENTIALS"]) delete process.env[key];
  Object.assign(process.env, env);

  const calls = { use: [], get: [], certCalls: 0, initCalls: 0 };
  const assertHandlers = (label, args) => {
    for (const a of args) {
      const ok = typeof a === "function" || (Array.isArray(a) && a.every((x) => typeof x === "function"));
      if (!ok && typeof a !== "string") throw new TypeError(`argument handler must be a function (${label}: got ${typeof a})`);
    }
  };
  const makeRouter = () => {
    const router = (req, res, next) => next();
    for (const m of ["get", "post", "put", "patch", "delete", "all"]) router[m] = (p, ...hs) => { assertHandlers(`router.${m} ${p}`, hs); };
    router.use = (...args) => { assertHandlers("router.use", args); };
    return router;
  };
  const express = () => {
    const app = (req, res) => res;
    app.disable = () => app;
    app.set = () => app;
    app.use = (...args) => { assertHandlers("app.use", args); calls.use.push(args.filter((a) => typeof a === "string")[0] || "*"); return app; };
    app.get = (p, ...hs) => { assertHandlers(`app.get ${p}`, hs); calls.get.push(p); return app; };
    return app;
  };
  express.Router = makeRouter;
  express.json = () => (req, res, next) => next();

  const stubs = {
    express,
    helmet: () => (req, res, next) => next(),
    cors: () => (req, res, next) => next(),
    "express-rate-limit": () => (req, res, next) => next(),
    dotenv: { config() {} },
    multer: Object.assign(() => ({ single: () => (req, res, next) => next() }), { memoryStorage: () => ({}), MulterError: class extends Error {} }),
    cloudinary: { v2: { config() {}, utils: {}, uploader: {} } },
    zod: { z: makeChain() },
    "firebase-admin/app": {
      getApps: () => [],
      applicationDefault: () => ({ kind: "adc" }),
      cert: (c) => { calls.certCalls++; if (firebase.certThrows) throw new Error("Failed to parse private key"); return { kind: "cert", projectId: c.projectId }; },
      initializeApp: () => { calls.initCalls++; return { name: "[DEFAULT]" }; },
    },
    "firebase-admin/firestore": { getFirestore: () => ({ collection: () => ({}) }), FieldValue: { serverTimestamp: () => new Date() } },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async () => { throw new Error("stub"); } }) },
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return origLoad.call(this, request, parent, ...rest);
  };
  const originalError = console.error;
  console.error = () => {}; // expected init failures are logged by the app; keep test output clean
  for (const key of Object.keys(require.cache)) if (key.startsWith(ROOT) && !key.includes(`${path.sep}tests${path.sep}`)) delete require.cache[key];
  try {
    const entry = require(path.join(ROOT, "api", "index.js"));
    const firestore = require(path.join(BACKEND, "src", "database", "firestore.js"));
    return { entry, firestore, calls };
  } finally {
    Module._load = origLoad;
    console.error = originalError;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test("api/index.js exports the Express app as a request handler function", () => {
  const { entry } = loadFresh({ env: { VERCEL: "1", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "svc@example.iam", private_key: "k", project_id: "demo" }) } });
  assert.equal(typeof entry, "function");
});

test("every route is mounted and every app.use() argument is a function (no 'handler must be a function')", () => {
  const { calls } = loadFresh({ env: { VERCEL: "1", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "svc@example.iam", private_key: "k", project_id: "demo" }) } });
  for (const mount of ["/api/products", "/api/settings", "/api/reviews", "/api/orders", "/api/admin/products", "/api/admin/orders", "/api/admin/settings", "/api/admin/reviews", "/api/admin/upload"]) {
    assert.ok(calls.use.includes(mount), `${mount} is mounted`);
  }
  assert.ok(calls.get.includes("/api/health"));
});

test("requireAdmin is exported as a function", () => {
  loadFresh({ env: { VERCEL: "1", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "svc@example.iam", private_key: "k", project_id: "demo" }) } });
  assert.equal(typeof require(path.join(BACKEND, "src", "auth", "adminAuth.js")), "function");
});

test("Firebase: credentials from FIREBASE_SERVICE_ACCOUNT_JSON initialise the app", () => {
  const { firestore, calls } = loadFresh({ env: { VERCEL: "1", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "svc@example.iam", private_key: "k", project_id: "demo" }) } });
  assert.equal(firestore.getFirebaseStatus(), "ready");
  assert.equal(calls.certCalls, 1);
});

test("Firebase: on Vercel without credentials the function still loads and reports 'misconfigured' (no crash, no default-credentials lookup)", () => {
  const { entry, firestore, calls } = loadFresh({ env: { VERCEL: "1" } });
  assert.equal(typeof entry, "function");
  assert.equal(firestore.getFirebaseStatus(), "misconfigured");
  assert.equal(calls.initCalls, 0);
  assert.throws(() => firestore.db.collection("products"), /not configured/);
});

test("Firebase: invalid credentials do not crash loading and never leak into the status", () => {
  const { firestore } = loadFresh({ env: { VERCEL: "1", FIREBASE_SERVICE_ACCOUNT_JSON: "not json at all" } });
  assert.equal(firestore.getFirebaseStatus(), "misconfigured");
  assert.equal(JSON.stringify(firestore.getFirebaseStatus()).includes("not json"), false);
});
