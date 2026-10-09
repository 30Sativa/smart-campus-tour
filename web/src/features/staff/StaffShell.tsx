import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Radio, ShieldAlert, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { LiveDot } from './StaffUi'
import { PageSkeleton } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { DevDataBadge, MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { ADMIN_LINK_ICON, STAFF_NAV, STAFF_NAV_ENTRIES, activeNavPath } from './staff-nav'
import { useStaffRealtimeSync, useTours, type AssistanceNotice } from './staff-hooks'
import { StaffBell } from './StaffBell'
import { REASON_SHORT } from './reason'

const TOAST_MS = 9_000

const CONNECTION_LABEL = {
  connecting: 'Đang kết nối',
  connected: 'Thời gian thực',
  reconnecting: 'Đang kết nối lại',
  disconnected: 'Mất kết nối',
} as const

/**
 * The operations shell: the shared grouped sidebar (logo, folding groups,
 * the assistance badge on "Điều hành trực tiếp"), and a quiet header with the
 * realtime state, the bell (everything that needs attention) and the account.
 */
export default function StaffShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<AssistanceNotice | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const showAdminLink = isAdminRole(user?.role)

  // The shell owns the one realtime subscription for the whole area.
  const connection = useStaffRealtimeSync(setToast)
  const today = useTours()
  const assistCount = today.data?.filter((tour) => tour.operationalStatus === 'NeedsAssistance').length ?? 0

  const currentPath = activeNavPath(location.pathname)
  const title = location.pathname.startsWith('/staff/digital-twin') ? 'Simulator robot' : STAFF_NAV.find(({ path }) => path === currentPath)?.label ?? 'Vận hành tour'
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
    <div className="flex min-h-[100dvh] bg-[#f6f7f9] text-[#173b59]">
      <MobileNavToggle open={menuOpen} controls="staff-navigation" label="Mở điều hướng vận hành" closeLabel="Đóng điều hướng vận hành" onOpen={() => setMenuOpen(true)} onClose={closeMenu} buttonRef={menuButtonRef} />

      <GroupedSidebar
        id="staff-navigation"
        label="Khu vực vận hành"
        navLabel="Điều hướng vận hành"
        homePath="/staff"
        subtitle="DT-AMR · Vận hành"
        entries={STAFF_NAV_ENTRIES}
        currentPath={currentPath}
        badges={{ '/staff/live': { value: assistCount, label: `${assistCount} buổi cần hỗ trợ`, tone: 'danger' } }}
        // Only an Admin sees a way across, and only because that account
        // genuinely has the other area. An operator is not shown a door it cannot open.
        secondary={showAdminLink ? [{ to: '/admin', label: 'Khu vực quản trị', icon: ADMIN_LINK_ICON }] : undefined}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
        closeRef={closeButtonRef}
      />

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 bg-[#f6f7f9]/85 px-4 backdrop-blur-md sm:px-6 lg:px-9">
          <div className="flex h-[62px] items-center gap-3 border-b border-[#e5e7eb]">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-[#9ca3af]">CampusTour <span className="mx-1.5 text-[#d1d5db]">/</span> <span className="text-[#6b7280]">{title}</span></p>
            <span
              role="status"
              className={`hidden shrink-0 items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold sm:inline-flex ${
                connection === 'connected' ? 'bg-[#ecfdf3] text-[#15803d]' : connection === 'disconnected' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#fffbeb] text-[#b45309]'
              }`}
            >
              <LiveDot tone={connection === 'connected' ? 'ok' : connection === 'disconnected' ? 'danger' : 'warn'} />
              {CONNECTION_LABEL[connection]}
            </span>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <StaffBell />
              {/* The signed-in account, top right. Sign-out stays in the sidebar. */}
              <div role="group" className="ml-1 flex min-w-0 items-center gap-2.5 border-l border-[#e5e7eb] pl-3.5" aria-label="Tài khoản đang đăng nhập">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#2d719e] text-white"><Radio size={15} aria-hidden="true" /></span>
                <div className="hidden min-w-0 sm:block">
                  <p className="max-w-40 truncate text-[13px] leading-tight font-semibold text-[#0f172a]">{user?.username || 'Nhân viên vận hành'}</p>
                  <p className="max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">{roleLabel(user?.role)}</p>
                </div>
                <ChevronDown size={14} aria-hidden="true" className="hidden shrink-0 text-[#9ca3af] sm:block" />
              </div>
            </div>
          </div>
        </header>

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
      className="fixed right-5 bottom-20 z-40 w-[min(380px,calc(100vw-2.5rem))] rounded-xl border border-l-4 border-[#fca5a5] border-l-[#dc2626] bg-white p-4 shadow-xl transition-[opacity,transform] duration-300 motion-reduce:transition-none ease-out starting:translate-y-3 starting:opacity-0 lg:bottom-5"
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
      </div>
    </div>
  )
}
