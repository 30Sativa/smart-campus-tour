import { Suspense, useCallback, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { useMyAvatarUrl } from '../account/hooks'
import { useAuthStore } from '../../stores/auth-store'
import { ConsoleAccountMenu } from '../../components/ui/ConsoleHeader'
import { RegistrationResultDialog } from './components/RegistrationResultDialog'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV, repActivePath } from './rep-nav'
import './representative.css'
import './approved-layout.css'

/**
 * The Representative shell. With only three pages there is no sidebar: one bar at the top holds the logo
 * on the left, the pages as tabs in the centre, the bell and the account on the right (profile and sign-out). On a phone the tabs move to a
 * second row that scrolls sideways. The pages inside keep their own Representative layout (`rep-*` classes).
 */
export default function RepresentativeShell() {
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const avatarUrl = useMyAvatarUrl(!!user)
  const logout = useLogout()
  const handleLogout = useCallback(() => { void logout() }, [logout])
  const queryClient = useQueryClient()
  useEffect(() => {
    function clearOwner(owner: string | undefined) {
      if (!owner) return
      void queryClient.cancelQueries({ queryKey: repQueryKeys.owner(owner) })
      queryClient.removeQueries({ queryKey: repQueryKeys.owner(owner) })
      void queryClient.cancelQueries({ queryKey: ['registration-invitations', owner] })
      queryClient.removeQueries({ queryKey: ['registration-invitations', owner] })
    }
    const currentOwner = useAuthStore.getState().user?.userId
    queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'representative' && query.queryKey[1] !== currentOwner })
    return useAuthStore.subscribe((state, previous) => {
      if (state.user?.userId !== previous.user?.userId || state.user?.role !== previous.user?.role) clearOwner(previous.user?.userId)
    })
  }, [queryClient])

  const current = repActivePath(location.pathname)

  const tabList = (
    <ul className="rep-shell-nav-list">
      {REP_NAV.map(({ path, label, icon: Icon }) => {
        const active = current === path
        return (
          <li key={path}>
            <Link to={path} aria-current={active ? 'page' : undefined}
              className="rep-shell-nav-link">
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="rep-shell">
      <a href="#rep-main" className="rep-shell-skip">Đến nội dung chính</a>

      <header className="rep-shell-header">
        <div className="rep-shell-header-inner">
          <Link to="/dai-dien" className="rep-shell-brand">
            <img src="/images/logo.png" alt="" width={36} height={36} />
            <span>
              <strong>CampusTour</strong>
              <small>Đại diện trường</small>
            </span>
          </Link>
          {/* One nav: centred in the bar from md up, its own sideways-scrolling row below on a phone. */}
          <nav aria-label="Điều hướng đại diện trường" className="rep-shell-nav">
            {tabList}
          </nav>
          <div className="rep-shell-account">
            <RepBell />
            <ConsoleAccountMenu avatarUrl={avatarUrl} name={user?.username || 'Đại diện'} role={roleLabel(user?.role ?? 'Representative')} profilePath="/dai-dien/ho-so" profileCurrent={location.pathname.startsWith('/dai-dien/ho-so')} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main id="rep-main" tabIndex={-1} className="rep-app rep-main">
        <div key={location.pathname} className="rep-page-enter">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </div>
      </main>
      <RegistrationResultDialog />
    </div>
  )
}
