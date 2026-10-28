import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { PageSkeleton } from './ConsolePrimitives'
import { Toaster } from './Toaster'

/**
 * A console's page area: each page change runs a thin sweep along the top of
 * the window and lets the new page rise into place (both skipped under
 * reduced motion). Keyed on the path only, so filters kept in the query string
 * and drawers opened from it do not replay the entrance. Also mounts the
 * notification stack, so every console shows what just finished.
 */
export function RouteView() {
  const { pathname } = useLocation()
  return (
    <>
      <span key={`sweep-${pathname}`} aria-hidden="true" className="console-sweep pointer-events-none fixed top-0 right-0 left-0 z-[70] h-0.5 bg-[#2d719e]" />
      <div key={pathname} className="console-enter min-h-full">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
      <Toaster />
    </>
  )
}
