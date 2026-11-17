import { Suspense, useCallback, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { useAuthStore } from '../../stores/auth-store'
import { ConsoleAccountMenu } from '../../components/ui/ConsoleHeader'
import { softConsoleGround, softConsoleHeader } from '../../components/ui/ui-classes'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV, repActivePath } from './rep-nav'
import './representative.css'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'

/**
 * The Representative shell. With only three pages there is no sidebar: one bar at the top holds the logo
 * on the left, the pages as tabs in the centre, the bell and the account on the right (profile and sign-out). On a phone the tabs move to a
 * second row that scrolls sideways. The pages inside keep their own Representative layout (`rep-*` classes).
 */
export default function RepresentativeShell() {
  const location = useLocation()
  const user = useAuthStore(state => state.user)
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
    <ul className="mx-auto flex w-max items-center gap-1">
      {REP_NAV.map(({ path, label, icon: Icon }) => {
        const active = current === path
        return (
          <li key={path} className="shrink-0">
            <Link to={path} aria-current={active ? 'page' : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-[14px] whitespace-nowrap transition-colors duration-200 ${focusRing} ${active ? 'bg-[#edf3fb] font-semibold text-[#1e293b]' : 'font-medium text-[#475569] hover:bg-white hover:text-[#0f172a]'}`}>
              <Icon size={16} strokeWidth={2.1} aria-hidden="true" className={active ? 'text-[#4a6fa5]' : 'text-[#94a3b8]'} />
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className={`flex h-[100dvh] flex-col overflow-hidden ${softConsoleGround}`}>
      <a href="#rep-main" className="sr-only z-[80] rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">Đến nội dung chính</a>

      <header className="relative z-20 shrink-0 px-4 pt-3 sm:px-6 lg:px-8">
        <div className={`${softConsoleHeader} flex-wrap py-2 md:grid md:grid-cols-[1fr_auto_1fr]`}>
          <Link to="/dai-dien" className={`group flex shrink-0 items-center gap-2.5 justify-self-start rounded-xl pr-2 ${focusRing}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_0_0_1px_#e5e7eb,0_6px_14px_-8px_rgba(17,24,39,0.35)] transition-transform duration-500 group-hover:-rotate-6 motion-reduce:transition-none">
              <img src="/images/logo.png" alt="" width={25} height={25} className="size-[25px] object-contain" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-sm font-bold tracking-[-0.03em] text-[#0f172a]">CampusTour</span>
              <span className="text-muted block text-[10.5px] font-semibold tracking-[0.04em]">Đại diện trường</span>
            </span>
          </Link>
          {/* One nav: centred in the bar from md up, its own sideways-scrolling row below on a phone. */}
          <nav aria-label="Điều hướng đại diện trường" className="order-last -mx-1 w-full min-w-0 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:justify-self-center md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
            {tabList}
          </nav>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 justify-self-end">
            <RepBell />
            <ConsoleAccountMenu name={user?.username || 'Đại diện'} role={roleLabel(user?.role ?? 'Representative')} profilePath="/dai-dien/ho-so" profileCurrent={location.pathname.startsWith('/dai-dien/ho-so')} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main id="rep-main" tabIndex={-1} className="rep-app rep-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto focus:outline-none">
        <span key={`sweep-${location.pathname}`} aria-hidden="true" className="console-sweep pointer-events-none fixed top-0 right-0 left-0 z-[70] h-0.5 bg-[#2d719e]" />
        <div key={location.pathname} className="console-enter min-h-full">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </div>
      </main>
    </div>
  )
}
