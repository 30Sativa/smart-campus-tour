import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter, useLocation, useParams } from 'react-router'
import LoginPage from '../../auth/LoginPage'
import RegisterPage from '../../auth/RegisterPage'
import { AuthLayout } from '../../auth/AuthLayout'
import { useAuthStore } from '../../stores/auth-store'
import { areaById, type AreaId } from '../../auth/access'
import { homePathForRole } from '../../auth/roles'

/**
 * Four areas, four audiences:
 *
 *   `/`        public   marketing pages, no account
 *   `/visit/*` visitor  the visitor app: explore, book a robot, walk a tour
 *   `/staff/*` staff    tour operations, for Staff and Admin
 *   `/admin/*` admin    administration, Admin only
 *
 * All three signed-in areas are lazy, shell included, so a visitor loading `/`
 * downloads none of them, a visitor never downloads operations, and an operator
 * never downloads administration.
 *
 * `/staff/*` used to live at `/admin/*` while the product had only one
 * signed-in area. It does not any more: `/admin/*` is administration now, and
 * the old operations URLs redirect (see the bottom of the table).
 *
 * The landing page is lazy for the same reason the two consoles are. It carries
 * GSAP, Lenis and the whole marketing stylesheet, and while it sat in the entry
 * chunk an operator opening `/staff` downloaded all of it before seeing a tour.
 */
const PublicHomePage = lazy(() => import('../../routes/public/PublicHomePage'))

const VisitorShell = lazy(() => import('../../features/visitor/VisitorShell'))
const VisitorHomePage = lazy(() => import('../../routes/visitor/VisitorHomePage'))
const ExplorePage = lazy(() => import('../../routes/visitor/ExplorePage'))
const LocationDetailPage = lazy(() => import('../../routes/visitor/LocationDetailPage'))
const CampusMapPage = lazy(() => import('../../routes/visitor/CampusMapPage'))
const BookRobotPage = lazy(() => import('../../routes/visitor/BookRobotPage'))
const MyBookingsPage = lazy(() => import('../../routes/visitor/MyBookingsPage'))
const MyToursPage = lazy(() => import('../../routes/visitor/MyToursPage'))
const ActiveTourPage = lazy(() => import('../../routes/visitor/ActiveTourPage'))
const AskRobotPage = lazy(() => import('../../routes/visitor/AskRobotPage'))
const NotificationsPage = lazy(() => import('../../routes/visitor/NotificationsPage'))
const ProfilePage = lazy(() => import('../../routes/visitor/ProfilePage'))
const HelpPage = lazy(() => import('../../routes/visitor/HelpPage'))

const StaffShell = lazy(() => import('../../features/staff/StaffShell'))
const OverviewPage = lazy(() => import('../../routes/staff/OverviewPage'))
const ToursTodayPage = lazy(() => import('../../routes/staff/ToursTodayPage'))
const SchedulePage = lazy(() => import('../../routes/staff/SchedulePage'))
const TourDetailPage = lazy(() => import('../../routes/staff/TourDetailPage'))
const StartCheckPage = lazy(() => import('../../routes/staff/StartCheckPage'))
const LiveOperationsPage = lazy(() => import('../../routes/staff/LiveOperationsPage'))
const RobotPage = lazy(() => import('../../routes/staff/RobotPage'))
const TourHistoryPage = lazy(() => import('../../routes/staff/TourHistoryPage'))
const DigitalTwinPage = lazy(() => import('../../routes/staff/DigitalTwinPage'))

const AdminShell = lazy(() => import('../../features/administration/AdminShell'))
const SystemOverviewPage = lazy(() => import('../../routes/admin/SystemOverviewPage'))
const RolesPage = lazy(() => import('../../routes/admin/RolesPage'))

function ShellFallback({ background }: { background: string }) {
  return <div className="min-h-[100dvh]" style={{ background }} aria-busy="true" aria-label="Đang tải" />
}

/**
 * Real navigation block, not a hidden nav link.
 *
 * An unauthenticated visitor is sent to sign in, remembering where they were
 * going. A signed-in account without the area's role is sent to its own home
 * rather than to `/`, so an operator typing `/admin` lands on `/staff` instead
 * of being dumped on the marketing page.
 *
 * The rule itself lives in `auth/access.ts`, which is also what the "Vai trò &
 * quyền" screen reads, so the guard and its documentation cannot drift apart.
 * The server remains the real enforcement.
 */
function RequireArea({ area, children }: { area: AreaId; children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const role = useAuthStore((state) => state.user?.role)
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!areaById(area).allows(role)) return <Navigate to={homePathForRole(role)} replace />
  return <>{children}</>
}

function VisitorArea() {
  return (
    <RequireArea area="visitor">
      {/* The fallback ground is the landing page's light token value, so the
          first paint of the shell is already the right colour rather than white
          for a frame. */}
      <Suspense fallback={<ShellFallback background="#f5f7f8" />}>
        <VisitorShell />
      </Suspense>
    </RequireArea>
  )
}

function StaffArea() {
  return (
    <RequireArea area="staff">
      <Suspense fallback={<ShellFallback background="#eef2f8" />}>
        <StaffShell />
      </Suspense>
    </RequireArea>
  )
}

function AdminArea() {
  return (
    <RequireArea area="admin">
      <Suspense fallback={<ShellFallback background="#f4f6fa" />}>
        <AdminShell />
      </Suspense>
    </RequireArea>
  )
}

/** Legacy `/admin/tours/:sessionId` kept its parameter, so carry it across. */
function LegacySessionRedirect() {
  const { sessionId } = useParams()
  return <Navigate to={`/staff/tours/${sessionId ?? ''}`} replace />
}

/**
 * The route table, separate from the browser router so it can be mounted in a
 * memory router and asserted on. The guard, the legacy redirects and the
 * `/admin` precedence rule are behaviour, and behaviour that is only visible by
 * clicking through a running app is behaviour that quietly regresses.
 */
export const routes = [
  {
    path: '/',
    element: (
      <Suspense fallback={<ShellFallback background="#060d11" />}>
        <PublicHomePage />
      </Suspense>
    ),
  },
  // One layout, two children: the photograph and the brand stay mounted while
  // the form swaps, which is what the sign-in/sign-up crossfade animates.
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    path: '/visit',
    element: <VisitorArea />,
    children: [
      { index: true, element: <VisitorHomePage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'explore/:locationId', element: <LocationDetailPage /> },
      { path: 'map', element: <CampusMapPage /> },
      { path: 'book', element: <BookRobotPage /> },
      { path: 'bookings', element: <MyBookingsPage /> },
      { path: 'tours', element: <MyToursPage /> },
      // The active tour is one session at a time, so it needs no id in the URL:
      // the API answers "the tour this account is on right now", and a link from
      // a notification cannot go stale.
      { path: 'tour', element: <ActiveTourPage /> },
      { path: 'assistant', element: <AskRobotPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'help', element: <HelpPage /> },
      // A mistyped path inside the area stays inside the area.
      { path: '*', element: <Navigate to="/visit" replace /> },
    ],
  },
  {
    path: '/staff',
    element: <StaffArea />,
    children: [
      { index: true, element: <OverviewPage /> },
      // Sessions (remote-tour scope): today's list, any day, detail & log,
      // and the pre-start check for a Ready one.
      { path: 'tours', element: <ToursTodayPage /> },
      { path: 'tours/:tourId', element: <TourDetailPage /> },
      { path: 'tours/:tourId/start', element: <StartCheckPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      // Operations.
      { path: 'live', element: <LiveOperationsPage /> },
      { path: 'live/:tourId', element: <LiveOperationsPage /> },
      { path: 'robot', element: <RobotPage /> },
      { path: 'digital-twin', element: <DigitalTwinPage /> },
      { path: 'history', element: <TourHistoryPage /> },
      // Renamed with the operations redesign (2026-09-21). Migration only:
      // drop once no bookmark points at them.
      { path: 'amr', element: <Navigate to="/staff/robot" replace /> },
      { path: 'alerts', element: <Navigate to="/staff" replace /> },
      { path: 'reports', element: <Navigate to="/staff/history" replace /> },
      // A mistyped path inside the area stays inside the area.
      { path: '*', element: <Navigate to="/staff" replace /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminArea />,
    children: [
      { index: true, element: <SystemOverviewPage /> },
      { path: 'roles', element: <RolesPage /> },
    ],
  },
  // Migration only: the operations pages that used to sit under `/admin`.
  // `/admin` itself is NOT redirected — it is the administration overview now,
  // and an Admin route always wins over a legacy path. Drop these once the old
  // links are gone.
  { path: '/admin/schedule', element: <Navigate to="/staff/schedule" replace /> },
  { path: '/admin/amr', element: <Navigate to="/staff/robot" replace /> },
  { path: '/admin/alerts', element: <Navigate to="/staff" replace /> },
  { path: '/admin/digital-twin', element: <Navigate to="/staff/digital-twin" replace /> },
  { path: '/admin/reports', element: <Navigate to="/staff/history" replace /> },
  { path: '/admin/tours/:sessionId', element: <LegacySessionRedirect /> },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
