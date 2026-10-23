const express = require("express");
const { db } = require("../database/firestore");
const { productSchema, normalizeProductImages } = require("../validators/product");
const { getCategoryIds } = require("../config/categories");
const router = express.Router();
const products = () => db.collection("products");
const validId = id => /^[a-zA-Z0-9_-]{1,100}$/.test(id);

function invalid(res, error) {
  return res.status(400).json({ error: "INVALID_PRODUCT", details: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
}
router.get("/", async (req, res) => {
  try {
    const snap = await products().limit(200).get();
    return res.set("Cache-Control", "no-store").json({ products: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    console.error("Admin product list failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to load products" });
  }
});
router.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    if (!(await getCategoryIds()).includes(parsed.data.category)) {
      return res.status(400).json({ error: "INVALID_PRODUCT", details: [{ path: "category", message: "القسم غير موجود. أضفه من إعدادات الأقسام الأول." }] });
    }
    const ref = products().doc();
    const now = new Date();
    const data = normalizeProductImages(parsed.data);
    await ref.create({ ...data, createdAt: now, updatedAt: now, createdBy: req.admin.uid, updatedBy: req.admin.uid });
    return res.status(201).json({ id: ref.id, product: { id: ref.id, ...data } });
  } catch (e) {
    console.error("Admin product create failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to create product" });
  }
});
router.put("/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid product ID" });
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    if (!(await getCategoryIds()).includes(parsed.data.category)) {
      return res.status(400).json({ error: "INVALID_PRODUCT", details: [{ path: "category", message: "القسم غير موجود. أضفه من إعدادات الأقسام الأول." }] });
    }
    const ref = products().doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists) return res.status(404).json({ error: "Product not found" });
    const data = normalizeProductImages(parsed.data);
    const old = existing.data() || {};
    // set() (not update()) so optional fields the admin removed (e.g. compareAtPrice, features, color images)
    // are really removed instead of lingering from the previous version. Creation metadata is preserved.
    await ref.set({
      ...data,
      createdAt: old.createdAt || new Date(),
      createdBy: old.createdBy || req.admin.uid,
      updatedAt: new Date(),
      updatedBy: req.admin.uid,
    });
    return res.json({ id: ref.id, product: { id: ref.id, ...data } });
  } catch (e) {
    console.error("Admin product update failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to update product" });
  }
});
router.patch("/:id/active", async (req, res) => {
  if (!validId(req.params.id) || typeof req.body?.active !== "boolean") return res.status(400).json({ error: "Expected product ID and boolean active value" });
  try {
    const ref = products().doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: "Product not found" });
    await ref.update({ active: req.body.active, updatedAt: new Date(), updatedBy: req.admin.uid });
    return res.json({ id: ref.id, active: req.body.active });
  } catch (e) {
    console.error("Admin product status update failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to update product status" });
  }
});
module.exports = router;
