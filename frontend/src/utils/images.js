// Cloudinary delivery optimisation: serves a resized, auto-format (WebP/AVIF) and auto-quality copy.
// Non-Cloudinary URLs (e.g. manually pasted links) are returned unchanged.
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i

export function optimizeImage(url, width) {
  if (typeof url !== 'string') return url
  const match = url.match(CLOUDINARY_UPLOAD)
  if (!match) return url
  return `${match[1]}f_auto,q_auto,w_${Math.round(width)}/${match[2]}`
}
