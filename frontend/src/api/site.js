import { DEFAULT_SETTINGS, mergeSettings } from '../site/defaults'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

async function getJson(path, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Never throws: on any failure the storefront keeps using the built-in defaults.
export async function fetchSiteSettings() {
  try {
    const data = await getJson('/api/settings')
    return mergeSettings(DEFAULT_SETTINGS, data)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function fetchReviews(productId) {
  return getJson(`/api/reviews/product/${encodeURIComponent(productId)}`)
}

export async function submitReview(productId, payload) {
  const res = await fetch(`${API_URL}/api/reviews/product/${encodeURIComponent(productId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const messages = { TOO_MANY_REQUESTS: data.message, DUPLICATE_REVIEW: data.message, INVALID_REVIEW: data.message }
    throw new Error(messages[data.error] || 'مقدرناش نبعت المراجعة. حاول تاني بعد شوية.')
  }
  return data
}
