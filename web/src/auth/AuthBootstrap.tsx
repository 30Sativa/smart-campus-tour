import { useEffect, type PropsWithChildren } from 'react'
import { restoreAuthSession } from '../api/client'
import { useAuthStore } from '../stores/auth-store'

/** Rebuild the in-memory session once from the browser's HttpOnly refresh cookie. */
export function AuthBootstrap({ children }: PropsWithChildren) {
  useEffect(() => {
    let mounted = true

    void restoreAuthSession()
      // Refresh owns revision-aware rejection. An old failure cannot clear a newer login.
      .catch(() => {})
      .finally(() => {
        if (mounted) useAuthStore.getState().setAuthReady()
      })

    return () => { mounted = false }
  }, [])

  return children
}
