// Local / traditional-host entry point. On Vercel this file is NOT used: api/index.js exports the same app.
const app = require("./app");
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`MATA API running on port ${PORT}`));
