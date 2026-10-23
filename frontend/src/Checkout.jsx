import { useEffect, useMemo, useRef, useState } from 'react'
import './Checkout.css'
import { Icon, ProductVisual } from './components/ui'
import { formatNumber, formatPrice } from './utils/format'
import {
  GOVERNORATES,
  NOTES_MAX_LENGTH,
  findGovernorate,
  normalizeName,
  normalizePhone,
  validateCheckout,
} from './utils/checkoutRules'
import { submitOrder } from './api/orders'
import { getShippingQuote } from './utils/shipping'
import { FreeShippingProgress } from './SiteBlocks'

const EMPTY_FORM = { fullName: '', phone: '', city: '', address: '', notes: '' }
const FIELD_ORDER = ['fullName', 'phone', 'city', 'address', 'notes']

function CheckoutHeader({ onBack }) {
  return (
    <header className="co-header">
      <div className="container co-header-inner">
        <button type="button" className="co-back" onClick={onBack}>
          <Icon name="arrowRight" size={18} />
          <span>رجوع للمتجر</span>
        </button>
        <button type="button" className="co-logo" onClick={onBack} aria-label="MATA - الرجوع للمتجر">
          MATA
        </button>
        <span aria-hidden="true" />
      </div>
    </header>
  )
}

function Field({ name, label, optional, error, hint, children }) {
  return (
    <div className="co-field">
      <label htmlFor={`co-${name}`}>
        {label}
        {optional ? <span className="co-optional"> (اختياري)</span> : <span className="co-required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="co-hint" id={`co-${name}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="co-error" id={`co-${name}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function OrderSummary({ items, subtotal, shipping, quote, shippingFee, total, onInc, onDec, onRemove }) {
  return (
    <>
      <ul className="co-items">
        {items.map(({ product, qty, cartKey, selectedColor }) => (
          <li key={cartKey || product.id} className="co-item">
            <div className="co-thumb">
              {selectedColor?.image || product.image ? (
                <img className="co-product-photo" src={selectedColor?.image || product.image} alt="" loading="lazy" />
              ) : (
                <ProductVisual category={product.category} tone={product.tone || '#e6dbc8'} label="" />
              )}
            </div>
            <div className="co-item-body">
              <h3>{product.name}</h3>
              {selectedColor && <p className="co-color-name">اللون: {selectedColor.name}</p>}
              <div className="qty" role="group" aria-label={`الكمية: ${product.name}`}>
                <button type="button" aria-label="تقليل الكمية" onClick={() => onDec(cartKey || product.id)}>
                  <Icon name="minus" size={16} />
                </button>
                <span aria-live="polite">{formatNumber(qty)}</span>
                <button type="button" aria-label="زيادة الكمية" onClick={() => onInc(cartKey || product.id)}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </div>
            <div className="co-item-side">
              <strong className="price">{formatPrice(product.price * qty)}</strong>
              <button
                type="button"
                className="icon-btn"
                aria-label={`حذف ${product.name} من الطلب`}
                onClick={() => onRemove(cartKey || product.id)}
              >
                <Icon name="trash" size={19} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <FreeShippingProgress subtotal={subtotal} shipping={shipping} />

      <dl className="co-totals">
        <div className="co-line">
          <dt>الإجمالي الفرعي</dt>
          <dd>{formatPrice(subtotal)}</dd>
        </div>
        <div className="co-line">
          <dt>الشحن</dt>
          <dd>
            {shippingFee === null ? 'بعد اختيار المدينة' : quote?.free ? (
              <><s className="co-old-fee">{formatPrice(quote.baseFee)}</s> <strong className="co-free">مجاني</strong></>
            ) : formatPrice(shippingFee)}
          </dd>
        </div>
        <div className="co-line co-total">
          <dt>{shippingFee === null ? 'الإجمالي (قبل الشحن)' : 'الإجمالي'}</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>
    </>
  )
}

export default function Checkout({ items, subtotal, shipping, onInc, onDec, onRemove, onBack, onOrderPlaced }) {
  const [values, setValues] = useState(EMPTY_FORM)
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | error | success
  const [errorMessage, setErrorMessage] = useState('')
  const [placed, setPlaced] = useState(null)

  const submittingRef = useRef(false)
  const alertRef = useRef(null)

  const errors = useMemo(() => validateCheckout(values), [values])
  // Display only: the server recalculates the shipping fee (and free shipping) from database prices.
  const quote = getShippingQuote(values.city, subtotal, shipping)
  const shippingFee = quote ? quote.fee : null
  const total = subtotal + (shippingFee ?? 0)
  const submitting = status === 'submitting'

  useEffect(() => {
    if (status === 'error') alertRef.current?.focus()
  }, [status])

  const showError = (name) => (touched[name] || submitAttempted ? errors[name] : undefined)

  const fieldProps = (name, { hint = false } = {}) => {
    const error = showError(name)
    const describedBy = [error ? `co-${name}-error` : null, hint && !error ? `co-${name}-hint` : null]
      .filter(Boolean)
      .join(' ')
    return {
      id: `co-${name}`,
      name,
      value: values[name],
      onChange: (e) => setValues((prev) => ({ ...prev, [name]: e.target.value })),
      onBlur: () => setTouched((prev) => ({ ...prev, [name]: true })),
      disabled: submitting,
      className: `co-input${error ? ' invalid' : ''}`,
      'aria-invalid': error ? 'true' : 'false',
      'aria-describedby': describedBy || undefined,
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submittingRef.current || items.length === 0) return

    setSubmitAttempted(true)
    const firstInvalid = FIELD_ORDER.find((name) => errors[name])
    if (firstInvalid) {
      document.getElementById(`co-${firstInvalid}`)?.focus()
      return
    }

    const governorate = findGovernorate(values.city)
    const payload = {
      customer: {
        fullName: normalizeName(values.fullName),
        phone: normalizePhone(values.phone),
        city: governorate.name,
        cityId: governorate.id,
        address: values.address.trim(),
        notes: values.notes.trim(),
      },
      // Only IDs and quantities — the server must calculate prices itself.
      items: items.map(({ product, qty, selectedColor }) => ({ productId: product.id, colorId: selectedColor?.id || null, quantity: qty })),
    }

    submittingRef.current = true
    setStatus('submitting')
    setErrorMessage('')

    try {
      const result = await submitOrder(payload)
      setPlaced({ orderNumber: result.orderNumber, cityName: governorate.name, subtotal: result.subtotal, shippingFee: result.shippingFee, total: result.total })
      setStatus('success')
      onOrderPlaced() // clears the cart — only after a real server confirmation
    } catch (error) {
      setErrorMessage(error.message || 'حصلت مشكلة غير متوقعة. حاول تاني.')
      setStatus('error')
    } finally {
      submittingRef.current = false
    }
  }

  /* ---------- Success ---------- */
  if (status === 'success' && placed) {
    return (
      <div className="co-page">
        <CheckoutHeader onBack={onBack} />
        <main className="container co-main">
          <section className="co-card co-center" aria-labelledby="co-success-title">
            <span className="co-badge co-badge-success">
              <Icon name="check" size={30} />
            </span>
            <h1 id="co-success-title">تم تسجيل طلبك</h1>
            <p className="co-muted">
              رقم طلبك: <strong className="co-order-number">{placed.orderNumber}</strong>
            </p>
            <p className="co-muted">
              طريقة الدفع: كاش عند الاستلام · التوصيل إلى {placed.cityName}
            </p>
            {placed.total !== undefined && (
              <p className="co-muted" data-testid="co-paid-amount">
                المطلوب عند الاستلام: <strong>{formatPrice(placed.total)}</strong>
                {placed.shippingFee === 0
                  ? ' (شحن مجاني)'
                  : placed.shippingFee > 0 ? ` (شامل الشحن ${formatPrice(placed.shippingFee)})` : ''}
              </p>
            )}
            <button type="button" className="btn btn-primary" onClick={onBack}>
              متابعة التسوّق
            </button>
          </section>
        </main>
      </div>
    )
  }

  /* ---------- Empty cart ---------- */
  if (items.length === 0) {
    return (
      <div className="co-page">
        <CheckoutHeader onBack={onBack} />
        <main className="container co-main">
          <section className="co-card co-center" aria-labelledby="co-empty-title">
            <span className="co-badge">
              <Icon name="bag" size={30} />
            </span>
            <h1 id="co-empty-title">سلتك فاضية</h1>
            <p className="co-muted">أضف منتجات للسلة الأول عشان تقدر تكمّل الطلب.</p>
            <button type="button" className="btn btn-primary" onClick={onBack}>
              ارجع للتسوّق
            </button>
          </section>
        </main>
      </div>
    )
  }

  /* ---------- Checkout form ---------- */
  return (
    <div className="co-page">
      <CheckoutHeader onBack={onBack} />

      <main className="container co-main">
        <h1 className="co-title">إتمام الطلب</h1>

        <div className="co-layout">
          <form id="checkout-form" className="co-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
            <section className="co-card" aria-labelledby="co-details-title">
              <h2 id="co-details-title">بيانات التوصيل</h2>

              <Field name="fullName" label="الاسم بالكامل" error={showError('fullName')}>
                <input type="text" autoComplete="name" placeholder="مثال: محمد أحمد علي" {...fieldProps('fullName')} />
              </Field>

              <div className="co-row">
                <Field
                  name="phone"
                  label="رقم الموبايل"
                  error={showError('phone')}
                  hint="رقم مصري، مثال: 01012345678"
                >
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="01012345678"
                    {...fieldProps('phone', { hint: true })}
                    className={`co-input co-input-ltr${showError('phone') ? ' invalid' : ''}`}
                  />
                </Field>

                <Field name="city" label="المدينة / المحافظة" error={showError('city')}>
                  <select autoComplete="address-level1" {...fieldProps('city')}>
                    <option value="">اختار المدينة</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                name="address"
                label="العنوان بالتفصيل"
                error={showError('address')}
                hint="الشارع، رقم العمارة، الدور والشقة، وأي علامة مميزة"
              >
                <textarea rows={3} autoComplete="street-address" {...fieldProps('address', { hint: true })} />
              </Field>

              <Field name="notes" label="ملاحظات على الطلب" optional error={showError('notes')}>
                <textarea rows={2} maxLength={NOTES_MAX_LENGTH} {...fieldProps('notes')} />
                <p className="co-counter" aria-hidden="true">
                  {formatNumber(values.notes.length)} / {formatNumber(NOTES_MAX_LENGTH)}
                </p>
              </Field>
            </section>

            <section className="co-card" aria-labelledby="co-pay-title">
              <h2 id="co-pay-title">طريقة الدفع</h2>
              <div className="co-pay">
                <span className="co-pay-icon">
                  <Icon name="cash" size={22} />
                </span>
                <div>
                  <strong>الدفع كاش عند الاستلام</strong>
                  <p className="co-muted">هتدفع المبلغ كاش وقت استلام الطلب. دي طريقة الدفع الوحيدة المتاحة حالياً.</p>
                </div>
              </div>
            </section>
          </form>

          <aside className="co-card co-summary" aria-labelledby="co-summary-title">
            <h2 id="co-summary-title">ملخص الطلب</h2>

            <OrderSummary
              items={items}
              subtotal={subtotal}
              shipping={shipping}
              quote={quote}
              shippingFee={shippingFee}
              total={total}
              onInc={onInc}
              onDec={onDec}
              onRemove={onRemove}
            />

            <p className="co-fine">
              الأسعار ورسوم الشحن المعروضة هنا مبدئية، والتأكيد النهائي هيتم من نظام الطلبات.
            </p>

            {status === 'error' && (
              <div className="co-alert" role="alert" tabIndex={-1} ref={alertRef}>
                <Icon name="alert" size={20} />
                <p>{errorMessage}</p>
              </div>
            )}

            <button type="submit" form="checkout-form" className="btn btn-dark btn-block" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>جاري إرسال الطلب…</span>
                </>
              ) : (
                'تأكيد الطلب — الدفع عند الاستلام'
              )}
            </button>
          </aside>
        </div>
      </main>
    </div>
  )
}