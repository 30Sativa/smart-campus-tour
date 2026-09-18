import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { MOCK_ACCOUNTS_HINT } from '../../mocks/auth-mock'
import { USE_MOCK_API } from '../../mocks/mock-mode'
import { VisitorNav } from './components/VisitorNav'
import { VisitorFooter } from './components/VisitorFooter'
import { LoadingPanel } from './components/States'
import { VisitorRoute } from './components/VisitorRoute'
import '../landing/landing.css'
import '../../auth/auth.css'
import './visitor.css'

/**
 * The shell every signed-in visitor screen renders into.
 *
 * The root carries `.lp` as well as `.vs`, and that is the whole reason this area
 * looks like the rest of the product: `.lp` is where the palette, the type scale,
 * the radius system and the light/dark switch are defined, so the visitor app
 * reads the landing page's design language rather than declaring a second one.
 *
 * The three imports below are the same layering: landing.css for the tokens and
 * the shared components (nav, brand, buttons, type), auth.css for the form
 * controls, visitor.css for the app shell and the few patterns neither of those
 * already has. Both of the first two are already in the bundle by the time a
 * visitor gets here, so reusing them costs nothing and keeps the surfaces from
 * drifting apart.
 */
export default function VisitorShell() {
  const { pathname } = useLocation()
  return (
    <div className="lp vs" lang="en">
      <a className="vs-skip" href="#visitor-content">Skip to content</a>
      <VisitorNav />

      <main className="vs-main" id="visitor-content" tabIndex={-1}>
        <Suspense fallback={<div className="vs-page"><LoadingPanel minHeight={320} /></div>}>
          <VisitorRoute key={pathname}><Outlet /></VisitorRoute>
        </Suspense>
      </main>

      <VisitorFooter />

      {/* Development only. A production bundle drops this branch, so no visitor
          ever sees build state in the middle of a screen; `mock-mode.ts` warns to
          the console instead for a production build still on mocks. */}
      {import.meta.env.DEV && USE_MOCK_API && (
        <p className="vs-devbadge" data-dev-only="true">
          DEV: running on sample data. {MOCK_ACCOUNTS_HINT}.
        </p>
      )}
    </div>
  )
}
