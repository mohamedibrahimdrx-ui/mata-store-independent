// Use same-origin /api routes for a single-domain Vercel deployment.
// A separate API URL is allowed for development, but localhost must never leak into production builds.
const raw = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
export const API_BASE = import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(raw) ? '' : raw
