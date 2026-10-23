const express = require("express");
const { db } = require("../database/firestore");
const { SCHEMAS, SETTING_KEYS } = require("../validators/settings");
const { loadAllSettings } = require("./settings");

// Mounted behind requireAdmin.
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    return res.json(await loadAllSettings());
  } catch (error) {
    console.error("Admin settings read failed:", error.message);
    return res.status(500).json({ error: "SETTINGS_UNAVAILABLE" });
  }
});

router.put("/:key", async (req, res) => {
  const { key } = req.params;
  if (!SETTING_KEYS.includes(key)) return res.status(404).json({ error: "Unknown setting" });
  const parsed = SCHEMAS[key].safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_SETTINGS",
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (key === "categories") {
    // A category that still has products cannot be removed (those products would lose their section).
    try {
      const keep = new Set(parsed.data.items.map((item) => item.id));
      const snapshot = await db.collection("products").limit(1000).get();
      const orphaned = [...new Set(snapshot.docs.map((doc) => doc.data().category).filter((c) => c && !keep.has(c)))];
      if (orphaned.length) {
        return res.status(409).json({
          error: "CATEGORY_IN_USE",
          message: `مينفعش تحذف الأقسام دي لأن عليها منتجات: ${orphaned.join("، ")}. انقل المنتجات لقسم تاني الأول، أو سيب القسم وعطّله بدل الحذف.`,
        });
      }
    } catch (error) {
      console.error("Category usage check failed:", error.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  try {
    await db.collection("settings").doc(key).set({ ...parsed.data, updatedAt: new Date(), updatedBy: req.admin.uid });
    return res.json({ key, settings: parsed.data });
  } catch (error) {
    console.error("Admin settings write failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
