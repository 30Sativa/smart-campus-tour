import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { apiClient } from '../api/client'
import { useAuthStore } from '../stores/auth-store'
import { USE_MOCK_API } from '../mocks/mock-mode'

/**
 * The one logout path, shared by the landing page and the operations shell.
 *
 * Clearing local state is not a logout on its own: the server has to revoke the
 * refresh token, or a stolen cookie from that session stays valid
 * (web/AGENTS.md §1). While auth is mocked there is no session to revoke.
 */
export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.logout)

  return useCallback(async () => {
    try {
      if (!USE_MOCK_API) await apiClient('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } finally {
      clearAuth()
      navigate('/')
    }
  }, [clearAuth, navigate])
}
