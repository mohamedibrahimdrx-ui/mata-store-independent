// Loads backend/.env for local development only. On Vercel, variables come from Project Settings.
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const productsRouter = require("./src/routes/products");
const ordersRouter = require("./src/routes/orders");
const adminProductsRouter = require("./src/routes/adminProducts");
const adminOrdersRouter = require("./src/routes/adminOrders");
const adminUploadRouter = require("./src/routes/adminUpload");
const settingsRouter = require("./src/routes/settings");
const reviewsRouter = require("./src/routes/reviews");
const adminSettingsRouter = require("./src/routes/adminSettings");
const adminReviewsRouter = require("./src/routes/adminReviews");
const { requireAdmin } = require("./src/middleware/adminAuth");
// TEMPORARY DIAGNOSTIC (remove after the Vercel "argument handler must be a function" error is identified).
// Vercel compiles this entrypoint (the stack trace shows backend/app.cjs). If its CommonJS conversion changes
// what a local module exports, app.use() receives a non-function. Check every local export BEFORE any
// route is registered, log its shape, and fail with a message that names the exact module.
const exportChecks = [
  ["./src/routes/products", productsRouter],
  ["./src/routes/orders", ordersRouter],
  ["./src/routes/adminProducts", adminProductsRouter],
  ["./src/routes/adminOrders", adminOrdersRouter],
  ["./src/routes/adminUpload", adminUploadRouter],
  ["./src/routes/settings", settingsRouter],
  ["./src/routes/reviews", reviewsRouter],
  ["./src/routes/adminSettings", adminSettingsRouter],
  ["./src/routes/adminReviews", adminReviewsRouter],
  ["./src/middleware/adminAuth (requireAdmin)", requireAdmin],
];
const describeExport = (value) => {
  if (value === null) return "null";
  const type = typeof value;
  if (type !== "object" && type !== "function") return type;
  let names;
  try { names = Object.getOwnPropertyNames(value); } catch { names = ["<unreadable>"]; }
  return `${type} with keys [${names.join(", ")}] (toString: ${Object.prototype.toString.call(value)})`;
};
const invalidExports = [];
for (const [name, value] of exportChecks) {
  const type = value === null ? "null" : typeof value;
  if (type === "function") {
    console.log(`[export-check] ${name}: typeof=function`);
  } else {
    const shape = describeExport(value);
    console.error(`[export-check] ${name}: typeof=${type}, INVALID, shape: ${shape}`);
    invalidExports.push(`${name} -> ${shape}`);
  }
}
if (invalidExports.length) {
  throw new Error(`Invalid Express export(s) (expected a function): ${invalidExports.join(" | ")}`);
}
const app = express();
app.disable("x-powered-by");
// Vercel (and most hosts) sit behind a proxy: needed so rate limiting sees the real client IP, not the proxy's.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map(x => x.trim()).filter(Boolean),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
}));
app.use(express.json({ limit: "10kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/products", productsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reviews", reviewsRouter);
const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "TOO_MANY_REQUESTS", message: "محاولات كتير لتسجيل الطلبات. حاول بعد شوية." } });
app.use("/api/orders", orderLimiter, ordersRouter);
app.use("/api/admin/products", requireAdmin, adminProductsRouter);
app.use("/api/admin/orders", requireAdmin, adminOrdersRouter);
app.use("/api/admin/settings", requireAdmin, adminSettingsRouter);
app.use("/api/admin/reviews", requireAdmin, adminReviewsRouter);
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "TOO_MANY_REQUESTS", message: "محاولات رفع كتير. حاول بعد شوية." } });
// requireAdmin runs BEFORE multer, so unauthenticated requests never reach the upload handler.
app.use("/api/admin/upload", requireAdmin, uploadLimiter, adminUploadRouter);
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "Invalid JSON" });
  console.error("Request failed:", err.message);
  return res.status(500).json({ error: "Internal server error" });
});
module.exports = app;