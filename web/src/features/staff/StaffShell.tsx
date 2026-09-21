import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Bot, ChevronRight, LogOut, Menu, Radio, Search, ShieldAlert, X } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { LiveDot, PageSkeleton } from './StaffUi'
import { useMobileNav } from './use-mobile-nav'
import { ADMIN_LINK_ICON, STAFF_NAV, STAFF_NAV_SECTIONS, activeNavPath } from './staff-nav'
import { useStaffRealtimeSync, useTours, type AssistanceNotice } from './staff-hooks'
import { REASON_SHORT } from './reason'

const TOAST_MS = 9_000

const CONNECTION_LABEL = {
  connecting: 'Đang kết nối',
  connected: 'Thời gian thực',
  reconnecting: 'Đang kết nối lại',
  disconnected: 'Mất kết nối',
} as const

export default function StaffShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<AssistanceNotice | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const showAdminLink = isAdminRole(user?.role)

  // The shell owns the one realtime subscription for the whole area.
  const connection = useStaffRealtimeSync(setToast)
  const today = useTours()
  const assistCount = today.data?.filter((tour) => tour.operationalStatus === 'NeedsAssistance').length ?? 0
  const runningTour = today.data?.find((tour) => tour.state === 'Running')

  const currentPath = activeNavPath(location.pathname)
  const searchResults = STAFF_NAV.filter(({ label }) =>
    label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
  )

  useEffect(() => {
    if (!menuOpen) return
    const menuButton = menuButtonRef.current
    closeButtonRef.current?.focus()
    return () => menuButton?.focus()
  }, [menuOpen])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast])

  return (

    <div className="flex min-h-[100dvh] bg-[#f8fafc] text-[#0f172a]">
      {/* Mobile drawer trigger */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-expanded={menuOpen}
        aria-controls="staff-navigation"
        className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#2563eb] text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 lg:hidden"
        aria-label="Mở điều hướng vận hành"
      >

    <div className="flex min-h-[100dvh] bg-[#f4f6f9] text-[#1f314d]">
      <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="staff-navigation" className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#5b91ed] text-white shadow-[0_10px_28px_rgba(79,141,247,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 lg:hidden" aria-label="Mở điều hướng vận hành">

        <Menu size={22} aria-hidden="true" />
      </button>

      {menuOpen && (
        <button
          type="button"
          onClick={closeMenu}
          className="fixed inset-0 z-30 cursor-default bg-[#0f172a]/20 backdrop-blur-[2px] lg:hidden"
          aria-label="Đóng điều hướng vận hành"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        id="staff-navigation"
        ref={navRef}
        tabIndex={-1}
        aria-label="Khu vực vận hành"
        className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#e2e8f0] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 focus-visible:outline-none ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#f1f5f9] px-4">
          <Link
            to="/staff"
            onClick={closeMenu}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#2563eb] text-white shadow-xs">
              <Bot size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-[#0f172a]">CampusTour</span>
              <span className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Vận hành tour</span>
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeMenu}
            className="grid size-8 place-items-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] lg:hidden"
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng vận hành">
          {STAFF_NAV_SECTIONS.map((section) => (
            <div key={section.label ?? 'home'} className={section.label ? 'mt-5' : ''}>
              {section.label && (
                <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.1em] text-[#94a3b8] uppercase">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ label, path, icon: Icon }) => {
                  const active = currentPath === path
                  const badge = path === '/staff/live' && assistCount > 0 ? assistCount : null
                  return (
                    <Link
                      key={path}
                      to={path}
                      onClick={closeMenu}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-9.5 items-center gap-3 rounded-xl px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                        active
                          ? 'bg-[#eff6ff] text-[#2563eb] shadow-2xs'
                          : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {badge != null && (
                        <span
                          className="rounded-full bg-[#fef2f2] px-1.5 text-[10px] font-extrabold text-[#dc2626] tabular-nums border border-[#fecaca]"
                          aria-label={`${badge} buổi cần hỗ trợ`}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          {showAdminLink && (
            <div className="mt-6 border-t border-[#f1f5f9] pt-4">
              <Link
                to="/admin"
                onClick={closeMenu}
                className="flex min-h-9.5 items-center gap-3 rounded-xl px-3 text-xs font-bold text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#2563eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
              >
                <ADMIN_LINK_ICON size={16} strokeWidth={2} aria-hidden="true" />
                Khu vực quản trị
              </Link>
            </div>
          )}
        </nav>

        {/* User profile & logout */}
        <div className="border-t border-[#f1f5f9] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] px-3 py-2">
            <span className="grid size-7 place-items-center rounded-lg bg-white text-[#2563eb] shadow-xs">
              <Radio size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#0f172a]">{user?.username || 'Nhân viên vận hành'}</p>
              <p className="truncate text-[10px] text-[#64748b] font-medium">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 text-xs font-bold text-[#64748b] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          >
            <LogOut size={15} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* ── Main Layout ──────────────────────────────────────────────────────── */}
      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">

        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e2e8f0] bg-white/95 px-5 backdrop-blur-md lg:px-8">
          <p className="text-sm font-bold text-[#0f172a] lg:hidden">
            {STAFF_NAV.find(({ path }) => path === currentPath)?.label ?? 'Vận hành tour'}
          </p>
          <span
            role="status"
            className={`hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-bold sm:inline-flex ${
              connection === 'connected'
                ? 'bg-[#ecfdf5] text-[#16a34a] border border-[#a7f3d0]'
                : connection === 'disconnected'
                ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]'
                : 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]'
            }`}
          >
            <LiveDot tone={connection === 'connected' ? 'ok' : connection === 'disconnected' ? 'danger' : 'warn'} />
            {CONNECTION_LABEL[connection]}
          </span>

          <div className="ml-auto flex min-w-0 items-center gap-2.5">

        {/* The shell header names the area. The page heading below says what the
            page is, so the two never print the same words. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <p className="text-sm font-bold tracking-[-0.01em] text-[#1f314d] lg:hidden">{STAFF_NAV.find(({ path }) => active(path))?.label ?? 'Vận hành tour'}</p>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {/* Development only. A full-width strip under the header read as an
                operational warning about the fleet; a marker in the chrome says
                the same thing without competing with a real alert. A production
                bundle drops the branch, and `mock-mode.ts` warns to the console. */}
            {import.meta.env.DEV && (
              <span data-dev-only="true" title="Dữ liệu mẫu" className="shrink-0 rounded border border-[#dfe5ec] bg-[#f8fafc] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.06em] text-[#8d99ab]">
                DEV
              </span>
            )}
            <form
              role="search"
              className="relative hidden w-60 sm:block"
              onSubmit={(event) => {
                event.preventDefault()
                if (search.trim() && searchResults[0]) {
                  navigate(searchResults[0].path)
                  setSearch('')
                }
              }}
            >
              <label className="flex h-9.5 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 focus-within:bg-white focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/20 transition-all">
                <Search size={14} className="shrink-0 text-[#64748b]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearch('')
                  }}
                  aria-label="Tìm trang vận hành"
                  placeholder="Tìm trang vận hành…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                />
              </label>
              {search.trim() && (
                <div className="absolute top-11 right-0 left-0 rounded-xl border border-[#e2e8f0] bg-white p-2 shadow-lg z-50">
                  <ul aria-label="Kết quả tìm trang" className="space-y-0.5">
                    {searchResults.map(({ path, label }) => (
                      <li key={path}>
                        <Link
                          to={path}
                          onClick={() => setSearch('')}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-[#2563eb] hover:bg-[#eff6ff]"
                        >
                          {label}
                          <ChevronRight size={13} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {searchResults.length === 0 && (
                    <p role="status" className="p-3 text-xs text-[#64748b]">
                      Không tìm thấy trang phù hợp.
                    </p>
                  )}
                </div>
              )}
            </form>

            <Link
              to={runningTour ? `/staff/live/${runningTour.id}` : '/staff/live'}
              aria-label={assistCount > 0 ? `Điều hành trực tiếp, ${assistCount} buổi cần hỗ trợ` : 'Điều hành trực tiếp'}
              className="relative grid size-9.5 shrink-0 place-items-center rounded-xl border border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#cbd5e1] hover:text-[#2563eb] hover:bg-[#f8fafc] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
            >
              <Bell size={17} aria-hidden="true" />
              {assistCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full bg-[#dc2626] px-1 text-[10px] leading-4 font-bold text-white tabular-nums"
                  aria-hidden="true"
                >
                  {assistCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {import.meta.env.DEV && (
          <p
            data-dev-only="true"
            className="flex items-center gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-1 text-[11px] text-[#64748b] lg:px-8"
          >
            <span className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.2 font-bold tracking-wider text-[#475569]">
              DEV
            </span>
            dữ liệu mẫu · mô phỏng thời gian thực
          </p>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>

        {toast && <AssistanceToast notice={toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  )
}

function AssistanceToast({ notice, onClose }: { notice: AssistanceNotice; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="fixed right-5 bottom-20 z-40 w-[min(380px,calc(100vw-2.5rem))] rounded-2xl border border-l-4 border-[#fca5a5] border-l-[#dc2626] bg-white p-4 shadow-xl transition-all duration-300 ease-out starting:translate-y-3 starting:opacity-0 lg:bottom-5"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#dc2626]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#0f172a]">
            {notice.tourCode} cần hỗ trợ · {REASON_SHORT[notice.reason] ?? notice.reason}
          </p>
          {notice.detail && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#64748b]">{notice.detail}</p>}
          <Link
            to={`/staff/live/${notice.tourId}`}
            onClick={onClose}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#2563eb] hover:underline"
          >
            Mở điều hành trực tiếp<ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
        >
          <X size={15} />
        </button>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>

      </div>
    </div>
  )
}
