import { Link } from 'react-router'

/** Thanh điều hướng cố định trên cùng — transparent + backdrop blur */
export function Navbar() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 lg:px-16 py-5 bg-[#f8f9fa]/80 backdrop-blur-xl border-b border-white/60">
      {/* ── Logo ── */}
      <Link
        to="/"
        id="nav-logo"
        className="flex items-center gap-2.5 group flex-shrink-0"
      >
        <div className="w-9 h-9 rounded-xl bg-[#0d0d0d] flex items-center justify-center group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5.5" y="8.5" width="13" height="10" rx="3.5" fill="white" opacity="0.92" />
            <rect x="9"   y="4"   width="6"  height="5"  rx="2.5" fill="white" opacity="0.7"  />
            <line x1="12" y1="4" x2="12" y2="8.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9.5"  cy="13" r="1.5" fill="#d1d5db" />
            <circle cx="14.5" cy="13" r="1.5" fill="#d1d5db" />
            <rect x="9.5"  y="18.5" width="2" height="3" rx="1" fill="white" opacity="0.6" />
            <rect x="12.5" y="18.5" width="2" height="3" rx="1" fill="white" opacity="0.6" />
          </svg>
        </div>
        <span className="text-[15px] font-bold text-[#0d0d0d] tracking-tight">
          CampusTour
        </span>
      </Link>

      {/* ── Nav links (desktop only) ── */}
      <nav className="hidden md:flex items-center gap-8" aria-label="Điều hướng chính">
        <a href="#about"    id="nav-about"    className="nav-link text-[13.5px] text-gray-500 font-medium">About us</a>
        <a href="#pricing"  id="nav-pricing"  className="nav-link text-[13.5px] text-gray-500 font-medium">Pricing</a>
        <a href="#products" id="nav-products" className="nav-link text-[13.5px] text-gray-500 font-medium">Products</a>
        <a href="#features" id="nav-features" className="nav-link text-[13.5px] text-gray-500 font-medium">Features</a>
      </nav>

      {/* ── Auth buttons ── */}
      <div className="flex items-center gap-3">
        <Link
          to="/admin"
          id="nav-login"
          className="hidden md:block text-[13.5px] text-gray-500 font-medium hover:text-gray-900 transition-colors duration-150 px-2"
        >
          Log in
        </Link>
        <a
          href="#book"
          id="nav-book"
          className="pill-light text-[13px]"
        >
          Book a Tour
        </a>
      </div>
    </header>
  )
}
