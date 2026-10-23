import { useEffect, useRef, useState } from 'react'
import { adminRequest, uploadProductImage } from './api/admin'
import { auth } from './firebase'
import { DEFAULT_SETTINGS, mergeSettings } from './site/defaults'
import { AnnouncementStrip, HeroSection, PromoBanner, SiteFooter, StoreFeatures } from './SiteBlocks'
import { optimizeImage } from './utils/images'

/* Admin sections that edit site settings stored in Firestore (settings/{announcement|shipping|homepage|features}).
   Every save goes through PUT /api/admin/settings/:key, which verifies the Firebase ID token + ADMIN_UIDS and validates the data. */

function useAdminSettings(user) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    adminRequest(user, '/api/admin/settings')
      .then((data) => { if (!cancelled) setSettings(mergeSettings(DEFAULT_SETTINGS, data)) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [user])
  const save = async (key, value) => {
    const result = await adminRequest(user, `/api/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) })
    setSettings((old) => ({ ...old, [key]: result.settings }))
  }
  return { settings, error, save }
}

function SaveBar({ onSave, onReset, busy, busyLabel, message, error }) {
  return (
    <div className="ad-savebar">
      <button type="button" className="ad-btn ad-primary" onClick={onSave} disabled={busy}>{busy ? (busyLabel || 'جارٍ الحفظ...') : 'حفظ التغييرات'}</button>
      {onReset && <button type="button" className="ad-btn" onClick={onReset} disabled={busy}>استرجاع الافتراضي</button>}
      {message && <span className="ad-success" role="status">{message}</span>}
      {error && <span className="ad-error" role="alert">{error}</span>}
    </div>
  )
}

function useSaver(save, key) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const run = async (value, uploading) => {
    if (uploading) { setError('استنى لحد ما رفع الصورة يخلص.'); return }
    setBusy(true); setMessage(''); setError('')
    try { await save(key, value); setMessage('تم الحفظ ✓') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return { busy, message, error, run }
}

/* One image: preview + upload from the device (Cloudinary) + optional URL. */
function ImageField({ label, value, onChange, onBusyChange, hint }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [url, setUrl] = useState('')
  const inputRef = useRef(null)

  async function pick(files) {
    const file = files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setProblem('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setProblem('الصيغة غير مسموحة (JPG أو PNG أو WebP).')
    if (file.size > 5 * 1024 * 1024) return setProblem('الحجم أكبر من 5 ميجابايت.')
    if (!auth.currentUser) return setProblem('انتهت جلسة الأدمن. سجّل الدخول مرة أخرى.')
    setBusy(true); onBusyChange?.(true)
    try { onChange(await uploadProductImage(auth.currentUser, file)) } catch (err) { setProblem(err.message) } finally { setBusy(false); onBusyChange?.(false) }
  }
  function addUrl() {
    if (!/^https:\/\/\S+$/i.test(url.trim())) return setProblem('أدخل رابط صورة يبدأ بـ https://')
    setProblem(''); onChange(url.trim()); setUrl('')
  }
  return (
    <div className="ad-imgfield">
      <strong>{label}</strong>
      {hint && <small>{hint}</small>}
      {value ? (
        <div className="ad-imgfield-preview"><img src={optimizeImage(value, 400)} alt="" /><button type="button" className="ad-btn danger" onClick={() => onChange('')}>حذف الصورة</button></div>
      ) : <p className="ad-empty">مفيش صورة.</p>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => pick(e.target.files)} aria-label={`رفع ${label}`} />
      {busy && <p className="ad-upload-status" role="status">جارٍ رفع الصورة…</p>}
      <div className="ad-url-add">
        <input type="url" placeholder="أو الصق رابط الصورة" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className="ad-btn" onClick={addUrl} disabled={busy}>إضافة</button>
      </div>
      {problem && <p className="ad-error" role="alert">{problem}</p>}
    </div>
  )
}

const Loading = ({ error }) => (error ? <p className="ad-error">{error}</p> : <p>جارٍ التحميل…</p>)

/* ----------------------------- announcement bar ----------------------------- */

export function AnnouncementAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(save, 'announcement')
  const [form, setForm] = useState(null)
  useEffect(() => { if (settings && !form) setForm(settings.announcement) }, [settings, form])
  if (!settings || !form) return <Loading error={error} />
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const threshold = settings.shipping.freeShippingThreshold
  return (
    <div className="ad-panel">
      <p className="ad-hint">الشريط ده بيظهر أعلى الموقع، فوق شريط «مجموعة الخريف». اكتب <code>{'{threshold}'}</code> في النص ليتحول لحد الشحن المجاني الحالي، وحط الكلمة المميزة بين <code>**</code> زي <code>**1000 جنيه**</code>.</p>
      <div className="ad-preview" aria-label="معاينة الشريط"><AnnouncementStrip settings={{ ...form, enabled: true }} threshold={threshold} /></div>
      <div className="ad-grid">
        <label className="ad-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> إظهار الشريط</label>
        <label className="ad-check"><input type="checkbox" checked={form.showIcon} onChange={(e) => set('showIcon', e.target.checked)} /> أيقونة شاحنة بجانب النص</label>
        <label className="ad-wide">نص الإعلان<input value={form.text} maxLength={200} onChange={(e) => set('text', e.target.value)} /></label>
        <label>لون الخلفية<input type="color" value={form.bgColor} onChange={(e) => set('bgColor', e.target.value)} /></label>
        <label>لون النص<input type="color" value={form.textColor} onChange={(e) => set('textColor', e.target.value)} /></label>
        <label>لون النص المميز<input type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></label>
        <label>الحركة<select value={form.animation} onChange={(e) => set('animation', e.target.value)}>
          <option value="static">ثابت</option><option value="pulse">نبض خفيف للكلمة المميزة</option><option value="marquee">نص متحرك</option></select></label>
        <label className="ad-wide">رابط الإعلان (اختياري)<input type="text" dir="ltr" value={form.linkUrl} placeholder="https://… أو /مسار أو #products" onChange={(e) => set('linkUrl', e.target.value)} /></label>
        <label>نص الزر (اختياري)<input value={form.buttonText} maxLength={30} placeholder="تسوّق الآن" onChange={(e) => set('buttonText', e.target.value)} /></label>
        <label>رابط الزر<input type="text" dir="ltr" value={form.buttonUrl} placeholder="#products" onChange={(e) => set('buttonUrl', e.target.value)} /></label>
      </div>
      <SaveBar busy={saver.busy} message={saver.message} error={saver.error} onSave={() => saver.run(form)} onReset={() => setForm(DEFAULT_SETTINGS.announcement)} />
    </div>
  )
}

/* ----------------------------- shipping ----------------------------- */

const ZONES = [['greaterCairo', 'القاهرة الكبرى (القاهرة، الجيزة، القليوبية)'], ['deltaCanal', 'الدلتا والقناة والإسكندرية'], ['upperEgypt', 'الصعيد'], ['remote', 'المناطق البعيدة']]

export function ShippingAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(save, 'shipping')
  const [form, setForm] = useState(null)
  useEffect(() => { if (settings && !form) setForm(settings.shipping) }, [settings, form])
  if (!settings || !form) return <Loading error={error} />
  const num = (value) => (value === '' ? '' : Number(value))
  return (
    <div className="ad-panel">
      <p className="ad-hint">القاعدة: لو إجمالي المنتجات (بعد الخصومات) <strong>أكبر</strong> من الحد، الشحن مجاني. يعني لو الحد 1000: طلب بـ 1000 بالظبط بيدفع شحن، و1001 شحنه مجاني. الحساب بيتم في السيرفر من أسعار قاعدة البيانات.</p>
      <div className="ad-grid">
        <label className="ad-check ad-wide"><input type="checkbox" checked={form.freeShippingEnabled} onChange={(e) => setForm({ ...form, freeShippingEnabled: e.target.checked })} /> تفعيل الشحن المجاني</label>
        <label>حد الشحن المجاني (جنيه)<input type="number" min="1" step="1" value={form.freeShippingThreshold} onChange={(e) => setForm({ ...form, freeShippingThreshold: num(e.target.value) })} /></label>
        <h3 className="ad-wide">تكلفة الشحن حسب المنطقة (جنيه)</h3>
        {ZONES.map(([key, label]) => (
          <label key={key}>{label}<input type="number" min="0" step="1" value={form.zoneFees[key]} onChange={(e) => setForm({ ...form, zoneFees: { ...form.zoneFees, [key]: num(e.target.value) } })} /></label>
        ))}
      </div>
      <p className="ad-hint">الأسعار الافتراضية للشحن تجريبية — اكتب أسعارك الفعلية وبعدين احفظ.</p>
      <SaveBar busy={saver.busy} message={saver.message} error={saver.error} onSave={() => saver.run(form)} onReset={() => setForm(DEFAULT_SETTINGS.shipping)} />
    </div>
  )
}

/* ----------------------------- home content: hero, promo, features ----------------------------- */

function BannerForm({ value, onChange, fields, onBusyChange }) {
  const set = (key, v) => onChange({ ...value, [key]: v })
  return (
    <div className="ad-grid">
      <label className="ad-check ad-wide"><input type="checkbox" checked={value.enabled} onChange={(e) => set('enabled', e.target.checked)} /> إظهار</label>
      {fields.images.map(([key, label, hint]) => (
        <ImageField key={key} label={label} hint={hint} value={value[key]} onChange={(v) => set(key, v)} onBusyChange={onBusyChange} />
      ))}
      {fields.text.map(([key, label, max, wide]) => (
        <label key={key} className={wide ? 'ad-wide' : ''}>{label}
          {key === 'description' || key === 'subtitle'
            ? <textarea rows="3" maxLength={max} value={value[key]} onChange={(e) => set(key, e.target.value)} />
            : <input value={value[key]} maxLength={max} dir={key === 'buttonUrl' ? 'ltr' : undefined} onChange={(e) => set(key, e.target.value)} />}
        </label>
      ))}
    </div>
  )
}

export function HomeContentAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const home = useSaver(save, 'homepage')
  const feat = useSaver(save, 'features')
  const [hp, setHp] = useState(null)
  const [features, setFeatures] = useState(null)
  const [uploading, setUploading] = useState(false)
  useEffect(() => { if (settings && !hp) { setHp(settings.homepage); setFeatures(settings.features) } }, [settings, hp])
  if (!settings || !hp || !features) return <Loading error={error} />
  const threshold = settings.shipping.freeShippingThreshold
  const setItem = (i, patch) => setFeatures({ ...features, items: features.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  const moveItem = (i, d) => {
    const items = [...features.items]; const j = i + d
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    setFeatures({ ...features, items })
  }
  return (
    <div className="ad-panel">
      <section className="ad-block">
        <h2>البانر الرئيسي (Hero)</h2>
        <p className="ad-hint">لو مرفعتش صور، بيفضل التصميم الحالي بالنصوص دي. لو رفعت صورة كمبيوتر وصورة موبايل، بتظهر كل واحدة على جهازها.</p>
        <div className="ad-preview"><HeroSection hero={{ ...hp.hero, enabled: true }} onShop={() => {}} visual={null} /></div>
        <BannerForm value={hp.hero} onChange={(hero) => setHp({ ...hp, hero })} onBusyChange={setUploading}
          fields={{ images: [['desktopImage', 'صورة الكمبيوتر', 'يُفضّل 1800×700 تقريبًا'], ['mobileImage', 'صورة الموبايل', 'يُفضّل 900×1125 (4:5)']],
            text: [['eyebrow', 'السطر الصغير', 60], ['title', 'العنوان الرئيسي', 120, true], ['subtitle', 'العنوان الفرعي', 300, true], ['buttonText', 'نص الزر', 30], ['buttonUrl', 'رابط الزر', 2048]] }} />
      </section>
      <section className="ad-block">
        <h2>بانر المجموعة / القسم الترويجي</h2>
        <div className="ad-preview"><PromoBanner promo={{ ...hp.promo, enabled: true }} onShop={() => {}} /></div>
        <BannerForm value={hp.promo} onChange={(promo) => setHp({ ...hp, promo })} onBusyChange={setUploading}
          fields={{ images: [['image', 'صورة البانر', 'اختياري — من غيرها بيظهر نص بس']],
            text: [['title', 'العنوان', 120, true], ['description', 'الوصف', 300, true], ['buttonText', 'نص الزر', 30], ['buttonUrl', 'رابط الزر', 2048]] }} />
      </section>
      <SaveBar busy={home.busy || uploading} busyLabel={uploading ? 'جارٍ رفع الصورة...' : undefined} message={home.message} error={home.error}
        onSave={() => home.run(hp, uploading)} onReset={() => setHp(DEFAULT_SETTINGS.homepage)} />

      <section className="ad-block">
        <h2>مزايا المتجر</h2>
        <p className="ad-hint">اكتب بس الحاجات المؤكدة فعلًا. «معاينة قبل الاستلام» و«استبدال واسترجاع 14 يوم» مش مضافين افتراضيًا — ضيفهم لو دي سياستك الحقيقية. استخدم <code>{'{threshold}'}</code> لحد الشحن المجاني.</p>
        <div className="ad-preview"><StoreFeatures features={{ ...features, enabled: true }} threshold={threshold} /></div>
        <div className="ad-grid">
          <label className="ad-check ad-wide"><input type="checkbox" checked={features.enabled} onChange={(e) => setFeatures({ ...features, enabled: e.target.checked })} /> إظهار قسم المزايا</label>
          <label className="ad-wide">سياسة الاستبدال والاسترجاع (بتظهر في صفحة المنتج لو مكتوبة)
            <textarea rows="2" maxLength={500} value={features.returnPolicy} onChange={(e) => setFeatures({ ...features, returnPolicy: e.target.value })} /></label>
        </div>
        <ul className="ad-feat-list">
          {features.items.map((item, i) => (
            <li key={i}>
              <label className="ad-check"><input type="checkbox" checked={item.enabled} onChange={(e) => setItem(i, { enabled: e.target.checked })} /> ظاهرة</label>
              <select value={item.icon} aria-label="الأيقونة" onChange={(e) => setItem(i, { icon: e.target.value })}>
                {[['truck', 'شاحنة'], ['cash', 'نقدي'], ['eye', 'معاينة'], ['return', 'استبدال'], ['shield', 'حماية'], ['gift', 'هدية'], ['star', 'نجمة'], ['phone', 'هاتف']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={item.title} maxLength={60} placeholder="العنوان" aria-label="عنوان الميزة" onChange={(e) => setItem(i, { title: e.target.value })} />
              <input value={item.text} maxLength={200} placeholder="الوصف" aria-label="وصف الميزة" onChange={(e) => setItem(i, { text: e.target.value })} />
              <span className="ad-row">
                <button type="button" className="ad-btn" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="تقديم">▲</button>
                <button type="button" className="ad-btn" onClick={() => moveItem(i, 1)} disabled={i === features.items.length - 1} aria-label="تأخير">▼</button>
                <button type="button" className="ad-btn danger" onClick={() => setFeatures({ ...features, items: features.items.filter((_, idx) => idx !== i) })} aria-label="حذف الميزة">✕</button>
              </span>
            </li>
          ))}
        </ul>
        {features.items.length < 6 && (
          <button type="button" className="ad-btn" onClick={() => setFeatures({ ...features, items: [...features.items, { enabled: true, icon: 'star', title: 'ميزة جديدة', text: '' }] })}>+ إضافة ميزة</button>
        )}
        <SaveBar busy={feat.busy} message={feat.message} error={feat.error} onSave={() => feat.run(features)} onReset={() => setFeatures(DEFAULT_SETTINGS.features)} />
      </section>
    </div>
  )
}


/* ----------------------------- shared: editable list of links ----------------------------- */

function LinkListEditor({ items, onChange, max, labelHint }) {
  const set = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const move = (i, d) => {
    const next = [...items]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="ad-wide">
      <ul className="ad-link-list">
        {items.map((item, i) => (
          <li key={i}>
            <input value={item.label} maxLength={30} placeholder={labelHint || 'النص'} aria-label="نص الرابط" onChange={(e) => set(i, { label: e.target.value })} />
            <input value={item.href} dir="ltr" placeholder="#products أو /مسار أو https://…" aria-label="الرابط" onChange={(e) => set(i, { href: e.target.value })} />
            <span className="ad-row">
              <button type="button" className="ad-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="تقديم">▲</button>
              <button type="button" className="ad-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="تأخير">▼</button>
              <button type="button" className="ad-btn danger" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="حذف الرابط">✕</button>
            </span>
          </li>
        ))}
      </ul>
      {items.length < max && <button type="button" className="ad-btn" onClick={() => onChange([...items, { label: '', href: '' }])}>+ إضافة رابط</button>}
    </div>
  )
}

/* ----------------------------- brand, top bar, menu, search ----------------------------- */

export function BrandAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(save, 'brand')
  const [form, setForm] = useState(null)
  const [uploading, setUploading] = useState(false)
  useEffect(() => { if (settings && !form) setForm(settings.brand) }, [settings, form])
  if (!settings || !form) return <Loading error={error} />
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  return (
    <div className="ad-panel">
      <section className="ad-block">
        <h2>هوية المتجر</h2>
        <div className="ad-grid">
          <label>اسم المتجر<input value={form.name} maxLength={40} onChange={(e) => set('name', e.target.value)} /></label>
          <label>الشعار تحت الاسم (اختياري)<input value={form.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} /></label>
          <label className="ad-wide">عنوان الصفحة في تبويب المتصفح وجوجل<input value={form.pageTitle} maxLength={120} onChange={(e) => set('pageTitle', e.target.value)} /></label>
          <ImageField label="لوجو المتجر (اختياري)" hint="لو مرفعتش لوجو، بيظهر اسم المتجر كنص." value={form.logo} onChange={(v) => set('logo', v)} onBusyChange={setUploading} />
        </div>
      </section>
      <section className="ad-block">
        <h2>الشريط العلوي الصغير (مجموعة الخريف)</h2>
        <div className="ad-preview">{form.topbar.enabled && <div className="announcement"><p>{form.topbar.text}</p></div>}</div>
        <div className="ad-grid">
          <label className="ad-check ad-wide"><input type="checkbox" checked={form.topbar.enabled} onChange={(e) => set('topbar', { ...form.topbar, enabled: e.target.checked })} /> إظهار الشريط</label>
          <label className="ad-wide">النص<input value={form.topbar.text} maxLength={200} onChange={(e) => set('topbar', { ...form.topbar, text: e.target.value })} /></label>
          <label className="ad-wide">رابط (اختياري)<input dir="ltr" value={form.topbar.link} onChange={(e) => set('topbar', { ...form.topbar, link: e.target.value })} /></label>
        </div>
      </section>
      <section className="ad-block">
        <h2>روابط القائمة العلوية</h2>
        <LinkListEditor items={form.nav} max={8} labelHint="اسم الرابط" onChange={(nav) => set('nav', nav)} />
        <div className="ad-grid"><label className="ad-wide">النص داخل خانة البحث<input value={form.searchPlaceholder} maxLength={80} onChange={(e) => set('searchPlaceholder', e.target.value)} /></label></div>
      </section>
      <SaveBar busy={saver.busy || uploading} busyLabel={uploading ? 'جارٍ رفع الصورة...' : undefined} message={saver.message} error={saver.error}
        onSave={() => saver.run(form, uploading)} onReset={() => setForm(DEFAULT_SETTINGS.brand)} />
    </div>
  )
}

/* ----------------------------- section order + headings ----------------------------- */

const SECTION_NAMES = { hero: 'البانر الرئيسي', categories: 'الأقسام', products: 'المنتجات', promo: 'البانر الترويجي', features: 'مزايا المتجر' }

export function LayoutAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(save, 'layout')
  const [form, setForm] = useState(null)
  useEffect(() => { if (settings && !form) setForm(settings.layout) }, [settings, form])
  if (!settings || !form) return <Loading error={error} />
  const move = (i, d) => {
    const sections = [...form.sections]; const j = i + d
    if (j < 0 || j >= sections.length) return
    ;[sections[i], sections[j]] = [sections[j], sections[i]]
    setForm({ ...form, sections })
  }
  return (
    <div className="ad-panel">
      <p className="ad-hint">رتّب أجزاء الصفحة الرئيسية بالأسهم، وأخفي أي جزء لا تريده. (محتوى كل جزء بتعدّله من قسمه.)</p>
      <ol className="ad-sections">
        {form.sections.map((section, i) => (
          <li key={section.id}>
            <label className="ad-check"><input type="checkbox" checked={section.enabled}
              onChange={(e) => setForm({ ...form, sections: form.sections.map((x, idx) => (idx === i ? { ...x, enabled: e.target.checked } : x)) })} /> {SECTION_NAMES[section.id]}</label>
            <span className="ad-row">
              <button type="button" className="ad-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`تقديم ${SECTION_NAMES[section.id]}`}>▲</button>
              <button type="button" className="ad-btn" onClick={() => move(i, 1)} disabled={i === form.sections.length - 1} aria-label={`تأخير ${SECTION_NAMES[section.id]}`}>▼</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="ad-grid">
        <label>عنوان قسم الأقسام<input value={form.categoriesTitle} maxLength={80} onChange={(e) => setForm({ ...form, categoriesTitle: e.target.value })} /></label>
        <label>وصفه<input value={form.categoriesSubtitle} maxLength={160} onChange={(e) => setForm({ ...form, categoriesSubtitle: e.target.value })} /></label>
        <label>عنوان قسم المنتجات<input value={form.productsTitle} maxLength={80} onChange={(e) => setForm({ ...form, productsTitle: e.target.value })} /></label>
        <label>وصفه<input value={form.productsSubtitle} maxLength={160} onChange={(e) => setForm({ ...form, productsSubtitle: e.target.value })} /></label>
      </div>
      <SaveBar busy={saver.busy} message={saver.message} error={saver.error} onSave={() => saver.run(form)} onReset={() => setForm(DEFAULT_SETTINGS.layout)} />
    </div>
  )
}

/* ----------------------------- shop categories ----------------------------- */

export function CategoriesAdmin({ user, onSaved }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(async (key, value) => { await save(key, value); onSaved?.() }, 'categories')
  const [items, setItems] = useState(null)
  const [uploading, setUploading] = useState(false)
  const savedIds = useRef(new Set())
  useEffect(() => { if (settings && !items) { setItems(settings.categories.items); savedIds.current = new Set(settings.categories.items.map((c) => c.id)) } }, [settings, items])
  if (!settings || !items) return <Loading error={error} />
  const set = (i, patch) => setItems(items.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const move = (i, d) => {
    const next = [...items]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }
  return (
    <div className="ad-panel">
      <p className="ad-hint">الأقسام اللي بتظهر في المتجر وفي نموذج المنتج. المعرّف (بالإنجليزي) بيتحدد مرة واحدة عند الإضافة ومينفعش يتغيّر بعدها. قسم عليه منتجات مينفعش يتحذف — عطّله بدل الحذف.</p>
      <ul className="ad-cats">
        {items.map((cat, i) => (
          <li key={i} className="ad-block">
            <div className="ad-grid">
              <label>المعرّف (إنجليزي)<input dir="ltr" value={cat.id} readOnly={savedIds.current.has(cat.id)} maxLength={30} placeholder="gifts"
                onChange={(e) => set(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></label>
              <label>الاسم<input value={cat.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} /></label>
              <label className="ad-wide">وصف قصير (اختياري)<input value={cat.blurb} maxLength={80} onChange={(e) => set(i, { blurb: e.target.value })} /></label>
              <ImageField label="صورة القسم (اختياري)" value={cat.image} onChange={(v) => set(i, { image: v })} onBusyChange={setUploading} />
              <label className="ad-check"><input type="checkbox" checked={cat.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} /> ظاهر في المتجر</label>
            </div>
            <span className="ad-row">
              <button type="button" className="ad-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="تقديم القسم">▲</button>
              <button type="button" className="ad-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="تأخير القسم">▼</button>
              <button type="button" className="ad-btn danger" onClick={() => setItems(items.filter((_, idx) => idx !== i))} disabled={items.length === 1}>حذف القسم</button>
            </span>
          </li>
        ))}
      </ul>
      {items.length < 12 && <button type="button" className="ad-btn" onClick={() => setItems([...items, { id: '', name: '', blurb: '', image: '', enabled: true }])}>+ إضافة قسم</button>}
      <SaveBar busy={saver.busy || uploading} busyLabel={uploading ? 'جارٍ رفع الصورة...' : undefined} message={saver.message} error={saver.error}
        onSave={() => saver.run({ items }, uploading)} />
    </div>
  )
}

/* ----------------------------- footer, contact, WhatsApp ----------------------------- */

export function FooterAdmin({ user }) {
  const { settings, error, save } = useAdminSettings(user)
  const saver = useSaver(save, 'footer')
  const [form, setForm] = useState(null)
  useEffect(() => { if (settings && !form) setForm(settings.footer) }, [settings, form])
  if (!settings || !form) return <Loading error={error} />
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const text = (key, label, extra = {}) => <label>{label}<input value={form[key]} onChange={(e) => set(key, e.target.value)} {...extra} /></label>
  return (
    <div className="ad-panel">
      <p className="ad-hint">اكتب بيانات التواصل الحقيقية بس. الخانة الفاضية مش بتظهر في الموقع. رقم الواتساب بالصيغة الدولية أرقام فقط، مثال <code>201012345678</code>.</p>
      <div className="ad-preview"><SiteFooter footer={{ ...form, enabled: true }} brand={settings.brand} /></div>
      <div className="ad-grid">
        <label className="ad-check ad-wide"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> إظهار الفوتر</label>
        <label className="ad-wide">نبذة عن المتجر<textarea rows="3" maxLength={400} value={form.about} onChange={(e) => set('about', e.target.value)} /></label>
        {text('phone', 'رقم الهاتف', { dir: 'ltr', maxLength: 20 })}
        {text('email', 'البريد الإلكتروني', { dir: 'ltr', maxLength: 120 })}
        {text('whatsapp', 'رقم واتساب', { dir: 'ltr', maxLength: 15, placeholder: '201012345678' })}
        {text('instagram', 'رابط إنستجرام', { dir: 'ltr', placeholder: 'https://instagram.com/…' })}
        {text('facebook', 'رابط فيسبوك', { dir: 'ltr', placeholder: 'https://facebook.com/…' })}
        {text('tiktok', 'رابط تيك توك', { dir: 'ltr', placeholder: 'https://tiktok.com/@…' })}
        {text('copyright', 'سطر الحقوق', { maxLength: 120 })}
        <label className="ad-check ad-wide"><input type="checkbox" checked={form.whatsappButton.enabled} onChange={(e) => set('whatsappButton', { ...form.whatsappButton, enabled: e.target.checked })} /> زر واتساب عائم في الموقع (محتاج رقم واتساب)</label>
        <label className="ad-wide">الرسالة الجاهزة عند الضغط على زر واتساب<input value={form.whatsappButton.message} maxLength={200} onChange={(e) => set('whatsappButton', { ...form.whatsappButton, message: e.target.value })} /></label>
      </div>
      <h3>روابط الفوتر</h3>
      <LinkListEditor items={form.links} max={8} labelHint="اسم الرابط" onChange={(links) => set('links', links)} />
      <SaveBar busy={saver.busy} message={saver.message} error={saver.error} onSave={() => saver.run(form)} onReset={() => setForm(DEFAULT_SETTINGS.footer)} />
    </div>
  )
}
