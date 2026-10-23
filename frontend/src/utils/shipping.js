import { findGovernorate } from './checkoutRules'

// DISPLAY helpers only. The real shipping fee is calculated and stored by the backend when the order is placed;
// these functions mirror backend/src/config/shipping.js so the shopper sees the same numbers.

// Free shipping applies when the products subtotal is STRICTLY GREATER than the threshold.
export function getFreeShippingStatus(subtotal, shipping) {
  if (!shipping?.freeShippingEnabled) return { enabled: false }
  const threshold = shipping.freeShippingThreshold
  const qualifies = subtotal > threshold
  return {
    enabled: true,
    threshold,
    qualifies,
    remaining: qualifies ? 0 : threshold + 1 - subtotal, // whole pounds still needed to pass the threshold
    progress: Math.max(0, Math.min(1, subtotal / (threshold + 1))),
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
