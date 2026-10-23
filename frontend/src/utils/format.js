const priceFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ar-EG')

export const formatPrice = (value) => priceFormatter.format(value)
export const formatNumber = (value) => numberFormatter.format(value)