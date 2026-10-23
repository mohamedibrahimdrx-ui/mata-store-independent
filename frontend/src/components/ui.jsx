/* Shared UI pieces used by the store and the checkout page. */

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  /* points right = "back" in an RTL layout */
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
}

export function Icon({ name, size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

// Simple line illustrations used as image placeholders (no image files needed)
const SHAPES = {
  bags: (
    <>
      <path d="M28 48h64l6 54H22l6-54Z" />
      <path d="M44 48V40a16 16 0 0 1 32 0v8" />
      <path d="M24 72h72" />
    </>
  ),
  wallets: (
    <>
      <rect x="18" y="36" width="84" height="56" rx="8" />
      <path d="M18 52h84" />
      <rect x="70" y="62" width="32" height="16" rx="6" />
      <circle cx="80" cy="70" r="2" />
    </>
  ),
  perfumes: (
    <>
      <rect x="38" y="52" width="44" height="52" rx="8" />
      <rect x="52" y="38" width="16" height="14" />
      <rect x="47" y="20" width="26" height="18" rx="3" />
      <path d="M48 78h24" />
    </>
  ),
  accessories: (
    <>
      <circle cx="38" cy="64" r="18" />
      <circle cx="82" cy="64" r="18" />
      <path d="M56 62q4-4 8 0M20 58l-8-6M100 58l8-6" />
    </>
  ),
}

export function ProductVisual({ category, tone, label }) {
  return (
    <div className="visual" style={{ '--tone': tone }} role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {SHAPES[category] || SHAPES.accessories}
      </svg>
    </div>
  )
}