const express = require("express");
const { db } = require("../database/firestore");
const { SETTING_KEYS, resolveSettings } = require("../validators/settings");

const router = express.Router();

async function loadAllSettings() {
  const snapshots = await Promise.all(SETTING_KEYS.map((key) => db.collection("settings").doc(key).get()));
  const result = {};
  SETTING_KEYS.forEach((key, i) => { result[key] = resolveSettings(key, snapshots[i].exists ? snapshots[i].data() : null); });
  return result;
}

// Public: everything the storefront needs to render the bar, banners, features and shipping rules.
router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=15");
    return res.json(await loadAllSettings());
  } catch (error) {
    console.error("Settings read failed:", error.message);
    return res.status(500).json({ error: "SETTINGS_UNAVAILABLE" });
  }
});

module.exports = router;
module.exports.loadAllSettings = loadAllSettings;
