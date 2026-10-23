
const { z } = require("zod");

// http(s) only: z.string().url() alone also accepts schemes such as javascript:
const imageUrlSchema = z.string().url().max(2048).regex(/^https?:\/\//i, "Image URL must start with http:// or https://");
const MAX_IMAGES = 10;

// Product video: an uploaded Cloudinary video, a YouTube/Vimeo link, or a direct https .mp4/.webm/.mov file.
// Anything else (other hosts, http:, javascript:, ...) is rejected. The stored shape is { provider, url, id?, poster? }.
function parseVideoUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const youtubeId = /^[A-Za-z0-9_-]{11}$/;
  if (host === "res.cloudinary.com" && /^\/[^/]+\/video\/upload\//.test(u.pathname) && /\.(mp4|webm|mov)$/i.test(u.pathname)) {
    return { provider: "cloudinary", url: u.href, poster: `${u.origin}${u.pathname.replace(/\.[a-z0-9]+$/i, ".jpg")}` };
  }
  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    const id = u.pathname === "/watch" ? u.searchParams.get("v") : (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/) || [])[1];
    return id && youtubeId.test(id) ? { provider: "youtube", url: u.href, id } : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return youtubeId.test(id) ? { provider: "youtube", url: u.href, id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = (u.pathname.match(/^\/(?:video\/)?(\d{6,12})(?:\/|$)/) || [])[1];
    return id ? { provider: "vimeo", url: u.href, id } : null;
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { provider: "file", url: u.href };
  return null;
}

const videoInputSchema = z.object({ url: z.string().url().max(2048) }).strict().superRefine((value, ctx) => {
  if (!parseVideoUrl(value.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Video must be an uploaded video or a YouTube/Vimeo/.mp4 https link" });
  }
});

const productColorSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image: imageUrlSchema.optional(),
  // Optional gallery for this color; when present the storefront shows these instead of the product gallery.
  images: z.array(imageUrlSchema).max(MAX_IMAGES).optional(),
  stock: z.number().int().min(0).max(100000),
  active: z.boolean().default(true),
});

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  price: z.number().int().positive().max(10000000),
  // Valid ids are the categories defined in the admin panel; adminProducts.js checks the id exists.
  category: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/, "Invalid category id"),
  image: imageUrlSchema,
  // Full ordered gallery; the first item is the main image (kept in sync with `image`).
  images: z.array(imageUrlSchema).max(MAX_IMAGES).optional(),
  // Optional "before discount" price; the storefront shows it struck through when higher than `price`.
  compareAtPrice: z.number().int().positive().max(10000000).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  specifications: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    value: z.string().trim().min(1).max(200),
  }).strict()).max(20).optional(),
  dimensions: z.string().trim().max(300).optional(),
  video: videoInputSchema.optional(),
  badge: z.string().trim().max(20).refine((v) => !/[<>]/.test(v), "Invalid characters").optional(), // small label on the card, e.g. "جديد"
  sortOrder: z.number().int().min(0).max(100000).optional(), // lower = shown first
  active: z.boolean().default(true),
  colors: z.array(productColorSchema).min(1).max(30),
}).strict().superRefine((product, ctx) => {
  const ids = product.colors.map((color) => color.id);

  if (product.compareAtPrice !== undefined && product.compareAtPrice <= product.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["compareAtPrice"],
      message: "Price before discount must be higher than the current price",
    });
  }

  if (product.images && new Set(product.images).size !== product.images.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["images"],
      message: "Duplicate images are not allowed",
    });
  }

  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["colors"],
      message: "Color IDs must be unique",
    });
  }
});

// Keeps `image` (main) and `images` (gallery) consistent and backward compatible:
// products with only `image` get images = [image]; otherwise image = images[0].
function normalizeProductImages(product) {
  const source = Array.isArray(product.images) && product.images.length ? product.images : [product.image];
  const images = [...new Set(source)];
  const colors = product.colors.map((color) =>
    color.images && color.images.length ? { ...color, image: color.images[0] } : color
  );
  const normalized = { ...product, images, image: images[0], colors };
  if (product.video) normalized.video = parseVideoUrl(product.video.url);
  return normalized;
}

module.exports = {
  parseVideoUrl,
  normalizeProductImages,
  productSchema,
  productColorSchema,
};