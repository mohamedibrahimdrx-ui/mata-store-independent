// Vercel Function entry point. vercel.json rewrites every /api/* request here, and the Express app
// routes it using the original URL, so all existing API paths (/api/products, /api/admin/...) are unchanged.
module.exports = require("../backend/app");
