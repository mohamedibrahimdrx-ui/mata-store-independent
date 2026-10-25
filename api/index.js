// Vercel Function entry point. The whole Express app (backend/app.js) runs as ONE function;
// vercel.json rewrites every /api/* request to it, and Express keeps the original path (e.g. /api/products).
// No app.listen here: Vercel calls the exported app as a (req, res) handler.
module.exports = require("../backend/app");
