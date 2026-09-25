import type { ReactNode, Ref } from 'react'
import { ChevronRight, LogOut, Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { NavSection } from './staff-nav'

/**
 * The sidebar both signed-in consoles share (operations and administration).
 *
 * Layout follows the Material dashboard template the team chose: a floating,
 * rounded, dark side navigation with the account at the top, sectioned links
 * and a filled active item. Colours follow the public home page: ink ground,
 * lime for the active item and the brand mark.
 */
export function ConsoleSidebar({
  id,
  label,
  navLabel,
  homePath,
  areaName,
  sections,
  currentPath,
  badges = {},
  secondary,
  user,
  onNavigate,
  onLogout,
  open,
  panelRef,
  closeRef,
}: {
  id: string
  label: string
  navLabel: string
  homePath: string
  areaName: string
  sections: NavSection[]
  currentPath: string | null
  badges?: Record<string, { value: number; label: string }>
  secondary?: Array<{ to: string; label: string; icon: LucideIcon; current?: boolean }>
  user: { name: string; role: string; icon: LucideIcon }
  onNavigate: () => void
  onLogout: () => void
  open: boolean
  panelRef: Ref<HTMLElement>
  closeRef?: Ref<HTMLButtonElement>
}) {
  const UserIcon = user.icon
  const initial = user.name.trim().charAt(0).toUpperCase() || '·'
  return (
    <aside
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={label}
      className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-72 flex-col bg-[linear-gradient(195deg,#2a2a2a,#161616)] text-white transition-transform duration-300 ease-out motion-reduce:transition-none focus-visible:outline-none lg:sticky lg:top-4 lg:m-4 lg:h-[calc(100dvh-2rem)] lg:translate-x-0 lg:rounded-2xl lg:shadow-[0_20px_40px_-18px_rgba(0,0,0,0.55)] ${open ? 'translate-x-0 shadow-[16px_0_40px_rgba(0,0,0,0.35)]' : '-translate-x-full'}`}
    >
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <Link to={homePath} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bde74e]">
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">CampusTour</span>
            <span className="block font-mono text-[10px] tracking-[0.08em] text-white/50 uppercase">{areaName}</span>
          </span>
        </Link>
        <button ref={closeRef} type="button" onClick={onNavigate} className="grid size-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
      </div>

      <div className="mx-4 flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#bde74e] text-sm font-bold text-[#1c1c1c]" aria-hidden="true">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{user.name}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-white/55"><UserIcon size={11} aria-hidden="true" />{user.role}</p>
        </div>
      </div>

      <hr className="mx-5 my-4 h-px border-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />

      {/* Scrolls without a visible bar; the soft fade at both edges says there is more. */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14px,#000_calc(100%-22px),transparent)]" aria-label={navLabel}>
        {sections.map((section, index) => (
          <div key={section.label ?? index} className={index ? 'mt-4' : ''}>
            {section.label && <p className="mb-1.5 px-3 font-mono text-[10px] tracking-[0.1em] text-white/40 uppercase">{section.label}</p>}
            <div className="space-y-1">
              {section.items.map(({ label: itemLabel, path, icon: Icon }) => {
                const active = currentPath === path
                const badge = badges[path]
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bde74e] ${active ? 'bg-[#bde74e] font-semibold text-[#1c1c1c] shadow-[0_8px_18px_-8px_rgba(189,231,78,0.7)]' : 'text-white/75 hover:bg-white/[0.08] hover:text-white'}`}
                  >
                    <Icon size={18} strokeWidth={1.9} aria-hidden="true" className={active ? 'text-[#1c1c1c]' : 'text-white/55 transition-colors group-hover:text-[#bde74e]'} />
                    <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
                    {badge && badge.value > 0 && <span className="rounded-full bg-[#dc2626] px-1.5 text-[11px] font-semibold text-white tabular-nums" aria-label={badge.label}>{badge.value}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {secondary && secondary.length > 0 && (
          <div className="mt-5 space-y-1 border-t border-white/10 pt-4">
            {secondary.map(({ to, label: linkLabel, icon: Icon, current }) => (
              <Link key={to} to={to} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bde74e] ${current ? 'bg-[#bde74e] font-semibold text-[#1c1c1c]' : 'text-white/65 hover:bg-white/[0.08] hover:text-white'}`}>
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                <span className="flex-1">{linkLabel}</span>
                <ChevronRight size={14} aria-hidden="true" className="opacity-50" />
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="p-4 pt-0">
        <button type="button" onClick={onLogout} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-[13px] font-medium text-white/80 transition-colors hover:border-[#bde74e] hover:bg-[#bde74e] hover:text-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bde74e]">
          <LogOut size={16} aria-hidden="true" />Đăng xuất
        </button>
      </div>
    </aside>
  )
}

/** The lime robot mark of the home page. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" width={34} height={34} aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#bde74e" />
      <rect x="7" y="10" width="18" height="12" rx="4" fill="#1c1c1c" />
      <circle cx="12.5" cy="16" r="2" fill="#bde74e" />
      <circle cx="19.5" cy="16" r="2" fill="#bde74e" />
      <path d="M16 10V6.5" stroke="#1c1c1c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5.5" r="1.8" fill="#1c1c1c" />
    </svg>
  )
}

/**
 * The top bar both consoles share: breadcrumb and page title on the left
 * (Material navbar), whatever the area needs on the right. It floats as a
 * rounded, frosted card above the scrolling content.
 */
export function ConsoleTopbar({ area, areaPath, title, children }: { area: string; areaPath: string; title: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 pt-4 lg:px-6">
      <div className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 shadow-[0_8px_26px_-14px_rgba(28,28,28,0.25)] backdrop-blur-md lg:px-5">
        <div className="min-w-0">
          <nav aria-label="Vị trí trang" className="flex items-center gap-1.5 text-[12px] text-[#8e9096]">
            <Link to={areaPath} className="rounded hover:text-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc93a]">{area}</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-[#1c1c1c]">{title}</span>
          </nav>
          <p className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.02em] text-[#1c1c1c]">{title}</p>
        </div>
        {children && <div className="ml-auto flex min-w-0 items-center gap-2.5">{children}</div>}
      </div>
    </header>
  )
}

/** The floating button that opens the sidebar below `lg`, and the scrim behind it. */
export function MobileNavToggle({ open, controls, label, closeLabel, onOpen, onClose, buttonRef }: {
  open: boolean; controls: string; label: string; closeLabel: string; onOpen: () => void; onClose: () => void; buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <>
      <button ref={buttonRef} type="button" onClick={onOpen} aria-expanded={open} aria-controls={controls} aria-label={label} className="fixed right-5 bottom-5 z-30 grid size-12 place-items-center rounded-full bg-[#1c1c1c] text-[#bde74e] shadow-[0_10px_24px_rgba(28,28,28,0.35)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc93a] focus-visible:ring-offset-2 lg:hidden">
        <Menu size={22} aria-hidden="true" />
      </button>
      {open && <button type="button" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-[#1c1c1c]/30 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 lg:hidden" aria-label={closeLabel} />}
    </>
  )
}

/** The development-only data badge under each shell's header. */
export function DevDataBadge({ children }: { children: ReactNode }) {
  if (!import.meta.env.DEV) return null
  return (
    <p data-dev-only="true" className="mx-4 mt-2 flex items-center gap-2 px-2 font-mono text-[10px] tracking-[0.04em] text-[#8e9096] lg:mx-6">
      <span className="rounded-full bg-[#1c1c1c] px-2 py-0.5 font-semibold text-[#bde74e]">DEV</span>
      {children}
    </p>
  )
}
