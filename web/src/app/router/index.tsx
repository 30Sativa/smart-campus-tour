import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter, useLocation } from 'react-router'
import LoginPage from '../../auth/LoginPage'
import { AuthLayout } from '../../auth/AuthLayout'
import { useAuthStore } from '../../stores/auth-store'
import { areaById, type AreaId } from '../../auth/access'
import { homePathForRole } from '../../auth/roles'

/**
 * Four areas, four audiences:
 *
 *   `/`        public   marketing pages, no account
 *   `/staff/*` staff    tour operations, for Staff and Admin
 *   `/admin/*` admin    Tour administration (create, review groups, e-mail, Chốt/Mở lại/Hủy), Admin only
 *   `/dai-dien/*`       school representative: register a group, roster, invitation
 *   `/tour/*`           students, no account: join, waiting room, live, end
 *
 * The visitor area (`/visit/*`) and self sign-up (`/register`) were removed on
 * 2026-09-24 together with the Visitor role.
 *
 * All signed-in areas are lazy, shell included, so a visitor loading `/`
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
const AdminDashboardPage = lazy(() => import('../../routes/admin/AdminDashboardPage'))
const AdminTourListPage = lazy(() => import('../../routes/admin/AdminTourListPage'))
const AdminTourCreatePage = lazy(() => import('../../routes/admin/AdminTourCreatePage'))
const AdminTourDetailPage = lazy(() => import('../../routes/admin/AdminTourDetailPage'))
const AdminTourEditPage = lazy(() => import('../../routes/admin/AdminTourEditPage'))
const AdminRegistrationsPage = lazy(() => import('../../routes/admin/AdminRegistrationsPage'))
const AdminRouteCatalogPage = lazy(() => import('../../routes/admin/AdminRouteCatalogPage'))
const AdminTourHistoryPage = lazy(() => import('../../routes/admin/AdminTourHistoryPage'))
const RolesPage = lazy(() => import('../../routes/admin/RolesPage'))

const StudentTourPage = lazy(() => import('../../routes/student/StudentTourPage'))

// School representative (screen flow review 21/09/2026 §4).
const RepresentativeShell = lazy(() => import('../../features/representative/RepresentativeShell'))
const RepToursPage = lazy(() => import('../../routes/representative/RepToursPage'))
const RepTourDetailPage = lazy(() => import('../../routes/representative/RepTourDetailPage'))
const RepRegisterPage = lazy(() => import('../../routes/representative/RepRegisterPage'))
const RepRegistrationsPage = lazy(() => import('../../routes/representative/RepRegistrationsPage'))
const RepRegistrationDetailPage = lazy(() => import('../../routes/representative/RepRegistrationDetailPage'))

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

function RepresentativeArea() {
  return (
    <RequireArea area="representative">
      <Suspense fallback={<ShellFallback background="#f0f0eb" />}>
        <RepresentativeShell />
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
  // Sign-in layout. Accounts are issued by Admin; there is no self sign-up.
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },
  // Student Remote Tour experience (Roster matching, Waiting room, Live tour with AMR & AI, End)
  {
    path: '/tour',
    element: (
      <Suspense fallback={<ShellFallback background="#f8fafc" />}>
        <StudentTourPage />
      </Suspense>
    ),
  },
  {
    path: '/tour/:tourId',
    element: (
      <Suspense fallback={<ShellFallback background="#f8fafc" />}>
        <StudentTourPage />
      </Suspense>
    ),
  },
  {
    path: '/dai-dien',
    element: <RepresentativeArea />,
    children: [
      { index: true, element: <RepToursPage /> },
      { path: 'buoi/:tourId', element: <RepTourDetailPage /> },
      { path: 'buoi/:tourId/dang-ky', element: <RepRegisterPage /> },
      { path: 'dang-ky', element: <RepRegistrationsPage /> },
      { path: 'dang-ky/:registrationId', element: <RepRegistrationDetailPage /> },
      { path: 'dang-ky/:registrationId/sua', element: <RepRegisterPage /> },
      { path: '*', element: <Navigate to="/dai-dien" replace /> },
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
      // Preparing Tours before they run (remote-tour scope §2, §3, §11.1).
      { index: true, element: <AdminDashboardPage /> },
      { path: 'tours', element: <AdminTourListPage /> },
      { path: 'tours/new', element: <AdminTourCreatePage /> },
      { path: 'tours/:tourId', element: <AdminTourDetailPage /> },
      { path: 'tours/:tourId/edit', element: <AdminTourEditPage /> },
      { path: 'registrations', element: <AdminRegistrationsPage mode="all" /> },
      { path: 'registrations/pending', element: <AdminRegistrationsPage mode="pending" /> },
      { path: 'routes', element: <AdminRouteCatalogPage /> },
      { path: 'history', element: <AdminTourHistoryPage /> },
      { path: 'roles', element: <RolesPage /> },
      // A mistyped path inside the area stays inside the area.
      { path: '*', element: <Navigate to="/admin" replace /> },
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
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
