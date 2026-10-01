import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { apiClient } from '../api/client'
import { useAuthStore } from '../stores/auth-store'

/**
 * The one logout path, shared by the landing page and the operations shell.
 *
 * Clearing local state is not a logout on its own: the server has to revoke the
 * refresh token, or a stolen cookie from that session stays valid
 * (web/AGENTS.md §1). Clear local state after the server has had a chance to
 * revoke the cookie-backed session, even if the request cannot reach it.
 */
export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.logout)

  return useCallback(async () => {
    try {
      await apiClient('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Local sign-out must still work when the API is unavailable.
    }
    clearAuth()
    navigate('/')
  }, [clearAuth, navigate])
}
