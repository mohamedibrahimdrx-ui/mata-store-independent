import { useRef, useState } from 'react'
import { auth } from './firebase'
import { uploadProductVideo } from './api/admin'

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_MB = 50 // keep equal to MAX_VIDEO_UPLOAD_MB on the backend (default 50)

// Supported links: YouTube, Vimeo, an uploaded Cloudinary video, or a direct https .mp4/.webm/.mov file.
function describeVideo(url) {
  let u
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const ytId = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null)
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    const id = ytId(u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/) || [])[1])
    return id ? { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, label: 'YouTube' } : null
  }
  if (host === 'youtu.be') { const id = ytId(u.pathname.slice(1)); return id ? { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, label: 'YouTube' } : null }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = (u.pathname.match(/^\/(?:video\/)?(\d{6,12})(?:\/|$)/) || [])[1]
    return id ? { kind: 'iframe', src: `https://player.vimeo.com/video/${id}`, label: 'Vimeo' } : null
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: 'video', src: u.href, label: host === 'res.cloudinary.com' ? 'Cloudinary' : 'ملف فيديو' }
  return null
}

/* Optional product video: upload from the device (Cloudinary) or paste a link. `video` is a URL string or ''. */
export default function ProductVideoEditor({ video, onChange, onBusyChange }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const inputRef = useRef(null)
  const preview = video ? describeVideo(video) : null

  async function handleFile(fileList) {
    const file = fileList?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setProblem('')
    if (!ALLOWED_TYPES.includes(file.type)) return setProblem('الصيغة غير مسموحة. استخدم MP4 أو WebM أو MOV.')
    if (file.size > MAX_MB * 1024 * 1024) {
      return setProblem(`حجم الفيديو أكبر من ${MAX_MB} ميجابايت. للفيديوهات الطويلة استخدم رابط YouTube أو Vimeo.`)
    }
    const user = auth.currentUser
    if (!user) return setProblem('انتهت جلسة الأدمن. سجّل الدخول مرة أخرى.')
    setBusy(true)
    onBusyChange?.(true)
    try {
      onChange(await uploadProductVideo(user, file))
    } catch (err) {
      setProblem(err.message || 'فشل رفع الفيديو.')
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  function addUrl() {
    const value = urlValue.trim()
    if (!describeVideo(value)) return setProblem('الرابط غير مدعوم. استخدم رابط https من YouTube أو Vimeo أو ملف .mp4/.webm/.mov.')
    setProblem('')
    onChange(value)
    setUrlValue('')
  }

  return (
    <div className="ad-video ad-wide">
      <div className="ad-row ad-between">
        <strong>فيديو المنتج (اختياري)</strong>
        <small>المتجر مش بيشغّل الفيديو تلقائيًا ولا بيشغّل الصوت.</small>
      </div>

      {preview && (
        <div className="ad-video-preview">
          {preview.kind === 'iframe'
            ? <iframe src={preview.src} title="معاينة الفيديو" loading="lazy" allowFullScreen />
            : <video src={preview.src} controls playsInline preload="metadata" />}
          <div className="ad-row ad-between">
            <small>المصدر: {preview.label}</small>
            <button type="button" className="ad-btn danger" onClick={() => onChange('')}>حذف الفيديو</button>
          </div>
        </div>
      )}

      <label className="ad-dropzone">
        {video ? 'استبدال الفيديو برفع فيديو جديد من جهازك' : 'ارفع فيديو من جهازك'}
        <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy}
          onChange={(event) => handleFile(event.target.files)} />
        <small>MP4 أو WebM أو MOV — بحد أقصى {MAX_MB}MB. الفيديو بيستهلك رصيد Cloudinary (تخزين ونقل بيانات)، فالأفضل رابط YouTube/Vimeo للفيديوهات الطويلة.</small>
      </label>
      {busy && <p className="ad-upload-status" role="status">جارٍ رفع الفيديو… ممكن ياخد وقت حسب الحجم.</p>}

      <div className="ad-url-add">
        <input type="url" inputMode="url" placeholder="أو الصق رابط YouTube / Vimeo / ملف mp4" value={urlValue}
          onChange={(event) => setUrlValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addUrl() } }} />
        <button type="button" className="ad-btn" onClick={addUrl} disabled={busy}>إضافة بالرابط</button>
      </div>
      {problem && <p className="ad-error" role="alert">{problem}</p>}
    </div>
  )
}
