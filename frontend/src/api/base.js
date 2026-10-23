// Base URL for API calls. Empty string = same-origin ("/api/..."), which is what Vercel production uses
// and what the Vite dev proxy (vite.config.js) expects. Set VITE_API_URL only for a separate API domain.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
