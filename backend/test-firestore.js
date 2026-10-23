
const {
  initializeApp,
  applicationDefault,
} = require("firebase-admin/app");

const {
  getFirestore,
} = require("firebase-admin/firestore");

initializeApp({
  credential: applicationDefault(),
  projectId: "mata-store-eg",
});

async function testConnection() {
  try {
    const db = getFirestore();

    await db.listCollections();

    console.log("Firestore connection successful.");
  } catch (error) {
    console.error("Firestore connection failed.");
    console.error("Error code:", error.code || "UNKNOWN");
    console.error("Error message:", error.message);
    process.exitCode = 1;
  }
}

testConnection();
