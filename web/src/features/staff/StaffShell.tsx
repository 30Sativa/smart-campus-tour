import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, LogOut, MonitorPlay, ShieldAlert, UserRound, X } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { usePendingReviewCount } from '../administration/registrations/hooks'
import { LiveDot } from './StaffUi'
import { RouteView } from '../../components/ui/RouteView'
import { softConsoleGround, softConsoleHeader, softConsoleMain } from '../../components/ui/ui-classes'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { useDismiss } from '../../components/ui/use-dismiss'
import { MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { ADMIN_LINK_ICON, STAFF_NAV, STAFF_NAV_ENTRIES, STAFF_NAV_SECTIONS, activeNavPath } from './staff-nav'
import { useStaffRealtimeSync, useTours, type AssistanceNotice } from './staff-hooks'
import { StaffBell } from './StaffBell'
import { REASON_SHORT } from './reason'
import type { TourOperation } from '../../api/contracts/staff'

const TOAST_MS = 9_000

const CONNECTION_LABEL = {
  connecting: 'Đang kết nối',
  connected: 'Mô phỏng trực tiếp',
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
  const running = today.data?.find((tour) => tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance') ?? today.data?.find((tour) => tour.state === 'Running')

  const currentPath = activeNavPath(location.pathname)
  // Preparation pages use live APIs; operational pages still use labelled simulations.
  const onLiveSqlPage = location.pathname === '/staff/manage' || location.pathname.startsWith('/staff/manage/') || location.pathname === '/staff/profile'
  // The badge links to the live SQL queue, so it counts that queue, never the simulated registrations.
  const pendingCount = usePendingReviewCount() ?? 0
  const title = location.pathname.startsWith('/staff/digital-twin') ? 'Simulator robot' : location.pathname.startsWith('/staff/profile') ? 'Hồ sơ của tôi' : STAFF_NAV.find(({ path }) => path === currentPath)?.label ?? 'Vận hành tour'
  const section = location.pathname.startsWith('/staff/profile') ? 'Tài khoản' : STAFF_NAV_SECTIONS.find(({ items }) => items.some(({ path }) => path === currentPath))?.label ?? 'Vận hành'
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
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <MobileNavToggle open={menuOpen} controls="staff-navigation" label="Mở điều hướng vận hành" closeLabel="Đóng điều hướng vận hành" onOpen={() => setMenuOpen(true)} onClose={closeMenu} buttonRef={menuButtonRef} />

      <GroupedSidebar
        id="staff-navigation"
        look="soft"
        label="Khu vực vận hành"
        navLabel="Điều hướng vận hành"
        homePath="/staff"
        subtitle="DT-AMR · Vận hành"
        entries={STAFF_NAV_ENTRIES}
        currentPath={currentPath}
        badges={{
          '/staff/live': { value: assistCount, label: `${assistCount} buổi cần hỗ trợ`, tone: 'danger' },
          '/staff/manage/registrations': { value: pendingCount, label: `${pendingCount} đoàn chờ duyệt`, tone: 'info' },
        }}
        // Only an Admin sees a way across, and only because that account
        // genuinely has the other area. An operator is not shown a door it cannot open.
        secondary={showAdminLink ? [{ to: '/admin', label: 'Khu vực quản trị', icon: ADMIN_LINK_ICON }] : undefined}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
        closeRef={closeButtonRef}
        highlight={!onLiveSqlPage && running ? (rail) => <RunningCard tour={running} rail={rail} onNavigate={closeMenu} /> : undefined}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Purity-style navbar: a frosted card floating over the page, breadcrumb above the page name. */}
        <header className="sticky top-0 z-20 shrink-0 px-4 pt-3 sm:px-6 lg:px-8">
          <div className={softConsoleHeader}>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-[#a0aec0]">{section} <span className="mx-1">/</span> <span className="text-[#2d3748]">{title}</span></p>
              <p className="truncate text-sm font-bold text-[#2d3748]">{title}</p>
            </div>
            {!onLiveSqlPage && <span
              role="status"
              className={`hidden shrink-0 items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold sm:inline-flex ${
                connection === 'connected' ? 'bg-[#ecfdf3] text-[#15803d]' : connection === 'disconnected' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#fffbeb] text-[#b45309]'
              }`}
            >
              <LiveDot tone={connection === 'connected' ? 'ok' : connection === 'disconnected' ? 'danger' : 'warn'} />
              {CONNECTION_LABEL[connection]}
            </span>}

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <StaffBell />
              {/* The signed-in account, top right: its profile and sign-out. */}
              <AccountMenu username={user?.username} role={user?.role} onLogout={handleLogout} />
            </div>
          </div>
        </header>

        {!onLiveSqlPage && <p role="note" className="mx-4 mt-3 w-fit rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#4a6fa5] sm:mx-6 lg:mx-8">Chế độ mô phỏng · Số liệu minh họa</p>}

        {/* Every panel on a Staff page becomes a Purity card: 15px corners, no border, a soft lift. */}
        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0 ${softConsoleMain}`}>
          <RouteView />
        </main>

        {toast && <AssistanceToast notice={toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  )
}

/**
 * The session running now, kept in view under the logo: one click to its live
 * control. Red when it needs assistance. On the rail it shrinks to its icon.
 */
function RunningCard({ tour, rail, onNavigate }: { tour: TourOperation; rail: boolean; onNavigate: () => void }) {
  const assist = tour.operationalStatus === 'NeedsAssistance'
  const index = tour.progress?.stopIndex
  const where = index != null && tour.stops[index] ? `Điểm ${index + 1}/${tour.stops.length}: ${tour.stops[index].name}` : 'Đang về điểm kết thúc'
  return (
    <Link to={`/staff/live/${tour.id}`} onClick={onNavigate} title={rail ? `Đang chạy ${tour.code}` : undefined}
      aria-label={`Đang chạy ${tour.code}${assist ? ', cần hỗ trợ' : ''}. Mở điều hành trực tiếp`}
      className={`mb-1 flex min-h-12 items-center gap-2.5 rounded-[15px] px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2 ${assist ? 'bg-[#fdecea] text-[#b23e31] ring-1 ring-[#f5c8c2] hover:bg-[#fbe0dc]' : 'bg-[#eef2f7] text-[#1e293b] hover:bg-[#e5eaf1]'} ${rail ? 'lg:justify-center lg:px-0' : ''}`}>
      {rail ? <MonitorPlay size={17} aria-hidden="true" className="hidden shrink-0 lg:block" /> : null}
      <span className={`${rail ? 'lg:hidden' : ''} flex min-w-0 items-center gap-2.5`}>
        <LiveDot tone={assist ? 'warn' : 'ok'} />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold">Đang chạy {tour.code}{assist ? ', cần hỗ trợ' : ''}</span>
          <span className="block truncate text-[11px] opacity-75">{where}</span>
        </span>
      </span>
    </Link>
  )
}

/** Initials for an account avatar, from a username like "staff" or "nguyen.anh". */
function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

function AccountMenu({ username, role, onLogout }: { username?: string; role?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(open, close)
  const name = username || 'Nhân viên vận hành'
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors'
  return (
    <div ref={ref} role="group" aria-label="Tài khoản đang đăng nhập" className="relative ml-1 border-l border-[#e2e8f0] pl-2">
      <button
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
          <span className="block max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">{roleLabel(role)}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`hidden shrink-0 text-[#9ca3af] transition-transform duration-200 sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute top-[calc(100%+8px)] right-0 z-40 w-60 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none">
          <div className="mb-1 border-b border-[#f1f5f9] px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[13.5px] font-bold text-[#0f172a]">{name}</p>
            <p className="truncate text-xs text-[#64748b]">{roleLabel(role)}</p>
          </div>
          <Link role="menuitem" to="/staff/profile" onClick={close} className={`${item} text-[#0f172a] hover:bg-[#f1f5f9]`}>
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

function AssistanceToast({ notice, onClose }: { notice: AssistanceNotice; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="fixed top-[68px] right-4 z-40 w-[min(380px,calc(100vw-2rem))] rounded-xl border border-l-4 border-[#fca5a5] border-l-[#dc2626] bg-white p-4 shadow-xl transition-[opacity,transform] duration-300 motion-reduce:transition-none ease-out starting:-translate-y-3 starting:opacity-0 lg:right-5"
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
