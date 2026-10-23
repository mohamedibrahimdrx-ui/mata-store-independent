import { useCallback, useEffect, useState } from 'react'
import { adminRequest } from './api/admin'
import { Stars } from './Reviews'

const TABS = [['pending', 'قيد المراجعة'], ['approved', 'معتمدة'], ['rejected', 'مرفوضة'], ['all', 'الكل']]
const LABEL = { pending: 'قيد المراجعة', approved: 'معتمدة', rejected: 'مرفوضة' }

export default function AdminReviews({ user, products }) {
  const [status, setStatus] = useState('pending')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const names = Object.fromEntries((products || []).map((p) => [p.id, p.name]))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminRequest(user, `/api/admin/reviews?status=${status}`)
      setReviews(data.reviews)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, status])
  useEffect(() => { load() }, [load])

  async function setReviewStatus(id, next) {
    setError('')
    try {
      await adminRequest(user, `/api/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      await load()
    } catch (err) { setError(err.message) }
  }
  async function remove(id) {
    if (!window.confirm('حذف المراجعة نهائيًا؟')) return
    setError('')
    try {
      await adminRequest(user, `/api/admin/reviews/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="ad-panel">
      <div className="ad-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={status === key} className={status === key ? 'chosen' : ''} onClick={() => setStatus(key)}>{label}</button>
        ))}
      </div>
      {error && <p className="ad-error">{error}</p>}
      {loading ? <p>جارٍ التحميل…</p> : reviews.length === 0 ? <p className="ad-empty">مفيش مراجعات هنا.</p> : (
        <ul className="ad-reviews">
          {reviews.map((review) => (
            <li key={review.id}>
              <div className="ad-row ad-between">
                <strong>{names[review.productId] || review.productId}</strong>
                <span className={`ad-badge ${review.status}`}>{LABEL[review.status] || review.status}</span>
              </div>
              <div className="ad-row"><Stars value={review.rating} size={16} /><span>{review.name}</span>
                {review.createdAt && <small>{new Date(review.createdAt).toLocaleDateString('ar-EG')}</small>}</div>
              <p>{review.text}</p>
              <div className="ad-row">
                {review.status !== 'approved' && <button className="ad-btn ad-primary" onClick={() => setReviewStatus(review.id, 'approved')}>اعتماد</button>}
                {review.status !== 'rejected' && <button className="ad-btn" onClick={() => setReviewStatus(review.id, 'rejected')}>رفض</button>}
                <button className="ad-btn danger" onClick={() => remove(review.id)}>حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
