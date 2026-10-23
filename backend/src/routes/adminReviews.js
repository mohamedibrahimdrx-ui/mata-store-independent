const express = require("express");
const { z } = require("zod");
const { db } = require("../database/firestore");

// Mounted behind requireAdmin.
const router = express.Router();
const validId = (id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const STATUSES = ["pending", "approved", "rejected"];
const toIso = (v) => (v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null);

router.get("/", async (req, res) => {
  const status = String(req.query.status || "pending");
  if (status !== "all" && !STATUSES.includes(status)) return res.status(400).json({ error: "INVALID_STATUS" });
  try {
    const col = db.collection("reviews");
    const snapshot = await (status === "all" ? col.limit(300) : col.where("status", "==", status).limit(300)).get();
    const reviews = snapshot.docs.map((doc) => {
      const d = doc.data();
      return { id: doc.id, productId: d.productId, name: d.name, rating: d.rating, text: d.text, status: d.status, createdAt: toIso(d.createdAt) };
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return res.json({ reviews });
  } catch (error) {
    console.error("Admin reviews read failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "INVALID_ID" });
  const parsed = z.object({ status: z.enum(STATUSES) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_STATUS" });
  try {
    const ref = db.collection("reviews").doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: "Review not found" });
    await ref.update({ status: parsed.data.status, moderatedAt: new Date(), moderatedBy: req.admin.uid });
    return res.json({ id: ref.id, status: parsed.data.status });
  } catch (error) {
    console.error("Admin review update failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const ref = db.collection("reviews").doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: "Review not found" });
    await ref.delete();
    return res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    console.error("Admin review delete failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
