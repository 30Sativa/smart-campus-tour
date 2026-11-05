import { create } from 'zustand'
import { STAFF_NAV, activeNavPath } from '../staff-nav'

/**
 * One Tour is spread over three pages (preparation, pre-start check, live
 * console). "Back" from any of them should return to the list the Tour was
 * opened from, not to a fixed page, and moving between the three must not
 * change that. The shell remembers the last Staff page that is not a Tour page;
 * a Tour opened straight from a link goes back to the calendar.
 */

/** The Tour id when `pathname` is one of a single Tour's pages, else null. */
export function tourPageId(pathname: string): string | null {
  const match = /^\/staff\/(?:manage\/tours|tours|live)\/([^/]+)(?:\/(?:start|edit))?\/?$/.exec(pathname)
  return match && match[1] !== 'new' ? match[1] : null
}

/** Whether a page can be where a Tour was opened from: not one of its own pages, and not the create form it leaves on save. */
export function isTourOrigin(pathname: string): boolean {
  return tourPageId(pathname) === null && pathname !== '/staff/manage/tours/new'
}

type OriginState = { origin: string | null; remember: (path: string) => void }
export const useTourOriginStore = create<OriginState>()(set => ({ origin: null, remember: origin => set({ origin }) }))

const FALLBACK = '/staff/schedule'

/** The nav entry a Tour page belongs to: the one it was opened from. */
export function originNavPath(origin: string | null): string {
  return activeNavPath(new URL(origin ?? FALLBACK, 'http://staff').pathname) ?? FALLBACK
}

/** Where "back" goes from a Tour page, and what the link says. */
export function useTourOrigin(): { to: string; label: string } {
  const origin = useTourOriginStore(state => state.origin)
  const nav = originNavPath(origin)
  return { to: origin ?? FALLBACK, label: STAFF_NAV.find(item => item.path === nav)?.label ?? 'Lịch Tour' }
}
