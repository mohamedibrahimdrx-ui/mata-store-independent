// Local / traditional-host entry point (npm start, npm run dev). On Vercel this file is NOT used:
// the serverless function in /api/index.js exports the same Express app from app.js.
const app = require("./app");
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`MATA API running on port ${PORT}`));
