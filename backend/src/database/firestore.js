const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { loadFirebaseCredentials, resolveProjectId } = require("./credentials");

// Credentials (server-side only), in priority order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY  (use these on Vercel)
//   2. Application Default Credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a key file (local dev only)
// This module also initialises the default Firebase Admin app that firebase-admin/auth uses.
//
// If initialisation fails (missing/invalid credentials) the function does NOT crash at load time:
// /api/health reports firebase "misconfigured", every database call fails with a safe error, and
// admin authentication fails closed. Error messages never contain credential values.
function createApp() {
  const credentials = loadFirebaseCredentials();
  if (!credentials && process.env.VERCEL) {
    // Application Default Credentials do not exist on Vercel; fail now with a clear message
    // instead of the late, confusing "Could not load the default credentials".
    throw new Error("Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) in the Vercel project's environment variables, then redeploy.");
  }
  return initializeApp({
    credential: credentials ? cert(credentials) : applicationDefault(),
    projectId: credentials ? credentials.projectId : resolveProjectId(),
  });
}

let initError = null;
let app = null;
try {
  app = getApps().length > 0 ? getApps()[0] : createApp();
} catch (error) {
  initError = error;
  console.error("Firebase Admin initialisation failed:", error.message);
}

// When initialisation failed, any use of `db` throws a safe error (routes already catch and return a 500).
const db = app
  ? getFirestore(app)
  : new Proxy({}, { get() { throw new Error("Firestore is unavailable: Firebase Admin is not configured."); } });

function getFirebaseStatus() {
  return initError ? "misconfigured" : "ready";
}

module.exports = { db, getFirebaseStatus };
