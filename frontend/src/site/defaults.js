// Fallback values used until /api/settings answers (or if it fails): the bar, banners and shipping
// rules never disappear because of a loading error. Keep in sync with backend/src/validators/settings.js.
export const DEFAULT_SETTINGS = {
  brand: {
    name: 'MATA', logo: '', tagline: '', pageTitle: 'MATA | ماتا — شنط ومحافظ وعطور وإكسسوارات',
    topbar: { enabled: true, text: 'مجموعة الخريف الجديدة وصلت — اكتشف أحدث التصميمات', link: '' },
    nav: [{ label: 'الرئيسية', href: '#top' }, { label: 'الأقسام', href: '#categories' }, { label: 'وصل حديثاً', href: '#products' }],
    searchPlaceholder: 'ابحث عن شنطة، عطر، محفظة…',
  },
  layout: {
    sections: ['hero', 'categories', 'products', 'promo', 'features'].map((id) => ({ id, enabled: true })),
    categoriesTitle: 'تسوّق حسب القسم', categoriesSubtitle: 'اختار القسم اللي بتدوّر عليه',
    productsTitle: 'وصل حديثاً', productsSubtitle: 'أحدث القطع في المتجر',
  },
  footer: {
    enabled: true, about: '', links: [], phone: '', email: '', whatsapp: '', instagram: '', facebook: '', tiktok: '',
    copyright: 'جميع الحقوق محفوظة © MATA', whatsappButton: { enabled: false, message: 'مرحباً، عندي استفسار' },
  },
  categories: {
    items: [
      { id: 'bags', name: 'شنط', blurb: 'جلد طبيعي بتصميمات هادية', image: '', enabled: true },
      { id: 'wallets', name: 'محافظ', blurb: 'صغيرة وعملية وتدوم', image: '', enabled: true },
      { id: 'perfumes', name: 'عطور', blurb: 'روائح ثابتة وراقية', image: '', enabled: true },
      { id: 'accessories', name: 'إكسسوارات', blurb: 'لمسة أخيرة تكمّل اللوك', image: '', enabled: true },
    ],
  },
  announcement: {
    enabled: true,
    text: '🚚 شحن مجاني للطلبات فوق **{threshold} جنيه**! ✨',
    bgColor: '#141210', textColor: '#faf7f2', accentColor: '#d6b46a',
    showIcon: false, linkUrl: '', buttonText: '', buttonUrl: '', animation: 'pulse',
  },
  shipping: {
    freeShippingEnabled: true,
    freeShippingThreshold: 1000,
    zoneFees: { greaterCairo: 50, deltaCanal: 65, upperEgypt: 80, remote: 110 },
  },
  homepage: {
    hero: {
      enabled: true, desktopImage: '', mobileImage: '',
      eyebrow: 'مجموعة الخريف ٢٠٢٦', title: 'أناقة هادية.. وتفاصيل بتفرق',
      subtitle: 'شنط ومحافظ وعطور وإكسسوارات مصنوعة بعناية، بتصميمات بسيطة تعيش معاك سنين وتليق على أي إطلالة.',
      buttonText: 'تسوّق دلوقتي', buttonUrl: '#products',
    },
    promo: { enabled: false, image: '', title: 'المجموعة الجديدة', description: '', buttonText: '', buttonUrl: '' },
  },
  features: {
    enabled: true, returnPolicy: '',
    items: [
      { enabled: true, icon: 'cash', title: 'الدفع عند الاستلام', text: 'ادفع لما الطلب يوصلك.' },
      { enabled: true, icon: 'truck', title: 'الشحن والتوصيل', text: 'شحن لكل المحافظات، وتكلفته بتظهر قبل تأكيد الطلب.' },
      { enabled: true, icon: 'gift', title: 'شحن مجاني', text: 'للطلبات فوق {threshold} جنيه.' },
    ],
  },
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v)
export function mergeSettings(base, extra) {
  if (!isPlain(base) || !isPlain(extra)) return extra === undefined || extra === null ? base : extra
  const out = { ...base }
  for (const key of Object.keys(extra)) out[key] = key in base ? mergeSettings(base[key], extra[key]) : extra[key]
  return out
}
