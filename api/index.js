// Vercel Function entry point. Vercel routes every /api/* request here (see vercel.json "rewrites").
// The Express app is exported as-is: an Express app is itself a (req, res) request handler.
// Plain CommonJS on purpose: Vercel traces the required files and runs them as written,
// so there is no bundler rewriting the backend's module exports.
module.exports = require("../backend/app");
