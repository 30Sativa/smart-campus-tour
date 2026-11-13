import { useEffect } from 'react'
import { MonitorPlay } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { usePendingReviewCount } from '../administration/registrations/hooks'
import { LiveDot } from './StaffUi'
import { RouteView } from '../../components/ui/RouteView'
import { softConsoleGround, softConsoleMain } from '../../components/ui/ui-classes'
import { useConsoleDrawer } from '../../components/ui/use-mobile-nav'
import { useCurrentPageTitle } from '../../components/ui/use-page-title'
import { MobileNavScrim } from '../../components/ui/ConsoleSidebar'
import { ConsoleAccountMenu, ConsoleHeader } from '../../components/ui/ConsoleHeader'
import { consoleCrumbs } from '../../components/ui/console-crumbs'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { REGISTRATIONS_NAV_PATH, STAFF_NAV, STAFF_NAV_ENTRIES, STAFF_NAV_SECTIONS, activeNavPath } from './staff-nav'
import { StaffBell } from './StaffBell'
import { useFleetConnection, useFleetTelemetrySync } from './operations/fleet-telemetry'
import { useRunningTours, type RunningTour } from './operations/hooks'
import { STEP_LABEL } from './operations/operation-labels'
import { isTourOrigin, originNavPath, tourPageId, useTourOriginStore } from './operations/tour-origin'

/**
 * The state of this browser's live connection to the server (the
 * `/hubs/operations` socket). It says nothing about whether any robot is
 * connected, which the Robot page reports, nor how fresh the Tour data is: Tours
 * are polled separately and each page says when they were last read.
 */
const CONNECTION_LABEL = {
  connecting: 'Cập nhật trực tiếp: đang kết nối',
  connected: 'Cập nhật trực tiếp: đã kết nối',
  reconnecting: 'Cập nhật trực tiếp: đang kết nối lại',
  disconnected: 'Cập nhật trực tiếp: mất kết nối',
} as const

/**
 * The operations shell: the shared grouped sidebar (logo, sections, the
 * assistance badge on "Điều hành trực tiếp") and the shared console header with
 * the live-connection status, the bell (everything that needs attention) and the
 * account. Operations is the one area with a live connection, so only it shows one.
 */
export default function StaffShell() {
  const drawer = useConsoleDrawer()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const pageTitle = useCurrentPageTitle()

  // The shell owns the one telemetry hub subscription for the whole area.
  useFleetTelemetrySync()
  const connection = useFleetConnection((state) => state.state)
  const runningTours = useRunningTours().tours
  const needsHelp = runningTours.filter((detail) => detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE')
  const assistCount = needsHelp.length
  const running = needsHelp[0] ?? runningTours[0]

  // A Tour page belongs to the list it was opened from (see tour-origin.ts).
  const onTourPage = tourPageId(location.pathname) !== null
  const origin = useTourOriginStore((state) => state.origin)
  const remember = useTourOriginStore((state) => state.remember)
  const here = `${location.pathname}${location.search}`
  const canBeOrigin = isTourOrigin(location.pathname)
  useEffect(() => { if (canBeOrigin) remember(here) }, [canBeOrigin, here, remember])
  const currentPath = onTourPage ? originNavPath(origin) : activeNavPath(location.pathname)
  // The running Tour and the robot channel stay in view on every page: the same
  // person prepares Tours while one runs, and must not lose sight of it.
  // The badge links to the live SQL queue, so it counts that queue, never the simulated registrations.
  const pendingCount = usePendingReviewCount() ?? 0
  const onProfile = location.pathname.startsWith('/staff/profile')
  const entry = onProfile ? null : STAFF_NAV.find(({ path }) => path === currentPath)?.label ?? null
  const section = onProfile ? 'Tài khoản' : STAFF_NAV_SECTIONS.find(({ items }) => items.some(({ path }) => path === currentPath))?.label ?? 'Vận hành'
  // Until a lazy page has set its own title, the shell names it from the address.
  const fallback = onTourPage ? 'Chi tiết Tour' : onProfile ? 'Hồ sơ của tôi' : location.pathname.startsWith('/staff/digital-twin') ? 'Simulator robot' : null
  const crumbs = consoleCrumbs({ section, entry, page: pageTitle ?? fallback })

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <MobileNavScrim open={drawer.open} label="Đóng điều hướng vận hành" onClose={drawer.close} />

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
          '/staff/live': { value: assistCount, label: `${assistCount} Tour cần hỗ trợ`, tone: 'danger' },
          [REGISTRATIONS_NAV_PATH]: { value: pendingCount, label: `${pendingCount} đoàn chờ duyệt`, tone: 'info' },
        }}
        onNavigate={drawer.close}
        onLogout={handleLogout}
        open={drawer.open}
        panelRef={drawer.panelRef}
        closeRef={drawer.closeButtonRef}
        highlight={running ? (rail) => <RunningCard detail={running} rail={rail} onNavigate={drawer.close} /> : undefined}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ConsoleHeader crumbs={crumbs} menuOpen={drawer.open} menuControls="staff-navigation" menuLabel="Mở điều hướng vận hành" onMenu={drawer.openDrawer} menuButtonRef={drawer.menuButtonRef}>
          <span
            role="status"
            className={`hidden shrink-0 items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold md:inline-flex ${
              connection === 'connected' ? 'bg-[#ecfdf3] text-[#15803d]' : connection === 'disconnected' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#fffbeb] text-[#b45309]'
            }`}
          >
            <LiveDot tone={connection === 'connected' ? 'ok' : connection === 'disconnected' ? 'danger' : 'warn'} />
            {CONNECTION_LABEL[connection]}
          </span>
          <StaffBell />
          <ConsoleAccountMenu name={user?.username || 'Nhân viên vận hành'} role={roleLabel(user?.role)} profilePath="/staff/profile" profileCurrent={onProfile} onLogout={handleLogout} onNavigate={drawer.close} />
        </ConsoleHeader>

        {/* Every panel on a console page becomes a soft card, and every primary button the one console blue. */}
        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${softConsoleMain}`}>
          <RouteView />
        </main>
      </div>
    </div>
  )
}

/**
 * The Tour running now, kept in view under the logo: one click to its live
 * console. Red when it needs assistance. On the rail it shrinks to its icon.
 */
function RunningCard({ detail, rail, onNavigate }: { detail: RunningTour; rail: boolean; onNavigate: () => void }) {
  const assist = detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE'
  const step = detail.execution?.currentStep ? STEP_LABEL[detail.execution.currentStep] ?? 'Đang chạy' : 'Đang chạy'
  return (
    <Link to={`/staff/live/${detail.tour.id}`} onClick={onNavigate} title={rail ? `Đang chạy ${detail.tour.name}` : undefined}
      aria-label={`Đang chạy ${detail.tour.name}${assist ? ', cần hỗ trợ' : ''}. Mở điều hành trực tiếp`}
      className={`mb-1 flex min-h-12 items-center gap-2.5 rounded-[15px] px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2 ${assist ? 'bg-[#fdecea] text-[#b23e31] ring-1 ring-[#f5c8c2] hover:bg-[#fbe0dc]' : 'bg-[#eef2f7] text-[#1e293b] hover:bg-[#e5eaf1]'} ${rail ? 'lg:justify-center lg:px-0' : ''}`}>
      {rail ? <MonitorPlay size={17} aria-hidden="true" className="hidden shrink-0 lg:block" /> : null}
      <span className={`${rail ? 'lg:hidden' : ''} flex min-w-0 items-center gap-2.5`}>
        <LiveDot tone={assist ? 'warn' : 'ok'} />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold">{detail.tour.name}{assist ? ', cần hỗ trợ' : ''}</span>
          <span className="block truncate text-[11px] opacity-75">{step}</span>
        </span>
      </span>
    </Link>
  )
}
