const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { createHash } = require("node:crypto");
const { db } = require("../database/firestore");

const router = express.Router();
const validId = (id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);

const noMarkup = (v) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  name: z.string().trim().min(2).max(60).refine(noMarkup, "Invalid characters"),
  text: z.string().trim().min(10).max(1000).refine(noMarkup, "Invalid characters"),
  website: z.string().max(200).optional(), // honeypot: real visitors never fill this hidden field
}).strict();

// Spam protection: 5 submissions per hour per IP (on top of the global limiter).
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "بعتّ مراجعات كتير. حاول بعد شوية." },
});

const toIso = (value) => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  return date ? date.toISOString() : null;
};

function summarize(reviews) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const review of reviews) { distribution[review.rating] += 1; sum += review.rating; }
  const count = reviews.length;
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution };
}

// Public: APPROVED reviews only.
router.get("/product/:productId", async (req, res) => {
  const { productId } = req.params;
  if (!validId(productId)) return res.status(400).json({ error: "INVALID_PRODUCT_ID" });
  try {
    const snapshot = await db.collection("reviews")
      .where("productId", "==", productId).where("status", "==", "approved").limit(500).get();
    const reviews = snapshot.docs.map((doc) => {
      const d = doc.data();
      return { id: doc.id, name: d.name, rating: d.rating, text: d.text, createdAt: toIso(d.createdAt) };
    }).filter((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.set("Cache-Control", "no-store");
    return res.json({ summary: summarize(reviews), reviews: reviews.slice(0, 50) });
  } catch (error) {
    console.error("Reviews read failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public: submit a review. It is stored as "pending" and is NOT visible until an admin approves it.
// The system does not verify purchases, so reviews are never labelled as verified buyers.
router.post("/product/:productId", submitLimiter, async (req, res) => {
  const { productId } = req.params;
  if (!validId(productId)) return res.status(400).json({ error: "INVALID_PRODUCT_ID" });
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_REVIEW", message: "راجع الاسم والتقييم ونص المراجعة (10 حروف على الأقل)." });
  }
  const { website, ...review } = parsed.data;
  if (website) return res.status(201).json({ status: "pending" }); // bot: pretend success, store nothing
  try {
    const product = await db.collection("products").doc(productId).get();
    if (!product.exists || product.get("active") !== true) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND", message: "المنتج غير متاح." });
    }
    // The document id is a hash of product + text, so the same text cannot be posted twice for a product.
    const id = createHash("sha256").update(`${productId}|${review.text.toLowerCase()}`).digest("hex").slice(0, 40);
    try {
      await db.collection("reviews").doc(id).create({ productId, ...review, status: "pending", createdAt: new Date() });
    } catch (error) {
      if (error.code === 6 || /already exists/i.test(error.message)) {
        return res.status(409).json({ error: "DUPLICATE_REVIEW", message: "المراجعة دي اتبعتت قبل كده." });
      }
      throw error;
    }
    return res.status(201).json({ status: "pending" });
  } catch (error) {
    console.error("Review submit failed:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
