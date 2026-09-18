import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Bot, ChevronRight, LogOut, Menu, Radio, Search, X } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { PageSkeleton } from './StaffUi'
import { useMobileNav } from './use-mobile-nav'
import { STAFF_NAV } from './staff-nav'

export default function StaffShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const showAdminLink = isAdminRole(user?.role)

  const active = (path: string) => (path === '/staff' ? location.pathname === path : location.pathname.startsWith(path))
  const searchResults = STAFF_NAV.filter(({ label }) =>
    label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
  )

  useEffect(() => {
    if (!menuOpen) return
    const menuButton = menuButtonRef.current
    closeButtonRef.current?.focus()
    return () => menuButton?.focus()
  }, [menuOpen])

  return (
    <div className="flex min-h-[100dvh] bg-[#eef2f8] text-[#1f314d]">
      <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="staff-navigation" className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#5b91ed] text-white shadow-[0_10px_28px_rgba(79,141,247,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 lg:hidden" aria-label="Mở điều hướng vận hành">
        <Menu size={22} aria-hidden="true" />
      </button>
      {menuOpen && <button type="button" onClick={closeMenu} className="fixed inset-0 z-30 cursor-default bg-[#1f314d]/20 backdrop-blur-[2px] lg:hidden" aria-label="Đóng điều hướng vận hành" />}

      <aside
        id="staff-navigation"
        ref={navRef}
        tabIndex={-1}
        aria-label="Khu vực vận hành"
        className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#dce9fb] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 focus-visible:outline-none ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center border-b border-[#e9f1fc] px-4">
          <Link to="/staff" onClick={closeMenu} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5b91ed] text-white shadow-sm"><Bot size={20} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-[#1f314d]">CampusTour</span>
              <span className="block text-[10px] font-semibold text-[#7b8fa9]">Vận hành tour</span>
            </span>
          </Link>
          <button ref={closeButtonRef} type="button" onClick={closeMenu} className="grid h-9 w-9 place-items-center rounded-xl text-[#8a98ac] hover:bg-[#eef2f8] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng vận hành">
          <div className="space-y-1">
            {STAFF_NAV.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={closeMenu}
                aria-current={active(path) ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${active(path) ? 'bg-[#eaf4ff] text-[#2f62b8]' : 'text-[#6e8096] hover:bg-[#eef2f8] hover:text-[#2f62b8]'}`}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          {/* Only an Admin sees a way across, and only because that account
              genuinely has the other area. An operator is not shown a door it
              cannot open. */}
          {showAdminLink && (
            <div className="mt-6 border-t border-[#e9f1fc] pt-5">
              <Link to="/admin" onClick={closeMenu} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] transition-colors hover:bg-[#eef2f8] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
                <Bot size={17} strokeWidth={1.9} aria-hidden="true" />
                Khu vực quản trị
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t border-[#e9f1fc] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#eef2f8] px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm"><Radio size={15} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#40546f]">{user?.username || 'Nhân viên vận hành'}</p>
              <p className="truncate text-[10px] text-[#8a98ac]">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] hover:bg-[#eaf4ff] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <LogOut size={17} aria-hidden="true" />Đăng xuất
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        {/* The shell header names the area. The page heading below says what the
            page is, so the two never print the same words. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <p className="text-sm font-bold tracking-[-0.01em] text-[#1f314d] lg:hidden">{STAFF_NAV.find(({ path }) => active(path))?.label ?? 'Vận hành tour'}</p>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <form
              role="search"
              className="relative hidden w-56 sm:block"
              onSubmit={(event) => {
                event.preventDefault()
                if (search.trim() && searchResults[0]) {
                  navigate(searchResults[0].path)
                  setSearch('')
                }
              }}
            >
              <label className="flex h-10 items-center gap-2 rounded-xl border border-[#dce9fb] bg-white px-3 focus-within:ring-2 focus-within:ring-[#4f8df7]">
                <Search size={15} className="shrink-0 text-[#71819a]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearch('')
                  }}
                  aria-label="Tìm trang vận hành"
                  placeholder="Tìm trang vận hành…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#40546f] outline-none placeholder:text-[#8a98ac]"
                />
              </label>
              {search.trim() && (
                <div className="absolute top-12 right-0 left-0 rounded-xl border border-[#dce9fb] bg-white p-2 shadow-lg">
                  <ul aria-label="Kết quả tìm trang">
                    {searchResults.map(({ path, label }) => (
                      <li key={path}>
                        <Link to={path} onClick={() => setSearch('')} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-[#2f62b8] hover:bg-[#eaf4ff]">
                          {label}<ChevronRight size={13} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {searchResults.length === 0 && <p role="status" className="p-3 text-xs text-[#71819a]">Không tìm thấy trang phù hợp.</p>}
                </div>
              )}
            </form>
            <Link to="/staff/alerts" aria-label="Xem cảnh báo" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dce9fb] bg-white text-[#6e89b2] hover:border-[#9fc4f8] hover:bg-[#eff6ff] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
              <Bell size={18} aria-hidden="true" />
            </Link>
          </div>
        </header>

        {/* Development only. Amber across the full width read as an alert about
            the fleet; a neutral chip beside the page title says the same thing
            without competing with a real warning. A production bundle drops the
            branch, and `mock-mode.ts` warns to the console instead. */}
        {import.meta.env.DEV && (
          <p data-dev-only="true" className="flex items-center gap-2 border-b border-[#e6ebf3] bg-[#f7f9fc] px-5 py-1 text-[11px] text-[#8a98ac] lg:px-8">
            <span className="rounded border border-[#d9e1ec] bg-white px-1.5 py-0.5 font-bold tracking-[0.04em] text-[#71819a]">DEV</span>
            dữ liệu mẫu
          </p>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
