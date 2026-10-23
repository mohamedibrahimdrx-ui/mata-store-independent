// Logic tests for settings, shipping/free-shipping, reviews, video and security wiring.
// Runs the REAL route files with in-memory fakes for express, Firestore, multer, Cloudinary and rate limiting,
// so it needs no credentials, no network and never touches real data.   Run:  node tests/logic.test.js
// (zod is loaded from node_modules; set ZOD_PATH only if zod lives elsewhere.)
const Module = require('module'); const path = require('path');
const BACK = path.join(__dirname, '..', 'src');
const Z = process.env.ZOD_PATH || 'zod';
const store = new Map(); let seq = 1; const handlers = {}; let current = 'x';
const mkRouter = (tag) => { const r = {}; for (const m of ['get', 'post', 'put', 'patch', 'delete']) r[m] = (p, ...hs) => { handlers[`${tag} ${m.toUpperCase()} ${p}`] = hs; }; r.use = () => {}; return r; };
class FakeError extends Error { constructor(m, code) { super(m); this.code = code; } }
const colRows = (name) => [...store].filter(([k]) => k.startsWith(name + '/')).map(([k, d]) => ({ id: k.slice(name.length + 1), ref: docRef(name, k.slice(name.length + 1)), data: () => d, get: (f) => d[f] }));
const cmpVal = (v) => (v instanceof Date ? v.getTime() : v);
const OPS = { '==': (a, b) => cmpVal(a) === cmpVal(b), '>=': (a, b) => cmpVal(a) >= cmpVal(b), '<': (a, b) => cmpVal(a) < cmpVal(b) };
const mkQuery = (name, filters = [], order = null) => ({
  where: (f, op, v) => mkQuery(name, [...filters, [f, op, v]], order),
  orderBy: (f, dir) => mkQuery(name, filters, [f, dir]),
  limit: (n) => ({ get: async () => { let rows = colRows(name).filter((r) => filters.every(([f, op, v]) => r.data()[f] !== undefined && OPS[op](r.data()[f], v)));
    if (order) rows = rows.sort((a, b) => (cmpVal(a.data()[order[0]]) - cmpVal(b.data()[order[0]])) * (order[1] === 'desc' ? -1 : 1)); return { docs: rows.slice(0, n) }; } }),
});
const docRef = (name, id) => { const key = `${name}/${id}`; return { id,
  create: async (d) => { if (store.has(key)) throw new FakeError('ALREADY_EXISTS: already exists', 6); store.set(key, d); },
  set: async (d) => { store.set(key, d); }, update: async (d) => { store.set(key, { ...store.get(key), ...d }); }, delete: async () => { store.delete(key); },
  get: async () => ({ exists: store.has(key), id, data: () => store.get(key), get: (f) => store.get(key)?.[f] }) }; };
const fakeDb = { db: {
  collection: (name) => ({ doc: (id) => docRef(name, id || 'gen' + seq++), ...mkQuery(name) }),
  batch: () => { const ops = []; return { update: (ref, d) => ops.push([ref, d]), commit: async () => { for (const [ref, d] of ops) await ref.update(d); } }; },
  runTransaction: async (fn) => fn({ get: (ref) => ref.get(), update: (ref, d) => ref.update(d), create: (ref, d) => ref.create(d) }),
} };
global.__upload = { file: null, err: null }; let cloudinaryMode = 'ok';
class MulterError extends Error { constructor(code) { super(code); this.code = code; } }
const multerStub = () => ({ single: () => (req, res, cb) => { if (global.__upload.err) return cb(global.__upload.err); req.file = global.__upload.file; cb(null); } });
multerStub.memoryStorage = () => ({}); multerStub.MulterError = MulterError;
const cloudinaryStub = { v2: { config() {}, utils: { api_sign_request: (params, secret) => 'sig|' + JSON.stringify(params) + '|' + (secret ? 'has-secret' : 'no-secret') }, uploader: { upload_stream: (opts, cb) => { const { Writable } = require('stream'); return new Writable({ write(c, e, n) { n(); }, final(n) { if (cloudinaryMode === 'fail') cb(Object.assign(new Error('boom api_secret=XYZ'), { http_code: 401 })); else cb(null, { secure_url: 'https://res.cloudinary.com/demo/video/upload/v1/mata/videos/v1.mp4', public_id: 'mata/videos/v1' }); n(); } }); } } } };
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === 'express') return { Router: () => mkRouter(current) };
  if (req === 'zod') return orig.call(this, Z, parent, ...r);
  if (req === 'express-rate-limit') return () => (rq, rs, next) => next();
  if (req === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => new Date() } };
  if (req === 'multer') return multerStub;
  if (req === 'cloudinary') return cloudinaryStub;
  if (req.endsWith('database/firestore')) return fakeDb;
  return orig.call(this, req, parent, ...r);
};
const load = (tag, f) => { current = tag; return require(path.join(BACK, f)); };
load('ORD', 'routes/orders.js'); load('AORD', 'routes/adminOrders.js'); load('SET', 'routes/settings.js'); load('ASET', 'routes/adminSettings.js');
load('REV', 'routes/reviews.js'); load('AREV', 'routes/adminReviews.js'); load('UP', 'routes/adminUpload.js'); load('PUB', 'routes/products.js'); load('APRD', 'routes/adminProducts.js');
const { parseVideoUrl, productSchema, normalizeProductImages } = require(path.join(BACK, 'validators/product.js'));
const { computeShipping } = require(path.join(BACK, 'config/shipping.js'));
const { resolveSettings } = require(path.join(BACK, 'validators/settings.js'));
const call = async (key, req = {}) => { const hs = handlers[key]; if (!hs) throw new Error('no handler ' + key); const out = { status: 200, headers: {} };
  const res = { set(k, v) { out.headers[k] = v; return res; }, status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  const full = { params: {}, body: {}, query: {}, headers: {}, admin: { uid: 'admin1' }, get: (h) => req.headers?.[h], ...req };
  for (let i = 0; i < hs.length; i++) { let nextCalled = false; await hs[i](full, res, () => { nextCalled = true; }); if (!nextCalled) break; } return out; };
let ok = 0, bad = 0; const check = (n, c, info = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + info}`); };
const section = (t) => console.log(`\n--- ${t}`);
const cust = (cityId = 'cairo') => ({ fullName: 'اختبار تجريبي', phone: '01012345678', city: 'القاهرة', cityId, address: 'شارع الاختبار 5', notes: '' });
const KEY = (n) => 'idempotency-key-' + String(n).padStart(8, '0');
const mkProduct = (id, price, stock = 50) => store.set(`products/${id}`, { name: 'منتج ' + id, description: '', price, category: 'bags', image: 'https://res.cloudinary.com/demo/image/upload/a.png', images: ['https://res.cloudinary.com/demo/image/upload/a.png'], active: true, colors: [{ id: 'black', name: 'أسود', hex: '#222222', stock, active: true }] });
const order = (n, items, cityId = 'cairo', extra = {}) => call('ORD POST /', { headers: { 'Idempotency-Key': KEY(n) }, body: { paymentMethod: 'cod', customer: cust(cityId), items, ...extra } });
(async () => {
  section('SHIPPING RULE (server-side) — 999 / 1000 / 1001');
  mkProduct('p999', 999); mkProduct('p1000', 1000); mkProduct('p1001', 1001); mkProduct('p500', 500); mkProduct('p501', 501);
  const o999 = await order(1, [{ productId: 'p999', quantity: 1, colorId: 'black' }]);
  check('999 EGP: shipping charged (50), total 1049', o999.status === 201 && o999.body.shippingFee === 50 && o999.body.total === 1049, JSON.stringify(o999.body));
  const o1000 = await order(2, [{ productId: 'p1000', quantity: 1, colorId: 'black' }]);
  check('exactly 1000 EGP: NOT free (50), total 1050', o1000.body.shippingFee === 50 && o1000.body.total === 1050, JSON.stringify(o1000.body));
  const o1001 = await order(3, [{ productId: 'p1001', quantity: 1, colorId: 'black' }]);
  check('1001 EGP: FREE shipping, total 1001', o1001.body.shippingFee === 0 && o1001.body.total === 1001, JSON.stringify(o1001.body));
  const saved = [...store].filter(([k]) => k.startsWith('orders/')).map(([, d]) => d);
  check('order documents store subtotal/shippingFee/freeShippingApplied/total', saved.every((d) => 'subtotal' in d && 'shippingFee' in d && typeof d.freeShippingApplied === 'boolean' && d.total === d.subtotal + d.shippingFee) && saved.some((d) => d.freeShippingApplied === true));
  const two500 = await order(4, [{ productId: 'p500', quantity: 2, colorId: 'black' }]); check('2 x 500 = 1000: not free', two500.body.shippingFee === 50);
  const two501 = await order(5, [{ productId: 'p501', quantity: 2, colorId: 'black' }]); check('2 x 501 = 1002: free', two501.body.shippingFee === 0 && two501.body.total === 1002);
  const mixed = await order(6, [{ productId: 'p500', quantity: 1, colorId: 'black' }, { productId: 'p501', quantity: 1, colorId: 'black' }]); check('mixed cart 500+501 = 1001: free', mixed.body.shippingFee === 0);
  const delta = await order(7, [{ productId: 'p999', quantity: 1, colorId: 'black' }], 'alexandria'); check('zone fee used (Alexandria 65)', delta.body.shippingFee === 65);
  // tampering
  const t1 = await order(8, [{ productId: 'p999', quantity: 1, colorId: 'black' }], 'cairo', { shippingFee: 0 }); check('client cannot send shippingFee (strict schema -> 400)', t1.status === 400 && t1.body.error === 'INVALID_ORDER');
  const t2 = await order(9, [{ productId: 'p999', quantity: 1, colorId: 'black' }], 'cairo', { total: 1, freeShipping: true }); check('client cannot send total/freeShipping', t2.status === 400);
  const t3 = await order(10, [{ productId: 'p999', quantity: 1, colorId: 'black', unitPrice: 1 }]); check('client cannot send unitPrice', t3.status === 400);
  const t4 = await order(11, [{ productId: 'p999', quantity: 1, colorId: 'black' }], 'atlantis'); check('unknown governorate id rejected (INVALID_CITY)', t4.status === 400 && t4.body.error === 'INVALID_CITY', JSON.stringify(t4.body));
  const stockLeft = store.get('products/p999').colors[0].stock; check('stock decremented only for accepted orders', stockLeft === 48 + 0 || stockLeft === 49 || stockLeft === 48, String(stockLeft));
  const replay = await order(1, [{ productId: 'p999', quantity: 1, colorId: 'black' }]); check('idempotent replay returns same order, no double charge', replay.body.replayed === true && store.get('products/p999').colors[0].stock === stockLeft);
  // configurable from admin
  const put1 = await call('ASET PUT /:key', { params: { key: 'shipping' }, body: { freeShippingEnabled: true, freeShippingThreshold: 500, zoneFees: { greaterCairo: 40, deltaCanal: 60, upperEgypt: 75, remote: 100 } } });
  check('admin sets threshold 500 + new fees', put1.status === 200);
  const c1 = await order(12, [{ productId: 'p501', quantity: 1, colorId: 'black' }]); check('new threshold applied immediately (501 > 500 -> free)', c1.body.shippingFee === 0);
  const c2 = await order(13, [{ productId: 'p500', quantity: 1, colorId: 'black' }]); check('500 with threshold 500 -> paid with NEW fee 40', c2.body.shippingFee === 40, JSON.stringify(c2.body));
  await call('ASET PUT /:key', { params: { key: 'shipping' }, body: { freeShippingEnabled: false, freeShippingThreshold: 500, zoneFees: { greaterCairo: 40, deltaCanal: 60, upperEgypt: 75, remote: 100 } } });
  const c3 = await order(14, [{ productId: 'p1001', quantity: 1, colorId: 'black' }]); check('free shipping disabled -> always charged', c3.body.shippingFee === 40);
  store.delete('settings/shipping');
  const c4 = await order(15, [{ productId: 'p999', quantity: 1, colorId: 'black' }]); check('no settings document -> defaults (1000 / 50)', c4.body.shippingFee === 50);
  store.set('settings/shipping', { freeShippingEnabled: 'yes', freeShippingThreshold: -5 });
  const c5 = await order(16, [{ productId: 'p999', quantity: 1, colorId: 'black' }]); check('corrupted settings document -> safe defaults, orders still work', c5.status === 201 && c5.body.shippingFee === 50);
  store.delete('settings/shipping');
  check('computeShipping unit: 1000 vs 1001', computeShipping(1000, 'giza').fee === 50 && computeShipping(1001, 'giza').fee === 0 && computeShipping(1, 'nope') === null);

  section('SETTINGS (public + admin validation)');
  const pubDefaults = await call('SET GET /');
  check('public settings return defaults when nothing is stored', pubDefaults.status === 200 && pubDefaults.body.announcement.text.includes('{threshold}') && pubDefaults.body.shipping.freeShippingThreshold === 1000 && pubDefaults.body.homepage.hero.title.includes('أناقة') && pubDefaults.body.features.items.length === 3);
  check('default features contain NO unverified promises (no 14-day returns / inspection)', !JSON.stringify(pubDefaults.body.features).match(/14|معاينة|استرجاع|استبدال/));
  const ann = { enabled: true, text: 'خصم **كبير** على المحافظ', bgColor: '#000000', textColor: '#ffffff', accentColor: '#c9a227', showIcon: true, linkUrl: '/', buttonText: 'تسوّق الآن', buttonUrl: '#products', animation: 'marquee' };
  const a1 = await call('ASET PUT /:key', { params: { key: 'announcement' }, body: ann }); check('admin saves announcement', a1.status === 200);
  const a2 = await call('SET GET /'); check('saved announcement is returned publicly', a2.body.announcement.text === ann.text && a2.body.announcement.animation === 'marquee' && !('updatedBy' in a2.body.announcement));
  const bads = [['javascript: link', { ...ann, linkUrl: 'javascript:alert(1)' }], ['data: button link', { ...ann, buttonUrl: 'data:text/html,x' }], ['protocol-relative link', { ...ann, linkUrl: '//evil.com' }], ['HTML in text', { ...ann, text: '<img src=x onerror=alert(1)>' }], ['bad color', { ...ann, bgColor: 'red' }], ['button text without link', { ...ann, buttonUrl: '' }], ['unknown animation', { ...ann, animation: 'explode' }], ['extra field', { ...ann, evil: 1 }], ['empty text', { ...ann, text: '   ' }]];
  for (const [name, body] of bads) { const r = await call('ASET PUT /:key', { params: { key: 'announcement' }, body }); check(`announcement rejected: ${name}`, r.status === 400 && r.body.error === 'INVALID_SETTINGS', JSON.stringify(r.body).slice(0, 120)); }
  const unk = await call('ASET PUT /:key', { params: { key: 'secrets' }, body: {} }); check('unknown settings key -> 404', unk.status === 404);
  const bannerBad = await call('ASET PUT /:key', { params: { key: 'homepage' }, body: { ...pubDefaults.body.homepage, hero: { ...pubDefaults.body.homepage.hero, desktopImage: 'http://insecure.example/x.png' } } }); check('banner image must be https', bannerBad.status === 400);
  const bannerOk = await call('ASET PUT /:key', { params: { key: 'homepage' }, body: { ...pubDefaults.body.homepage, hero: { ...pubDefaults.body.homepage.hero, desktopImage: 'https://res.cloudinary.com/demo/image/upload/h.jpg', mobileImage: 'https://res.cloudinary.com/demo/image/upload/m.jpg', title: 'عنوان جديد' }, promo: { enabled: true, image: 'https://res.cloudinary.com/demo/image/upload/p.jpg', title: 'مجموعة', description: 'وصف', buttonText: 'شوف', buttonUrl: '#products' } } });
  check('hero + promo banners saved', bannerOk.status === 200);
  const hp = (await call('SET GET /')).body.homepage; check('banners restored from Firestore (desktop+mobile images, promo enabled)', hp.hero.title === 'عنوان جديد' && hp.hero.mobileImage.endsWith('m.jpg') && hp.promo.enabled && hp.promo.image.endsWith('p.jpg'));
  const featBad = await call('ASET PUT /:key', { params: { key: 'features' }, body: { enabled: true, returnPolicy: '', items: Array.from({ length: 7 }, () => ({ enabled: true, icon: 'truck', title: 'x', text: '' })) } }); check('max 6 features', featBad.status === 400);
  const featOk = await call('ASET PUT /:key', { params: { key: 'features' }, body: { enabled: true, returnPolicy: 'الاستبدال خلال 14 يوم', items: [{ enabled: true, icon: 'return', title: 'استبدال', text: '14 يوم' }] } }); check('features + return policy saved by admin', featOk.status === 200 && (await call('SET GET /')).body.features.returnPolicy === 'الاستبدال خلال 14 يوم');
  store.set('settings/announcement', { text: 12345 }); check('corrupted announcement doc falls back to defaults (bar never disappears)', resolveSettings('announcement', store.get('settings/announcement')).enabled === true);
  check('admin settings GET works', (await call('ASET GET /')).status === 200);

  section('REVIEWS (moderation + anti-spam)');
  mkProduct('rp1', 300); store.set('products/rinactive', { ...store.get('products/rp1'), active: false });
  const rv = (body) => call('REV POST /product/:productId', { params: { productId: 'rp1' }, body });
  const good = { rating: 5, name: 'أحمد', text: 'منتج ممتاز وجودة عالية جدا' };
  const r1 = await rv(good); check('new review accepted as pending', r1.status === 201 && r1.body.status === 'pending');
  let list = await call('REV GET /product/:productId', { params: { productId: 'rp1' } }); check('pending review NOT visible publicly; no summary numbers', list.body.reviews.length === 0 && list.body.summary.count === 0 && list.body.summary.average === 0);
  const r2 = await rv(good); check('duplicate text for same product -> 409', r2.status === 409);
  const r3 = await rv({ ...good, website: 'http://spam.example' }); check('honeypot filled -> fake 201 but nothing stored', r3.status === 201 && [...store.keys()].filter((k) => k.startsWith('reviews/')).length === 1);
  for (const [n, b] of [['rating 6', { ...good, rating: 6, text: 'نص طويل كفاية للمراجعة' }], ['rating 0', { ...good, rating: 0, text: 'نص آخر طويل كفاية' }], ['short text', { ...good, text: 'قصير' }], ['HTML name', { ...good, name: '<b>x</b>', text: 'نص ثالث طويل كفاية' }], ['extra field', { ...good, status: 'approved', text: 'نص رابع طويل كفاية' }], ['status injection', { ...good, verified: true, text: 'نص خامس طويل كفاية' }]]) { const r = await rv(b); check(`review rejected: ${n}`, r.status === 400, JSON.stringify(r.body)); }
  const rI = await call('REV POST /product/:productId', { params: { productId: 'rinactive' }, body: { ...good, text: 'مراجعة لمنتج غير نشط تماما' } }); check('review for inactive/unknown product -> 404', rI.status === 404);
  const adminPending = await call('AREV GET /', { query: { status: 'pending' } }); const rid = adminPending.body.reviews[0].id;
  check('admin sees the pending review', adminPending.body.reviews.length === 1 && adminPending.body.reviews[0].status === 'pending');
  await call('AREV PATCH /:id', { params: { id: rid }, body: { status: 'approved' } });
  await rv({ rating: 4, name: 'منى', text: 'جيد جدا ولكن التوصيل تأخر قليلا' }); await rv({ rating: 3, name: 'سارة', text: 'مقبول بشكل عام وسعره مناسب' });
  const pend2 = (await call('AREV GET /', { query: { status: 'pending' } })).body.reviews; const toReject = pend2.find((x) => x.name === 'سارة'); const toApprove = pend2.find((x) => x.name === 'منى');
  await call('AREV PATCH /:id', { params: { id: toApprove.id }, body: { status: 'approved' } }); await call('AREV PATCH /:id', { params: { id: toReject.id }, body: { status: 'rejected' } });
  list = await call('REV GET /product/:productId', { params: { productId: 'rp1' } });
  check('approved reviews visible; rejected hidden', list.body.reviews.length === 2 && !list.body.reviews.some((x) => x.name === 'سارة'));
  check('summary: count 2, average 4.5, distribution 5->1, 4->1', list.body.summary.count === 2 && list.body.summary.average === 4.5 && list.body.summary.distribution[5] === 1 && list.body.summary.distribution[4] === 1, JSON.stringify(list.body.summary));
  check('public review has no status/productId/internal fields and no "verified" claim', !JSON.stringify(list.body.reviews).match(/status|productId|verified|moderat/));
  const badStatus = await call('AREV PATCH /:id', { params: { id: rid }, body: { status: 'hacked' } }); check('invalid moderation status rejected', badStatus.status === 400);
  const del = await call('AREV DELETE /:id', { params: { id: rid } }); list = await call('REV GET /product/:productId', { params: { productId: 'rp1' } });
  check('admin delete removes the review', del.status === 200 && list.body.summary.count === 1);
  check('admin can list all / rejected', (await call('AREV GET /', { query: { status: 'all' } })).body.reviews.length === 2 && (await call('AREV GET /', { query: { status: 'rejected' } })).body.reviews.length === 1);

  section('PRODUCT VIDEO');
  const V = (u) => parseVideoUrl(u);
  check('YouTube watch / youtu.be / shorts parsed', V('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.id === 'dQw4w9WgXcQ' && V('https://youtu.be/dQw4w9WgXcQ')?.provider === 'youtube' && V('https://youtube.com/shorts/dQw4w9WgXcQ')?.id === 'dQw4w9WgXcQ');
  check('Vimeo parsed', V('https://vimeo.com/123456789')?.id === '123456789' && V('https://player.vimeo.com/video/123456789')?.provider === 'vimeo');
  check('Cloudinary video parsed with poster', V('https://res.cloudinary.com/demo/video/upload/v1/mata/videos/a.mp4')?.poster === 'https://res.cloudinary.com/demo/video/upload/v1/mata/videos/a.jpg');
  check('direct https mp4 accepted', V('https://cdn.example.com/a/b.mp4?x=1')?.provider === 'file');
  for (const bad of ['http://youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)', 'https://evil.com/page.html', 'https://youtube.com/watch?v=<script>', 'https://vimeo.com/abc', 'not a url']) check(`video rejected: ${bad}`, V(bad) === null);
  const baseP = { name: 'منتج فيديو', description: '', price: 500, category: 'bags', image: 'https://res.cloudinary.com/demo/image/upload/a.png', active: true, colors: [{ id: 'black', name: 'أسود', hex: '#222222', stock: 3, active: true }] };
  check('schema accepts {video:{url}} and rejects bad/extra', productSchema.safeParse({ ...baseP, video: { url: 'https://youtu.be/dQw4w9WgXcQ' } }).success && !productSchema.safeParse({ ...baseP, video: { url: 'https://evil.com/x' } }).success && !productSchema.safeParse({ ...baseP, video: { url: 'https://youtu.be/dQw4w9WgXcQ', provider: 'x' } }).success);
  const created = await call('APRD POST /', { body: { ...baseP, video: { url: 'https://youtu.be/dQw4w9WgXcQ' } } });
  check('admin saves product with video; normalised provider/id stored', created.status === 201 && store.get(`products/${created.body.id}`).video.provider === 'youtube' && store.get(`products/${created.body.id}`).video.id === 'dQw4w9WgXcQ');
  const pl = (await call('PUB GET /')).body.products; check('public API exposes video; product without video has none', pl.find((p) => p.id === created.body.id)?.video?.provider === 'youtube' && !('video' in pl.find((p) => p.id === 'p999')));
  const noVid = await call('APRD POST /', { body: baseP }); check('product WITHOUT video still saves', noVid.status === 201 && !('video' in store.get(`products/${noVid.body.id}`)));
  const rm = await call('APRD PUT /:id', { params: { id: created.body.id }, body: baseP }); check('editing removes the video', rm.status === 200 && !('video' in store.get(`products/${created.body.id}`)));

  section('VIDEO UPLOAD ENDPOINT');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);
  const up = (file, err = null) => { global.__upload = { file, err }; return call('UP POST /video'); };
  process.env.CLOUDINARY_CLOUD_NAME = 'demo'; process.env.CLOUDINARY_API_KEY = 'k'; process.env.CLOUDINARY_API_SECRET = 's';
  let r = await up(null); check('no file -> 400 VIDEO_REQUIRED', r.status === 400 && r.body.error === 'VIDEO_REQUIRED');
  r = await up({ buffer: Buffer.from('this is plainly a text file pretending to be video'), mimetype: 'video/mp4' }); check('fake video (text content) rejected by signature check', r.status === 400 && r.body.error === 'INVALID_VIDEO');
  r = await up(null, new MulterError('LIMIT_FILE_SIZE')); check('too large -> VIDEO_TOO_LARGE with helpful message', r.status === 400 && r.body.error === 'VIDEO_TOO_LARGE' && r.body.message.includes('YouTube'));
  r = await up(null, new Error('نوع الفيديو غير مسموح')); check('wrong mimetype -> INVALID_VIDEO', r.status === 400 && r.body.error === 'INVALID_VIDEO');
  r = await up({ buffer: mp4, mimetype: 'video/mp4' }); check('valid mp4 -> 201 with Cloudinary video URL', r.status === 201 && /^https:\/\/res\.cloudinary\.com\/.+\/video\/upload\//.test(r.body.video) && parseVideoUrl(r.body.video) !== null);
  cloudinaryMode = 'fail'; r = await up({ buffer: mp4, mimetype: 'video/mp4' }); check('Cloudinary failure -> 502, message leaks no secrets', r.status === 502 && !JSON.stringify(r.body).match(/XYZ|api_secret|secret/i), JSON.stringify(r.body)); cloudinaryMode = 'ok';
  delete process.env.CLOUDINARY_API_SECRET; r = await up({ buffer: mp4, mimetype: 'video/mp4' }); check('missing Cloudinary config -> 503', r.status === 503);

  section('FULL STOREFRONT CONTROL: brand / layout / footer / categories');
  const put = (key, body) => call('ASET PUT /:key', { params: { key }, body });
  const pubS = async () => (await call('SET GET /')).body;
  const d0 = await pubS();
  check('public settings include brand, layout, footer, categories with sensible defaults', d0.brand.name === 'MATA' && d0.brand.nav.length === 3 && d0.brand.topbar.text.includes('مجموعة الخريف') && d0.layout.sections.length === 5 && d0.categories.items.length === 4 && d0.footer.copyright.includes('MATA'));
  check('default footer has NO invented contact details', !d0.footer.phone && !d0.footer.email && !d0.footer.whatsapp && !d0.footer.whatsappButton.enabled);
  // brand
  const brand = { ...d0.brand, name: 'متجر ماتا', logo: 'https://res.cloudinary.com/demo/image/upload/logo.png', tagline: 'أناقة', topbar: { enabled: true, text: 'شحن سريع', link: '/offers' }, nav: [{ label: 'الرئيسية', href: '#top' }, { label: 'عروض', href: 'https://example.com/x' }], searchPlaceholder: 'دوّر…' };
  check('admin saves brand (name, logo, top bar, menu, search text)', (await put('brand', brand)).status === 200 && (await pubS()).brand.nav[1].label === 'عروض');
  for (const [n, b] of [['javascript: menu link', { ...brand, nav: [{ label: 'x', href: 'javascript:alert(1)' }] }], ['empty menu link', { ...brand, nav: [{ label: 'x', href: '' }] }], ['9 menu items', { ...brand, nav: Array.from({ length: 9 }, (_, i) => ({ label: 'a' + i, href: '#top' })) }], ['HTML brand name', { ...brand, name: '<b>x</b>' }], ['http logo', { ...brand, logo: 'http://x.com/l.png' }], ['extra field', { ...brand, evil: 1 }]]) { const r = await put('brand', b); check(`brand rejected: ${n}`, r.status === 400, JSON.stringify(r.body)); }
  // layout
  const L = d0.layout; const reordered = { ...L, sections: [{ id: 'products', enabled: true }, { id: 'hero', enabled: true }, { id: 'categories', enabled: false }, { id: 'promo', enabled: true }, { id: 'features', enabled: true }] };
  check('admin reorders/hides home sections and edits headings', (await put('layout', { ...reordered, productsTitle: 'كل المنتجات' })).status === 200 && (await pubS()).layout.sections[0].id === 'products' && (await pubS()).layout.productsTitle === 'كل المنتجات');
  check('layout rejects duplicate / missing / unknown section ids', (await put('layout', { ...L, sections: [...L.sections.slice(0, 4), { id: 'hero', enabled: true }] })).status === 400 && (await put('layout', { ...L, sections: L.sections.slice(0, 4) })).status === 400 && (await put('layout', { ...L, sections: [...L.sections.slice(0, 4), { id: 'evil', enabled: true }] })).status === 400);
  // footer
  const F = d0.footer; const footer = { ...F, about: 'متجر شنط', links: [{ label: 'من نحن', href: '/about' }], phone: '+20 101 234 5678', email: 'info@mata.eg', whatsapp: '201012345678', instagram: 'https://instagram.com/mata', whatsappButton: { enabled: true, message: 'أهلاً' } };
  check('admin saves footer + contact + WhatsApp button', (await put('footer', footer)).status === 200 && (await pubS()).footer.whatsapp === '201012345678');
  for (const [n, b] of [['whatsapp with +/letters', { ...footer, whatsapp: '+20abc' }], ['bad email', { ...footer, email: 'not-an-email' }], ['javascript: social link', { ...footer, instagram: 'javascript:alert(1)' }], ['http social link', { ...footer, facebook: 'http://fb.com/x' }], ['HTML in about', { ...footer, about: '<script>x</script>' }], ['bad phone', { ...footer, phone: 'call me' }]]) { const r = await put('footer', b); check(`footer rejected: ${n}`, r.status === 400, JSON.stringify(r.body)); }
  // categories
  const C0 = d0.categories;
  const withNew = { items: [...C0.items, { id: 'gifts', name: 'هدايا', blurb: 'اختيارات للهدايا', image: '', enabled: true }] };
  check('admin adds a new category', (await put('categories', withNew)).status === 200 && (await pubS()).categories.items.length === 5);
  const pbase = { name: 'منتج هدية', description: '', price: 200, category: 'gifts', image: 'https://res.cloudinary.com/demo/image/upload/g.png', active: true, colors: [{ id: 'c', name: 'لون', hex: '#222222', stock: 4, active: true }] };
  const okGift = await call('APRD POST /', { body: pbase }); check('product can be created in the NEW category', okGift.status === 201);
  const ghost = await call('APRD POST /', { body: { ...pbase, category: 'ghost' } }); check('product in a non-existent category is rejected with a clear message', ghost.status === 400 && ghost.body.details[0].path === 'category', JSON.stringify(ghost.body));
  const delCat = await put('categories', C0); check('deleting a category that still has products is refused (409)', delCat.status === 409 && delCat.body.error === 'CATEGORY_IN_USE' && delCat.body.message.includes('gifts'), JSON.stringify(delCat.body));
  check('...but it can be DISABLED instead (hidden from the store, product stays valid)', (await put('categories', { items: withNew.items.map((i) => (i.id === 'gifts' ? { ...i, enabled: false } : i)) })).status === 200 && (await call('APRD PUT /:id', { params: { id: okGift.body.id }, body: { ...pbase, name: 'منتج هدية 2' } })).status === 200);
  store.delete(`products/${okGift.body.id}`);
  check('after the products are gone the category can be deleted', (await put('categories', C0)).status === 200);
  for (const [n, b] of [['duplicate ids', { items: [C0.items[0], C0.items[0]] }], ['bad slug (uppercase/space)', { items: [{ ...C0.items[0], id: 'Bad Id' }] }], ['empty list', { items: [] }], ['13 categories', { items: Array.from({ length: 13 }, (_, i) => ({ ...C0.items[0], id: 'c' + (i + 10) })) }], ['HTML name', { items: [{ ...C0.items[0], name: '<i>x</i>' }] }]]) { const r = await put('categories', b); check(`categories rejected: ${n}`, r.status === 400, JSON.stringify(r.body)); }
  store.set('settings/brand', { name: 12, nav: 'x' }); check('corrupted brand document falls back to defaults', resolveSettings('brand', store.get('settings/brand')).name === 'MATA');
  // product extras
  const bp = await call('APRD POST /', { body: { ...pbase, category: 'bags', badge: 'جديد', sortOrder: 1, name: 'أول منتج' } });
  check('product badge + sortOrder saved; public API exposes badge', bp.status === 201 && (await call('PUB GET /')).body.products.find((x) => x.id === bp.body.id)?.badge === 'جديد');
  const badBadge = await call('APRD POST /', { body: { ...pbase, category: 'bags', badge: '<b>x</b>' } }); check('badge with HTML rejected', badBadge.status === 400);
  for (let i = 0; i < 60; i++) store.set(`products/bulk${i}`, { ...store.get(`products/${bp.body.id}`), name: 'bulk ' + i, sortOrder: 500 + i, badge: undefined });
  const all = (await call('PUB GET /')).body.products;
  check('public list is no longer capped at 50 products', all.length > 60, String(all.length));
  check('public list respects sortOrder (lowest first)', all[0].id === bp.body.id, all.slice(0, 2).map((x) => x.name).join(','));
  for (let i = 0; i < 60; i++) store.delete(`products/bulk${i}`);

  section('ADMIN ORDERS: sales totals (Cairo time) + read/unread');
  const { startOfDayUtc } = require(path.join(BACK, 'utils/cairoTime.js'));
  const at = (y, m, d, h = 12) => new Date(startOfDayUtc(y, m, d) + h * 3600 * 1000);   // Cairo local time of day
  const mkOrder = (id, createdAt, status, subtotal, shippingFee, extra = {}) => store.set(`orders/${id}`, { orderNumber: id, customer: { fullName: 'عميل', phone: '01012345678' }, items: [], createdAt, status, subtotal, ...(shippingFee === undefined ? {} : { shippingFee, total: subtotal + shippingFee }), ...(shippingFee === undefined ? { total: subtotal } : {}), ...extra });
  for (const k of [...store.keys()]) if (k.startsWith('orders/')) store.delete(k);
  mkOrder('d1', at(2026, 3, 10, 9), 'pending', 500, 50);
  mkOrder('d2', at(2026, 3, 10, 20), 'delivered', 1001, 0);
  mkOrder('d3', at(2026, 3, 10, 23), 'cancelled', 700, 50);             // cancelled: never counted as sales
  mkOrder('d4', at(2026, 3, 10, 0.2), 'shipped', 300, undefined);       // legacy order: no shippingFee, total = subtotal
  mkOrder('e1', at(2026, 3, 11, 1), 'confirmed', 200, 50);
  mkOrder('m1', at(2026, 2, 28, 12), 'delivered', 999, 50);             // another month
  mkOrder('n1', at(2026, 3, 31, 23.5), 'pending', 100, 50);             // last half hour of March in Cairo
  mkOrder('n2', at(2026, 4, 1, 0.3), 'pending', 400, 50);               // first minutes of April in Cairo
  const stats = (q) => call('AORD GET /stats', { query: q });
  let ro = await stats({ period: 'day', date: '2026-03-10' });
  check('daily sales = all non-cancelled orders of that Cairo day (550 + 1001 + 300 = 1851)', ro.status === 200 && ro.body.sales.count === 3 && ro.body.sales.total === 550 + 1001 + 300, JSON.stringify(ro.body.sales));
  check('daily: subtotal / shipping split, legacy order counted without shipping', ro.body.sales.subtotal === 500 + 1001 + 300 && ro.body.sales.shipping === 50);
  check('daily: cancelled order excluded from sales but reported separately', ro.body.byStatus.cancelled.count === 1 && ro.body.byStatus.cancelled.total === 750 && ro.body.byStatus.delivered.total === 1001 && ro.body.byStatus.pending.count === 1);
  ro = await stats({ period: 'day', date: '2026-03-11' }); check('another day only includes its own orders', ro.body.sales.count === 1 && ro.body.sales.total === 250);
  ro = await stats({ period: 'month', date: '2026-03' });
  check('monthly total (March): includes 23:30 on the 31st, excludes 00:18 on April 1st and February orders', ro.body.sales.count === 5 && ro.body.sales.total === 550 + 1001 + 300 + 250 + 150 && !JSON.stringify(ro.body.byDay).includes('2026-04') && !JSON.stringify(ro.body.byDay).includes('2026-02'), JSON.stringify(ro.body.sales));
  check('monthly byDay breakdown sums to the monthly total, ordered by date', ro.body.byDay.map((x) => x.date).join() === '2026-03-10,2026-03-11,2026-03-31' && ro.body.byDay.reduce((a, x) => a + x.total, 0) === ro.body.sales.total && ro.body.byDay[0].count === 3);
  ro = await stats({ period: 'month', date: '2026-04' }); check('April starts at Cairo midnight (the 00:18 order belongs to April)', ro.body.sales.count === 1 && ro.body.sales.total === 450);
  ro = await stats({ period: 'month', date: '2026-01' }); check('empty month -> zeros (no crash)', ro.status === 200 && ro.body.sales.count === 0 && ro.body.sales.total === 0 && ro.body.byDay.length === 0);
  const today = require(path.join(BACK, 'utils/cairoTime.js')).todayInCairo(); mkOrder('today1', new Date(), 'pending', 123, 0);
  ro = await stats({}); check('default = today in Cairo', ro.status === 200 && ro.body.date === today && ro.body.sales.total === 123, JSON.stringify(ro.body));
  for (const [n, q] of [['bad period', { period: 'year' }], ['bad date', { period: 'day', date: '2026-02-30' }], ['garbage date', { date: 'abc' }], ['injection-like date', { date: "2026-03-10' OR 1=1" }]]) { const x = await stats(q); check(`stats rejects: ${n}`, x.status === 400, JSON.stringify(x.body)); }
  // read / unread
  const seenCall = (id, body) => call('AORD PATCH /:id/seen', { params: { id }, body });
  check('new orders are unread by default (no seen flag)', store.get('orders/d1').seen === undefined);
  ro = await seenCall('d1', { seen: true }); check('mark as read stores seen/seenAt/seenBy', ro.status === 200 && store.get('orders/d1').seen === true && store.get('orders/d1').seenBy === 'admin1' && !!store.get('orders/d1').seenAt);
  ro = await seenCall('d1', { seen: false }); check('mark as unread again', store.get('orders/d1').seen === false && store.get('orders/d1').seenAt === null);
  check('seen validation: non-boolean / unknown order / bad id', (await seenCall('d1', { seen: 'yes' })).status === 400 && (await seenCall('nope', { seen: true })).status === 404 && (await seenCall('../x', { seen: true })).status === 400);
  ro = await call('AORD POST /seen-all'); check('mark ALL as read', ro.status === 200 && ro.body.updated > 5 && [...store].filter(([k, v]) => k.startsWith('orders/') && v.seen !== true).length === 0, JSON.stringify(ro.body));
  ro = await call('AORD PATCH /:id/status', { params: { id: 'e1' }, body: { status: 'shipped' } }); check('status update still follows the allowed transitions (confirmed -> shipped)', ro.status === 200 && store.get('orders/e1').status === 'shipped');
  await seenCall('e1', { seen: false }); await call('AORD PATCH /:id/status', { params: { id: 'e1' }, body: { status: 'delivered' } }); check('changing the status marks the order as read', store.get('orders/e1').seen === true);
  ro = await call('AORD PATCH /:id/status', { params: { id: 'd2' }, body: { status: 'pending' } }); check('invalid transition still refused (delivered -> pending)', ro.status === 409);
  ro = await call('AORD GET /', { query: { limit: '9999' } }); check('order list returns orders (limit capped)', ro.status === 200 && ro.body.orders.length > 5);

  section('SIGNED DIRECT UPLOAD (Vercel has a ~4.5 MB request-body limit)');
  process.env.CLOUDINARY_CLOUD_NAME = 'demo'; process.env.CLOUDINARY_API_KEY = 'k'; process.env.CLOUDINARY_API_SECRET = 'topsecret';
  let sg = await call('UP POST /sign', { body: { type: 'image' } });
  check('sign image: folder/formats are server-chosen and part of the signature', sg.status === 200 && sg.body.folder === 'mata/products' && sg.body.allowedFormats === 'jpg,jpeg,png,webp' && sg.body.signature.includes('"folder":"mata/products"') && sg.body.signature.includes('"allowed_formats":"jpg,jpeg,png,webp"') && Number.isInteger(sg.body.timestamp), JSON.stringify(sg.body));
  check('sign image: upload URL targets the configured cloud and /image/upload; limit is 5 MB', sg.body.uploadUrl === 'https://api.cloudinary.com/v1_1/demo/image/upload' && sg.body.maxBytes === 5 * 1024 * 1024 && sg.body.apiKey === 'k');
  check('sign: the API secret is never returned', !JSON.stringify(sg.body).includes('topsecret'));
  sg = await call('UP POST /sign', { body: { type: 'video' } });
  check('sign video: video folder, formats, /video/upload and configured size cap', sg.status === 200 && sg.body.folder === 'mata/videos' && sg.body.allowedFormats === 'mp4,webm,mov' && sg.body.uploadUrl.endsWith('/video/upload') && sg.body.maxBytes === 50 * 1024 * 1024);
  for (const bad of [{}, { type: 'raw' }, { type: '__proto__' }, { type: ['image'] }, { type: 'image/../x' }]) { sg = await call('UP POST /sign', { body: bad }); check('sign rejects type ' + JSON.stringify(bad), sg.status === 400 && sg.body.error === 'INVALID_UPLOAD_TYPE', JSON.stringify(sg.body)); }
  check('sign: client cannot pick the folder', (await call('UP POST /sign', { body: { type: 'image', folder: 'evil' } })).body.folder === 'mata/products');
  delete process.env.CLOUDINARY_API_SECRET; sg = await call('UP POST /sign', { body: { type: 'image' } }); check('sign: missing Cloudinary config -> 503', sg.status === 503);
  process.env.CLOUDINARY_API_SECRET = 's';

  section('STATIC SECURITY CHECKS on app.js (server.js only calls listen)');
  const srv = require('fs').readFileSync(path.join(BACK, '../app.js'), 'utf8');
  for (const m of ['/api/admin/settings', '/api/admin/reviews', '/api/admin/upload', '/api/admin/products', '/api/admin/orders']) check(`${m} mounted behind requireAdmin`, new RegExp(`app\\.use\\("${m}", requireAdmin`).test(srv));
  check('public routes /api/settings and /api/reviews mounted', /app\.use\("\/api\/settings"/.test(srv) && /app\.use\("\/api\/reviews"/.test(srv));
  check('helmet + CORS + rate limit still present, DELETE allowed in CORS', srv.includes('helmet()') && srv.includes('cors(') && srv.includes('rateLimit(') && srv.includes('"DELETE"'));
  console.log(`\nPHASE RESULT: ${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
