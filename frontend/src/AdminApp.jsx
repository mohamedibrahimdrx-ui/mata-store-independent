import { useEffect, useMemo, useState } from 'react'

import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'

import { auth, firebaseConfigError } from './firebase'

import { adminRequest } from './api/admin'

import ProductImagesEditor, { ColorImagePicker } from './ProductImagesEditor'

import ProductVideoEditor from './ProductVideoEditor'

import AdminReviews from './AdminReviews'

import AdminOrders from './AdminOrders'

import { AnnouncementAdmin, ShippingAdmin, HomeContentAdmin, BrandAdmin, LayoutAdmin, CategoriesAdmin, FooterAdmin } from './AdminSite'

import './Admin.css'




const categories = [

  ['bags', 'شنط'],

  ['wallets', 'محافظ'],

  ['perfumes', 'عطور'],

  ['accessories', 'إكسسوارات'],

]

const statuses = [

  ['pending', 'قيد المراجعة'],

  ['confirmed', 'تم التأكيد'],

  ['shipped', 'تم الشحن'],

  ['delivered', 'تم التسليم'],

  ['cancelled', 'ملغي'],

]

const transitions = {

  pending: ['confirmed', 'cancelled'],

  confirmed: ['shipped', 'cancelled'],

  shipped: ['delivered'],

  delivered: [],

  cancelled: [],

}

const labelStatus = (status) => statuses.find(([key]) => key === status)?.[1] || status || 'غير محدد'

const money = (amount) => `${Number(amount || 0).toLocaleString('ar-EG')} ج.م`

const newProduct = () => ({

  name: '',

  description: '',

  price: 1,

  category: 'bags',

  image: '',

  images: [],
  video: '',

  badge: '',

  sortOrder: '',

  compareAtPrice: '',

  dimensions: '',

  active: true,

  colors: [{ id: 'black', name: 'أسود', hex: '#222222', stock: 0, active: true }],

})



// Builds the editable form from a stored product. Old products that only have `image` get a one-item gallery.
function initForm(initial) {
  if (!initial?.id) return { ...newProduct(), featuresText: '', specsText: '' }
  const images = [...new Set([initial.image, ...(Array.isArray(initial.images) ? initial.images : [])].filter(Boolean))]
  return {
    ...initial,
    images,
    compareAtPrice: initial.compareAtPrice ? String(initial.compareAtPrice) : '',
    dimensions: initial.dimensions || '',
    video: initial.video?.url || '',
    badge: initial.badge || '',
    sortOrder: Number.isInteger(initial.sortOrder) ? String(initial.sortOrder) : '',
    featuresText: (initial.features || []).join('\n'),
    specsText: (initial.specifications || []).map((spec) => `${spec.label}: ${spec.value}`).join('\n'),
    colors: (initial.colors || []).map((color) => ({ ...color, images: Array.isArray(color.images) ? [...color.images] : [] })),
  }
}

function parseSpecs(text) {
  const specs = []
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const match = line.match(/^([^:：]+)[:：](.+)$/)
    if (!match || !match[1].trim() || !match[2].trim()) return null
    specs.push({ label: match[1].trim(), value: match[2].trim() })
  }
  return specs
}

const SITE_SECTIONS = [
  ['brand', 'هوية المتجر والقوائم'],
  ['layout', 'ترتيب الصفحة والعناوين'],
  ['categories', 'الأقسام'],
  ['home', 'محتوى الصفحة الرئيسية'],
  ['announcement', 'إعدادات الشريط الإعلاني'],
  ['shipping', 'إعدادات الشحن المجاني'],
  ['reviews', 'مراجعات العملاء'],
  ['footer', 'الفوتر والتواصل'],
]

function ProductEditor({ initial, categories, onSave, onCancel, saving }) {

  const [form, setForm] = useState(() => initForm(initial))

  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))

  // Gallery updates also drop deleted images from any color that referenced them.
  const setImages = (updater) =>
    setForm((old) => {
      const images = typeof updater === 'function' ? updater(old.images || []) : updater
      const colors = old.colors.map((color) =>
        color.images?.length ? { ...color, images: color.images.filter((url) => images.includes(url)) } : color)
      return { ...old, images, colors }
    })

  const colorSet = (index, key, value) =>

    set('colors', form.colors.map((color, i) => (i === index ? { ...color, [key]: value } : color)))



  async function submit(event) {

    event.preventDefault()

    setError('')

    // Send ONLY the fields the API schema allows (the stored product also has id, createdAt, updatedAt, ...,
    // which the strict server schema rejects as INVALID_PRODUCT).
    if (uploading) return setError('استنى لحد ما رفع الصور يخلص.')

    const images = [...new Set(form.images || [])]
    if (!images.length) return setError('ضيف صورة واحدة على الأقل للمنتج.')
    if (images.length > 10) return setError('الحد الأقصى 10 صور للمنتج.')

    const specifications = parseSpecs(form.specsText || '')
    if (specifications === null) return setError('كل سطر في المواصفات لازم يكون بصيغة: الاسم: القيمة')
    const features = (form.featuresText || '').split('\n').map((line) => line.trim()).filter(Boolean)

    const price = Number(form.price)
    const compareAt = String(form.compareAtPrice ?? '').trim()
    if (compareAt && (!Number.isInteger(Number(compareAt)) || Number(compareAt) <= price)) {
      return setError('السعر قبل الخصم لازم يكون رقمًا صحيحًا أعلى من السعر الحالي (أو سيبه فاضي).')
    }

    const payload = {
      name: String(form.name || '').trim(),
      description: String(form.description || '').trim(),
      price,
      category: form.category,
      image: images[0],
      images,
      active: form.active !== false,
      colors: form.colors.map((color) => {
        const clean = {
          id: String(color.id || '').trim(),
          name: String(color.name || '').trim(),
          hex: String(color.hex || '').trim(),
          stock: Number(color.stock),
          active: color.active !== false,
        }
        const colorImages = (color.images || []).filter((url) => images.includes(url))
        if (colorImages.length) {
          clean.images = colorImages
          clean.image = colorImages[0]
        } else if (typeof color.image === 'string' && color.image.trim()) {
          clean.image = color.image.trim()
        }
        return clean
      }),
    }
    if (compareAt) payload.compareAtPrice = Number(compareAt)
    if (features.length) payload.features = features
    if (specifications.length) payload.specifications = specifications
    if ((form.dimensions || '').trim()) payload.dimensions = form.dimensions.trim()
    if ((form.video || '').trim()) payload.video = { url: form.video.trim() }
    if ((form.badge || '').trim()) payload.badge = form.badge.trim()
    const order = String(form.sortOrder ?? '').trim()
    if (order !== '') {
      if (!/^\d+$/.test(order)) return setError('ترتيب العرض لازم يكون رقم صحيح (0 أو أكتر).')
      payload.sortOrder = Number(order)
    }

    if (payload.name.trim().length < 2) return setError('اسم المنتج لازم يكون حرفين على الأقل.')

    if (!Number.isInteger(payload.price) || payload.price < 1) return setError('السعر لازم يكون رقمًا صحيحًا موجبًا.')

    if (!/^https?:\/\//i.test(payload.image)) return setError('أدخل رابط صورة صحيح يبدأ بـ http:// أو https://')

    if (

      !payload.colors.length ||

      payload.colors.some(

        (color) =>

          !/^[a-z0-9_-]{1,40}$/.test(color.id) ||

          !color.name.trim() ||

          !/^#[0-9a-fA-F]{6}$/.test(color.hex) ||

          !Number.isInteger(color.stock) ||

          color.stock < 0,

      )

    ) return setError('راجع معرّفات الألوان وأسمائها وأكواد Hex والمخزون.')

    if (new Set(payload.colors.map((color) => color.id)).size !== payload.colors.length) {

      return setError('معرّفات الألوان لازم تكون مختلفة.')

    }

    try {

      await onSave(payload)

    } catch (err) {

      setError(err.message || 'تعذر حفظ المنتج.')

    }

  }



  return (

    <form className="ad-editor" onSubmit={submit}>

      <div className="ad-row ad-between">

        <h2>{initial?.id ? 'تعديل منتج' : 'إضافة منتج'}</h2>

        <button type="button" className="ad-btn" onClick={onCancel}>إلغاء</button>

      </div>

      <div className="ad-grid">

        <label>اسم المنتج<input value={form.name} maxLength={120} onChange={(event) => set('name', event.target.value)} required /></label>

        <label>السعر بالجنيه<input type="number" min="1" step="1" value={form.price} onChange={(event) => set('price', event.target.value)} required /></label>

        <label>القسم<select value={form.category} onChange={(event) => set('category', event.target.value)}>{categories.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>

        <ProductImagesEditor images={form.images || []} onChange={setImages} onBusyChange={setUploading} />
        <ProductVideoEditor video={form.video || ''} onChange={(url) => set('video', url)} onBusyChange={setUploading} />
        <label>السعر قبل الخصم (اختياري)<input type="number" min="1" step="1" value={form.compareAtPrice} onChange={(event) => set('compareAtPrice', event.target.value)} placeholder="يظهر مشطوبًا لو أعلى من السعر" /></label>
        <label>الأبعاد (اختياري)<input value={form.dimensions} maxLength={300} onChange={(event) => set('dimensions', event.target.value)} placeholder="مثال: 45 × 30 × 15 سم" /></label>
        <label>شارة على كارت المنتج (اختياري)<input value={form.badge} maxLength={20} onChange={(event) => set('badge', event.target.value)} placeholder="مثال: جديد" /></label>
        <label>ترتيب العرض (الأقل يظهر أولًا)<input type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => set('sortOrder', event.target.value)} placeholder="فاضي = حسب الأحدث" /></label>
        <label className="ad-wide">الوصف<textarea rows="3" maxLength={2000} value={form.description || ''} onChange={(event) => set('description', event.target.value)} /></label>

        <label className="ad-wide">المميزات (اختياري — كل ميزة في سطر)<textarea rows="3" value={form.featuresText} onChange={(event) => set('featuresText', event.target.value)} /></label>
        <label className="ad-wide">المواصفات (اختياري — كل سطر بصيغة الاسم: القيمة)<textarea rows="3" value={form.specsText} onChange={(event) => set('specsText', event.target.value)} placeholder={'الخامة: جلد طبيعي\nالمقاس: وسط'} /></label>
        <label className="ad-check"><input type="checkbox" checked={form.active !== false} onChange={(event) => set('active', event.target.checked)} /> ظاهر في المتجر</label>

      </div>

      <div className="ad-row ad-between">

        <h3>الألوان والمخزون</h3>

        <button type="button" className="ad-btn" disabled={form.colors.length >= 30} onClick={() => set('colors', [...form.colors, { id: '', name: '', hex: '#222222', stock: 0, active: true }])}>+ لون</button>

      </div>

      {form.colors.map((color, index) => (

        <div className="ad-color" key={index}>

          <label>المعرّف<input value={color.id} onChange={(event) => colorSet(index, 'id', event.target.value.toLowerCase())} placeholder="black" required /></label>

          <label>اسم اللون<input value={color.name} onChange={(event) => colorSet(index, 'name', event.target.value)} required /></label>

          <label>Hex<input value={color.hex} onChange={(event) => colorSet(index, 'hex', event.target.value)} pattern="#[0-9a-fA-F]{6}" required /></label>

          <label>المخزون<input type="number" min="0" step="1" value={color.stock} onChange={(event) => colorSet(index, 'stock', event.target.value)} required /></label>

          <label className="ad-check"><input type="checkbox" checked={color.active !== false} onChange={(event) => colorSet(index, 'active', event.target.checked)} /> متاح</label>

          <button type="button" className="ad-btn ad-danger" disabled={form.colors.length <= 1} onClick={() => set('colors', form.colors.filter((_, i) => i !== index))}>حذف</button>
          <ColorImagePicker images={form.images || []} selected={color.images || []} onChange={(urls) => colorSet(index, 'images', urls)} />

        </div>

      ))}

      {error && <p className="ad-error">{error}</p>}

      <button className="ad-btn ad-primary" disabled={saving || uploading}>{uploading ? 'جارٍ رفع الصور...' : saving ? 'جارٍ الحفظ...' : 'حفظ المنتج'}</button>

    </form>

  )

}



export default function AdminApp() {

  const [user, setUser] = useState(null)

  const [authReady, setAuthReady] = useState(false)

  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')

  const [section, setSection] = useState('products')

  const [products, setProducts] = useState([])
  const [categoryList, setCategoryList] = useState(categories)

  const [orders, setOrders] = useState([])

  const [loading, setLoading] = useState(false)

  const [saving, setSaving] = useState(false)

  const [editing, setEditing] = useState(null)

  const [notice, setNotice] = useState('')

  const [error, setError] = useState('')

  const [search, setSearch] = useState('')



  useEffect(() => {

    if (!auth) {

      setAuthReady(true)

      return undefined

    }

    return onAuthStateChanged(auth, (currentUser) => {

      setUser(currentUser)

      setAuthReady(true)

    })

  }, [])



  async function loadProducts() {

    const data = await adminRequest(user, '/api/admin/products')

    setProducts(Array.isArray(data.products) ? data.products : [])

  }

  const unreadOrders = orders.filter((o) => o.seen !== true).length

  // New orders appear without pressing refresh (only while the orders screen is open and the tab is visible)
  useEffect(() => {
    if (!user || section !== 'orders') return undefined
    const timer = setInterval(() => { if (!document.hidden) loadOrders().catch(() => {}) }, 60000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, section])

  async function loadCategories() {
    try {
      const data = await adminRequest(user, '/api/admin/settings')
      const items = data?.categories?.items
      if (Array.isArray(items) && items.length) setCategoryList(items.map((item) => [item.id, item.enabled ? item.name : `${item.name} (مخفي)`]))
    } catch {
      // keep the built-in list; the product form still works
    }
  }
  async function loadOrders() {

    const data = await adminRequest(user, '/api/admin/orders?limit=300')

    setOrders(Array.isArray(data.orders) ? data.orders : [])

  }

  async function refresh() {

    if (!user) return

    setLoading(true)

    setError('')

    try {

      await Promise.all([loadProducts(), loadOrders(), loadCategories()])

    } catch (err) {

      setError(err.message)

    } finally {

      setLoading(false)

    }

  }

  useEffect(() => { if (user) refresh() }, [user])



  async function login(event) {

    event.preventDefault()

    setError('')

    try {

      await signInWithEmailAndPassword(auth, email.trim(), password)

      setPassword('')

    } catch {

      setError('تعذر الدخول. راجع البريد وكلمة المرور وتفعيل Email/Password في Firebase.')

    }

  }

  async function saveProduct(payload) {

    setSaving(true)

    try {

      if (editing?.id) {

        await adminRequest(user, `/api/admin/products/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: JSON.stringify(payload) })

      } else {

        await adminRequest(user, '/api/admin/products', { method: 'POST', body: JSON.stringify(payload) })

      }

      setEditing(null)

      setNotice('تم حفظ المنتج.')

      await loadProducts()

    } finally {

      setSaving(false)

    }

  }

  async function toggleProduct(product) {

    setError('')

    try {

      await adminRequest(user, `/api/admin/products/${encodeURIComponent(product.id)}/active`, {

        method: 'PATCH', body: JSON.stringify({ active: product.active === false }),

      })

      setNotice('تم تحديث حالة المنتج.')

      await loadProducts()

    } catch (err) {

      setError(err.message)

    }

  }

  async function changeStatus(order, status) {

    const extra = status === 'cancelled' ? '\nسيحاول النظام إعادة المخزون.' : ''

    if (!window.confirm(`تأكيد تغيير حالة الطلب إلى «${labelStatus(status)}»؟${extra}`)) return

    try {

      await adminRequest(user, `/api/admin/orders/${encodeURIComponent(order.id)}/status`, {

        method: 'PATCH', body: JSON.stringify({ status }),

      })

      setNotice('تم تحديث حالة الطلب.')

      await loadOrders()

    } catch (err) {

      setError(err.message)

    }

  }



  const filtered = useMemo(() => products.filter((product) =>

    `${product.name || ''} ${product.category || ''} ${product.id || ''}`.toLowerCase().includes(search.toLowerCase()),

  ), [products, search])



  if (!authReady) return <main className="ad-page"><div className="ad-panel">جارٍ التحقق من الدخول...</div></main>

  if (!auth) return <main className="ad-page" dir="rtl"><div className="ad-panel"><h2>تعذر تشغيل تسجيل الدخول</h2><p>{firebaseConfigError}</p><p>أضف المتغيرات في إعدادات المشروع على Vercel ثم أعد النشر (Redeploy).</p></div></main>

  if (!user) {

    return (

      <main className="ad-page">

        <form className="ad-login" onSubmit={login}>

          <div className="ad-brand">MATA <span>ADMIN</span></div>

          <h1>تسجيل دخول الإدارة</h1>

          <p>الدخول للمصرّح لهم فقط</p>

          <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>

          <label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>

          {error && <p className="ad-error">{error}</p>}

          <button className="ad-btn ad-primary ad-full">تسجيل الدخول</button>

          <a href="/" className="ad-link">الرجوع للمتجر</a>

        </form>

      </main>

    )

  }



  return (

    <main className="ad-page" dir="rtl">

      <header className="ad-top">

        <div className="ad-brand">MATA <span>ADMIN</span></div>

        <div className="ad-row"><span>{user.email}</span><button className="ad-btn" onClick={() => signOut(auth)}>تسجيل الخروج</button></div>

      </header>

      <div className="ad-layout">

        <aside className="ad-side">

          <h2>لوحة التحكم</h2>

          <button className={section === 'products' ? 'chosen' : ''} onClick={() => { setSection('products'); setEditing(null) }}>المنتجات والمخزون</button>

          <button className={section === 'orders' ? 'chosen' : ''} onClick={() => { setSection('orders'); setEditing(null) }}>الطلبات{unreadOrders > 0 && <span className="ad-nav-badge" aria-label={`${unreadOrders} طلب غير مقروء`}>{unreadOrders}</span>}</button>
          {SITE_SECTIONS.map(([key, label]) => (
            <button key={key} className={section === key ? 'chosen' : ''} onClick={() => { setSection(key); setEditing(null) }}>{label}</button>
          ))}

          <button onClick={refresh}>تحديث البيانات</button>

          <a href="/" className="ad-link">عرض المتجر ↗</a>

        </aside>

        <section className="ad-content">

          <div className="ad-row ad-between ad-title">

            <div><h1>{section === 'products' ? 'المنتجات والمخزون' : section === 'orders' ? 'إدارة الطلبات' : SITE_SECTIONS.find(([key]) => key === section)?.[1]}</h1>{(section === 'products' || section === 'orders') && <p>{section === 'products' ? `${products.length} منتج` : `${orders.length} طلب`}</p>}</div>

            <button className="ad-btn" disabled={loading} onClick={refresh}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>

          </div>

          {notice && <p className="ad-success">{notice}</p>}

          {error && <p className="ad-error">{error}</p>}

          {section === 'brand' && <BrandAdmin user={user} />}
          {section === 'layout' && <LayoutAdmin user={user} />}
          {section === 'categories' && <CategoriesAdmin user={user} onSaved={loadCategories} />}
          {section === 'footer' && <FooterAdmin user={user} />}
          {section === 'home' && <HomeContentAdmin user={user} />}
          {section === 'announcement' && <AnnouncementAdmin user={user} />}
          {section === 'shipping' && <ShippingAdmin user={user} />}
          {section === 'reviews' && <AdminReviews user={user} products={products} />}
          {section === 'products' && (editing ? (

            <ProductEditor key={editing.id || 'new'} categories={categoryList} initial={editing.id ? editing : null} saving={saving} onCancel={() => setEditing(null)} onSave={saveProduct} />

          ) : (

            <>

              <div className="ad-toolbar">

                <input placeholder="ابحث باسم المنتج أو القسم أو المعرّف" value={search} onChange={(event) => setSearch(event.target.value)} />

                <button className="ad-btn ad-primary" onClick={() => { setNotice(''); setEditing({}) }}>+ إضافة منتج</button>

              </div>

              <div className="ad-table-wrap">

                <table className="ad-table">

                  <thead><tr><th>المنتج</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th>إجراءات</th></tr></thead>

                  <tbody>

                    {filtered.map((product) => (

                      <tr key={product.id}>

                        <td><div className="ad-product"><img src={product.image} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /><div><b>{product.name}</b><small>{product.id}</small></div></div></td>

                        <td>{categoryList.find(([key]) => key === product.category)?.[1] || product.category}</td>

                        <td>{money(product.price)}</td>

                        <td>{(product.colors || []).reduce((sum, color) => sum + Number(color.stock || 0), 0)}</td>

                        <td><span className={`ad-status ${product.active === false ? 'off' : 'on'}`}>{product.active === false ? 'مخفي' : 'نشط'}</span></td>

                        <td><div className="ad-row"><button className="ad-btn" onClick={() => setEditing(product)}>تعديل</button><button className="ad-btn" onClick={() => toggleProduct(product)}>{product.active === false ? 'إظهار' : 'إخفاء'}</button></div></td>

                      </tr>

                    ))}

                    {!filtered.length && <tr><td colSpan="6" className="ad-empty">لا توجد منتجات مطابقة.</td></tr>}

                  </tbody>

                </table>

              </div>

            </>

          ))}

          {section === 'orders' && (
            <AdminOrders
              user={user}
              orders={orders}
              loading={loading}
              labelStatus={labelStatus}
              transitions={transitions}
              onChangeStatus={changeStatus}
              onPatchOrder={(id, patch) => setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))}
              onReload={loadOrders}
            />
          )}

        </section>

      </div>

      <footer className="ad-footer">MATA Store · لوحة الإدارة</footer>

    </main>

  )

}
