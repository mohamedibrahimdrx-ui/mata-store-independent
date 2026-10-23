
const API_BASE = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/+$/, '')

export async function adminRequest(user, path, options = {}) {
  if (!user) {
    throw new Error('سجّل الدخول أولًا.')
  }

  const token = await user.getIdToken()

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  // JSON requests get Content-Type automatically.
  // FormData must NOT set Content-Type manually.
  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData

  if (options.body != null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const messages = {
      AUTH_REQUIRED: 'سجّل الدخول للوصول إلى لوحة الإدارة.',
      INVALID_TOKEN: 'جلسة الدخول غير صالحة. سجّل الدخول مجددًا.',
      ADMIN_ONLY: 'الحساب غير مضاف ضمن حسابات الأدمن المسموح لها.',
      INVALID_STATUS_TRANSITION: 'تغيير حالة الطلب ده غير مسموح به.',
      IMAGE_UPLOAD_FAILED: 'فشل رفع الصورة إلى Cloudinary.',
      IMAGE_SERVICE_NOT_CONFIGURED: 'إعدادات Cloudinary غير مكتملة.',
      IMAGE_REQUIRED: 'اختار صورة الأول.',
      IMAGE_TOO_LARGE: 'حجم الصورة لازم يكون 5 ميجابايت أو أقل.',
      INVALID_IMAGE: data.message || 'صيغة الصورة غير مسموح بها.',
      TOO_MANY_REQUESTS: data.message || 'محاولات كتير. حاول بعد شوية.',
      VIDEO_REQUIRED: 'اختار فيديو الأول.',
      VIDEO_TOO_LARGE: data.message || 'حجم الفيديو أكبر من المسموح.',
      INVALID_VIDEO: data.message || 'صيغة الفيديو غير مسموح بها.',
      VIDEO_UPLOAD_FAILED: data.message || 'فشل رفع الفيديو.',
    }

    const fieldNames = {
      name: 'الاسم', description: 'الوصف', price: 'السعر', category: 'القسم',
      image: 'الصورة', images: 'الصور', video: 'الفيديو', active: 'الحالة', colors: 'الألوان',
      compareAtPrice: 'السعر قبل الخصم', features: 'المميزات', specifications: 'المواصفات', dimensions: 'الأبعاد',
      text: 'النص', bgColor: 'لون الخلفية', textColor: 'لون النص', accentColor: 'اللون المميز', linkUrl: 'رابط الإعلان',
      buttonText: 'نص الزر', buttonUrl: 'رابط الزر', animation: 'الحركة', freeShippingThreshold: 'حد الشحن المجاني',
      zoneFees: 'أسعار الشحن', hero: 'البانر الرئيسي', promo: 'البانر الترويجي', items: 'المزايا', returnPolicy: 'سياسة الاستبدال',
      title: 'العنوان', subtitle: 'العنوان الفرعي', desktopImage: 'صورة الكمبيوتر', mobileImage: 'صورة الموبايل',
    }
    const detailsText = Array.isArray(data.details) && data.details.length
      ? (data.error === 'INVALID_SETTINGS' ? 'الإعدادات غير صالحة: ' : 'بيانات المنتج غير صالحة: ') + data.details
          .slice(0, 5)
          .map((d) => `${d.path ? (fieldNames[d.path.split('.')[0]] || d.path.split('.')[0]) + ' (' + d.path + ')' : 'المنتج'}: ${d.message}`)
          .join(' | ')
      : ''

    const message =
      ((data.error === 'INVALID_PRODUCT' || data.error === 'INVALID_SETTINGS') && (detailsText || 'البيانات غير صالحة.')) ||
      messages[data.error] ||
      data.message ||
      data.error ||
      `حدث خطأ (${response.status})`

    const error = new Error(message)
    error.status = response.status
    error.code = data.error
    error.details = data.details

    throw error
  }

  return data
}

export async function uploadProductImage(user, file) {
  const formData = new FormData()
  formData.append('image', file)
  // No manual Content-Type: the browser sets the multipart boundary.
  const data = await adminRequest(user, '/api/admin/upload', { method: 'POST', body: formData })
  if (!data.image || !/^https:\/\/res\.cloudinary\.com\//i.test(data.image)) {
    throw new Error('رابط الصورة المستلم غير صالح.')
  }
  return data.image
}

export async function uploadProductVideo(user, file) {
  const formData = new FormData()
  formData.append('video', file)
  // No manual Content-Type: the browser sets the multipart boundary.
  const data = await adminRequest(user, '/api/admin/upload/video', { method: 'POST', body: formData })
  if (!data.video || !/^https:\/\/res\.cloudinary\.com\//i.test(data.video)) {
    throw new Error('رابط الفيديو المستلم غير صالح.')
  }
  return data.video
}
