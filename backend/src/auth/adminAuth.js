const { getAuth } = require("firebase-admin/auth");
// Ensures the Firebase Admin app (with its credentials) is initialised before verifyIdToken is called.
require("../database/firestore");

// Verifies the Firebase ID token, then checks the uid against the ADMIN_UIDS allow-list.
// Fails closed: any verification problem (including missing Firebase credentials) is a 401.
async function requireAdmin(req, res, next) {
  const match = (req.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "AUTH_REQUIRED" });
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    const allowedUids = (process.env.ADMIN_UIDS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!allowedUids.length || !allowedUids.includes(decoded.uid)) return res.status(403).json({ error: "ADMIN_ONLY" });
    req.admin = { uid: decoded.uid, email: decoded.email || "" };
    return next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

module.exports = requireAdmin;
<<<<<<< HEAD
module.exports.requireAdmin = requireAdmin;
=======
>>>>>>> cd9eccd63c9330d33b8807fdf5dc11a6578c0b8f
