const { db } = require("../database/firestore");
const { resolveSettings } = require("../validators/settings");

// Category ids currently defined by the admin (settings/categories), falling back to the defaults.
async function getCategoryIds() {
  const snapshot = await db.collection("settings").doc("categories").get();
  const settings = resolveSettings("categories", snapshot.exists ? snapshot.data() : null);
  return settings.items.map((item) => item.id);
}

module.exports = { getCategoryIds };
