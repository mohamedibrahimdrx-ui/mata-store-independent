// Local / traditional-host entry point. On Vercel this file is NOT used: the backend service's entrypoint is app.js, which exports the same app.
const app = require("./app");
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`MATA API running on port ${PORT}`));
