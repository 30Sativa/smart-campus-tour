import { Suspense, lazy } from 'react'
import { Outlet, createBrowserRouter } from 'react-router'
import PublicHomePage from '../../routes/public/PublicHomePage'

// `/admin/*` is lazy-loaded so a visitor on `/` never downloads dashboard code
// (web/AGENTS.md §1). Auth guard is not wired yet — backend contract pending.
const AdminDashboardPage = lazy(
  () => import('../../routes/admin/AdminDashboardPage'),
)
const DigitalTwinPage = lazy(() => import('../../routes/admin/DigitalTwinPage'))

function AdminLayout() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
          Loading…
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <PublicHomePage /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'digital-twin', element: <DigitalTwinPage /> },
    ],
  },
])
