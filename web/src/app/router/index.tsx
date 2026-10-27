import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter, useLocation } from 'react-router'
import LoginPage from '../../auth/LoginPage'
import { AuthLayout } from '../../auth/AuthLayout'
import { useAuthStore } from '../../stores/auth-store'
import { areaById, type AreaId } from '../../auth/access'
import { homePathForRole } from '../../auth/roles'

/**
 * Areas and audiences:
 *
 *   `/`        public   marketing pages, no account
 *   `/staff/*` staff    tour preparation (`/staff/manage/*`) and operations, for Staff and Admin
 *   `/admin/*` admin    accounts and roles, Admin only
 *   `/technical/*`      Technical Staff: map versions, POI import, technical confirmation
 *   `/dai-dien/*`       school representative: register a group, roster, invitation
 *   `/tour/*`           students, no account: join, waiting room, live, end
 *
 * All signed-in areas are lazy, shell included, so a visitor loading `/`
 * downloads none of them, and an operator never downloads administration.
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
const QuestAudioPage = lazy(() => import('../../routes/public/QuestAudioPage'))
const QuestIntercomPage = lazy(() => import('../../routes/staff/QuestIntercomPage'))


// SQL GUID Tours use personal access-code/cookie entry; non-GUID IDs retain the legacy fixture flow.
const StudentTourPage = lazy(() => import('../../routes/student/StudentTourPage'))

// School representative (flow review 21/09/2026 §4).
const RepresentativeShell = lazy(() => import('../../features/representative/RepresentativeShell'))
const RepDashboardPage = lazy(() => import('../../routes/representative/RepDashboardPage'))
const RepToursPage = lazy(() => import('../../routes/representative/RepToursPage'))
const RepTourDetailPage = lazy(() => import('../../routes/representative/RepTourDetailPage'))
const RepRegisterPage = lazy(() => import('../../routes/representative/RepRegisterPage'))
const RepRegistrationsPage = lazy(() => import('../../routes/representative/RepRegistrationsPage'))
const RepRegistrationDetailPage = lazy(() => import('../../routes/representative/RepRegistrationDetailPage'))
const RepProfilePage = lazy(() => import('../../routes/representative/RepProfilePage'))

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
const StaffProfilePage = lazy(() => import('../../routes/staff/StaffProfilePage'))

const AdminShell = lazy(() => import('../../features/administration/AdminShell'))
const AdminDashboardPage = lazy(() => import('../../routes/staff/manage/AdminDashboardPage'))
const AdminTourListPage = lazy(() => import('../../routes/staff/manage/AdminTourListPage'))
const AdminTourCreatePage = lazy(() => import('../../routes/staff/manage/AdminTourCreatePage'))
const AdminTourDetailPage = lazy(() => import('../../routes/staff/manage/AdminTourDetailPage'))
const AdminTourEditPage = lazy(() => import('../../routes/staff/manage/AdminTourEditPage'))
const AdminRegistrationsPage = lazy(() => import('../../routes/staff/manage/AdminRegistrationsPage'))
const AdminRouteCatalogPage = lazy(() => import('../../routes/staff/manage/AdminRouteCatalogPage'))
const AdminRouteDetailsPage = lazy(() => import('../../routes/staff/manage/AdminRouteDetailsPage'))
const AdminRouteFormPage = lazy(() => import('../../routes/staff/manage/AdminRouteFormPage'))
const AdminAccountsPage = lazy(() => import('../../routes/admin/AdminAccountsPage'))
const AdminPoisPage = lazy(() => import('../../routes/staff/manage/AdminPoisPage'))
const AdminPoiFormPage = lazy(() => import('../../routes/staff/manage/AdminPoiFormPage'))
const RolesPage = lazy(() => import('../../routes/admin/RolesPage'))

const TechnicalShell = lazy(() => import('../../features/technical/TechnicalShell'))
const TechnicalMapsPage = lazy(() => import('../../routes/technical/TechnicalMapsPage'))
const TechnicalPoiImportPage = lazy(() => import('../../routes/technical/TechnicalPoiImportPage'))
const TechnicalConfirmationsPage = lazy(() => import('../../routes/technical/TechnicalConfirmationsPage'))

function ShellFallback({ background }: { background: string }) {
  return <div className="min-h-[100dvh]" style={{ background }} aria-busy="true" aria-label="Đang tải" />
}

function AuthSessionFallback() {
  return <div className="min-h-[100dvh] grid place-items-center" role="status" aria-live="polite">Đang kiểm tra phiên đăng nhập...</div>
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
  const isAuthReady = useAuthStore((state) => state.isAuthReady)
  const role = useAuthStore((state) => state.user?.role)
  const location = useLocation()

  if (!isAuthReady) return <AuthSessionFallback />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!areaById(area).allows(role)) return <Navigate to={homePathForRole(role)} replace />
  return <>{children}</>
}

function RepresentativeArea() {
  return (
    <RequireArea area="representative">
      <Suspense fallback={<ShellFallback background="#f5f7f8" />}>
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

function TechnicalArea() {
  return (
    <RequireArea area="technical">
      <Suspense fallback={<ShellFallback background="#f6f7f9" />}>
        <TechnicalShell />
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

/** `/admin/<x>/...` → `/staff/manage/<x>/...`, keeping ids and the query string. */
function MovedToStaff() {
  const location = useLocation()
  return <Navigate to={`${location.pathname.replace(/^\/admin/, '/staff/manage')}${location.search}`} replace />
}

/**
 * The route table, separate from the browser router so it can be mounted in a
 * memory router and asserted on. The guard, the legacy redirects and the
 * `/admin` precedence rule are behaviour, and behaviour that is only visible by
 * clicking through a running app is behaviour that quietly regresses.
 */
export const routes = [
  { path: '/quest/intercom', element: <Suspense fallback={<ShellFallback background="#f5f7f8" />}><QuestAudioPage /></Suspense> },
  {
    path: '/',
    element: (
      <Suspense fallback={<ShellFallback background="#060d11" />}>
        <PublicHomePage />
      </Suspense>
    ),
  },
  // Keep the sign-in composition mounted while its route content renders.
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },
  // Students: join with the group code, then waiting room, live and end (no account).
  {
    path: '/tour',
    element: (
      <Suspense fallback={<ShellFallback background="#f5f7f8" />}>
        <StudentTourPage />
      </Suspense>
    ),
  },
  {
    path: '/tour/:tourId',
    element: (
      <Suspense fallback={<ShellFallback background="#f5f7f8" />}>
        <StudentTourPage />
      </Suspense>
    ),
  },
  {
    path: '/dai-dien',
    element: <RepresentativeArea />,
    children: [
      { index: true, element: <RepDashboardPage /> },
      { path: 'buoi', element: <RepToursPage /> },
      { path: 'buoi/:tourId', element: <RepTourDetailPage /> },
      { path: 'buoi/:tourId/dang-ky', element: <RepRegisterPage /> },
      { path: 'dang-ky', element: <RepRegistrationsPage /> },
      { path: 'dang-ky/:registrationId', element: <RepRegistrationDetailPage /> },
      { path: 'dang-ky/:registrationId/sua', element: <RepRegisterPage /> },
      { path: 'ho-so', element: <RepProfilePage /> },
      // A mistyped path inside the area stays inside the area.
      { path: '*', element: <Navigate to="/dai-dien" replace /> },
    ],
  },
  {
    path: '/staff',
    element: <StaffArea />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'intercom', element: <QuestIntercomPage /> },
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
      { path: 'profile', element: <StaffProfilePage /> },
      // Tour preparation, moved from `/admin/*` (SRS v1.9 §3.2.c: Staff owns
      // content, registrations, Routes and scheduling).
      { path: 'manage', element: <AdminDashboardPage /> },
      { path: 'manage/tours', element: <AdminTourListPage /> },
      { path: 'manage/tours/new', element: <AdminTourCreatePage /> },
      { path: 'manage/tours/:tourId', element: <AdminTourDetailPage /> },
      { path: 'manage/tours/:tourId/edit', element: <AdminTourEditPage /> },
      { path: 'manage/registrations', element: <AdminRegistrationsPage mode="all" /> },
      { path: 'manage/registrations/pending', element: <AdminRegistrationsPage mode="pending" /> },
      { path: 'manage/routes', element: <AdminRouteCatalogPage /> },
      { path: 'manage/routes/new', element: <AdminRouteFormPage /> },
      { path: 'manage/routes/:routeId', element: <AdminRouteDetailsPage /> },
      { path: 'manage/routes/:routeId/edit', element: <AdminRouteFormPage /> },
      { path: 'manage/pois', element: <AdminPoisPage /> },
      { path: 'manage/pois/new', element: <AdminPoiFormPage /> },
      { path: 'manage/pois/:poiId', element: <AdminPoiFormPage /> },
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
      // Administration only: accounts and roles. Tour preparation moved to `/staff/manage/*`.
      { index: true, element: <Navigate to="/admin/accounts" replace /> },
      { path: 'accounts', element: <AdminAccountsPage /> },
      { path: 'roles', element: <RolesPage /> },
      // A mistyped path inside the area stays inside the area.
      { path: '*', element: <Navigate to="/admin" replace /> },
    ],
  },
  {
    path: '/technical',
    element: <TechnicalArea />,
    children: [
      // Technical Staff: map versions, POI YAML import, version-bound confirmation (SRS v1.9 §3.2.c).
      { index: true, element: <Navigate to="/technical/maps" replace /> },
      { path: 'maps', element: <TechnicalMapsPage /> },
      { path: 'poi-import', element: <TechnicalPoiImportPage /> },
      { path: 'confirmations', element: <TechnicalConfirmationsPage /> },
      { path: '*', element: <Navigate to="/technical" replace /> },
    ],
  },
  // Migration only: Tour preparation pages that used to sit under `/admin`.
  { path: '/admin/tours/*', element: <MovedToStaff /> },
  { path: '/admin/registrations/*', element: <MovedToStaff /> },
  { path: '/admin/routes/*', element: <MovedToStaff /> },
  { path: '/admin/pois/*', element: <MovedToStaff /> },
  { path: '/admin/history', element: <Navigate to="/staff/history" replace /> },
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
