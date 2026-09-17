import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter, useLocation } from 'react-router'
import PublicHomePage from '../../routes/public/PublicHomePage'
import LoginPage from '../../auth/LoginPage'
import RegisterPage from '../../auth/RegisterPage'
import { AuthLayout } from '../../auth/AuthLayout'
import { useAuthStore } from '../../stores/auth-store'
import { isStaffRole } from '../../auth/roles'

/**
 * Two entries: the public landing page and the staff operations dashboard.
 *
 * Everything under `/admin/*` is lazy — the shell as well as the pages — so a
 * visitor loading `/` never downloads dashboard code.
 */
const OperationsShell = lazy(() => import('../../features/operations/OperationsShell'))
const DashboardPage = lazy(() => import('../../routes/admin/DashboardPage'))
const SchedulePage = lazy(() => import('../../routes/admin/SchedulePage'))
const SessionDetailPage = lazy(() => import('../../routes/admin/SessionDetailPage'))
const AmrPage = lazy(() => import('../../routes/admin/AmrPage'))
const AlertsPage = lazy(() => import('../../routes/admin/AlertsPage'))
const DigitalTwinPage = lazy(() => import('../../routes/admin/DigitalTwinPage'))
const ReportsPage = lazy(() => import('../../routes/admin/ReportsPage'))

function ShellFallback() {
  return <div className="min-h-[100dvh] bg-[#f1f6fe]" aria-busy="true" aria-label="Đang tải khu vực vận hành" />
}

/**
 * Real navigation block, not a hidden nav link: an unauthenticated visitor is
 * sent to sign in, and an account without a staff role never renders the shell.
 */
function RequireStaff({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const role = useAuthStore((state) => state.user?.role)
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!isStaffRole(role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function AdminLayout() {
  return (
    <RequireStaff>
      <Suspense fallback={<ShellFallback />}>
        <OperationsShell />
      </Suspense>
    </RequireStaff>
  )
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
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'tours/:sessionId', element: <SessionDetailPage /> },
      { path: 'amr', element: <AmrPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'digital-twin', element: <DigitalTwinPage /> },
      { path: 'reports', element: <ReportsPage /> },
    ],
  },
  // The ops dashboard used to live at /staff/*; keep old bookmarks working.
  { path: '/staff/*', element: <Navigate to="/admin" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
