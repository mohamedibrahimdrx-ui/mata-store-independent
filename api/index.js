// Vercel serverless entry point. Keep business logic and middleware in backend/app.js.
// Do not call app.listen() in a Vercel Function; export the Express request handler.
const app = require("../backend/app");
module.exports = app;
