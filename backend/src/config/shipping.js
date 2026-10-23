// Shipping rules, enforced on the server. The browser only DISPLAYS these values.
// Zones mirror frontend/src/utils/checkoutRules.js. Fees are PLACEHOLDERS until the owner sets real ones
// (editable from the admin panel: "إعدادات الشحن").
const GOVERNORATE_ZONES = {
  cairo: "greaterCairo", giza: "greaterCairo", qalyubia: "greaterCairo",
  alexandria: "deltaCanal", beheira: "deltaCanal", gharbia: "deltaCanal", sharqia: "deltaCanal", dakahlia: "deltaCanal",
  "kafr-el-sheikh": "deltaCanal", monufia: "deltaCanal", damietta: "deltaCanal", "port-said": "deltaCanal",
  ismailia: "deltaCanal", suez: "deltaCanal",
  fayoum: "upperEgypt", "beni-suef": "upperEgypt", minya: "upperEgypt", assiut: "upperEgypt", sohag: "upperEgypt",
  qena: "upperEgypt", luxor: "upperEgypt", aswan: "upperEgypt",
  "red-sea": "remote", "new-valley": "remote", matrouh: "remote", "north-sinai": "remote", "south-sinai": "remote",
};

const DEFAULT_SHIPPING = {
  freeShippingEnabled: true,
  freeShippingThreshold: 1000,
  zoneFees: { greaterCairo: 50, deltaCanal: 65, upperEgypt: 80, remote: 110 },
};

// Free shipping applies when the products subtotal is GREATER THAN OR EQUAL TO the threshold.
// Exactly 1000 EGP qualifies for free shipping. Returns null for an unknown governorate id.
function computeShipping(subtotal, cityId, settings = DEFAULT_SHIPPING) {
  const zone = Object.prototype.hasOwnProperty.call(GOVERNORATE_ZONES, cityId) ? GOVERNORATE_ZONES[cityId] : null;
  if (!zone) return null;
  const baseFee = settings.zoneFees?.[zone] ?? DEFAULT_SHIPPING.zoneFees[zone];
  const freeShipping = settings.freeShippingEnabled === true && Number(subtotal) >= Number(settings.freeShippingThreshold);
  return { zone, baseFee, freeShipping, fee: freeShipping ? 0 : baseFee };
}

module.exports = { GOVERNORATE_ZONES, DEFAULT_SHIPPING, computeShipping };
