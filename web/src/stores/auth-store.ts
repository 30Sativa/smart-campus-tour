import { create } from 'zustand'

/**
 * Auth state, in memory only.
 *
 * The access token is deliberately NOT persisted to localStorage/sessionStorage
 * (web/AGENTS.md §1): a reload must re-derive the session from the HttpOnly
 * refresh cookie, so a stolen storage entry cannot resurrect a session. While
 * the auth backend is mocked there is no refresh cookie, so a reload simply
 * returns to the sign-in page.
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
  setAuth: (token: string, user: UserInfo) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: true }),
  logout: () => set({ accessToken: null, user: null, isAuthenticated: false }),
}))
