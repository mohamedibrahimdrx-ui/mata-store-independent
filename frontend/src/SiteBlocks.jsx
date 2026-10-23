import './SiteBlocks.css'
import { optimizeImage } from './utils/images'
import { getFreeShippingStatus } from './utils/shipping'

/* Blocks whose content is managed from the admin panel (settings stored in Firestore).
   All text is rendered as React text (never as HTML) and all links go through SafeLink. */

const fillThreshold = (text, threshold) => String(text).replaceAll('{threshold}', String(threshold))

function SafeLink({ href, children, ...props }) {
  const external = /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
      {children}
    </a>
  )
}

const ICONS = {
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  return: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  gift: 'M4 9h16v4H4zM6 13h12v7H6zM12 9v11M12 9S10 4 8 5s0 4 4 4zM12 9s2-5 4-4-0 4-4 4z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
}
export function SiteIcon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.star} />
    </svg>
  )
}

/* ------------------------------ top announcement strip ------------------------------ */

function Highlighted({ text }) {
  // **word** is highlighted with the accent color. Odd-numbered pieces between the ** markers are highlighted.
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i} className="ship-hl">{part}</strong> : <span key={i}>{part}</span>))
}

export function AnnouncementStrip({ settings, threshold }) {
  if (!settings || !settings.enabled || !settings.text) return null
  const text = fillThreshold(settings.text, threshold)
  const content = (
    <>
      {settings.showIcon && <SiteIcon name="truck" size={20} />}
      <span className="ship-text"><Highlighted text={text} /></span>
    </>
  )
  const marquee = settings.animation === 'marquee'
  return (
    <div className={`ship-bar anim-${settings.animation}`} role="region" aria-label="إعلان المتجر"
      style={{ background: settings.bgColor, color: settings.textColor, '--ship-accent': settings.accentColor }}>
      <div className="ship-inner">
        {marquee ? (
          <div className="ship-track" aria-hidden={false}>
            <span className="ship-item">{content}</span>
            <span className="ship-item ship-dup" aria-hidden="true">{content}</span>
          </div>
        ) : (
          <>
            {settings.linkUrl ? <SafeLink className="ship-item ship-link" href={settings.linkUrl}>{content}</SafeLink> : <span className="ship-item">{content}</span>}
          </>
        )}
        {settings.buttonText && settings.buttonUrl && (
          <SafeLink className="ship-btn" href={settings.buttonUrl}>{settings.buttonText}</SafeLink>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ free shipping progress ------------------------------ */

export function FreeShippingProgress({ subtotal, shipping }) {
  const status = getFreeShippingStatus(subtotal, shipping)
  if (!status.enabled || subtotal <= 0) return null
  return (
    <div className={`fs-progress${status.qualifies ? ' done' : ''}`} role="status" aria-live="polite">
      <p>
        {status.qualifies
          ? 'مبروك! حصلت على شحن مجاني 🎉'
          : `أضف منتجات بقيمة ${status.remaining} جنيه لتحصل على شحن مجاني`}
      </p>
      <div className="fs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)}>
        <span style={{ width: `${Math.round(status.progress * 100)}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------ home banners ------------------------------ */

export function HeroSection({ hero, onShop, visual, showCategories = true }) {
  if (!hero?.enabled) return null
  const hasImage = Boolean(hero.desktopImage || hero.mobileImage)
  const shop = hero.buttonText && hero.buttonUrl ? (
    <SafeLink className="btn btn-primary" href={hero.buttonUrl}
      onClick={(e) => { if (hero.buttonUrl === '#products') { e.preventDefault(); onShop() } }}>{hero.buttonText}</SafeLink>
  ) : null
  const copy = (
    <div className="hero-copy">
      {hero.eyebrow && <p className="eyebrow">{hero.eyebrow}</p>}
      <h1 id="hero-title">{hero.title}</h1>
      {hero.subtitle && <p className="hero-text">{hero.subtitle}</p>}
      <div className="hero-cta">
        {shop}
        {showCategories && <a className="btn btn-ghost" href="#categories">تصفّح الأقسام</a>}
      </div>
    </div>
  )
  if (!hasImage) {
    return (
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner container">
          {copy}
          {visual}
        </div>
      </section>
    )
  }
  const desktop = hero.desktopImage || hero.mobileImage
  const mobile = hero.mobileImage || hero.desktopImage
  return (
    <section className="hero-banner" aria-labelledby="hero-title">
      <picture>
        <source media="(max-width: 760px)" srcSet={optimizeImage(mobile, 900)} />
        <img className="hero-banner-img" src={optimizeImage(desktop, 1800)} alt="" fetchPriority="high" decoding="async" />
      </picture>
      <div className="hero-banner-copy container">{copy}</div>
    </section>
  )
}

export function PromoBanner({ promo, onShop }) {
  if (!promo?.enabled || (!promo.image && !promo.title)) return null
  return (
    <section className="section container promo" aria-labelledby="promo-title">
      <div className={`promo-card${promo.image ? ' has-image' : ''}`}>
        {promo.image && <img className="promo-img" src={optimizeImage(promo.image, 1200)} alt="" loading="lazy" decoding="async" />}
        <div className="promo-copy">
          <h2 id="promo-title">{promo.title}</h2>
          {promo.description && <p>{promo.description}</p>}
          {promo.buttonText && promo.buttonUrl && (
            <SafeLink className="btn btn-primary" href={promo.buttonUrl}
              onClick={(e) => { if (promo.buttonUrl === '#products') { e.preventDefault(); onShop() } }}>{promo.buttonText}</SafeLink>
          )}
        </div>
      </div>
    </section>
  )
}

export function StoreFeatures({ features, threshold }) {
  const items = (features?.items || []).filter((item) => item.enabled)
  if (!features?.enabled || items.length === 0) return null
  return (
    <section className="section container" aria-label="مزايا المتجر">
      <ul className="feat-grid">
        {items.map((item, i) => (
          <li key={i} className="feat-card">
            <span className="feat-icon"><SiteIcon name={item.icon} size={24} /></span>
            <h3>{item.title}</h3>
            {item.text && <p>{fillThreshold(item.text, threshold)}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}


/* ------------------------------ footer + WhatsApp button ------------------------------ */

const waLink = (number, message) => `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`

export function SiteFooter({ footer, brand }) {
  if (!footer?.enabled) return null
  const socials = [['instagram', 'إنستجرام'], ['facebook', 'فيسبوك'], ['tiktok', 'تيك توك']].filter(([key]) => footer[key])
  const hasContact = footer.phone || footer.email || footer.whatsapp || socials.length > 0
  return (
    <footer className="site-footer">
      <div className="container site-footer-grid">
        <div className="site-footer-brand">
          {brand.logo ? <img src={optimizeImage(brand.logo, 240)} alt={brand.name} height="40" /> : <strong className="site-footer-name">{brand.name}</strong>}
          {brand.tagline && <p>{brand.tagline}</p>}
          {footer.about && <p>{footer.about}</p>}
        </div>
        {footer.links.length > 0 && (
          <nav aria-label="روابط مهمة">
            <h3>روابط</h3>
            <ul>{footer.links.map((item, i) => <li key={i}><SafeLink href={item.href}>{item.label}</SafeLink></li>)}</ul>
          </nav>
        )}
        {hasContact && (
          <div>
            <h3>تواصل معانا</h3>
            <ul>
              {footer.phone && <li><a href={`tel:${footer.phone.replace(/[^0-9+]/g, '')}`} dir="ltr">{footer.phone}</a></li>}
              {footer.email && <li><a href={`mailto:${footer.email}`} dir="ltr">{footer.email}</a></li>}
              {footer.whatsapp && <li><a href={waLink(footer.whatsapp, footer.whatsappButton?.message)} target="_blank" rel="noopener noreferrer">واتساب</a></li>}
              {socials.map(([key, label]) => <li key={key}><a href={footer[key]} target="_blank" rel="noopener noreferrer">{label}</a></li>)}
            </ul>
          </div>
        )}
      </div>
      {footer.copyright && <p className="site-footer-copy">{footer.copyright}</p>}
    </footer>
  )
}

export function WhatsAppButton({ footer }) {
  if (!footer?.whatsappButton?.enabled || !footer.whatsapp) return null
  return (
    <a className="wa-float" href={waLink(footer.whatsapp, footer.whatsappButton.message)} target="_blank" rel="noopener noreferrer" aria-label="تواصل معانا على واتساب">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.2-.4.700-1.300.1-.2 0-.3 0-.5l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.300-.7.700-1 1.500-1 2.300.1 1 .5 2 1.200 2.800 1.300 1.700 3 3 5.100 3.500.7.200 1.300.2 1.800.1.600-.1 1.500-.6 1.700-1.200.2-.6.2-1.100.2-1.200-.1-.1-.3-.2-.5-.3z" /></svg>
    </a>
  )
}
