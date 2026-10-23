const express = require("express");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../database/firestore");
const router = express.Router();
const transitions = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered"]),
  delivered: new Set(),
  cancelled: new Set(),
};
router.get("/", async (req, res) => {
  const n = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(n) ? Math.min(Math.max(n, 1), 100) : 50;
  try {
    const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(limit).get();
    return res.set("Cache-Control", "no-store").json({ orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    console.error("Admin order list failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to load orders" });
  }
});
router.patch("/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body || {};
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ error: "Invalid order ID" });
  if (!Object.prototype.hasOwnProperty.call(transitions, status)) return res.status(400).json({ error: "Invalid order status" });
  const orderRef = db.collection("orders").doc(id);
  try {
    const result = await db.runTransaction(async tx => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const order = orderSnap.data();
      if (order.status === status) return { unchanged: true };
      if (!transitions[order.status]?.has(status)) throw new Error("INVALID_STATUS_TRANSITION");
      if (status === "cancelled") {
        const items = Array.isArray(order.items) ? order.items : [];
        const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))];
        const refs = productIds.map(pid => db.collection("products").doc(pid));
        const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
        const productMap = new Map();
        snaps.forEach((snap, i) => { if (snap.exists) productMap.set(productIds[i], { ref: refs[i], data: snap.data() }); });
        const increments = new Map();
        for (const item of items) {
          const p = productMap.get(item.productId);
          if (!p || !item.colorId || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
          const key = `${item.productId}::${item.colorId}`;
          const color = (Array.isArray(p.data.colors) ? p.data.colors : []).find(c => c.id === item.colorId);
          if (!color || !Number.isInteger(color.stock) || color.stock < 0) continue;
          if (!increments.has(key)) increments.set(key, { quantity: 0 });
          increments.get(key).quantity += item.quantity;
        }
        for (const productId of productIds) {
          const p = productMap.get(productId);
          if (!p) continue;
          const colors = Array.isArray(p.data.colors) ? p.data.colors : [];
          tx.update(p.ref, {
            colors: colors.map(c => {
              const inc = increments.get(`${productId}::${c.id}`);
              return inc ? { ...c, stock: c.stock + inc.quantity } : c;
            }),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      tx.update(orderRef, { status, updatedAt: FieldValue.serverTimestamp(), updatedBy: req.admin.uid });
      return { unchanged: false };
    });
    return res.json({ id, status, ...result });
  } catch (e) {
    if (e.message === "ORDER_NOT_FOUND") return res.status(404).json({ error: "Order not found" });
    if (e.message === "INVALID_STATUS_TRANSITION") return res.status(409).json({ error: "INVALID_STATUS_TRANSITION" });
    console.error("Admin order status update failed:", e.code || e.message || "UNKNOWN");
    return res.status(500).json({ error: "Unable to update order status" });
  }
});
module.exports = router;
