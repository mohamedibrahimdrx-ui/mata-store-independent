
const raw = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// In production, don't allow localhost URLs in the built frontend.
export const API_BASE =
  import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw)
    ? ""
    : raw;
