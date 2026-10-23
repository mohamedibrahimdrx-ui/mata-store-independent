import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ProductDetails.css'
import { formatPrice } from './utils/format'
import { optimizeImage } from './utils/images'
import { STORE_INFO } from './storeInfo'
import ReviewsSection, { Stars, useReviews } from './Reviews'

const MAX_QTY_PER_ITEM = 20 // the orders API accepts at most 20 of the same item

const PATHS = {
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'm6 6 12 12M18 6 6 18',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  share: 'M12 15V4m0 0L8 8m4-4 4 4M5 13v6h14v-6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01',
  returnBox: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
}

function Ico({ name, size = 20, fill = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/* ---------------------------- Gallery ---------------------------- */

function Gallery({ images, name, index, onIndexChange, onOpenLightbox }) {
  const trackRef = useRef(null)
  const thumbsRef = useRef(null)
  const count = images.length

  // Track which slide is centered (works for swipe, arrows and thumbnails, in RTL too).
  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            onIndexChange(Number(entry.target.dataset.index))
          }
        })
      },
      { root: track, threshold: [0.6] },
    )
    Array.from(track.children).forEach((slide) => observer.observe(slide))
    return () => observer.disconnect()
  }, [images, onIndexChange])

  // A different set of images (e.g. another color) always starts from the first image.
  const imagesKey = images.join('|')
  useEffect(() => {
    const first = trackRef.current?.children[0]
    first?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'auto' })
  }, [imagesKey])

  const goTo = useCallback((i) => {
    const next = (i + count) % count
    trackRef.current?.children[next]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    onIndexChange(next)
  }, [count, onIndexChange])

  useEffect(() => {
    thumbsRef.current?.children[index]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [index])

  return (
    <div className="pd-gallery">
      <div className="pd-stage">
        <div className="pd-track" ref={trackRef} aria-roledescription="carousel" aria-label={`صور ${name}`}>
          {images.map((src, i) => (
            <div className="pd-slide" key={src} data-index={i} role="group" aria-label={`صورة ${i + 1} من ${count}`}>
              <img src={optimizeImage(src, 900)} alt={i === 0 ? name : `${name} - صورة ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'} decoding="async" draggable="false" />
            </div>
          ))}
        </div>
        <button type="button" className="pd-icon-btn pd-expand" onClick={onOpenLightbox} aria-label="تكبير الصورة">
          <Ico name="expand" size={18} />
        </button>
        {count > 1 && (
          <>
            <button type="button" className="pd-arrow pd-arrow-prev" onClick={() => goTo(index - 1)} aria-label="الصورة السابقة">
              <Ico name="chevronRight" />
            </button>
            <button type="button" className="pd-arrow pd-arrow-next" onClick={() => goTo(index + 1)} aria-label="الصورة التالية">
              <Ico name="chevronLeft" />
            </button>
            <span className="pd-counter" aria-hidden="true">{index + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="pd-thumbs" ref={thumbsRef} role="tablist" aria-label="الصور المصغرة">
          {images.map((src, i) => (
            <button type="button" key={src} role="tab" aria-selected={i === index}
              className={`pd-thumb${i === index ? ' active' : ''}`} onClick={() => goTo(i)} aria-label={`عرض الصورة ${i + 1}`}>
              <img src={optimizeImage(src, 160)} alt="" loading="lazy" decoding="async" draggable="false" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Lightbox ---------------------------- */

function Lightbox({ images, index, name, onClose, onIndexChange }) {
  const closeRef = useRef(null)
  const touchStart = useRef(null)
  const count = images.length
  const step = useCallback((d) => onIndexChange((index + d + count) % count), [index, count, onIndexChange])

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      // RTL layout: the "next" image is on the left.
      else if (e.key === 'ArrowLeft') step(1)
      else if (e.key === 'ArrowRight') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, step])

  const onTouchEnd = (e) => {
    if (touchStart.current == null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (Math.abs(dx) < 50 || count < 2) return
    // RTL layout, same as the carousel: dragging left-to-right (positive dx) reveals the NEXT image.
    step(dx > 0 ? 1 : -1)
  }

  return (
    <div className="pd-lightbox" role="dialog" aria-modal="true" aria-label={`صور ${name}`} onClick={onClose}>
      <button type="button" ref={closeRef} className="pd-lb-close" onClick={onClose} aria-label="إغلاق"><Ico name="close" size={24} /></button>
      <div className="pd-lb-stage" onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchStart.current = e.touches[0].clientX }} onTouchEnd={onTouchEnd}>
        <img src={optimizeImage(images[index], 1600)} alt={`${name} - صورة ${index + 1}`} draggable="false" />
      </div>
      {count > 1 && (
        <>
          <button type="button" className="pd-lb-arrow pd-lb-prev" onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label="الصورة السابقة"><Ico name="chevronRight" size={28} /></button>
          <button type="button" className="pd-lb-arrow pd-lb-next" onClick={(e) => { e.stopPropagation(); step(1) }} aria-label="الصورة التالية"><Ico name="chevronLeft" size={28} /></button>
          <span className="pd-lb-count">{index + 1} / {count}</span>
        </>
      )}
    </div>
  )
}

/* ---------------------------- Video ---------------------------- */

// Never autoplays. Uploaded/direct files use the native player (play, pause, volume, fullscreen);
// YouTube and Vimeo use their official embeds (youtube-nocookie for YouTube).
function ProductVideo({ video, name }) {
  const embed = video.provider === 'youtube' && video.id
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?rel=0`
    : video.provider === 'vimeo' && video.id
      ? `https://player.vimeo.com/video/${encodeURIComponent(video.id)}`
      : null
  return (
    <section className="pd-video" aria-label="فيديو المنتج">
      <h2>فيديو المنتج</h2>
      <div className={`pd-video-frame${embed ? ' embed' : ''}`}>
        {embed ? (
          <iframe src={embed} title={`فيديو ${name}`} loading="lazy" allowFullScreen
            allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <video src={video.url} poster={video.poster ? optimizeImage(video.poster, 900) : undefined}
            controls playsInline preload="metadata">
            المتصفح عندك مش بيدعم تشغيل الفيديو.
          </video>
        )}
      </div>
    </section>
  )
}

/* ---------------------------- Page ---------------------------- */

function SimilarCard({ product, onOpen }) {
  return (
    <a className="pd-sim" href={`#/product/${product.id}`} onClick={(e) => { e.preventDefault(); onOpen(product.id) }}>
      <span className="pd-sim-img">
        {product.image && <img src={optimizeImage(product.image, 500)} alt="" loading="lazy" decoding="async" />}
      </span>
      <span className="pd-sim-name">{product.name}</span>
      <span className="pd-sim-price">{formatPrice(product.price)}</span>
    </a>
  )
}

export default function ProductDetails({
  product, products, settings, loading, categoryName, onBack, onOpenProduct, onGoCategory,
  onAddToCart, onBuyNow, wishlisted, onToggleWishlist, onNotice,
}) {
  const colors = useMemo(() => (Array.isArray(product?.colors) ? product.colors : []), [product])
  const firstAvailable = colors.find((c) => c.stock > 0) || colors[0] || null
  const [colorId, setColorId] = useState(null) // null until the shopper picks; falls back to the first available color
  const [qty, setQty] = useState(1)
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const ctaRef = useRef(null)
  const reviews = useReviews(product?.id)

  const color = colors.find((c) => c.id === colorId) || firstAvailable
  const stock = color ? color.stock : Infinity
  const inStock = colors.length === 0 ? true : !!color && color.stock > 0
  const maxQty = Math.max(1, Math.min(Number.isFinite(stock) ? stock : MAX_QTY_PER_ITEM, MAX_QTY_PER_ITEM))

  // Gallery: a color with its own images shows those; otherwise the product gallery.
  const productImages = useMemo(() => {
    const list = [...new Set([product?.image, ...(product?.images || [])].filter(Boolean))]
    return list
  }, [product])
  const images = useMemo(() => {
    const own = color?.images?.filter(Boolean) || []
    if (own.length) return own
    if (color?.image && !productImages.includes(color.image)) return [color.image]
    return productImages
  }, [color, productImages])

  const safeIndex = Math.min(index, Math.max(0, images.length - 1))

  useEffect(() => { setQty((q) => Math.min(Math.max(1, q), maxQty)) }, [maxQty])

  // Sticky mobile bar: shown once the in-page buy buttons have scrolled above the top of the screen.
  // (A scroll listener is used instead of IntersectionObserver, which misses fast jumps past the element.)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = ctaRef.current
      if (el) setShowSticky(el.getBoundingClientRect().bottom < 0)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [product?.id])

  const similar = useMemo(() => {
    if (!product) return []
    const others = products.filter((p) => p.id !== product.id)
    const sameCategory = others.filter((p) => p.category === product.category)
    return [...sameCategory, ...others.filter((p) => p.category !== product.category)].slice(0, 4)
  }, [product, products])

  const selectColor = (id) => { setColorId(id); setQty(1) }

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}#/product/${product.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url })
        return
      }
      await navigator.clipboard.writeText(url)
      onNotice('تم نسخ رابط المنتج')
    } catch (err) {
      if (err?.name !== 'AbortError') onNotice('مقدرناش نشارك الرابط. انسخه من شريط العنوان.')
    }
  }

  if (loading && !product) {
    return <main className="pd-root"><div className="pd-state"><p>جاري تحميل المنتج…</p></div></main>
  }
  if (!product) {
    return (
      <main className="pd-root">
        <div className="pd-state">
          <p>المنتج ده مش متاح دلوقتي.</p>
          <button type="button" className="btn btn-ghost" onClick={onBack}>الرجوع للمتجر</button>
        </div>
      </main>
    )
  }

  const hasRating = reviews.summary.count > 0 // only real, admin-approved reviews
  const discount = product.compareAtPrice > product.price
    ? Math.round((1 - product.price / product.compareAtPrice) * 100) : 0
  const returnPolicy = settings?.features?.returnPolicy || STORE_INFO.returnPolicy // only shown when the owner wrote one
  const specs = Array.isArray(product.specifications) ? product.specifications : []
  const features = Array.isArray(product.features) ? product.features : []

  return (
    <>
      <main className="pd-root">
        <nav className="pd-crumbs" aria-label="مسار التنقل">
          <button type="button" onClick={onBack}>الرئيسية</button>
          <span aria-hidden="true">›</span>
          <button type="button" onClick={() => onGoCategory(product.category)}>{categoryName}</button>
          <span aria-hidden="true">›</span>
          <span aria-current="page" className="pd-crumb-current">{product.name}</span>
        </nav>

        <div className="pd-layout">
          <Gallery images={images} name={product.name} index={safeIndex}
            onIndexChange={setIndex} onOpenLightbox={() => setLightbox(true)} />

          <div className="pd-info">
            <h1 className="pd-title">{product.name}</h1>

            <div className="pd-price-row">
              <span className="pd-price">{formatPrice(product.price)}</span>
              {discount > 0 && (
                <>
                  <s className="pd-old-price">{formatPrice(product.compareAtPrice)}</s>
                  <span className="pd-discount">خصم {discount}%</span>
                </>
              )}
            </div>

            {hasRating && (
              <a className="pd-rating" href="#reviews" onClick={(e) => { e.preventDefault(); document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' }) }}>
                <Stars value={reviews.summary.average} size={16} /> {reviews.summary.average.toFixed(1)} · {reviews.summary.count} تقييم
              </a>
            )}

            {colors.length > 0 && (
              <div className="pd-colors" role="group" aria-label="اختار اللون">
                <p className="pd-label">اللون: <strong>{color?.name}</strong></p>
                <div className="pd-swatches">
                  {colors.map((c) => (
                    <button type="button" key={c.id}
                      className={`pd-swatch${c.id === colorId ? ' selected' : ''}${c.stock < 1 ? ' soldout' : ''}`}
                      style={{ '--swatch': c.hex }} aria-pressed={c.id === colorId}
                      aria-label={`${c.name}${c.stock < 1 ? ' - غير متوفر' : ''}`} title={`${c.name}${c.stock < 1 ? ' - غير متوفر' : ''}`}
                      onClick={() => selectColor(c.id)} />
                  ))}
                </div>
              </div>
            )}

            <p className={`pd-stock ${inStock ? 'in' : 'out'}`} role="status">
              <span className="pd-dot" aria-hidden="true" />
              {inStock ? (Number.isFinite(stock) && stock <= 5 ? `متوفر — باقي ${stock} فقط` : 'متوفر') : 'غير متوفر حالياً'}
            </p>

            <div className="pd-qty-row">
              <p className="pd-label" id="pd-qty-label">الكمية</p>
              <div className="pd-qty" role="group" aria-labelledby="pd-qty-label">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={!inStock || qty <= 1} aria-label="تقليل الكمية"><Ico name="minus" size={18} /></button>
                <output aria-live="polite">{qty}</output>
                <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={!inStock || qty >= maxQty} aria-label="زيادة الكمية"><Ico name="plus" size={18} /></button>
              </div>
              {inStock && qty >= maxQty && Number.isFinite(stock) && stock <= MAX_QTY_PER_ITEM && <small className="pd-hint">ده أقصى مخزون متاح</small>}
            </div>

            <div className="pd-cta" ref={ctaRef}>
              <button type="button" className="btn btn-dark pd-add" disabled={!inStock}
                onClick={() => onAddToCart(product.id, color?.id ?? null, { qty })}>
                {inStock ? 'أضف للسلة' : 'غير متوفر'}
              </button>
              <button type="button" className="btn btn-ghost pd-buy" disabled={!inStock}
                onClick={() => onBuyNow(product.id, color?.id ?? null, qty)}>
                اشتري الآن
              </button>
              <div className="pd-secondary">
                <button type="button" className={`pd-chip${wishlisted ? ' on' : ''}`} aria-pressed={wishlisted}
                  onClick={() => onToggleWishlist(product.id)}>
                  <Ico name="heart" size={18} fill={wishlisted} /> {wishlisted ? 'في المفضلة' : 'أضف للمفضلة'}
                </button>
                <button type="button" className="pd-chip" onClick={share}><Ico name="share" size={18} /> مشاركة</button>
              </div>
            </div>

            {product.description && <p className="pd-desc">{product.description}</p>}

            {product.video && <ProductVideo video={product.video} name={product.name} />}

            {(features.length > 0 || specs.length > 0 || product.dimensions) && (
              <div className="pd-acc">
                {features.length > 0 && (
                  <details><summary>المميزات</summary>
                    <ul>{features.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </details>
                )}
                {specs.length > 0 && (
                  <details><summary>المواصفات</summary>
                    <dl>{specs.map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
                  </details>
                )}
                {product.dimensions && (
                  <details><summary>الأبعاد</summary><p>{product.dimensions}</p></details>
                )}
              </div>
            )}

            <div className="pd-cards">
              <section className="pd-card" aria-labelledby="pd-ship">
                <Ico name="truck" size={22} />
                <h2 id="pd-ship">الشحن والتوصيل</h2>
                {STORE_INFO.shipping.map((line, i) => <p key={i}>{line}</p>)}
                {settings?.shipping?.freeShippingEnabled && (
                  <p><strong>شحن مجاني للطلبات فوق {settings.shipping.freeShippingThreshold} جنيه.</strong></p>
                )}
              </section>
              {returnPolicy && (
                <section className="pd-card" aria-labelledby="pd-ret">
                  <Ico name="returnBox" size={22} />
                  <h2 id="pd-ret">الاستبدال والاسترجاع</h2>
                  <p>{returnPolicy}</p>
                </section>
              )}
            </div>
          </div>
        </div>

        <ReviewsSection productId={product.id} reviews={reviews} />

        {similar.length > 0 && (
          <section className="pd-similar" aria-labelledby="pd-sim-title">
            <h2 id="pd-sim-title">منتجات قد تعجبك</h2>
            <div className="pd-sim-grid">
              {similar.map((p) => <SimilarCard key={p.id} product={p} onOpen={onOpenProduct} />)}
            </div>
          </section>
        )}
      </main>

      <div className={`pd-sticky${showSticky ? ' show' : ''}`} aria-hidden={!showSticky}>
        <div className="pd-sticky-info">
          <strong>{formatPrice(product.price)}</strong>
          <span>{product.name}</span>
        </div>
        <button type="button" className="btn btn-dark" disabled={!inStock} tabIndex={showSticky ? 0 : -1}
          onClick={() => onAddToCart(product.id, color?.id ?? null, { qty })}>
          {inStock ? 'أضف للسلة' : 'غير متوفر'}
        </button>
      </div>

      {lightbox && (
        <Lightbox images={images} index={safeIndex} name={product.name}
          onClose={() => setLightbox(false)} onIndexChange={setIndex} />
      )}
    </>
  )
}
