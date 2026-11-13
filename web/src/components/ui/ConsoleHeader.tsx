import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { ChevronDown, LogOut, Menu, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { useDismiss } from './use-dismiss'
import { softConsoleHeader } from './ui-classes'
import { initialsOf } from './console-crumbs'

/**
 * The header every signed-in console shares (Staff, Đại diện trường, Kỹ thuật,
 * Quản trị): the menu button on the left below `lg`, one breadcrumb line ending
 * on the page in front, then whatever the area has data for (connection status,
 * bell) and the account. The page's own heading carries its name in large type,
 * so the header names it once, in the breadcrumb, and never a third time.
 */
export function ConsoleHeader({ crumbs, menuOpen, menuControls, menuLabel, onMenu, menuButtonRef, children }: {
  crumbs: string[]
  menuOpen: boolean
  /** The id of the sidebar the menu button opens. */
  menuControls: string
  menuLabel: string
  onMenu: () => void
  menuButtonRef?: Ref<HTMLButtonElement>
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 pt-3 sm:px-6 lg:px-8">
      <div className={softConsoleHeader}>
        <button ref={menuButtonRef} type="button" onClick={onMenu} aria-expanded={menuOpen} aria-controls={menuControls} aria-label={menuLabel}
          className="-ml-1.5 grid size-10 shrink-0 place-items-center rounded-xl text-[#334155] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] lg:hidden">
          <Menu size={20} aria-hidden="true" />
        </button>
        <Breadcrumb crumbs={crumbs} />
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">{children}</div>
      </div>
    </header>
  )
}

/** "Nhóm / Mục / Trang": the area's group, the menu item when the page is not the item itself, then the page. */
function Breadcrumb({ crumbs }: { crumbs: string[] }) {
  return (
    <nav aria-label="Vị trí trang" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={`${index}-${crumb}`} className={last ? 'min-w-0 truncate font-semibold text-[#2d3748]' : 'hidden shrink-0 text-[#64748b] sm:block'} aria-current={last ? 'page' : undefined}>
              {crumb}
              {!last && <span aria-hidden="true" className="mx-1.5 text-[#cbd5e1]">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The signed-in account, top right, the same in every console: its profile and sign-out. */
export function ConsoleAccountMenu({ name, role, profilePath, profileCurrent = false, onLogout, onNavigate }: {
  name: string
  role: string
  profilePath: string
  profileCurrent?: boolean
  onLogout: () => void
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(open, close)
  useEffect(() => { if (open) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [open, ref])
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'
  return (
    <div ref={ref} role="group" aria-label="Tài khoản đang đăng nhập" className="relative ml-1 border-l border-[#e2e8f0] pl-2">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${name}`}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-2 pl-1.5 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${open ? 'bg-white' : ''}`}
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#edf3fb] text-[11.5px] font-extrabold text-[#4a6fa5]">{initialsOf(name)}</span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-[13px] leading-tight font-semibold text-[#0f172a]">{name}</span>
          <span className="text-muted block max-w-40 truncate text-[11px] leading-tight">{role}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`hidden shrink-0 text-[#9ca3af] transition-transform duration-200 sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); close(); buttonRef.current?.focus(); return }
          const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
          const index = items.indexOf(document.activeElement as HTMLElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }
        }} className="absolute top-[calc(100%+8px)] right-0 z-40 w-60 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none">
          <div className="mb-1 border-b border-[#f1f5f9] px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[13.5px] font-bold text-[#0f172a]">{name}</p>
            <p className="truncate text-xs text-[#64748b]">{role}</p>
          </div>
          <Link role="menuitem" to={profilePath} aria-current={profileCurrent ? 'page' : undefined} onClick={() => { close(); onNavigate?.() }} className={`${item} text-[#0f172a] hover:bg-[#f1f5f9]`}>
            <UserRound size={16} aria-hidden="true" className="text-[#64748b]" />
            Hồ sơ của tôi
          </Link>
          <button role="menuitem" type="button" onClick={() => { close(); onLogout() }} className={`${item} mt-1 border-t border-[#f1f5f9] text-[#dc2626] hover:bg-[#fef2f2]`}>
            <LogOut size={16} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  )
}
