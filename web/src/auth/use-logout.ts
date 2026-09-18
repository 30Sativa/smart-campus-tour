import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../stores/auth-store'

/**
 * The one logout path, shared by the landing page and the operations shell.
 *
 * Clearing local state is not a logout on its own: the server has to revoke the
 * refresh token, or a stolen cookie from that session stays valid
 * (web/AGENTS.md §1). On mock auth there is no cookie and no session to revoke,
 * so this clears memory and leaves. Restoring the real path means calling
 * `POST /api/auth/logout` with credentials before `clearAuth()` - and it is not
 * optional, it is the whole security point of the endpoint.
 */
export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.logout)

  return useCallback(async () => {
    clearAuth()
    navigate('/')
  }, [clearAuth, navigate])
}
