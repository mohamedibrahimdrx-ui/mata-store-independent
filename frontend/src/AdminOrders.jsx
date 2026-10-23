import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminRequest } from './api/admin'
import { optimizeImage } from './utils/images'

const egp = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`
const TZ = 'Africa/Cairo'

const toDate = (value) => {
  if (!value) return null
  const d = value._seconds !== undefined ? new Date(value._seconds * 1000)
    : value.seconds !== undefined ? new Date(value.seconds * 1000) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
const fmtDateTime = (value) => {
  const d = toDate(value)
  return d ? d.toLocaleString('ar-EG', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : 'غير مسجل'
}
const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()) // YYYY-MM-DD

// 01012345678 -> 201012345678 (WhatsApp wants the international format, digits only)
const waNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (/^01[0-9]{9}$/.test(digits)) return `2${digits}`
  if (/^201[0-9]{9}$/.test(digits)) return digits
  return null
}

const TABS = [
  ['all', 'الكل'], ['unread', 'غير مقروءة'], ['read', 'مقروءة'],
  ['pending', 'قيد المراجعة'], ['confirmed', 'تم التأكيد'], ['shipped', 'تم الشحن'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي'],
]
const isUnread = (order) => order.seen !== true
const matchesTab = (order, tab) => (tab === 'all' ? true : tab === 'unread' ? isUnread(order) : tab === 'read' ? !isUnread(order) : order.status === tab)

/* ----------------------------- sales totals (day / month, Cairo time) ----------------------------- */

function SalesPanel({ user, version }) {
  const [mode, setMode] = useState('day')
  const [day, setDay] = useState(cairoToday)
  const [month, setMonth] = useState(() => cairoToday().slice(0, 7))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const value = mode === 'day' ? day : month

  useEffect(() => {
    let cancelled = false
    if (!value) return undefined
    setLoading(true); setError('')
    adminRequest(user, `/api/admin/orders/stats?period=${mode}&date=${encodeURIComponent(value)}`)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, mode, value, version])

  const maxDay = data?.byDay?.length ? Math.max(...data.byDay.map((x) => x.total)) : 0
  const title = mode === 'day' ? 'مبيعات اليوم' : 'مبيعات الشهر'
  return (
    <section className="ad-sales" aria-label="إجمالي المبيعات">
      <div className="ad-sales-head">
        <div className="ad-seg" role="tablist" aria-label="الفترة">
          <button role="tab" aria-selected={mode === 'day'} className={mode === 'day' ? 'chosen' : ''} onClick={() => setMode('day')}>يومي</button>
          <button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'chosen' : ''} onClick={() => setMode('month')}>شهري</button>
        </div>
        {mode === 'day'
          ? <input type="date" aria-label="اختار اليوم" value={day} max="2100-12-31" onChange={(e) => setDay(e.target.value)} />
          : <input type="month" aria-label="اختار الشهر" value={month} onChange={(e) => setMonth(e.target.value)} />}
        <button className="ad-btn" onClick={() => (mode === 'day' ? setDay(cairoToday()) : setMonth(cairoToday().slice(0, 7)))}>{mode === 'day' ? 'اليوم' : 'هذا الشهر'}</button>
      </div>
      {error && <p className="ad-error">{error}</p>}
      {data && (
        <div className={loading ? 'ad-sales-body loading' : 'ad-sales-body'}>
          <div className="ad-sales-main">
            <span>{title}</span>
            <strong data-testid="sales-total">{egp(data.sales.total)}</strong>
            <small>{data.sales.count} طلب (من غير الملغي) · المنتجات {egp(data.sales.subtotal)} + الشحن {egp(data.sales.shipping)}</small>
          </div>
          <div className="ad-sales-cards">
            <div><span>قيد المراجعة</span><b>{egp(data.byStatus.pending?.total)}</b><small>{data.byStatus.pending?.count || 0} طلب</small></div>
            <div><span>تم التأكيد</span><b>{egp(data.byStatus.confirmed?.total)}</b><small>{data.byStatus.confirmed?.count || 0} طلب</small></div>
            <div><span>تم الشحن</span><b>{egp(data.byStatus.shipped?.total)}</b><small>{data.byStatus.shipped?.count || 0} طلب</small></div>
            <div><span>تم التسليم</span><b>{egp(data.byStatus.delivered?.total)}</b><small>{data.byStatus.delivered?.count || 0} طلب</small></div>
            <div className="cancelled"><span>ملغي (مش محسوب)</span><b>{egp(data.byStatus.cancelled?.total)}</b><small>{data.byStatus.cancelled?.count || 0} طلب</small></div>
          </div>
          {data.truncated && <p className="ad-hint">الفترة فيها طلبات كتير جدًا، الأرقام قد تكون ناقصة.</p>}
          {mode === 'month' && data.byDay?.length > 0 && (
            <ul className="ad-daybars" aria-label="المبيعات حسب اليوم">
              {data.byDay.map((d) => (
                <li key={d.date}>
                  <span>{d.date.slice(8)}</span>
                  <span className="bar"><span style={{ width: `${maxDay ? (d.total / maxDay) * 100 : 0}%` }} /></span>
                  <b>{egp(d.total)}</b><small>{d.count} طلب</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/* ----------------------------- one order ----------------------------- */

function OrderDetails({ order }) {
  const c = order.customer || {}
  const items = Array.isArray(order.items) ? order.items : []
  const lineOf = (item) => (Number.isFinite(item.lineTotal) ? item.lineTotal : (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))
  const itemsSum = items.reduce((sum, item) => sum + lineOf(item), 0)
  const subtotal = Number.isFinite(order.subtotal) ? order.subtotal : itemsSum
  const wa = waNumber(c.phone)
  return (
    <div className="ad-order-details">
      <div className="ad-detail-grid">
        <section>
          <h4>بيانات العميل</h4>
          <dl>
            <div><dt>الاسم</dt><dd>{c.fullName || c.name || 'غير مسجل'}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{c.phone ? <a href={`tel:${String(c.phone).replace(/[^0-9+]/g, '')}`}>{c.phone}</a> : 'غير مسجل'}{wa && <> · <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">واتساب</a></>}</dd></div>
            <div><dt>المحافظة</dt><dd>{c.city || 'غير مسجل'}</dd></div>
            <div><dt>العنوان</dt><dd>{c.address || c.shippingAddress || 'غير مسجل'}</dd></div>
            {c.notes && <div><dt>ملاحظات العميل</dt><dd className="note">{c.notes}</dd></div>}
          </dl>
        </section>
        <section>
          <h4>بيانات الطلب</h4>
          <dl>
            <div><dt>رقم الطلب</dt><dd dir="ltr">{order.orderNumber || order.id}</dd></div>
            <div><dt>تاريخ الطلب</dt><dd>{fmtDateTime(order.createdAt)}</dd></div>
            {order.updatedAt && <div><dt>آخر تحديث</dt><dd>{fmtDateTime(order.updatedAt)}</dd></div>}
            <div><dt>الدفع</dt><dd>{order.paymentMethod === 'cod' ? 'الدفع عند الاستلام' : order.paymentMethod || 'غير محدد'}</dd></div>
            <div><dt>القراءة</dt><dd>{isUnread(order) ? 'لم تُقرأ' : `قُرئ ${order.seenAt ? fmtDateTime(order.seenAt) : ''}`}</dd></div>
          </dl>
        </section>
      </div>

      <h4>المنتجات ({items.length})</h4>
      <div className="ad-items-wrap">
        <table className="ad-items-table">
          <thead><tr><th>المنتج</th><th>اللون</th><th>الكمية</th><th>سعر القطعة</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.productId || 'x'}-${i}`}>
                <td><span className="ad-item-name">{item.image && <img src={optimizeImage(item.image, 96)} alt="" loading="lazy" />}<span>{item.productName || item.name || item.productId}</span></span></td>
                <td>{item.colorName || item.colorHex ? <span className="ad-color-chip"><i style={{ background: item.colorHex || '#ccc' }} />{item.colorName || '—'}</span> : '—'}</td>
                <td>{item.quantity}</td>
                <td>{egp(item.unitPrice)}</td>
                <td><b>{egp(lineOf(item))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ad-order-totals">
        <div><dt>إجمالي المنتجات</dt><dd>{egp(subtotal)}</dd></div>
        <div><dt>الشحن</dt><dd>{Number.isFinite(order.shippingFee) ? (order.shippingFee === 0 ? 'مجاني' : egp(order.shippingFee)) : 'غير مسجل (طلب قديم)'}</dd></div>
        <div className="grand"><dt>الإجمالي المطلوب من العميل</dt><dd>{egp(order.total)}</dd></div>
      </dl>
    </div>
  )
}

/* ----------------------------- the orders screen ----------------------------- */

export default function AdminOrders({ user, orders, loading, labelStatus, transitions, onChangeStatus, onPatchOrder, onReload }) {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [error, setError] = useState('')

  const counts = useMemo(() => Object.fromEntries(TABS.map(([key]) => [key, orders.filter((o) => matchesTab(o, key)).length])), [orders])
  const version = useMemo(() => orders.map((o) => `${o.id}:${o.status}`).join('|'), [orders])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => matchesTab(o, tab)).filter((o) => !q
      || `${o.orderNumber || ''} ${o.id} ${o.customer?.fullName || o.customer?.name || ''} ${o.customer?.phone || ''} ${o.customer?.city || ''}`.toLowerCase().includes(q))
  }, [orders, tab, search])

  const setSeen = useCallback(async (order, seen) => {
    setError('')
    onPatchOrder(order.id, { seen })
    try {
      await adminRequest(user, `/api/admin/orders/${encodeURIComponent(order.id)}/seen`, { method: 'PATCH', body: JSON.stringify({ seen }) })
    } catch (err) {
      onPatchOrder(order.id, { seen: order.seen })
      setError(err.message)
    }
  }, [user, onPatchOrder])

  async function markAllSeen() {
    setError('')
    try {
      await adminRequest(user, '/api/admin/orders/seen-all', { method: 'POST', body: JSON.stringify({}) })
      await onReload()
    } catch (err) { setError(err.message) }
  }

  function toggle(order) {
    const next = new Set(open)
    if (next.has(order.id)) next.delete(order.id)
    else {
      next.add(order.id)
      if (isUnread(order)) setSeen(order, true) // opening an order marks it as read
    }
    setOpen(next)
  }

  return (
    <div className="ad-orders-screen">
      <SalesPanel user={user} version={version} />

      <div className="ad-tabs ad-order-tabs" role="tablist" aria-label="تصنيف الطلبات">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`${tab === key ? 'chosen' : ''}${key === 'unread' && counts.unread > 0 ? ' alert' : ''}`} onClick={() => setTab(key)}>
            {label} <span className="ad-count">{counts[key]}</span>
          </button>
        ))}
      </div>
      <div className="ad-toolbar">
        <input type="search" placeholder="ابحث برقم الطلب أو الاسم أو الهاتف أو المحافظة" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث في الطلبات" />
        {counts.unread > 0 && <button className="ad-btn" onClick={markAllSeen}>تعليم الكل كمقروء</button>}
      </div>
      {error && <p className="ad-error">{error}</p>}

      <div className="ad-orders">
        {shown.map((order) => {
          const isOpen = open.has(order.id)
          const unread = isUnread(order)
          const items = Array.isArray(order.items) ? order.items : []
          return (
            <article key={order.id} className={`ad-order${unread ? ' unread' : ''}`}>
              <button className="ad-order-head" aria-expanded={isOpen} onClick={() => toggle(order)}>
                <span className="ad-order-title">
                  {unread && <span className="ad-new">جديد</span>}
                  <b>طلب #{order.orderNumber || order.id}</b>
                  <small>{order.customer?.fullName || order.customer?.name || 'عميل'} · {order.customer?.phone || 'لا يوجد هاتف'} · {order.customer?.city || ''}</small>
                  <small>{fmtDateTime(order.createdAt)}</small>
                </span>
                <span className="ad-order-side">
                  <span className={`ad-status s-${order.status}`}>{labelStatus(order.status)}</span>
                  <b>{egp(order.total)}</b>
                  <small>{items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)} قطعة</small>
                  <span className="ad-chev" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
                </span>
              </button>

              {isOpen && <OrderDetails order={order} />}

              <div className="ad-order-actions">
                <label className="ad-status-select">تغيير الحالة
                  <select value="" disabled={(transitions[order.status] || []).length === 0} onChange={(event) => event.target.value && onChangeStatus(order, event.target.value)}>
                    <option value="">اختار حالة جديدة</option>
                    {(transitions[order.status] || []).map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                  </select>
                </label>
                <button className="ad-btn" onClick={() => setSeen(order, unread)}>{unread ? 'تعليم كمقروء' : 'تعليم كغير مقروء'}</button>
              </div>
            </article>
          )
        })}
        {!loading && shown.length === 0 && <div className="ad-empty">{orders.length ? 'مفيش طلبات في التصنيف ده.' : 'لا توجد طلبات حتى الآن.'}</div>}
      </div>
      {orders.length >= 300 && <p className="ad-hint">بيتعرض آخر 300 طلب. إجمالي المبيعات فوق محسوب على كل الطلبات في الفترة.</p>}
    </div>
  )
}
