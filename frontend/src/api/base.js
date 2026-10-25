<<<<<<< HEAD
// Base URL for API calls. Empty string = same-origin ("/api/..."), which is what Vercel production uses
// and what the Vite dev proxy (vite.config.js) expects. Set VITE_API_URL only for a separate API domain.
const raw = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
// Safety net: a localhost URL left in an env file must never end up in a production bundle.
export const API_BASE = import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(raw) ? '' : raw
=======
// Keep API requests same-origin so Vercel serves the frontend and API under one domain.
export const API_BASE = ''
>>>>>>> cd9eccd63c9330d33b8807fdf5dc11a6578c0b8f
