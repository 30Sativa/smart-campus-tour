import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { useAuthStore } from '../../stores/auth-store'
import { useDismiss } from '../../components/ui/use-dismiss'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { softConsoleGround, softConsoleHeader } from '../../components/ui/ui-classes'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV_ENTRIES, repActivePath, repPageTitle } from './rep-nav'
import './representative.css'

/**
 * The Representative shell, in the Staff console's chrome: the shared soft
 * grouped sidebar (logo, pages, fold to a rail, sign-out), a floating frosted
 * header with the breadcrumb, the bell and the account. The pages inside keep
 * their own Representative layout (`rep-*` classes), now on the console palette.
 */
export default function RepresentativeShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const logout = useLogout()
  const handleLogout = useCallback(() => { void logout() }, [logout])
  const queryClient = useQueryClient()
  useEffect(() => {
    function clearOwner(owner: string | undefined) {
      if (!owner) return
      void queryClient.cancelQueries({ queryKey: repQueryKeys.owner(owner) })
      queryClient.removeQueries({ queryKey: repQueryKeys.owner(owner) })
      void queryClient.cancelQueries({ queryKey: ['registration-invitations', owner] })
      queryClient.removeQueries({ queryKey: ['registration-invitations', owner] })
    }
    const currentOwner = useAuthStore.getState().user?.userId
    queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'representative' && query.queryKey[1] !== currentOwner })
    return useAuthStore.subscribe((state, previous) => {
      if (state.user?.userId !== previous.user?.userId || state.user?.role !== previous.user?.role) clearOwner(previous.user?.userId)
    })
  }, [queryClient])
  useEffect(() => {
    if (!menuOpen) return
    const menuButton = menuButtonRef.current
    closeButtonRef.current?.focus()
    return () => menuButton?.focus()
  }, [menuOpen])

  const current = repActivePath(location.pathname)
  const { section, parent, title } = repPageTitle(location.pathname)

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <a href="#rep-main" className="sr-only z-[80] rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">Đến nội dung chính</a>
      <MobileNavToggle open={menuOpen} controls="rep-navigation" label="Mở điều hướng đại diện" closeLabel="Đóng điều hướng đại diện" onOpen={() => setMenuOpen(true)} onClose={closeMenu} buttonRef={menuButtonRef} />

      <GroupedSidebar
        id="rep-navigation"
        look="soft"
        label="Khu vực đại diện trường"
        navLabel="Điều hướng đại diện trường"
        homePath="/dai-dien"
        subtitle="DT-AMR · Đại diện trường"
        entries={REP_NAV_ENTRIES}
        currentPath={current}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
        closeRef={closeButtonRef}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The same floating, frosted header card as the Staff console: breadcrumb above the page name. */}
        <header className="sticky top-0 z-20 shrink-0 px-4 pt-3 sm:px-6 lg:px-8">
          <div className={softConsoleHeader}>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-[#a0aec0]">{section} <span className="mx-1">/</span> {parent ? <>{parent} <span className="mx-1">/</span> </> : null}<span className="text-[#2d3748]">{title}</span></p>
              <p className="truncate text-sm font-bold text-[#2d3748]">{title}</p>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <RepBell />
              <AccountMenu username={user?.username} onLogout={handleLogout} onNavigate={closeMenu} profileCurrent={location.pathname.startsWith('/dai-dien/ho-so')} />
            </div>
          </div>
        </header>

        <main id="rep-main" tabIndex={-1} className="rep-app rep-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto focus:outline-none">
          <span key={`sweep-${location.pathname}`} aria-hidden="true" className="console-sweep pointer-events-none fixed top-0 right-0 left-0 z-[70] h-0.5 bg-[#2d719e]" />
          <div key={location.pathname} className="console-enter min-h-full">
            <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
          </div>
          {/* Room under every page for the floating menu button below lg. */}
          <div aria-hidden="true" className="h-20 lg:hidden" />
        </main>
      </div>
    </div>
  )
}

/** Initials for an account avatar, from a username like "daidien" or "nguyen.anh". */
function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

/** The signed-in account, top right, drawn exactly like the Staff console's: its profile and sign-out. */
function AccountMenu({ username, onLogout, onNavigate, profileCurrent }: { username?: string; onLogout: () => void; onNavigate: () => void; profileCurrent: boolean }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(open, close)
  useEffect(() => { if (open) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [open, ref])
  const name = username || 'Đại diện'
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
          <span className="block max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">Đại diện trường</span>
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
            <p className="truncate text-xs text-[#64748b]">Đại diện trường</p>
          </div>
          <Link role="menuitem" to="/dai-dien/ho-so" aria-current={profileCurrent ? 'page' : undefined} onClick={() => { close(); onNavigate() }} className={`${item} text-[#0f172a] hover:bg-[#f1f5f9]`}>
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
