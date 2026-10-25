<<<<<<< HEAD
// Vercel Function entry point. The whole Express app (backend/app.js) runs as ONE function;
// vercel.json rewrites every /api/* request to it, and Express keeps the original path (e.g. /api/products).
// No app.listen here: Vercel calls the exported app as a (req, res) handler.
=======
// Vercel Function entry point. vercel.json rewrites every /api/* request here.
// The Express app is exported as-is: an Express app is itself a (req, res) request handler.
// Plain CommonJS on purpose: Vercel traces the required files and runs them as written,
// so there is no bundler rewriting the backend's module exports.
>>>>>>> cd9eccd63c9330d33b8807fdf5dc11a6578c0b8f
module.exports = require("../backend/app");
