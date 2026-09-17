import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter, useLocation, useParams } from 'react-router'
import PublicHomePage from '../../routes/public/PublicHomePage'
import LoginPage from '../../auth/LoginPage'
import RegisterPage from '../../auth/RegisterPage'
import { AuthLayout } from '../../auth/AuthLayout'
import { useAuthStore } from '../../stores/auth-store'
import { areaById, type AreaId } from '../../auth/access'
import { homePathForRole } from '../../auth/roles'

/**
 * Three areas, three audiences:
 *
 *   `/`        public  visitors, no account
 *   `/staff/*` staff   tour operations, for Staff and Admin
 *   `/admin/*` admin   administration, Admin only
 *
 * Both signed-in areas are lazy, shell included, so a visitor loading `/` never
 * downloads either one, and an operator never downloads administration.
 *
 * `/staff/*` used to live at `/admin/*` while the product had only one
 * signed-in area. It does not any more: `/admin/*` is administration now, and
 * the old operations URLs redirect (see the bottom of the table).
 */
const StaffShell = lazy(() => import('../../features/operations/StaffShell'))
const OperationsOverviewPage = lazy(() => import('../../routes/staff/OperationsOverviewPage'))
const SchedulePage = lazy(() => import('../../routes/staff/SchedulePage'))
const SessionDetailPage = lazy(() => import('../../routes/staff/SessionDetailPage'))
const AmrPage = lazy(() => import('../../routes/staff/AmrPage'))
const AlertsPage = lazy(() => import('../../routes/staff/AlertsPage'))
const DigitalTwinPage = lazy(() => import('../../routes/staff/DigitalTwinPage'))
const ReportsPage = lazy(() => import('../../routes/staff/ReportsPage'))

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

function StaffArea() {
  return (
    <RequireArea area="staff">
      <Suspense fallback={<ShellFallback background="#f1f6fe" />}>
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

export const router = createBrowserRouter([
  { path: '/', element: <PublicHomePage /> },
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
    path: '/staff',
    element: <StaffArea />,
    children: [
      { index: true, element: <OperationsOverviewPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'tours/:sessionId', element: <SessionDetailPage /> },
      { path: 'amr', element: <AmrPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'digital-twin', element: <DigitalTwinPage /> },
      { path: 'reports', element: <ReportsPage /> },
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
  { path: '/admin/amr', element: <Navigate to="/staff/amr" replace /> },
  { path: '/admin/alerts', element: <Navigate to="/staff/alerts" replace /> },
  { path: '/admin/digital-twin', element: <Navigate to="/staff/digital-twin" replace /> },
  { path: '/admin/reports', element: <Navigate to="/staff/reports" replace /> },
  { path: '/admin/tours/:sessionId', element: <LegacySessionRedirect /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
