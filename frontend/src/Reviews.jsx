import { useEffect, useState } from 'react'
import { fetchReviews, submitReview } from './api/site'

const STARS = [1, 2, 3, 4, 5]
const arabicDate = (iso) => {
  try { return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) } catch { return '' }
}

export function Stars({ value, size = 18 }) {
  return (
    <span className="rv-stars" role="img" aria-label={`${value} من 5`} style={{ fontSize: size }}>
      {STARS.map((n) => <span key={n} className={n <= Math.round(value) ? 'on' : ''} aria-hidden="true">★</span>)}
    </span>
  )
}

// Loads the APPROVED reviews of a product. Never throws; `status` is 'loading' | 'ready' | 'error'.
export function useReviews(productId) {
  const [state, setState] = useState({ status: 'loading', summary: { count: 0, average: 0, distribution: {} }, reviews: [] })
  useEffect(() => {
    let cancelled = false
    fetchReviews(productId)
      .then((data) => { if (!cancelled) setState({ status: 'ready', summary: data.summary, reviews: data.reviews }) })
      .catch(() => { if (!cancelled) setState((old) => ({ ...old, status: 'error' })) })
    return () => { cancelled = true }
  }, [productId])
  return state
}

function ReviewForm({ productId, onDone }) {
  const [rating, setRating] = useState(0)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [website, setWebsite] = useState('') // honeypot: hidden from people, bots fill it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (rating < 1) return setError('اختار عدد النجوم.')
    if (name.trim().length < 2) return setError('اكتب اسمك (حرفين على الأقل).')
    if (text.trim().length < 10) return setError('اكتب رأيك في 10 حروف على الأقل.')
    setBusy(true)
    setError('')
    try {
      await submitReview(productId, { rating, name: name.trim(), text: text.trim(), ...(website ? { website } : {}) })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="rv-form" onSubmit={submit} noValidate>
      <fieldset className="rv-rate">
        <legend>تقييمك</legend>
        <div role="radiogroup" aria-label="التقييم من 1 إلى 5">
          {STARS.map((n) => (
            <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} من 5`}
              className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
          ))}
        </div>
      </fieldset>
      <label>الاسم
        <input value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>رأيك في المنتج
        <textarea rows="4" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="rv-hp" aria-hidden="true">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      {error && <p className="rv-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'جاري الإرسال…' : 'إرسال المراجعة'}</button>
      <small>المراجعة بتظهر بعد موافقة الإدارة.</small>
    </form>
  )
}

export default function ReviewsSection({ productId, reviews }) {
  const { status, summary, reviews: list } = reviews
  const [formOpen, setFormOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const has = summary.count > 0

  return (
    <section className="pd-reviews" id="reviews" aria-labelledby="rv-title">
      <h2 id="rv-title">تقييمات العملاء</h2>

      {has && (
        <div className="rv-summary">
          <div className="rv-avg">
            <strong>{summary.average.toFixed(1)}</strong>
            <Stars value={summary.average} size={20} />
            <span>{summary.count} {summary.count === 1 ? 'تقييم' : 'تقييمات'}</span>
          </div>
          <ul className="rv-dist" aria-label="توزيع التقييمات">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = summary.distribution[n] || 0
              return (
                <li key={n}>
                  <span>{n} ★</span>
                  <span className="rv-bar"><span style={{ width: `${(c / summary.count) * 100}%` }} /></span>
                  <span>{c}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!has && status === 'ready' && <p className="rv-empty">لسه مفيش تقييمات للمنتج ده. كن أول من يقيّمه.</p>}
      {status === 'error' && <p className="rv-empty">مقدرناش نحمل التقييمات دلوقتي.</p>}

      {has && (
        <ul className="rv-list">
          {list.map((review) => (
            <li key={review.id} className="rv-item">
              <div className="rv-head"><Stars value={review.rating} size={16} /><strong>{review.name}</strong></div>
              <p>{review.text}</p>
              {review.createdAt && <time dateTime={review.createdAt}>{arabicDate(review.createdAt)}</time>}
            </li>
          ))}
        </ul>
      )}

      {sent ? (
        <p className="rv-thanks" role="status">شكرًا لك! مراجعتك اتبعتت وهتظهر بعد موافقة الإدارة.</p>
      ) : formOpen ? (
        <ReviewForm productId={productId} onDone={() => { setSent(true); setFormOpen(false) }} />
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(true)}>اكتب تقييمك</button>
      )}
    </section>
  )
}
