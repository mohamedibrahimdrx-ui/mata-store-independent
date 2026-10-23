import { findGovernorate } from './checkoutRules'

// DISPLAY helpers only. The real shipping fee is calculated and stored by the backend when the order is placed;
// these functions mirror backend/src/config/shipping.js so the shopper sees the same numbers.

// Free shipping applies when the products subtotal is GREATER THAN OR EQUAL TO the threshold.
export function getFreeShippingStatus(subtotal, shipping) {
  if (!shipping?.freeShippingEnabled) return { enabled: false }
  const threshold = Number(shipping.freeShippingThreshold)
  const amount = Number(subtotal)
  const qualifies = amount >= threshold
  return {
    enabled: true,
    threshold,
    qualifies,
    remaining: qualifies ? 0 : Math.max(0, threshold - amount),
    progress: Math.max(0, Math.min(1, amount / (threshold || 1))),
  }
}

// Returns null until a governorate is chosen.
export function getShippingQuote(cityId, subtotal, shipping) {
  const gov = findGovernorate(cityId)
  if (!gov) return null
  const baseFee = shipping.zoneFees[gov.zone]
  const free = getFreeShippingStatus(subtotal, shipping).qualifies === true
  return { baseFee, free, fee: free ? 0 : baseFee }
}
