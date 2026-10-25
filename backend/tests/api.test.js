// Integration tests for the admin product + image upload API.
// Firebase Auth/Firestore and Cloudinary are replaced with in-memory fakes,
// so these tests need no credentials and never touch real data.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.PORT = "3999";
process.env.ADMIN_UIDS = "admin1";
process.env.FRONTEND_ORIGIN = "http://localhost:5173,https://mata-store-new-4wse.vercel.app";
process.env.CLOUDINARY_CLOUD_NAME = "demo";
process.env.CLOUDINARY_API_KEY = "key";
process.env.CLOUDINARY_API_SECRET = "secret";

// ---- fake Firebase Auth
const authPath = require.resolve("firebase-admin/auth");
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  getAuth: () => ({
    verifyIdToken: async (t) => {
      if (t === "admin-token") return { uid: "admin1", email: "a@x.com" };
      if (t === "user-token") return { uid: "someone-else" };
      throw new Error("bad token");
    },
  }),
} };

// ---- fake Firestore
const store = new Map();
let nextId = 1;
const fakeDb = {
  collection: (name) => ({
    doc: (id) => {
      const docId = id || `doc${nextId++}`;
      const key = `${name}/${docId}`;
      return {
        id: docId,
        create: async (d) => { store.set(key, d); },
        set: async (d) => { store.set(key, d); },
        get: async () => ({ exists: store.has(key), id: docId, data: () => store.get(key), get: (f) => store.get(key)?.[f] }),
        update: async (d) => { store.set(key, { ...store.get(key), ...d }); },
      };
    },
    limit: () => ({ get: async () => ({ docs: [...store].filter(([k]) => k.startsWith(name + "/")).map(([k, v]) => ({ id: k.split("/")[1], data: () => v })) }) }),
    where: (field, op, value) => ({ limit: () => ({ get: async () => ({ docs: [...store].filter(([k, v]) => k.startsWith(name + "/") && v[field] === value).map(([k, v]) => ({ id: k.split("/")[1], data: () => v, get: (f) => v[f] })) }) }) }),
  }),
};
const dbPath = path.resolve(__dirname, "../src/database/firestore.js");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { db: fakeDb, getFirebaseStatus: () => "ready" } };

// ---- fake Cloudinary upload
const { v2: cloudinary } = require("cloudinary");
let cloudinaryCalls = 0;
cloudinary.uploader.upload_stream = (opts, cb) => {
  const { Writable } = require("node:stream");
  return new Writable({ write(c, e, n) { n(); }, final(n) { cloudinaryCalls++; cb(null, { secure_url: "https://res.cloudinary.com/demo/image/upload/v1/mata/products/x.png", public_id: "mata/products/x" }); n(); } });
};

require("../server.js");
const BASE = "http://localhost:3999";
const auth = { Authorization: "Bearer admin-token" };
const json = { ...auth, "Content-Type": "application/json" };

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const validProduct = () => ({
  name: "شنطة اختبار", description: "وصف", price: 499, category: "bags",
  image: "https://res.cloudinary.com/demo/image/upload/x.png", active: true,
  colors: [{ id: "black", name: "أسود", hex: "#222222", stock: 5, active: true }],
});
const form = (buf, type, name = "a.png") => { const f = new FormData(); f.append("image", new Blob([buf], { type }), name); return f; };

test("server up", async () => { await new Promise((r) => setTimeout(r, 300)); const r = await fetch(`${BASE}/api/health`); assert.equal(r.status, 200); });

test("CORS: Vercel origin is allowed for API requests and preflight", async () => {
  const origin = "https://mata-store-new-4wse.vercel.app";
  const response = await fetch(`${BASE}/api/health`, { headers: { Origin: origin } });
  assert.equal(response.headers.get("access-control-allow-origin"), origin);

  const preflight = await fetch(`${BASE}/api/orders`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/i);
});

test("upload: no token -> 401", async () => { const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", body: form(PNG, "image/png") }); assert.equal(r.status, 401); });
test("upload: non-admin -> 403", async () => { const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: { Authorization: "Bearer user-token" }, body: form(PNG, "image/png") }); assert.equal(r.status, 403); });
test("upload: missing file -> 400", async () => { const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: auth, body: new FormData() }); assert.equal(r.status, 400); assert.equal((await r.json()).error, "IMAGE_REQUIRED"); });
test("upload: gif mimetype -> 400", async () => { const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: auth, body: form(Buffer.from("GIF89a"+"x".repeat(30)), "image/gif", "a.gif") }); assert.equal(r.status, 400); assert.equal((await r.json()).error, "INVALID_IMAGE"); });
test("upload: fake PNG (text content) -> 400, never reaches Cloudinary", async () => { const before = cloudinaryCalls; const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: auth, body: form(Buffer.from("this is not an image at all"), "image/png") }); assert.equal(r.status, 400); assert.equal(cloudinaryCalls, before); });
test("upload: > 5MB -> 400 IMAGE_TOO_LARGE", async () => { const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]); const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: auth, body: form(big, "image/png") }); assert.equal(r.status, 400); assert.equal((await r.json()).error, "IMAGE_TOO_LARGE"); });
test("upload: valid PNG as admin -> 201 with Cloudinary secure_url", async () => { const r = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: auth, body: form(PNG, "image/png") }); assert.equal(r.status, 201); const d = await r.json(); assert.match(d.image, /^https:\/\/res\.cloudinary\.com\//); });

test("product: valid create -> 201", async () => { const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(validProduct()) }); assert.equal(r.status, 201); });
test("product: no token -> 401", async () => { const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validProduct()) }); assert.equal(r.status, 401); });
test("product: price as string -> 400 INVALID_PRODUCT with details", async () => { const p = validProduct(); p.price = "499"; const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(p) }); const d = await r.json(); assert.equal(r.status, 400); assert.equal(d.error, "INVALID_PRODUCT"); assert.ok(d.details.some((x) => x.path === "price")); });
test("product: negative stock / bad category / bad hex -> 400", async () => { const p = validProduct(); p.category = "shoes"; p.colors[0].stock = -1; p.colors[0].hex = "red"; const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(p) }); const d = await r.json(); assert.equal(r.status, 400); assert.ok(d.details.length >= 3); });
test("product: ROOT CAUSE - stored fields (id/createdAt/...) sent back on edit -> 400", async () => { const p = { ...validProduct(), id: "doc1", createdAt: { _seconds: 1 }, updatedAt: { _seconds: 1 }, createdBy: "admin1" }; const r = await fetch(`${BASE}/api/admin/products/doc1`, { method: "PUT", headers: json, body: JSON.stringify(p) }); const d = await r.json(); assert.equal(r.status, 400); assert.equal(d.error, "INVALID_PRODUCT"); });
test("product: ROOT CAUSE - empty color image '' -> 400", async () => { const p = validProduct(); p.colors[0].image = ""; const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(p) }); assert.equal(r.status, 400); });
test("product: edit with clean payload (what the fixed form sends) -> 200 and persisted", async () => { const p = { ...validProduct(), price: 650 }; const r = await fetch(`${BASE}/api/admin/products/doc1`, { method: "PUT", headers: json, body: JSON.stringify(p) }); assert.equal(r.status, 200); const saved = [...store.entries()].find(([k]) => k === "products/doc1")[1]; assert.equal(saved.price, 650); });

// ---- Public storefront API (regression: admin-written metadata must not hide products)
test("public: admin-created ACTIVE product is returned (with createdAt/updatedBy stored) and metadata is not leaked", async () => {
  const create = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify({ ...validProduct(), name: "منتج ظاهر للزوار" }) });
  assert.equal(create.status, 201);
  const { id } = await create.json();
  assert.ok(store.get(`products/${id}`).createdAt && store.get(`products/${id}`).updatedBy, "admin metadata is stored");
  const r = await fetch(`${BASE}/api/products`); const d = await r.json();
  assert.equal(r.status, 200);
  const found = d.products.find((p) => p.id === id);
  assert.ok(found, "active product must appear in public list");
  assert.equal(typeof found.price, "number");
  assert.ok(!("createdBy" in found) && !("updatedBy" in found) && !("createdAt" in found));
  const one = await fetch(`${BASE}/api/products/${id}`); assert.equal(one.status, 200);
});
test("public: inactive products are hidden from visitors", async () => {
  const create = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify({ ...validProduct(), name: "منتج مخفي", active: false }) });
  const { id } = await create.json();
  const d = await (await fetch(`${BASE}/api/products`)).json();
  assert.ok(!d.products.some((p) => p.id === id));
  assert.equal((await fetch(`${BASE}/api/products/${id}`)).status, 404);
});
test("public: product edited by admin (updatedAt/updatedBy added) is still returned", async () => {
  const create = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify({ ...validProduct(), name: "قبل التعديل" }) });
  const { id } = await create.json();
  const put = await fetch(`${BASE}/api/admin/products/${id}`, { method: "PUT", headers: json, body: JSON.stringify({ ...validProduct(), name: "بعد التعديل", price: 777 }) });
  assert.equal(put.status, 200);
  const d = await (await fetch(`${BASE}/api/products`)).json();
  assert.equal(d.products.find((p) => p.id === id)?.price, 777);
});

// ---- Multi-image gallery (images[], colors[].images[]) + backward compatibility
const U = (x) => `https://res.cloudinary.com/demo/image/upload/${x}.png`;
const galleryProduct = () => ({ ...validProduct(), name: "منتج بمعرض صور", image: U("a"), images: [U("a"), U("b"), U("c")], compareAtPrice: 900, features: ["ميزة"], specifications: [{ label: "الخامة", value: "جلد" }], dimensions: "10×10",
  colors: [{ id: "black", name: "أسود", hex: "#222222", stock: 5, active: true, images: [U("b"), U("c")] }] });

test("gallery: create product with 3 images + color images, stored in Firestore", async () => {
  const r = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(galleryProduct()) });
  assert.equal(r.status, 201); const { id } = await r.json();
  const saved = store.get(`products/${id}`);
  assert.equal(saved.images.length, 3); assert.equal(saved.image, saved.images[0]); assert.equal(saved.colors[0].images.length, 2);
});
test("gallery: public API exposes images, color images and detail fields", async () => {
  const d = await (await fetch(`${BASE}/api/products`)).json();
  const p = d.products.find((x) => x.name === "منتج بمعرض صور");
  assert.ok(p); assert.equal(p.images.length, 3); assert.equal(p.images[0], p.image);
  assert.equal(p.colors[0].images.length, 2); assert.equal(p.compareAtPrice, 900); assert.equal(p.dimensions, "10×10");
});
test("gallery: legacy product with only `image` still works (images = [image])", async () => {
  store.set("products/legacy-old", { ...validProduct(), name: "منتج قديم", active: true });
  const d = await (await fetch(`${BASE}/api/products`)).json();
  const p = d.products.find((x) => x.id === "legacy-old");
  assert.ok(p); assert.deepEqual(p.images, [p.image]);
});
test("gallery: edit reorders images and removes dropped optional fields", async () => {
  const create = await fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(galleryProduct()) });
  const { id } = await create.json();
  const edit = { ...galleryProduct(), images: [U("c"), U("a")], image: U("c"), colors: [{ id: "black", name: "أسود", hex: "#222222", stock: 5, active: true }] };
  delete edit.compareAtPrice;
  const put = await fetch(`${BASE}/api/admin/products/${id}`, { method: "PUT", headers: json, body: JSON.stringify(edit) });
  assert.equal(put.status, 200);
  const saved = store.get(`products/${id}`);
  assert.deepEqual(saved.images, [U("c"), U("a")]); assert.equal(saved.image, U("c")); assert.ok(!("compareAtPrice" in saved));
});
test("gallery: invalid galleries are rejected (11 images, duplicates, javascript: URL, compareAtPrice <= price)", async () => {
  const post = (body) => fetch(`${BASE}/api/admin/products`, { method: "POST", headers: json, body: JSON.stringify(body) });
  assert.equal((await post({ ...galleryProduct(), images: Array.from({ length: 11 }, (_, i) => U("i" + i)) })).status, 400);
  assert.equal((await post({ ...galleryProduct(), images: [U("a"), U("a")] })).status, 400);
  assert.equal((await post({ ...galleryProduct(), images: ["javascript:alert(1)"] })).status, 400);
  assert.equal((await post({ ...galleryProduct(), compareAtPrice: 100 })).status, 400);
});
