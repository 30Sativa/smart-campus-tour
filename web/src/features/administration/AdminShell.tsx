import { Suspense, useEffect, useRef, useState } from 'react'
import { Bot, ChevronRight, Home, LogOut, Menu, Radio, Search, ShieldCheck, X } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { USE_MOCK_API } from '../../mocks/mock-mode'
import { PageSkeleton } from '../operations/OperationsUi'
import { ADMIN_NAV } from './admin-nav'

/**
 * The administration shell.
 *
 * It is the operations shell's chrome, and deliberately so as of 2026-09-18.
 * The two consoles used to run different palettes — administration on slate,
 * operations on blue — on the theory that administration should feel quieter.
 * In practice the only account that can open both is an Admin, so the only
 * person who ever saw the distinction was the one person guaranteed to cross it,
 * and crossing it looked like leaving the product. One palette now, from
 * `features/operations`.
 *
 * What still separates the two is priority, not colour, and that part is kept:
 * there is no alert bell here and no live badge, because administration is a
 * place you visit to check and to configure, not a console you watch all day.
 * Nothing on this chrome pulls for attention.
 */
export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()

  const active = (path: string) => (path === '/admin' ? location.pathname === path : location.pathname.startsWith(path))
  const currentPage = ADMIN_NAV.find(({ path }) => active(path))?.label ?? 'Quản trị hệ thống'
  const results = ADMIN_NAV.filter(({ label }) =>
    label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
  )
  const closeMenu = () => {
    setMenuOpen(false)
    menuButton.current?.focus()
  }

  useEffect(() => {
    if (!menuOpen) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className="min-h-dvh bg-[#f1f6fe] text-[#1f314d]">
      <a
        href="#admin-content"
        className="sr-only z-50 rounded-lg bg-white p-3 text-sm focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Đến nội dung chính
      </a>
      {menuOpen && (
        <button
          type="button"
          onClick={closeMenu}
          className="fixed inset-0 z-30 bg-[#1f314d]/20 backdrop-blur-[2px] lg:hidden"
          aria-label="Đóng điều hướng quản trị"
        />
      )}

      <aside
        id="admin-navigation"
        className={`fixed inset-y-4 left-4 z-40 flex w-[264px] flex-col rounded-xl border border-white bg-white shadow-[0_10px_30px_-12px_#4570a726] transition-[transform,visibility] duration-200 lg:visible lg:translate-x-0 ${menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-[calc(100%+1rem)]'}`}
      >
        <div className="mx-5 flex min-h-20 items-center gap-3 border-b border-[#e9f1fc]">
          <Link
            to="/admin"
            onClick={() => setMenuOpen(false)}
            className="flex flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4f8df7]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-tr from-[#407bd8] to-[#5b91ed] text-white shadow-md">
              <Bot size={23} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold">CampusTour</span>
              <span className="mt-0.5 block text-[11px] text-[#71819a]">Quản trị hệ thống</span>
            </span>
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={closeMenu}
            className="grid size-8 place-items-center rounded-lg text-[#8a98ac] hover:bg-[#eaf4ff] lg:hidden"
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mx-5 flex items-center gap-3 border-b border-[#e9f1fc] py-5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[#edf2fa] text-sm font-semibold text-[#2f62b8]"
            aria-hidden="true"
          >
            {user?.username?.slice(0, 2).toLocaleUpperCase('vi') || 'QT'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.username || 'Quản trị viên'}</p>
            <p className="mt-1 text-xs text-[#71819a]">{roleLabel(user?.role)}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4" aria-label="Điều hướng quản trị">
          <p className="px-3 pt-2 pb-3 text-[10px] font-bold tracking-[0.13em] text-[#8a98ac] uppercase">Quản trị</p>
          <div className="space-y-1.5">
            {ADMIN_NAV.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMenuOpen(false)}
                aria-current={active(path) ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-lg px-4 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7] ${
                  active(path)
                    ? 'bg-gradient-to-tr from-[#eaf4ff] to-[#dce9fb] font-semibold text-[#2f62b8] shadow-md shadow-[#4f8df7]/20'
                    : 'font-medium text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#1f314d]'
                }`}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          {/* An Admin genuinely has the operations console, so the door is real.
              It is the only cross-area link here, and it is not a nav item. */}
          <div className="mt-5 border-t border-[#e9f1fc] pt-5">
            <Link
              to="/staff"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-4 text-[13px] font-medium text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#1f314d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]"
            >
              <Radio size={19} strokeWidth={1.8} aria-hidden="true" />
              Khu vực vận hành
            </Link>
          </div>
        </nav>

        <div className="m-4 mt-0 border-t border-[#e9f1fc] pt-3">
          <Link
            to="/"
            className="flex min-h-10 items-center gap-3 rounded-lg px-4 text-xs font-medium text-[#71819a] hover:bg-[#f1f6fe]"
          >
            <Home size={17} aria-hidden="true" />
            Trang chủ CampusTour
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-4 text-xs font-semibold text-[#6e8096] hover:bg-[#eaf4ff]"
          >
            <LogOut size={17} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col lg:ml-[296px]">
        <header className="relative z-20 flex min-h-24 flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="admin-navigation"
              className="grid size-10 place-items-center rounded-lg bg-white text-[#2f62b8] shadow-sm lg:hidden"
              aria-label="Mở điều hướng quản trị"
            >
              <Menu size={21} />
            </button>
            <nav aria-label="Đường dẫn trang" className="min-w-0">
              <ol className="flex items-center gap-2 text-xs text-[#71819a]">
                <li>
                  <Link to="/" aria-label="Trang chủ" className="hover:text-[#2f62b8]">
                    <Home size={14} />
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>Admin</li>
                <li aria-hidden="true">/</li>
                <li className="text-[#2f62b8]" aria-current="page">
                  {currentPage}
                </li>
              </ol>
              <p className="mt-2 text-sm font-semibold text-[#1f314d]">Quản trị hệ thống</p>
            </nav>
          </div>

          <div className="flex items-center gap-2 max-sm:w-full sm:gap-4">
            <form
              role="search"
              className="relative min-w-0 flex-1 sm:w-56"
              onSubmit={(event) => {
                event.preventDefault()
                if (search.trim() && results[0]) {
                  navigate(results[0].path)
                  setSearch('')
                }
              }}
            >
              <label className="flex h-10 items-center gap-2 rounded-lg border border-[#dce9fb] bg-transparent px-3 focus-within:border-[#4f8df7] focus-within:ring-1 focus-within:ring-[#4f8df7]">
                <Search size={16} className="shrink-0 text-[#71819a]" aria-hidden="true" />
                <span className="sr-only">Tìm trang quản trị</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearch('')
                  }}
                  placeholder="Tìm trang quản trị…"
                  className="w-full bg-transparent text-xs text-[#2f62b8] outline-none placeholder:text-[#71819a]"
                />
              </label>
              {search.trim() && (
                <div className="absolute top-12 right-0 left-0 rounded-xl border border-[#dce9fb] bg-white p-2 shadow-lg">
                  <ul aria-label="Kết quả tìm trang">
                    {results.map(({ path, label }) => (
                      <li key={path}>
                        <Link
                          to={path}
                          onClick={() => setSearch('')}
                          className="flex items-center justify-between rounded-lg px-3 py-3 text-xs text-[#2f62b8] hover:bg-[#eaf4ff] focus:bg-[#eaf4ff]"
                        >
                          {label}
                          <ChevronRight size={13} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {results.length === 0 && (
                    <p role="status" className="p-3 text-xs text-[#71819a]">
                      Không tìm thấy trang phù hợp.
                    </p>
                  )}
                </div>
              )}
            </form>

            {/* Operations has a bell here. Administration does not, on purpose:
                there is no queue to work on this side of the product. */}
            <span className="hidden items-center gap-1.5 border-l border-[#dce9fb] pl-4 text-xs font-medium text-[#647793] xl:flex">
              <ShieldCheck size={15} className="text-[#8a98ac]" aria-hidden="true" />
              {roleLabel(user?.role)}
            </span>
          </div>
        </header>

        {import.meta.env.DEV && USE_MOCK_API && (
          <p
            role="status"
            data-dev-only="true"
            className="px-4 pb-1 text-[10px] font-medium text-[#8a6d3b] sm:px-6 lg:px-8"
          >
            DEV · Dữ liệu hiển thị là dữ liệu mẫu.
          </p>
        )}

        <main id="admin-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-[#71819a] sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} <span className="font-semibold text-[#2f62b8]">CampusTour</span>
          </p>
          <span>Quản trị hệ thống & phân quyền truy cập</span>
        </footer>
      </div>
    </div>
  )
}
