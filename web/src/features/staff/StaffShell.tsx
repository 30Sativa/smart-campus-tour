import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, ChevronRight, Radio, Search, ShieldAlert, X } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { LiveDot, PageSkeleton } from './StaffUi'
import { useMobileNav } from './use-mobile-nav'
import { ConsoleSidebar, ConsoleTopbar, DevDataBadge, MobileNavToggle } from './ConsoleSidebar'
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
    <div className="flex min-h-[100dvh] bg-[#f0f0eb] text-[#1c1c1c]">
      <MobileNavToggle open={menuOpen} controls="staff-navigation" label="Mở điều hướng vận hành" closeLabel="Đóng điều hướng vận hành" onOpen={() => setMenuOpen(true)} onClose={closeMenu} buttonRef={menuButtonRef} />

      <ConsoleSidebar
        id="staff-navigation"
        label="Khu vực vận hành"
        navLabel="Điều hướng vận hành"
        homePath="/staff"
        areaName="Vận hành tour"
        sections={STAFF_NAV_SECTIONS}
        currentPath={currentPath}
        badges={{ '/staff/live': { value: assistCount, label: `${assistCount} buổi cần hỗ trợ` } }}
        // Only an Admin sees a way across, and only because that account
        // genuinely has the other area. An operator is not shown a door it cannot open.
        secondary={showAdminLink ? [{ to: '/admin', label: 'Khu vực quản trị', icon: ADMIN_LINK_ICON }] : undefined}
        user={{ name: user?.username || 'Nhân viên vận hành', role: roleLabel(user?.role), icon: Radio }}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
        closeRef={closeButtonRef}
      />

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <ConsoleTopbar
          area="Vận hành"
          areaPath="/staff"
          title={STAFF_NAV.find(({ path }) => path === currentPath)?.label ?? 'Vận hành tour'}
        >
          <span
            role="status"
            className={`hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-bold sm:inline-flex ${
              connection === 'connected'
                ? 'bg-[#f2f7e4] text-[#5f7a12] border border-[#d5e8a6]'
                : connection === 'disconnected'
                ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]'
                : 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]'
            }`}
          >
            <LiveDot tone={connection === 'connected' ? 'ok' : connection === 'disconnected' ? 'danger' : 'warn'} />
            {CONNECTION_LABEL[connection]}
          </span>

          <div className="ml-auto flex min-w-0 items-center gap-2.5">
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
              <label className="flex h-9.5 items-center gap-2 rounded-xl border border-[#e3e3dc] bg-[#f7f7f3] px-3 focus-within:bg-white focus-within:border-[#1c1c1c] focus-within:ring-2 focus-within:ring-[#9cc93a]/20 transition-all">
                <Search size={14} className="shrink-0 text-[#6b6e75]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearch('')
                  }}
                  aria-label="Tìm trang vận hành"
                  placeholder="Tìm trang vận hành…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1c1c1c] outline-none placeholder:text-[#8e9096]"
                />
              </label>
              {search.trim() && (
                <div className="absolute top-11 right-0 left-0 rounded-xl border border-[#e3e3dc] bg-white p-1.5 shadow-lg transition-[opacity,transform] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none">
                  <ul aria-label="Kết quả tìm trang" className="space-y-0.5">
                    {searchResults.map(({ path, label }) => (
                      <li key={path}>
                        <Link
                          to={path}
                          onClick={() => setSearch('')}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-[#4d6410] hover:bg-[#f2f7e4]"
                        >
                          {label}
                          <ChevronRight size={13} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {searchResults.length === 0 && (
                    <p role="status" className="p-3 text-xs text-[#6b6e75]">
                      Không tìm thấy trang phù hợp.
                    </p>
                  )}
                </div>
              )}
            </form>

            <Link
              to={runningTour ? `/staff/live/${runningTour.id}` : '/staff/live'}
              aria-label={assistCount > 0 ? `Điều hành trực tiếp, ${assistCount} buổi cần hỗ trợ` : 'Điều hành trực tiếp'}
              className="relative grid size-9.5 shrink-0 place-items-center rounded-xl border border-[#e3e3dc] bg-white text-[#6b6e75] hover:border-[#c6c7cc] hover:text-[#4d6410] hover:bg-[#f7f7f3] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc93a]"
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
        </ConsoleTopbar>

        <DevDataBadge>dữ liệu mẫu · mô phỏng thời gian thực</DevDataBadge>

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
      className="fixed right-5 bottom-20 z-40 w-[min(380px,calc(100vw-2.5rem))] rounded-2xl border border-l-4 border-[#fca5a5] border-l-[#dc2626] bg-white p-4 shadow-xl transition-[opacity,transform] duration-300 motion-reduce:transition-none ease-out starting:translate-y-3 starting:opacity-0 lg:bottom-5"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#dc2626]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#1c1c1c]">
            {notice.tourCode} cần hỗ trợ · {REASON_SHORT[notice.reason] ?? notice.reason}
          </p>
          {notice.detail && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#6b6e75]">{notice.detail}</p>}
          <Link
            to={`/staff/live/${notice.tourId}`}
            onClick={onClose}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#4d6410] hover:underline"
          >
            Mở điều hành trực tiếp<ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[#8e9096] hover:bg-[#efefe9] hover:text-[#1c1c1c]"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
