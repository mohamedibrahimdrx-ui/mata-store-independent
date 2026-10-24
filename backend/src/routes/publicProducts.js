
const express = require("express");
const { z } = require("zod");
const { db } = require("../database/firestore");

const router = express.Router();

const productIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,100}$/);

const colorSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image: z.string().url().max(2048).optional(),
  images: z.array(z.string().url().max(2048)).max(10).optional(),
  stock: z.number().int().min(0),
  active: z.boolean(),
});

// Read-side projection of a stored product. Admin writes also store server metadata
// (createdAt, updatedAt, createdBy, updatedBy), so this schema must NOT be strict:
// unknown keys are stripped, and formatProduct() below whitelists every field returned
// to visitors. (Write-side strictness stays in validators/product.js.)
const productSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  price: z.number().int().positive(),
  category: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/),
  image: z.string().url().max(2048),
  images: z.array(z.string().url().max(2048)).max(10).optional(),
  compareAtPrice: z.number().int().positive().optional(),
  features: z.array(z.string().max(200)).max(20).optional(),
  specifications: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).max(20).optional(),
  dimensions: z.string().max(300).optional(),
  badge: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
  video: z.object({
    provider: z.enum(["cloudinary", "youtube", "vimeo", "file"]),
    url: z.string().url().max(2048),
    id: z.string().max(40).optional(),
    poster: z.string().url().max(2048).optional(),
  }).optional(),
  active: z.boolean(),
  colors: z.array(colorSchema).max(30),
});

function formatProduct(doc) {
  const parsed = productSchema.safeParse(doc.data());

  if (!parsed.success) {
    // Safe diagnostics: document id + failing field paths only, never values.
    console.error(
      "Invalid product document:",
      doc.id,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).join(", ")
    );
    return null;
  }

  const product = parsed.data;

  return {
    id: doc.id,
    name: product.name,
    description: product.description || "",
    price: product.price,
    image: product.image,
    // Gallery: main image first, then the rest. Old products (only `image`) get a one-item gallery.
    images: [...new Set([product.image, ...(product.images || [])])],
    ...(product.compareAtPrice > product.price ? { compareAtPrice: product.compareAtPrice } : {}),
    ...(product.features?.length ? { features: product.features } : {}),
    ...(product.specifications?.length ? { specifications: product.specifications } : {}),
    ...(product.dimensions ? { dimensions: product.dimensions } : {}),
    ...(product.video ? { video: product.video } : {}),
    ...(product.badge ? { badge: product.badge } : {}),
    category: product.category,
    colors: product.colors
      .filter((color) => color.active)
      .map((color) => ({
        id: color.id,
        name: color.name,
        hex: color.hex,
        image: color.image || product.image,
        images: color.images || [],
        stock: color.stock,
      })),
  };
}

router.get("/", async (req, res) => {
  try {
    const snapshot = await db
      .collection("products")
      .where("active", "==", true)
      .limit(200)
      .get();

    // Order: admin "display order" first (lower = earlier), then newest, then name.
    const toMillis = (v) => (v?.toDate ? v.toDate().getTime() : v instanceof Date ? v.getTime() : 0);
    const products = snapshot.docs
      .map((doc) => {
        const product = formatProduct(doc);
        if (!product) return null;
        const data = doc.data();
        return { product, order: Number.isInteger(data.sortOrder) ? data.sortOrder : 1000, created: toMillis(data.createdAt) };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || b.created - a.created || a.product.name.localeCompare(b.product.name, "ar"))
      .map((row) => row.product);

    res.set("Cache-Control", "no-store");
    return res.json({ products });
  } catch (error) {
    console.error("Products query failed:", error.code || "UNKNOWN");
    return res.status(500).json({
      error: "Unable to load products",
    });
  }
});

router.get("/:id", async (req, res) => {
  const parsedId = productIdSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid product ID" });
  }

  try {
    const doc = await db
      .collection("products")
      .doc(parsedId.data)
      .get();

    if (!doc.exists || doc.get("active") !== true) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = formatProduct(doc);

    if (!product) {
      return res.status(500).json({
        error: "Product data is invalid",
      });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Product query failed:", error.code || "UNKNOWN");
    return res.status(500).json({
      error: "Unable to load product",
    });
  }
});

module.exports = router;
