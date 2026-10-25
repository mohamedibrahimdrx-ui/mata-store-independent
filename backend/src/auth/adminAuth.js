
const { getAuth } = require("firebase-admin/auth");

// Initialize Firebase Admin before verifying ID tokens.
require("../database/firestore");

// Verify the Firebase ID token and check the UID against ADMIN_UIDS.
async function requireAdmin(req, res, next) {
  const match = (req.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  try {
    const decoded = await getAuth().verifyIdToken(match[1]);

    const allowedUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);

    if (!allowedUids.includes(decoded.uid)) {
      return res.status(403).json({ error: "ADMIN_ONLY" });
    }

    req.admin = {
      uid: decoded.uid,
      email: decoded.email || "",
    };

    return next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

module.exports = requireAdmin;
