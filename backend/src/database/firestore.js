
const {
  initializeApp,
  applicationDefault,
  getApps,
} = require("firebase-admin/app");

const {
  getFirestore,
} = require("firebase-admin/firestore");

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
        projectId: "mata-store-eg",
      });

const db = getFirestore(app);

module.exports = { db };
