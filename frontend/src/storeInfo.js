// Store-wide facts shown on the product page.
// Only put information here that is TRUE for the store: the page never invents policies.
export const STORE_INFO = {
  // Verified in the project: orders are cash-on-delivery only (backend accepts paymentMethod "cod")
  // and the shipping fee is calculated per governorate in the checkout page.
  shipping: [
    'الدفع عند الاستلام.',
    'تكلفة الشحن بتتحسب حسب المحافظة وبتظهر في صفحة إتمام الطلب قبل تأكيد الطلب.',
  ],
  // Leave empty until the owner decides on a policy. When empty, the "الاستبدال والاسترجاع"
  // block is NOT shown. Example once decided: 'الاستبدال خلال 14 يوم من الاستلام بشرط ...'
  returnPolicy: '',
}
