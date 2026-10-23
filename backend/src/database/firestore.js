const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { loadFirebaseCredentials, resolveProjectId } = require("./credentials");

// Credentials (server-side only), in priority order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY  (use these on Vercel)
//   2. Application Default Credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a key file (local dev)
// This module also initialises the default Firebase Admin app that firebase-admin/auth uses.
function createApp() {
  const credentials = loadFirebaseCredentials();
  return initializeApp({
    credential: credentials ? cert(credentials) : applicationDefault(),
    projectId: credentials ? credentials.projectId : resolveProjectId(),
  });
}

const app = getApps().length > 0 ? getApps()[0] : createApp();
const db = getFirestore(app);

module.exports = { db };
