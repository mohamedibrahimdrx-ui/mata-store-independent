
const express = require("express");
const { z } = require("zod");
const { randomBytes, createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../database/firestore");
const { computeShipping } = require("../config/shipping");
const { resolveSettings } = require("../validators/settings");

const router = express.Router();

const customerSchema = z.object({
  fullName: z.string().trim().min(3).max(100),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/),
  city: z.string().trim().min(2).max(100),
  cityId: z.string().trim().min(1).max(100),
  address: z.string().trim().min(5).max(300),
  notes: z.string().trim().max(500).optional().default(""),
}).strict();

const orderSchema = z.object({
  paymentMethod: z.literal("cod"),
  customer: customerSchema,
  items: z.array(
    z.object({
      productId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      quantity: z.number().int().min(1).max(20),
      colorId: z.string().min(1).max(40).optional(),
    }).strict()
  ).min(1).max(20),
}).strict();

function hashRequest(customer, items) {
  const canonicalItems = [...items].sort((a, b) => {
    const first = `${a.productId}::${a.colorId || ""}`;
    const second = `${b.productId}::${b.colorId || ""}`;
    return first.localeCompare(second);
  });

  return createHash("sha256")
    .update(JSON.stringify({
      customer,
      items: canonicalItems,
      paymentMethod: "cod",
    }))
    .digest("hex");
}

router.post("/", async (req, res) => {
  const idempotencyKey = req.get("Idempotency-Key");

  if (
    !idempotencyKey ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)
  ) {
    return res.status(400).json({
      error: "INVALID_IDEMPOTENCY_KEY",
      message: "مفتاح الطلب غير صالح.",
    });
  }

  const parsed = orderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_ORDER",
      message: "راجع بيانات العميل والمنتجات والكميات.",
    });
  }

  const { customer, items } = parsed.data;

  // Combine repeated selections of the same product and color.
  const quantities = new Map();

  for (const item of items) {
    const key = `${item.productId}::${item.colorId || "default"}`;
    const previous = quantities.get(key);

    quantities.set(key, {
      productId: item.productId,
      colorId: item.colorId || null,
      quantity: (previous?.quantity || 0) + item.quantity,
    });
  }

  const normalizedItems = [...quantities.values()];

  if (normalizedItems.some((item) => item.quantity > 20)) {
    return res.status(400).json({
      error: "INVALID_QUANTITY",
      message: "الكمية المطلوبة غير مسموح بها.",
    });
  }

  const requestHash = hashRequest(customer, normalizedItems);

  // Store a hash of the client key, not the raw key.
  const idempotencyHash = createHash("sha256")
    .update(idempotencyKey)
    .digest("hex");

  const idempotencyRef = db
    .collection("idempotencyKeys")
    .doc(idempotencyHash);

  const productIds = [
    ...new Set(normalizedItems.map((item) => item.productId)),
  ];

  const productRefs = productIds.map((id) =>
    db.collection("products").doc(id)
  );

  // These values are reused if Firestore retries the transaction callback.
  const orderRef = db.collection("orders").doc();
  const orderNumber = `MATA-${randomBytes(5).toString("hex").toUpperCase()}`;

  try {
    const result = await db.runTransaction(async (transaction) => {
      // Check the idempotency record before reading or changing stock.
      const idempotencySnapshot = await transaction.get(idempotencyRef);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data();

        if (previous.requestHash !== requestHash) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }

        return {
          orderNumber: previous.orderNumber,
          replayed: true,
        };
      }

      // Read all products before writing anything.
      const snapshots = await Promise.all(
        productRefs.map((ref) => transaction.get(ref))
      );

      const productsById = new Map();

      for (let i = 0; i < snapshots.length; i += 1) {
        const snapshot = snapshots[i];

        if (!snapshot.exists || snapshot.get("active") !== true) {
          throw new Error("PRODUCT_UNAVAILABLE");
        }

        productsById.set(productIds[i], {
          ref: productRefs[i],
          data: snapshot.data(),
        });
      }

      // Shipping rules live in Firestore (editable by the admin). Read BEFORE any write in this transaction.
      const shippingSnapshot = await transaction.get(db.collection("settings").doc("shipping"));
      const shippingSettings = resolveSettings("shipping", shippingSnapshot.exists ? shippingSnapshot.data() : null);

      const stockUpdates = new Map();
      const confirmedItems = [];
      let total = 0;

      for (const item of normalizedItems) {
        const entry = productsById.get(item.productId);
        const product = entry.data;

        if (
          typeof product.name !== "string" ||
          !Number.isSafeInteger(product.price) ||
          product.price <= 0
        ) {
          throw new Error("INVALID_PRODUCT_DATA");
        }

        const colors = Array.isArray(product.colors)
          ? product.colors
          : [];

        const selectedColor = colors.find(
          (color) =>
            color.id === item.colorId &&
            color.active === true
        );

        if (!selectedColor) {
          throw new Error(
            colors.length > 0 ? "COLOR_UNAVAILABLE" : "COLOR_REQUIRED"
          );
        }

        if (
          typeof selectedColor.name !== "string" ||
          typeof selectedColor.hex !== "string" ||
          !Number.isSafeInteger(selectedColor.stock) ||
          selectedColor.stock < 0
        ) {
          throw new Error("INVALID_PRODUCT_DATA");
        }

        const colorKey = `${item.productId}::${selectedColor.id}`;

        const currentStock = stockUpdates.has(colorKey)
          ? stockUpdates.get(colorKey).stock
          : selectedColor.stock;

        if (currentStock < item.quantity) {
          throw new Error("OUT_OF_STOCK");
        }

        stockUpdates.set(colorKey, {
          productId: item.productId,
          colorId: selectedColor.id,
          stock: currentStock - item.quantity,
        });

        const lineTotal = product.price * item.quantity;

        if (!Number.isSafeInteger(lineTotal)) {
          throw new Error("INVALID_PRODUCT_DATA");
        }

        total += lineTotal;

        if (!Number.isSafeInteger(total)) {
          throw new Error("INVALID_PRODUCT_DATA");
        }

        confirmedItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          lineTotal,
          colorId: selectedColor.id,
          colorName: selectedColor.name,
          colorHex: selectedColor.hex,
          image: selectedColor.image || product.image || "",
        });
      }

      // Shipping is computed here from the DATABASE prices: the browser's numbers are never used.
      const shipping = computeShipping(total, customer.cityId, shippingSettings);
      if (!shipping) throw new Error("INVALID_CITY");
      const grandTotal = total + shipping.fee;

      // Update only products whose color stock changed.
      const changedProductIds = new Set(
        [...stockUpdates.values()].map((update) => update.productId)
      );

      for (const productId of changedProductIds) {
        const entry = productsById.get(productId);

        const updatedColors = entry.data.colors.map((color) => {
          const key = `${productId}::${color.id}`;
          const update = stockUpdates.get(key);

          return update
            ? { ...color, stock: update.stock }
            : color;
        });

        transaction.update(entry.ref, {
          colors: updatedColors,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Save the order and its idempotency record atomically.
      transaction.create(orderRef, {
        orderNumber,
        customer,
        items: confirmedItems,
        subtotal: total,
        shippingFee: shipping.fee,
        freeShippingApplied: shipping.freeShipping,
        total: grandTotal,
        currency: "EGP",
        paymentMethod: "cod",
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.create(idempotencyRef, {
        orderNumber,
        orderId: orderRef.id,
        requestHash,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        orderNumber,
        replayed: false,
        subtotal: total,
        shippingFee: shipping.fee,
        total: grandTotal,
      };
    });

    return res.status(201).json({
      orderNumber: result.orderNumber,
      replayed: result.replayed,
      ...(result.replayed ? {} : { subtotal: result.subtotal, shippingFee: result.shippingFee, total: result.total }),
    });
  } catch (error) {
    const knownErrors = {
      PRODUCT_UNAVAILABLE: [
        400,
        "فيه منتج غير متاح ضمن الطلب.",
      ],
      INVALID_PRODUCT_DATA: [
        500,
        "تعذر التحقق من بيانات أحد المنتجات.",
      ],
      COLOR_UNAVAILABLE: [
        400,
        "اللون المختار غير متاح.",
      ],
      COLOR_REQUIRED: [
        400,
        "لازم تختار لونًا متاحًا لكل منتج.",
      ],
      INVALID_CITY: [
        400,
        "اختار محافظة صحيحة.",
      ],
      OUT_OF_STOCK: [
        409,
        "الكمية المطلوبة غير متوفرة حاليًا.",
      ],
      IDEMPOTENCY_KEY_REUSED: [
        409,
        "مفتاح الطلب مستخدم بالفعل لبيانات طلب مختلفة.",
      ],
    };

    const known = knownErrors[error.message];

    if (known) {
      if (known[0] === 500) {
        console.error("Invalid product data during order.");
      }

      return res.status(known[0]).json({
        error: error.message,
        message: known[1],
      });
    }

    console.error(
      "Order creation failed:",
      error.code || "UNKNOWN"
    );

    return res.status(500).json({
      error: "ORDER_FAILED",
      message: "حصلت مشكلة أثناء تسجيل الطلب.",
    });
  }
});

module.exports = router;
