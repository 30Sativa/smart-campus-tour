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
  setAuth: (token: string, user: UserInfo) => void
  setAuthReady: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isAuthReady: false,
  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: true, isAuthReady: true }),
  setAuthReady: () => set({ isAuthReady: true }),
  logout: () => set({ accessToken: null, user: null, isAuthenticated: false, isAuthReady: true }),
}))
