/* Checkout rules: governorates, PLACEHOLDER shipping fees, and validation.
   Real shipping rates will come from the backend later. */

export const NOTES_MAX_LENGTH = 300

// PLACEHOLDER fees in EGP — replace with your real rates.
const ZONE_FEES = {
  greaterCairo: 50,
  deltaCanal: 65,
  upperEgypt: 80,
  remote: 110,
}

export const GOVERNORATES = [
  { id: 'cairo', name: 'القاهرة', zone: 'greaterCairo' },
  { id: 'giza', name: 'الجيزة', zone: 'greaterCairo' },
  { id: 'qalyubia', name: 'القليوبية', zone: 'greaterCairo' },
  { id: 'alexandria', name: 'الإسكندرية', zone: 'deltaCanal' },
  { id: 'beheira', name: 'البحيرة', zone: 'deltaCanal' },
  { id: 'gharbia', name: 'الغربية', zone: 'deltaCanal' },
  { id: 'sharqia', name: 'الشرقية', zone: 'deltaCanal' },
  { id: 'dakahlia', name: 'الدقهلية', zone: 'deltaCanal' },
  { id: 'kafr-el-sheikh', name: 'كفر الشيخ', zone: 'deltaCanal' },
  { id: 'monufia', name: 'المنوفية', zone: 'deltaCanal' },
  { id: 'damietta', name: 'دمياط', zone: 'deltaCanal' },
  { id: 'port-said', name: 'بورسعيد', zone: 'deltaCanal' },
  { id: 'ismailia', name: 'الإسماعيلية', zone: 'deltaCanal' },
  { id: 'suez', name: 'السويس', zone: 'deltaCanal' },
  { id: 'fayoum', name: 'الفيوم', zone: 'upperEgypt' },
  { id: 'beni-suef', name: 'بني سويف', zone: 'upperEgypt' },
  { id: 'minya', name: 'المنيا', zone: 'upperEgypt' },
  { id: 'assiut', name: 'أسيوط', zone: 'upperEgypt' },
  { id: 'sohag', name: 'سوهاج', zone: 'upperEgypt' },
  { id: 'qena', name: 'قنا', zone: 'upperEgypt' },
  { id: 'luxor', name: 'الأقصر', zone: 'upperEgypt' },
  { id: 'aswan', name: 'أسوان', zone: 'upperEgypt' },
  { id: 'red-sea', name: 'البحر الأحمر', zone: 'remote' },
  { id: 'new-valley', name: 'الوادي الجديد', zone: 'remote' },
  { id: 'matrouh', name: 'مطروح', zone: 'remote' },
  { id: 'north-sinai', name: 'شمال سيناء', zone: 'remote' },
  { id: 'south-sinai', name: 'جنوب سيناء', zone: 'remote' },
]

export const findGovernorate = (id) => GOVERNORATES.find((g) => g.id === id)

// Returns the fee in EGP, or null when no city is selected yet.
export function getShippingFee(cityId) {
  const gov = findGovernorate(cityId)
  return gov ? ZONE_FEES[gov.zone] : null
}

/* ---------- Normalizers ---------- */

// Converts Arabic-Indic (٠١٢) and Persian (۰۱۲) digits to 0-9
const toLatinDigits = (text) =>
  text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))

// "+20 101 234 5678", "٠١٠١٢٣٤٥٦٧٨", "0020101..." → "01012345678"
export function normalizePhone(raw) {
  let phone = toLatinDigits(String(raw)).replace(/[\s\-().]/g, '')
  if (phone.startsWith('+20')) phone = '0' + phone.slice(3)
  else if (phone.startsWith('0020')) phone = '0' + phone.slice(4)
  else if (/^20\d{10}$/.test(phone)) phone = '0' + phone.slice(2)
  return phone
}

export const normalizeName = (raw) => String(raw).trim().replace(/\s+/g, ' ')

/* ---------- Validation ---------- */

// Egyptian mobile numbers: 010 / 011 / 012 / 015 + 8 digits
export const isValidEgyptianMobile = (phone) => /^01[0125]\d{8}$/.test(phone)

const NAME_PATTERN = /^[\p{L}\p{M}\s.'’-]+$/u

// Returns an object like { fullName: '...', phone: '...' } — empty when valid.
export function validateCheckout(values) {
  const errors = {}

  const name = normalizeName(values.fullName)
  if (!name) errors.fullName = 'اكتب اسمك بالكامل'
  else if (!NAME_PATTERN.test(name)) errors.fullName = 'الاسم لازم يكون حروف فقط، من غير أرقام أو رموز'
  else if (name.split(' ').length < 2) errors.fullName = 'اكتب الاسم الأول واسم العيلة على الأقل'
  else if (name.length > 80) errors.fullName = 'الاسم طويل زيادة'

  if (!values.phone.trim()) errors.phone = 'اكتب رقم الموبايل'
  else if (!isValidEgyptianMobile(normalizePhone(values.phone)))
    errors.phone = 'رقم الموبايل مش صحيح. لازم يكون رقم مصري زي 01012345678'

  if (!values.city) errors.city = 'اختار المدينة'
  else if (!findGovernorate(values.city)) errors.city = 'اختار مدينة من القايمة'

  const address = values.address.trim()
  if (!address) errors.address = 'اكتب عنوانك بالتفصيل'
  else if (address.length < 10) errors.address = 'العنوان قصير. اكتب الشارع ورقم العمارة والشقة'
  else if (address.length > 250) errors.address = 'العنوان طويل زيادة (٢٥٠ حرف بحد أقصى)'

  if (values.notes.length > NOTES_MAX_LENGTH)
    errors.notes = 'الملاحظات طويلة (٣٠٠ حرف بحد أقصى)'

  return errors
}