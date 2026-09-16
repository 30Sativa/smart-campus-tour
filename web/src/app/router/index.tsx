import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import PublicHomePage from '../../routes/public/PublicHomePage'
import ToursPage from '../../routes/public/ToursPage'
import MyBookingsPage from '../../routes/public/MyBookingsPage'
import RouteDetail from '../../routes/public/RouteDetail'
import BookingFlow from '../../routes/public/BookingFlow'
import LiveTour from '../../routes/public/LiveTour'
import AIGuide from '../../routes/public/AIGuide'
import Feedback from '../../routes/public/Feedback'
import Profile from '../../routes/public/Profile'
import LoginPage from '../../auth/LoginPage'
import RegisterPage from '../../auth/RegisterPage'
import { useAuthStore } from '../../stores/auth-store'
import { isAdminRole, isStaffRole } from '../../auth/roles'
import AdminSidebar from '../../components/ui/AdminSidebar'
import AdminTopbar from '../../components/ui/AdminTopbar'
import StaffShell from '../../components/staff/StaffShell'

const AdminDashboardPage = lazy(() => import('../../routes/admin/AdminDashboardPage'))
const DigitalTwinPage = lazy(() => import('../../routes/admin/DigitalTwinPage'))
const SchedulePage = lazy(() => import('../../routes/admin/SchedulePage'))
const LiveOperationsPage = lazy(() => import('../../routes/admin/LiveOperationsPage'))
const StaffDashboardPage = lazy(() => import('../../routes/staff/StaffDashboardPage'))
const StaffSchedulePage = lazy(() => import('../../routes/staff/StaffSchedulePage'))
const StaffSessionDetailPage = lazy(() => import('../../routes/staff/StaffSessionDetailPage'))
const StaffAmrPage = lazy(() => import('../../routes/staff/StaffAmrPage'))
const StaffAlertsPage = lazy(() => import('../../routes/staff/StaffAlertsPage'))
const StaffTwinPage = lazy(() => import('../../routes/staff/StaffTwinPage'))
const StaffReportsPage = lazy(() => import('../../routes/staff/StaffReportsPage'))

function RouteGuard({ children, access }: { children: ReactNode; access: 'staff' | 'admin' }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const allowed = access === 'admin' ? isAdminRole(user?.role) : isStaffRole(user?.role) && !isAdminRole(user?.role)
  if (!allowed) return <Navigate to={isAdminRole(user?.role) ? '/admin' : isStaffRole(user?.role) ? '/staff' : '/'} replace />
  return <>{children}</>
}

function PageFallback() {
  return <div className="flex flex-1 items-start justify-center bg-[#f1f6fe] p-8" aria-busy="true" aria-label="Đang tải trang"><div className="w-full max-w-[1500px] space-y-5"><div className="h-16 max-w-md animate-pulse rounded-2xl bg-[#e2ecfb]" /><div className="h-24 animate-pulse rounded-2xl bg-[#e2ecfb]" /><div className="h-80 animate-pulse rounded-2xl bg-[#e2ecfb]" /></div></div>
}

function AdminLayout() {
  return <RouteGuard access="admin"><div className="flex min-h-[100dvh] bg-[#f1f6fe] text-[#1f314d]"><AdminSidebar /><div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden"><AdminTopbar /><Suspense fallback={<PageFallback />}><main className="flex-1 overflow-y-auto overflow-x-hidden"><Outlet /></main></Suspense></div></div></RouteGuard>
}

function StaffLayout() {
  return <RouteGuard access="staff"><Suspense fallback={<PageFallback />}><StaffShell /></Suspense></RouteGuard>
}

export const router = createBrowserRouter([
  { path: '/', element: <PublicHomePage /> },
  { path: '/tours', element: <ToursPage /> },
  { path: '/tours/:id', element: <RouteDetail /> },
  { path: '/tours/:id/book', element: <BookingFlow /> },
  { path: '/my-bookings', element: <MyBookingsPage /> },
  { path: '/live-tour/:id', element: <LiveTour /> },
  { path: '/ai-guide', element: <AIGuide /> },
  { path: '/feedback/:id', element: <Feedback /> },
  { path: '/profile', element: <Profile /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/admin', element: <AdminLayout />, children: [
    { index: true, element: <AdminDashboardPage /> },
    { path: 'digital-twin', element: <DigitalTwinPage /> },
    { path: 'schedule', element: <SchedulePage /> },
    { path: 'live-operations', element: <LiveOperationsPage /> },
  ] },
  { path: '/staff', element: <StaffLayout />, children: [
    { index: true, element: <StaffDashboardPage /> },
    { path: 'dashboard', element: <StaffDashboardPage /> },
    { path: 'schedule', element: <StaffSchedulePage /> },
    { path: 'bookings', element: <StaffSchedulePage /> },
    { path: 'tours', element: <StaffSchedulePage /> },
    { path: 'tours/:sessionId', element: <StaffSessionDetailPage /> },
    { path: 'amr', element: <StaffAmrPage /> },
    { path: 'alerts', element: <StaffAlertsPage /> },
    { path: 'digital-twin', element: <StaffTwinPage /> },
    { path: 'reports', element: <StaffReportsPage /> },
  ] },
])
