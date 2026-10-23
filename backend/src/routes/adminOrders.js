const express = require("express");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../database/firestore");
const { localDate, todayInCairo, parseDate, dayRange, monthRange, TZ } = require("../utils/cairoTime");
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
  const limit = Number.isInteger(n) ? Math.min(Math.max(n, 1), 300) : 50;
  try {
    const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(limit).get();
    return res.set("Cache-Control", "no-store").json({ orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    console.error("Admin order list failed:", e.code || "UNKNOWN");
    return res.status(500).json({ error: "Unable to load orders" });
  }
});
const toMs = (v) => (v?.toDate ? v.toDate().getTime() : v instanceof Date ? v.getTime() : null);
const num = (v) => (Number.isFinite(v) ? v : null);

// Sales figures for one Cairo day or month. "Sales" = every order that is not cancelled
// (cancelled orders are listed separately and never counted). Computed here, not in the browser,
// because the order list endpoint is capped.
router.get("/stats", async (req, res) => {
  const period = req.query.period === undefined ? "day" : req.query.period;
  if (period !== "day" && period !== "month") return res.status(400).json({ error: "INVALID_PERIOD" });
  const parsed = parseDate(req.query.date || (period === "day" ? todayInCairo() : todayInCairo().slice(0, 7)));
  if (!parsed) return res.status(400).json({ error: "INVALID_DATE" });
  const range = period === "day" ? dayRange(parsed) : monthRange(parsed);
  const LIMIT = 5000;
  try {
    const snap = await db.collection("orders")
      .where("createdAt", ">=", new Date(range.from)).where("createdAt", "<", new Date(range.to)).limit(LIMIT).get();
    const empty = () => ({ count: 0, total: 0 });
    const byStatus = { pending: empty(), confirmed: empty(), shipped: empty(), delivered: empty(), cancelled: empty() };
    const sales = { count: 0, total: 0, subtotal: 0, shipping: 0 };
    const days = new Map();
    for (const doc of snap.docs) {
      const o = doc.data();
      const shipping = num(o.shippingFee) ?? 0;
      const total = num(o.total) ?? num(o.subtotal) ?? 0;
      const subtotal = num(o.subtotal) ?? total - shipping;
      const bucket = byStatus[o.status] || (byStatus[o.status] = empty());
      bucket.count += 1; bucket.total += total;
      if (o.status === "cancelled") continue;
      sales.count += 1; sales.total += total; sales.subtotal += subtotal; sales.shipping += shipping;
      const ms = toMs(o.createdAt);
      if (ms !== null) {
        const key = localDate(ms);
        const day = days.get(key) || { date: key, count: 0, total: 0 };
        day.count += 1; day.total += total; days.set(key, day);
      }
    }
    return res.set("Cache-Control", "no-store").json({
      period, date: period === "day" ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : `${parsed.y}-${String(parsed.m).padStart(2, "0")}`,
      timezone: TZ, sales, byStatus,
      byDay: period === "month" ? [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) : undefined,
      truncated: snap.docs.length >= LIMIT,
    });
  } catch (e) {
    console.error("Admin order stats failed:", e.code || e.message || "UNKNOWN");
    return res.status(500).json({ error: "Unable to calculate sales" });
  }
});

// Read / unread tracking (for the admin's own inbox view; the customer never sees this).
router.post("/seen-all", async (req, res) => {
  try {
    const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(300).get();
    const unseen = snap.docs.filter((d) => d.data().seen !== true);
    for (let i = 0; i < unseen.length; i += 400) {
      const batch = db.batch();
      unseen.slice(i, i + 400).forEach((d) => batch.update(d.ref || db.collection("orders").doc(d.id), { seen: true, seenAt: new Date(), seenBy: req.admin.uid }));
      await batch.commit();
    }
    return res.json({ updated: unseen.length });
  } catch (e) {
    console.error("Admin mark-all-seen failed:", e.code || e.message || "UNKNOWN");
    return res.status(500).json({ error: "Unable to update orders" });
  }
});

router.patch("/:id/seen", async (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ error: "Invalid order ID" });
  if (typeof (req.body || {}).seen !== "boolean") return res.status(400).json({ error: "INVALID_SEEN" });
  const seen = req.body.seen;
  try {
    const ref = db.collection("orders").doc(id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: "Order not found" });
    await ref.update(seen ? { seen: true, seenAt: new Date(), seenBy: req.admin.uid } : { seen: false, seenAt: null, seenBy: null });
    return res.json({ id, seen });
  } catch (e) {
    console.error("Admin order seen update failed:", e.code || e.message || "UNKNOWN");
    return res.status(500).json({ error: "Unable to update order" });
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
      tx.update(orderRef, { status, seen: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: req.admin.uid });
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
