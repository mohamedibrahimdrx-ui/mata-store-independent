import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import Checkout from './Checkout'
import ProductDetails from './ProductDetails'
import { AnnouncementStrip, FreeShippingProgress, HeroSection, PromoBanner, SiteFooter, StoreFeatures, WhatsAppButton } from './SiteBlocks'
import { fetchSiteSettings } from './api/site'
import { DEFAULT_SETTINGS } from './site/defaults'
import { optimizeImage } from './utils/images'
import { Icon, ProductVisual } from './components/ui'
import { formatNumber, formatPrice } from './utils/format'

/* ------------------------------------------------------------------ */
/*  DATA (placeholder) — will move to src/data/ in a later step        */
/*  To use real photos later, add an `image: '/images/xxx.jpg'` field  */
/*  to a product and show it in <ProductVisual />.                     */
/* ------------------------------------------------------------------ */




/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

// Makes Arabic search forgiving: ignores tashkeel and alef/yaa/taa-marbuta variants
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()

const PRODUCT_HASH = /^#\/product\/([A-Za-z0-9_-]{1,100})$/
const productIdFromHash = () => window.location.hash.match(PRODUCT_HASH)?.[1] ?? null
const WISHLIST_KEY = 'mata_wishlist_v1'

const scrollToProducts = () =>
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })

/* ------------------------------------------------------------------ */
/*  SECTIONS                                                           */
/* ------------------------------------------------------------------ */

function AnnouncementBar({ topbar }) {
  if (!topbar?.enabled || !topbar.text) return null
  return (
    <div className="announcement">
      <p>{topbar.link ? <a href={topbar.link} style={{ color: 'inherit' }}>{topbar.text}</a> : topbar.text}</p>
    </div>
  )
}

function Header({ brand, query, onQueryChange, onSearchSubmit, cartCount, onOpenCart, onAccount }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="header">
      <div className="header-inner container">
        <button
          className="icon-btn menu-toggle"
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>

        <a className="logo" href="#top" aria-label={`${brand.name} - الصفحة الرئيسية`}>
          {brand.logo ? <img src={optimizeImage(brand.logo, 240)} alt={brand.name} style={{ height: 36, width: 'auto', display: 'block' }} /> : brand.name}
        </a>

        <nav id="main-nav" className={`nav ${menuOpen ? 'open' : ''}`} aria-label="القائمة الرئيسية">
          <ul>
            {brand.nav.map((link, i) => (
              <li key={`${link.href}-${i}`}>
                <a href={link.href} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <form className="search" role="search" onSubmit={onSearchSubmit}>
          <label htmlFor="site-search" className="sr-only">
            ابحث في المتجر
          </label>
          <input
            id="site-search"
            type="search"
            placeholder={brand.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <button type="submit" aria-label="بحث">
            <Icon name="search" size={20} />
          </button>
        </form>

        <div className="header-actions">
          <button className="icon-btn" aria-label="حسابي" onClick={onAccount}>
            <Icon name="user" />
          </button>
          <button className="icon-btn bag-btn" aria-label={`فتح السلة، ${formatNumber(cartCount)} منتج`} onClick={onOpenCart}>
            <Icon name="bag" />
            {cartCount > 0 && <span className="count">{formatNumber(cartCount)}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}

// Decorative product cards shown beside the hero text when no banner image is uploaded.
function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-card hero-card-main">
        <ProductVisual category="bags" tone="#dccdb4" label="" />
      </div>
      <div className="hero-card hero-card-side">
        <ProductVisual category="perfumes" tone="#efe6d8" label="" />
      </div>
    </div>
  )
}

function CategoryCards({ categories, layout, onSelect }) {
  const visible = categories.filter((cat) => cat.enabled)
  if (visible.length === 0) return null
  return (
    <section id="categories" className="section container" aria-labelledby="cat-title">
      <div className="section-head">
        <h2 id="cat-title">{layout.categoriesTitle}</h2>
        {layout.categoriesSubtitle && <p>{layout.categoriesSubtitle}</p>}
      </div>
      <ul className="category-grid">
        {visible.map((cat, i) => (
          <li key={cat.id}>
            <button className="cat-card" onClick={() => onSelect(cat.id)}>
              {cat.image
                ? <img className="cat-image" src={optimizeImage(cat.image, 500)} alt="" loading="lazy" decoding="async" />
                : <ProductVisual category={cat.id} tone={["#e6dbc8", "#efe6d8", "#dccdb4", "#e4d8c4"][i % 4]} label="" />}
              <span className="cat-name">{cat.name}</span>
              {cat.blurb && <span className="cat-blurb">{cat.blurb}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProductCard({ product, onAdd, onOpen }) {
  const availableColors = Array.isArray(product.colors) ? product.colors : []
  const [selectedColorId, setSelectedColorId] = useState(
    availableColors.find((color) => color.stock > 0)?.id ?? availableColors[0]?.id ?? '',
  )
  const selectedColor = availableColors.find((color) => color.id === selectedColorId)
  const image = selectedColor?.image || product.image
  const inStock = selectedColor ? selectedColor.stock > 0 : true

  return (
    <article className="product-card">
      <div className="product-media">
        <a className="product-link" href={`#/product/${product.id}`} aria-label={`عرض تفاصيل ${product.name}`}
          onClick={(e) => { e.preventDefault(); onOpen(product.id) }}>
          {image ? (
            <img className="product-photo" src={optimizeImage(image, 600)} alt={`${product.name}${selectedColor ? ` - ${selectedColor.name}` : ''}`} loading="lazy" decoding="async" />
          ) : (
            <ProductVisual category={product.category} tone={product.tone || '#e6dbc8'} label={product.name} />
          )}
        </a>
        {product.tag && <span className="tag">{product.tag}</span>}
      </div>
      <div className="product-info">
        <h3><a className="product-title-link" href={`#/product/${product.id}`} onClick={(e) => { e.preventDefault(); onOpen(product.id) }}>{product.name}</a></h3>
        <p className="price">{formatPrice(product.price)}</p>
        {availableColors.length > 0 && (
          <div className="product-colors" role="group" aria-label={`اختار لون ${product.name}`}>
            <p className="selected-color-label">اللون: <strong>{selectedColor?.name || 'غير محدد'}</strong></p>
            <div className="color-swatches">
              {availableColors.map((color) => (
                <button key={color.id} type="button"
                  className={`color-swatch${selectedColorId === color.id ? ' selected' : ''}`}
                  style={{ '--swatch-color': color.hex }}
                  aria-label={`${color.name}${color.stock < 1 ? ' - غير متوفر' : ''}`}
                  aria-pressed={selectedColorId === color.id}
                  title={`${color.name}${color.stock < 1 ? ' - غير متوفر' : ''}`}
                  disabled={color.stock < 1}
                  onClick={() => setSelectedColorId(color.id)}
                />
              ))}
            </div>
          </div>
        )}
        <button type="button" className="btn btn-dark btn-block"
          disabled={!inStock || (availableColors.length > 0 && !selectedColor)}
          onClick={() => onAdd(product.id, selectedColor?.id || null)}>
          {!inStock ? 'نفد اللون' : 'أضف للسلة'}
        </button>
      </div>
    </article>
  )
}

function ProductsSection({ categories, layout, products, category, onCategoryChange, query, onClear, onAdd, onOpen, loading, error }) {
  const filters = [{ id: 'all', name: 'الكل' }, ...categories.filter((cat) => cat.enabled)]

  return (
    <section id="products" className="section container" aria-labelledby="products-title">
      <div className="section-head">
        <h2 id="products-title">{layout.productsTitle}</h2>
        {layout.productsSubtitle && <p>{layout.productsSubtitle}</p>}
      </div>

      <div className="filters" role="group" aria-label="فلترة المنتجات حسب القسم">
        {filters.map((f) => (
          <button
            key={f.id}
            className={`chip ${category === f.id ? 'active' : ''}`}
            aria-pressed={category === f.id}
            onClick={() => onCategoryChange(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <p className="results-note" role="status" aria-live="polite">
        {query ? `نتايج البحث عن "${query}": ` : ''}
        {formatNumber(products.length)} منتج
      </p>

      {loading ? (
        <div className="empty-state"><p>جاري تحميل المنتجات…</p></div>
      ) : error ? (
        <div className="empty-state"><p role="alert">{error}</p></div>
      ) : products.length > 0 ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={onAdd} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>مفيش منتجات مطابقة للبحث أو الفلتر.</p>
          <button className="btn btn-ghost" onClick={onClear}>
            مسح البحث والفلاتر
          </button>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  CART                                                               */
/* ------------------------------------------------------------------ */

function CartDrawer({ open, items, subtotal, shipping, onClose, onInc, onDec, onRemove, onCheckout }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        className={`drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        aria-hidden={!open}
      >
        <div className="drawer-head">
          <h2 id="cart-title">سلة المشتريات</h2>
          <button ref={closeRef} className="icon-btn" aria-label="إغلاق السلة" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="drawer-empty">
            <Icon name="bag" size={44} />
            <p>سلتك فاضية لسه</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose()
                scrollToProducts()
              }}
            >
              ابدأ التسوّق
            </button>
          </div>
        ) : (
          <>
            <ul className="cart-list">
              {items.map(({ product, qty, cartKey, selectedColor }) => (
                <li key={cartKey} className="cart-item">
                  <div className="cart-thumb">
                    {selectedColor?.image || product.image ? (
                      <img className="cart-photo" src={selectedColor?.image || product.image} alt="" loading="lazy" />
                    ) : (
                      <ProductVisual category={product.category} tone={product.tone || '#e6dbc8'} label="" />
                    )}
                  </div>
                  <div className="cart-details">
                    <h3>{product.name}</h3>
                    {selectedColor && <p className="cart-color-name">اللون: {selectedColor.name}</p>}
                    <p className="price">{formatPrice(product.price)}</p>
                    <div className="qty" role="group" aria-label={`الكمية: ${product.name}`}>
                      <button aria-label="تقليل الكمية" onClick={() => onDec(cartKey)}>
                        <Icon name="minus" size={16} />
                      </button>
                      <span aria-live="polite">{formatNumber(qty)}</span>
                      <button aria-label="زيادة الكمية" onClick={() => onInc(cartKey)}>
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </div>
                  <button className="icon-btn" aria-label={`حذف ${product.name} من السلة`} onClick={() => onRemove(cartKey)}>
                    <Icon name="trash" size={20} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="drawer-foot">
              <FreeShippingProgress subtotal={subtotal} shipping={shipping} />
              <div className="subtotal">
                <span>الإجمالي الفرعي</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              <p className="fine-print">الشحن بيتحسب عند إتمام الطلب.</p>
              <button className="btn btn-dark btn-block" onClick={onCheckout}>
                إتمام الطلب
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  APP                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [cart, setCart] = useState([]) // [{ id, colorId, cartKey, qty }]
  const [cartOpen, setCartOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState(() => (productIdFromHash() ? 'product' : 'store')) // 'store' | 'checkout' | 'product'
  const [productId, setProductId] = useState(productIdFromHash)
  const storeScrollRef = useRef(null)
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SETTINGS)
  const [wishlist, setWishlist] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(WISHLIST_KEY))
      return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string').slice(0, 200) : []
    } catch {
      return []
    }
  })
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
    const endpoint = `${apiBase}/api/products`

    async function loadProducts() {
      setProductsLoading(true)
      setProductsError('')
      try {
        const response = await fetch(endpoint, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal })
        if (!response.ok) throw new Error('Product request failed')
        const data = await response.json()
        if (!Array.isArray(data?.products)) throw new Error('Invalid product response')
        const normalized = data.products.map((product) => ({
          ...product,
          price: Number(product.price),
          colors: Array.isArray(product.colors) ? product.colors : [],
          tone: '#e6dbc8',
          tag: product.badge || '',
        })).filter((product) => typeof product.id === 'string' && typeof product.name === 'string' && Number.isFinite(product.price) && product.price > 0)
        setProducts(normalized)
      } catch (error) {
        if (error.name !== 'AbortError') setProductsError('مش قادرين نحمل المنتجات دلوقتي. اتأكد إن الـ Backend شغال وحاول تاني.')
      } finally {
        if (!controller.signal.aborted) setProductsLoading(false)
      }
    }
    loadProducts()
    return () => controller.abort()
  }, [])

  // Arabic / RTL document setup
  useEffect(() => {
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
    document.title = 'MATA | ماتا — شنط ومحافظ وعطور وإكسسوارات'
  }, [])

  // Browser back/forward support for the checkout page (no router needed).
  // The cart lives in memory, so a reload always starts on the store page.
  useEffect(() => {
    if (window.location.hash === '#checkout') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    const onPopState = () => {
      const pid = productIdFromHash()
      if (pid) {
        setProductId(pid)
        setView('product')
      } else {
        setView(window.history.state?.view === 'checkout' ? 'checkout' : 'store')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Start each page at the top (coming back to the store from a product restores the list position)
  useEffect(() => {
    if (view === 'store' && storeScrollRef.current != null) {
      window.scrollTo({ top: storeScrollRef.current, behavior: 'instant' })
      storeScrollRef.current = null
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [view, productId])

  useEffect(() => {
    try {
      window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist))
    } catch {
      // Storage can be unavailable (private mode); the wishlist then lasts for this visit only.
    }
  }, [wishlist])

  // Banner, announcement strip, shipping rules and store features come from the admin panel (Firestore).
  useEffect(() => {
    let cancelled = false
    fetchSiteSettings().then((loaded) => { if (!cancelled) setSiteSettings(loaded) })
    return () => { cancelled = true }
  }, [])

  const currentProduct = view === 'product' ? products.find((item) => item.id === productId) : null
  useEffect(() => {
    document.title = currentProduct
      ? `${currentProduct.name} | MATA | ماتا`
      : siteSettings.brand.pageTitle
  }, [currentProduct, siteSettings.brand.pageTitle])

  // Lock page scroll while the cart is open + close on Escape
  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : ''
    const onKey = (e) => e.key === 'Escape' && setCartOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [cartOpen])

  // Auto-hide the small notice message
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(t)
  }, [notice])

  const visibleProducts = useMemo(() => {
    const q = normalize(query)
    return products.filter((p) => {
      const inCategory = category === 'all' || p.category === category
      const catName = siteSettings.categories.items.find((c) => c.id === p.category)?.name ?? ''
      const matches = !q || normalize(p.name).includes(q) || normalize(catName).includes(q)
      return inCategory && matches
    })
  }, [products, query, category, siteSettings.categories.items])

  const cartItems = useMemo(
    () => cart.map(({ id, colorId, cartKey, qty }) => {
      const product = products.find((item) => item.id === id)
      const selectedColor = product?.colors?.find((color) => color.id === colorId)
      return product ? { product, qty, cartKey: cartKey || `${id}::${colorId || 'default'}`, selectedColor: selectedColor || null } : null
    }).filter(Boolean),
    [cart, products],
  )
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0)
  const subtotal = cartItems.reduce((sum, i) => sum + i.qty * i.product.price, 0)

  // Returns true when the item was added. `qty` and `open` are used by the product page.
  const addToCart = (id, colorId = null, { qty = 1, open = true } = {}) => {
    const product = products.find((item) => item.id === id)
    if (!product) return false
    const selectedColor = product.colors?.find((color) => color.id === colorId)
    if (product.colors?.length && (!selectedColor || selectedColor.stock < 1)) {
      setNotice('اختار لون متوفر الأول')
      return false
    }
    const cartKey = `${id}::${colorId || 'default'}`
    const existing = cart.find((item) => item.cartKey === cartKey)
    const limit = Math.min(selectedColor ? selectedColor.stock : 20, 20) // the orders API allows 20 per item
    if ((existing?.qty || 0) + qty > limit) {
      setNotice('الكمية المطلوبة أكبر من المخزون المتاح')
      return false
    }
    setCart((prev) => prev.some((item) => item.cartKey === cartKey)
      ? prev.map((item) => item.cartKey === cartKey ? { ...item, qty: item.qty + qty } : item)
      : [...prev, { id, colorId, cartKey, qty }])
    if (open) setCartOpen(true)
    return true
  }
  const buyNow = (id, colorId, qty) => {
    if (addToCart(id, colorId, { qty, open: false })) openCheckout()
  }
  const increase = (cartKey) => setCart((prev) => prev.map((item) => {
    if (item.cartKey !== cartKey) return item
    const product = products.find((entry) => entry.id === item.id)
    const color = product?.colors?.find((entry) => entry.id === item.colorId)
    return color && item.qty >= color.stock ? item : { ...item, qty: item.qty + 1 }
  }))
  const decrease = (cartKey) => setCart((prev) => prev.flatMap((item) => item.cartKey !== cartKey ? [item] : item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : []))
  const remove = (cartKey) => setCart((prev) => prev.filter((item) => item.cartKey !== cartKey))
  const clearCart = () => setCart([])

  const openCheckout = () => {
    setCartOpen(false)
    window.history.pushState({ view: 'checkout' }, '', '#checkout')
    setView('checkout')
  }
  const closeCheckout = () => {
    if (window.history.state?.view === 'checkout') window.history.back()
    else setView('store')
  }

  const openProduct = (id) => {
    if (view === 'store') storeScrollRef.current = window.scrollY
    window.history.pushState({ view: 'product', id }, '', `#/product/${id}`)
    setProductId(id)
    setView('product')
  }
  const goStore = () => {
    window.history.pushState({ view: 'store' }, '', window.location.pathname + window.location.search)
    setView('store')
  }
  const toggleWishlist = (id) =>
    setWishlist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (view === 'product') {
      storeScrollRef.current = null
      goStore()
      setTimeout(scrollToProducts, 150)
    } else {
      scrollToProducts()
    }
  }
  const handleCategorySelect = (id) => {
    setCategory(id)
    scrollToProducts()
  }
  const clearFilters = () => {
    setQuery('')
    setCategory('all')
  }

  return (
    <div id="top" className="app">
      {view === 'checkout' ? (
        <Checkout
          items={cartItems}
          subtotal={subtotal}
          shipping={siteSettings.shipping}
          onInc={increase}
          onDec={decrease}
          onRemove={remove}
          onBack={closeCheckout}
          onOrderPlaced={clearCart}
        />
      ) : view === 'product' ? (
        <>
          <AnnouncementStrip settings={siteSettings.announcement} threshold={siteSettings.shipping.freeShippingThreshold} />
          <AnnouncementBar topbar={siteSettings.brand.topbar} />
          <Header
            brand={siteSettings.brand}
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearchSubmit}
            cartCount={cartCount}
            onOpenCart={() => setCartOpen(true)}
            onAccount={() => setNotice('تسجيل الدخول هيتوفر قريباً')}
          />
          <ProductDetails
            key={currentProduct?.id || `loading-${productId}`}
            product={currentProduct || null}
            products={products}
            settings={siteSettings}
            loading={productsLoading}
            categoryName={siteSettings.categories.items.find((c) => c.id === currentProduct?.category)?.name ?? 'المنتجات'}
            onBack={() => { storeScrollRef.current = null; goStore() }}
            onOpenProduct={openProduct}
            onGoCategory={(id) => {
              storeScrollRef.current = null
              setCategory(id)
              goStore()
              setTimeout(scrollToProducts, 150)
            }}
            onAddToCart={addToCart}
            onBuyNow={buyNow}
            wishlisted={wishlist.includes(productId)}
            onToggleWishlist={toggleWishlist}
            onNotice={setNotice}
          />
          <SiteFooter footer={siteSettings.footer} brand={siteSettings.brand} />
          <WhatsAppButton footer={siteSettings.footer} />
          <CartDrawer
            open={cartOpen}
            shipping={siteSettings.shipping}
            items={cartItems}
            subtotal={subtotal}
            onClose={() => setCartOpen(false)}
            onInc={increase}
            onDec={decrease}
            onRemove={remove}
            onCheckout={openCheckout}
          />
        </>
      ) : (
        <>
          <AnnouncementStrip settings={siteSettings.announcement} threshold={siteSettings.shipping.freeShippingThreshold} />
          <AnnouncementBar topbar={siteSettings.brand.topbar} />
          <Header
            brand={siteSettings.brand}
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearchSubmit}
            cartCount={cartCount}
            onOpenCart={() => setCartOpen(true)}
            onAccount={() => setNotice('تسجيل الدخول هيتوفر قريباً')}
          />

          <main>
            {siteSettings.layout.sections.filter((section) => section.enabled).map((section) => (
              <Fragment key={section.id}>{{
                hero: <HeroSection hero={siteSettings.homepage.hero} onShop={scrollToProducts} visual={<HeroVisual />}
                  showCategories={siteSettings.layout.sections.some((x) => x.id === 'categories' && x.enabled)} />,
                categories: <CategoryCards categories={siteSettings.categories.items} layout={siteSettings.layout} onSelect={handleCategorySelect} />,
                products: (
                  <ProductsSection
                    categories={siteSettings.categories.items}
                    layout={siteSettings.layout}
                    products={visibleProducts}
                    category={category}
                    onCategoryChange={setCategory}
                    query={query.trim()}
                    onClear={clearFilters}
                    onAdd={addToCart}
                    onOpen={openProduct}
                    loading={productsLoading}
                    error={productsError}
                  />
                ),
                promo: <PromoBanner promo={siteSettings.homepage.promo} onShop={scrollToProducts} />,
                features: <StoreFeatures features={siteSettings.features} threshold={siteSettings.shipping.freeShippingThreshold} />,
              }[section.id]}</Fragment>
            ))}
          </main>
          <SiteFooter footer={siteSettings.footer} brand={siteSettings.brand} />
          <WhatsAppButton footer={siteSettings.footer} />

          <CartDrawer
            open={cartOpen}
            shipping={siteSettings.shipping}
            items={cartItems}
            subtotal={subtotal}
            onClose={() => setCartOpen(false)}
            onInc={increase}
            onDec={decrease}
            onRemove={remove}
            onCheckout={openCheckout}
          />
        </>
      )}

      <div className={`toast ${notice ? 'show' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  )
}