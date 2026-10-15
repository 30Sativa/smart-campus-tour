import { create } from 'zustand'

/**
 * Auth state, in memory only.
 *
 * The access token is deliberately NOT persisted to localStorage/sessionStorage
 * (web/AGENTS.md §1): a reload re-derives the session from the HttpOnly refresh
 * cookie, so a stolen storage entry cannot resurrect a session.
 */
export type UserInfo = {
  userId: string
  username: string
  role: string
}

type AuthState = {
  accessToken: string | null
  user: UserInfo | null
  isAuthenticated: boolean
  isAuthReady: boolean
  /** Changes on login/logout or a cookie identity change; same-account refresh retains it. */
  sessionRevision: number
  setAuth: (token: string, user: UserInfo) => void
  applyRefresh: (token: string, user: UserInfo, expectedRevision: number) => boolean
  setAuthReady: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isAuthReady: false,
  sessionRevision: 0,
  setAuth: (accessToken, user) => set(state => ({ accessToken, user, isAuthenticated: true, isAuthReady: true,
    sessionRevision: state.sessionRevision + 1 })),
  // A late refresh cannot overwrite logout or a more recent explicit login.
  applyRefresh: (accessToken, user, expectedRevision) => {
    let applied = false
    set(state => {
      if (state.sessionRevision !== expectedRevision) return state
      applied = true
      const identityChanged = state.user && (state.user.userId !== user.userId || state.user.role !== user.role)
      return { accessToken, user, isAuthenticated: true, isAuthReady: true,
        sessionRevision: identityChanged ? state.sessionRevision + 1 : state.sessionRevision }
    })
    return applied
  },
  setAuthReady: () => set({ isAuthReady: true }),
  logout: () => set(state => ({ accessToken: null, user: null, isAuthenticated: false, isAuthReady: true,
    sessionRevision: state.sessionRevision + 1 })),
}))
