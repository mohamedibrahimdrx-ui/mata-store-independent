import { useRef, useState } from 'react'
import { auth } from './firebase'
import { uploadProductImage } from './api/admin'
import { optimizeImage } from './utils/images'

export const MAX_PRODUCT_IMAGES = 10
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

/* Multi-image uploader for the product form.
   `images` is the ordered gallery (first item = main image). `onChange` accepts a new array OR an updater function. */
export default function ProductImagesEditor({ images, onChange, onBusyChange }) {
  const [pending, setPending] = useState([]) // [{ key, preview, name }]
  const [status, setStatus] = useState('')
  const [problems, setProblems] = useState([])
  const [urlValue, setUrlValue] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const inputRef = useRef(null)
  const busy = pending.length > 0

  const add = (urls) => onChange((prev) => [...new Set([...prev, ...urls])].slice(0, MAX_PRODUCT_IMAGES))
  const move = (from, to) => onChange((prev) => {
    if (to < 0 || to >= prev.length || from === to) return prev
    const next = [...prev]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })
  const makeMain = (i) => move(i, 0)
  const remove = (i) => onChange((prev) => prev.filter((_, index) => index !== i))

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (inputRef.current) inputRef.current.value = ''
    if (!files.length) return
    setProblems([])

    const room = MAX_PRODUCT_IMAGES - images.length
    const errors = []
    if (room <= 0) {
      setProblems([`الحد الأقصى ${MAX_PRODUCT_IMAGES} صور للمنتج.`])
      return
    }
    const accepted = []
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) errors.push(`${file.name}: الصيغة غير مسموحة (JPG أو PNG أو WebP فقط).`)
      else if (file.size > MAX_BYTES) errors.push(`${file.name}: الحجم أكبر من 5 ميجابايت.`)
      else accepted.push(file)
    }
    if (accepted.length > room) {
      errors.push(`تم رفع أول ${room} صورة فقط — الحد الأقصى ${MAX_PRODUCT_IMAGES} صور.`)
      accepted.length = room
    }
    if (!accepted.length) {
      setProblems(errors)
      return
    }

    const user = auth.currentUser
    if (!user) {
      setProblems(['انتهت جلسة الأدمن. سجّل الدخول مرة أخرى.'])
      return
    }

    const items = accepted.map((file, i) => ({ key: `${Date.now()}-${i}`, file, preview: URL.createObjectURL(file), name: file.name }))
    setPending(items.map(({ key, preview, name }) => ({ key, preview, name })))
    onBusyChange?.(true)

    let done = 0
    for (const item of items) {
      setStatus(`جارٍ رفع الصورة ${done + 1} من ${items.length}...`)
      try {
        const url = await uploadProductImage(user, item.file)
        add([url])
      } catch (err) {
        errors.push(`${item.name}: ${err.message || 'فشل الرفع.'}`)
      }
      done += 1
      URL.revokeObjectURL(item.preview)
      setPending((old) => old.filter((entry) => entry.key !== item.key))
    }
    setStatus('')
    setProblems(errors)
    onBusyChange?.(false)
  }

  function addUrl() {
    const value = urlValue.trim()
    if (!/^https?:\/\/\S+$/i.test(value)) return setProblems(['أدخل رابط صورة صحيح يبدأ بـ http:// أو https://'])
    if (images.includes(value)) return setProblems(['الصورة دي مضافة بالفعل.'])
    if (images.length >= MAX_PRODUCT_IMAGES) return setProblems([`الحد الأقصى ${MAX_PRODUCT_IMAGES} صور للمنتج.`])
    setProblems([])
    add([value])
    setUrlValue('')
  }

  return (
    <div className="ad-gallery ad-wide">
      <div className="ad-row ad-between">
        <strong>صور المنتج ({images.length}/{MAX_PRODUCT_IMAGES})</strong>
        <small>أول صورة هي الصورة الرئيسية — اسحب الصور لإعادة ترتيبها</small>
      </div>

      <label className="ad-dropzone">
        اختار صورة أو أكتر من جهازك
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
          disabled={busy || images.length >= MAX_PRODUCT_IMAGES}
          onChange={(event) => handleFiles(event.target.files)} />
        <small>JPG أو PNG أو WebP — بحد أقصى 5MB للصورة</small>
      </label>

      {status && <p className="ad-upload-status" role="status">{status}</p>}

      {(images.length > 0 || pending.length > 0) && (
        <ul className="ad-thumbs" aria-label="صور المنتج">
          {images.map((url, i) => (
            <li key={url} draggable={!busy}
              className={`ad-thumb${dragIndex === i ? ' dragging' : ''}${overIndex === i && dragIndex !== i ? ' over' : ''}`}
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i) }}
              onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); setOverIndex(null) }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}>
              <img src={optimizeImage(url, 240)} alt={`صورة المنتج ${i + 1}`} draggable="false" loading="lazy" />
              {i === 0 && <span className="ad-main-badge">الرئيسية</span>}
              <div className="ad-thumb-actions">
                {i > 0 && <button type="button" onClick={() => makeMain(i)} title="تعيين كصورة رئيسية">رئيسية</button>}
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="تقديم الصورة" title="تقديم">▶</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} aria-label="تأخير الصورة" title="تأخير">◀</button>
                <button type="button" className="danger" onClick={() => remove(i)} aria-label="حذف الصورة" title="حذف">✕</button>
              </div>
            </li>
          ))}
          {pending.map((item) => (
            <li key={item.key} className="ad-thumb uploading" aria-busy="true">
              <img src={item.preview} alt="" draggable="false" />
              <span className="ad-uploading-label">جارٍ الرفع...</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ad-url-add">
        <input type="url" inputMode="url" placeholder="أو الصق رابط صورة (اختياري)" value={urlValue}
          onChange={(event) => setUrlValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addUrl() } }} />
        <button type="button" className="ad-btn" onClick={addUrl} disabled={busy}>إضافة بالرابط</button>
      </div>

      {problems.length > 0 && (
        <ul className="ad-error ad-problems" role="alert">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      )}
    </div>
  )
}

/* Lets the admin pick which gallery images belong to a color. */
export function ColorImagePicker({ images, selected = [], onChange }) {
  if (!images.length) return null
  const toggle = (url) => onChange(selected.includes(url) ? selected.filter((u) => u !== url) : [...selected, url])
  return (
    <div className="ad-color-images">
      <small>صور هذا اللون (اختياري — لو مفيش، يعرض صور المنتج العامة):</small>
      <div className="ad-color-thumbs">
        {images.map((url, i) => (
          <button type="button" key={url} aria-pressed={selected.includes(url)} aria-label={`صورة ${i + 1}`}
            className={selected.includes(url) ? 'on' : ''} onClick={() => toggle(url)}>
            <img src={optimizeImage(url, 120)} alt="" loading="lazy" draggable="false" />
          </button>
        ))}
      </div>
    </div>
  )
}
