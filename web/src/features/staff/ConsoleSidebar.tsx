import type { ReactNode, Ref } from 'react'
import { Bot, LogOut, Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { NavSection } from './staff-nav'

/**
 * The sidebar both signed-in Vietnamese consoles share: brand, sectioned
 * navigation, a few secondary links, the signed-in account and sign-out.
 * Operations and administration differ in what they list, never in how a
 * list looks, so the two shells render this rather than two copies of it.
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
  return (
    <aside
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={label}
      className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#e2e8f0] bg-white transition-transform duration-300 ease-out lg:sticky lg:translate-x-0 motion-reduce:transition-none focus-visible:outline-none ${open ? 'translate-x-0 shadow-[16px_0_40px_rgba(31,49,77,0.12)] lg:shadow-none' : '-translate-x-full'}`}
    >
      <div className="flex h-16 items-center border-b border-[#f1f5f9] px-4">
        <Link to={homePath} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
          <span className="grid size-9 place-items-center rounded-xl bg-[#2563eb] text-white"><Bot size={19} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[-0.02em] text-[#1e293b]">CampusTour</span>
            <span className="block text-[11px] font-medium text-[#64748b]">{areaName}</span>
          </span>
        </Link>
        <button ref={closeRef} type="button" onClick={onNavigate} className="grid size-9 place-items-center rounded-xl text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={navLabel}>
        {sections.map((section, index) => (
          <div key={section.label ?? index} className={index ? 'mt-5' : ''}>
            {section.label && <p className="mb-1 px-3 text-[11px] font-semibold text-[#94a3b8]">{section.label}</p>}
            <div className="space-y-0.5">
              {section.items.map(({ label: itemLabel, path, icon: Icon }) => {
                const active = currentPath === path
                const badge = badges[path]
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${active ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b]'}`}
                  >
                    <span aria-hidden="true" className={`absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-[#2563eb] transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" className={active ? 'text-[#2563eb]' : 'text-[#94a3b8] transition-colors group-hover:text-[#334155]'} />
                    <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
                    {badge && badge.value > 0 && <span className="rounded-full bg-[#fdecea] px-1.5 text-[11px] font-semibold text-[#b23e31] tabular-nums" aria-label={badge.label}>{badge.value}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {secondary && secondary.length > 0 && (
          <div className="mt-6 space-y-0.5 border-t border-[#f1f5f9] pt-4">
            {secondary.map(({ to, label: linkLabel, icon: Icon, current }) => (
              <Link key={to} to={to} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={`flex min-h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${current ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'text-[#6b7688] hover:bg-[#f8fafc] hover:text-[#1e293b]'}`}>
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                {linkLabel}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-[#f1f5f9] p-3">
        <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="grid size-8 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><UserIcon size={15} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#1e293b]">{user.name}</p>
            <p className="truncate text-[11px] text-[#94a3b8]">{user.role}</p>
          </div>
        </div>
        <button type="button" onClick={onLogout} className="flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[#6b7688] transition-colors hover:bg-[#f8fafc] hover:text-[#1e293b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
          <LogOut size={16} aria-hidden="true" />Đăng xuất
        </button>
      </div>
    </aside>
  )
}

/** The floating button that opens the sidebar below `lg`, and the scrim behind it. */
export function MobileNavToggle({ open, controls, label, closeLabel, onOpen, onClose, buttonRef }: {
  open: boolean; controls: string; label: string; closeLabel: string; onOpen: () => void; onClose: () => void; buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <>
      <button ref={buttonRef} type="button" onClick={onOpen} aria-expanded={open} aria-controls={controls} aria-label={label} className="fixed right-5 bottom-5 z-30 grid size-12 place-items-center rounded-full bg-[#2563eb] text-white shadow-[0_8px_24px_rgba(31,79,158,0.28)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 lg:hidden">
        <Menu size={22} aria-hidden="true" />
      </button>
      {open && <button type="button" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-[#1e293b]/20 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 lg:hidden" aria-label={closeLabel} />}
    </>
  )
}

/** The development-only data badge under each shell's header. */
export function DevDataBadge({ children }: { children: ReactNode }) {
  if (!import.meta.env.DEV) return null
  return (
    <p data-dev-only="true" className="flex items-center gap-2 border-b border-[#f1f5f9] bg-[#f8fafc] px-5 py-1 text-[11px] text-[#94a3b8] lg:px-8">
      <span className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 font-semibold tracking-[0.04em] text-[#64748b]">DEV</span>
      {children}
    </p>
  )
}
