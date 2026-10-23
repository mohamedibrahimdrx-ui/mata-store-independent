const { z } = require("zod");
const { DEFAULT_SHIPPING } = require("../config/shipping");

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "اللون لازم يكون بصيغة #RRGGBB");
// Plain text only: React renders these as text, and we also reject angle brackets and control characters.
const text = (min, max) => z.string().trim().min(min).max(max)
  .refine((v) => !/[<>]/.test(v), "ممنوع استخدام رموز HTML")
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "النص فيه رموز غير مسموحة");
const optText = (max) => z.string().trim().max(max).refine((v) => !/[<>\u0000-\u001f\u007f]/.test(v), "النص فيه رموز غير مسموحة");
// Links: https URLs, site-relative paths ("/x") or in-page anchors ("#products"). Never javascript:/data:.
const link = z.string().trim().max(2048).refine((v) => v === "" || /^(https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*|#[A-Za-z0-9_-]*)$/i.test(v), "الرابط لازم يبدأ بـ https:// أو يكون مسارًا يبدأ بـ / أو #قسم");
const imageUrl = z.string().trim().max(2048).refine((v) => v === "" || /^https:\/\/[^\s<>"']+$/i.test(v), "رابط الصورة لازم يبدأ بـ https://");

const announcementSchema = z.object({
  enabled: z.boolean(),
  text: text(1, 200), // may contain **highlighted** words and the {threshold} token
  bgColor: hex, textColor: hex, accentColor: hex,
  linkUrl: link,
  buttonText: optText(30), buttonUrl: link,
  showIcon: z.boolean(), // optional SVG truck icon next to the text (the default text already starts with a truck emoji)
  animation: z.enum(["static", "pulse", "marquee"]),
}).strict().refine((v) => !v.buttonText || v.buttonUrl, { path: ["buttonUrl"], message: "رابط الزر مطلوب لما يكون للزر نص" });

const shippingSchema = z.object({
  freeShippingEnabled: z.boolean(),
  freeShippingThreshold: z.number().int().min(1).max(1000000),
  zoneFees: z.object({
    greaterCairo: z.number().int().min(0).max(5000), deltaCanal: z.number().int().min(0).max(5000),
    upperEgypt: z.number().int().min(0).max(5000), remote: z.number().int().min(0).max(5000),
  }).strict(),
}).strict();

const homepageSchema = z.object({
  hero: z.object({
    enabled: z.boolean(), desktopImage: imageUrl, mobileImage: imageUrl,
    eyebrow: optText(60), title: text(1, 120), subtitle: optText(300),
    buttonText: optText(30), buttonUrl: link,
  }).strict(),
  promo: z.object({
    enabled: z.boolean(), image: imageUrl, title: text(1, 120), description: optText(300),
    buttonText: optText(30), buttonUrl: link,
  }).strict(),
}).strict();

const ICONS = ["truck", "cash", "eye", "return", "shield", "gift", "star", "phone"];
const featuresSchema = z.object({
  enabled: z.boolean(),
  returnPolicy: optText(500), // shown on product pages only when not empty
  items: z.array(z.object({ enabled: z.boolean(), icon: z.enum(ICONS), title: text(1, 60), text: optText(200) }).strict()).max(6),
}).strict();

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/, "المعرّف حروف إنجليزية صغيرة وأرقام وشرطة فقط (2-30 حرف)");
const navLink = z.object({ label: text(1, 30), href: link.refine((v) => v !== "", "الرابط مطلوب") }).strict();
const unique = (items, pick) => new Set(items.map(pick)).size === items.length;

// Name, logo, the "new collection" top bar, header menu and search box text.
const brandSchema = z.object({
  name: text(1, 40), logo: imageUrl, tagline: optText(120), pageTitle: text(1, 120),
  topbar: z.object({ enabled: z.boolean(), text: text(1, 200), link }).strict(),
  nav: z.array(navLink).max(8),
  searchPlaceholder: optText(80),
}).strict();

// Order + visibility of the home page sections, and their headings.
const SECTION_IDS = ["hero", "categories", "products", "promo", "features"];
const layoutSchema = z.object({
  sections: z.array(z.object({ id: z.enum(SECTION_IDS), enabled: z.boolean() }).strict()).length(SECTION_IDS.length)
    .refine((items) => unique(items, (i) => i.id), "كل جزء لازم يظهر مرة واحدة"),
  categoriesTitle: text(1, 80), categoriesSubtitle: optText(160),
  productsTitle: text(1, 80), productsSubtitle: optText(160),
}).strict();

const phone = z.string().trim().refine((v) => v === "" || /^[0-9+\s()-]{6,20}$/.test(v), "رقم هاتف غير صالح");
const email = z.string().trim().max(120).refine((v) => v === "" || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v), "بريد إلكتروني غير صالح");
const waNumber = z.string().trim().refine((v) => v === "" || /^[0-9]{8,15}$/.test(v), "رقم واتساب بالصيغة الدولية أرقام فقط، مثال 201012345678");
const httpsLink = z.string().trim().max(2048).refine((v) => v === "" || /^https:\/\/[^\s<>"']+$/i.test(v), "الرابط لازم يبدأ بـ https://");
const footerSchema = z.object({
  enabled: z.boolean(), about: optText(400), links: z.array(navLink).max(8),
  phone, email, whatsapp: waNumber, instagram: httpsLink, facebook: httpsLink, tiktok: httpsLink,
  copyright: optText(120),
  whatsappButton: z.object({ enabled: z.boolean(), message: optText(200) }).strict(),
}).strict();

// Shop categories. `id` is the stable key stored on products (cannot be renamed, only the display name).
const categoriesSchema = z.object({
  items: z.array(z.object({ id: slug, name: text(1, 40), blurb: optText(80), image: imageUrl, enabled: z.boolean() }).strict())
    .min(1).max(12).refine((items) => unique(items, (i) => i.id), "معرّف القسم مكرر"),
}).strict();

const SCHEMAS = { announcement: announcementSchema, shipping: shippingSchema, homepage: homepageSchema, features: featuresSchema, brand: brandSchema, layout: layoutSchema, footer: footerSchema, categories: categoriesSchema };

const DEFAULTS = {
  announcement: {
    enabled: true,
    text: "🚚 شحن مجاني للطلبات فوق **{threshold} جنيه**! ✨",
    bgColor: "#141210", textColor: "#faf7f2", accentColor: "#d6b46a",
    showIcon: false, linkUrl: "", buttonText: "", buttonUrl: "", animation: "pulse",
  },
  shipping: DEFAULT_SHIPPING,
  homepage: {
    hero: {
      enabled: true, desktopImage: "", mobileImage: "",
      eyebrow: "مجموعة الخريف ٢٠٢٦", title: "أناقة هادية.. وتفاصيل بتفرق",
      subtitle: "شنط ومحافظ وعطور وإكسسوارات مصنوعة بعناية، بتصميمات بسيطة تعيش معاك سنين وتليق على أي إطلالة.",
      buttonText: "تسوّق دلوقتي", buttonUrl: "#products",
    },
    promo: { enabled: false, image: "", title: "المجموعة الجديدة", description: "", buttonText: "", buttonUrl: "" },
  },
  // Only claims that are TRUE for the store today (cash on delivery; shipping fee shown before confirming).
  // "Inspect before receiving" and "14-day returns" are NOT included: add them from the admin panel if they are real policies.
  features: {
    enabled: true, returnPolicy: "",
    items: [
      { enabled: true, icon: "cash", title: "الدفع عند الاستلام", text: "ادفع لما الطلب يوصلك." },
      { enabled: true, icon: "truck", title: "الشحن والتوصيل", text: "شحن لكل المحافظات، وتكلفته بتظهر قبل تأكيد الطلب." },
      { enabled: true, icon: "gift", title: "شحن مجاني", text: "للطلبات فوق {threshold} جنيه." },
    ],
  },
};

DEFAULTS.brand = {
  name: "MATA", logo: "", tagline: "", pageTitle: "MATA | ماتا — شنط ومحافظ وعطور وإكسسوارات",
  topbar: { enabled: true, text: "مجموعة الخريف الجديدة وصلت — اكتشف أحدث التصميمات", link: "" },
  nav: [{ label: "الرئيسية", href: "#top" }, { label: "الأقسام", href: "#categories" }, { label: "وصل حديثاً", href: "#products" }],
  searchPlaceholder: "ابحث عن شنطة، عطر، محفظة…",
};
DEFAULTS.layout = {
  sections: SECTION_IDS.map((id) => ({ id, enabled: true })),
  categoriesTitle: "تسوّق حسب القسم", categoriesSubtitle: "اختار القسم اللي بتدوّر عليه",
  productsTitle: "وصل حديثاً", productsSubtitle: "أحدث القطع في المتجر",
};
// Only facts that are true today; the owner adds contact details and links from the admin panel.
DEFAULTS.footer = {
  enabled: true, about: "", links: [], phone: "", email: "", whatsapp: "", instagram: "", facebook: "", tiktok: "",
  copyright: "جميع الحقوق محفوظة © MATA", whatsappButton: { enabled: false, message: "مرحباً، عندي استفسار" },
};
DEFAULTS.categories = {
  items: [
    { id: "bags", name: "شنط", blurb: "جلد طبيعي بتصميمات هادية", image: "", enabled: true },
    { id: "wallets", name: "محافظ", blurb: "صغيرة وعملية وتدوم", image: "", enabled: true },
    { id: "perfumes", name: "عطور", blurb: "روائح ثابتة وراقية", image: "", enabled: true },
    { id: "accessories", name: "إكسسوارات", blurb: "لمسة أخيرة تكمّل اللوك", image: "", enabled: true },
  ],
};

const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);
const deepMerge = (base, extra) => {
  if (!isPlain(base) || !isPlain(extra)) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) out[k] = k in base ? deepMerge(base[k], extra[k]) : extra[k];
  return out;
};

// Stored document -> valid settings. Anything missing or invalid falls back to the defaults,
// so a bad/absent document can never make the bar, banners or shipping rules disappear.
function resolveSettings(key, raw) {
  const defaults = DEFAULTS[key];
  if (!raw) return defaults;
  const { updatedAt, updatedBy, ...stored } = raw; // eslint-disable-line no-unused-vars
  const parsed = SCHEMAS[key].safeParse(deepMerge(defaults, stored));
  return parsed.success ? parsed.data : defaults;
}

module.exports = { SCHEMAS, DEFAULTS, SETTING_KEYS: Object.keys(SCHEMAS), resolveSettings };
