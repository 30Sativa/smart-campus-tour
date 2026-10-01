import { useEffect, type PropsWithChildren } from 'react'
import { restoreAuthSession } from '../api/client'
import { useAuthStore } from '../stores/auth-store'

/** Rebuild the in-memory session once from the browser's HttpOnly refresh cookie. */
export function AuthBootstrap({ children }: PropsWithChildren) {
  useEffect(() => {
    let mounted = true

    void restoreAuthSession()
      .catch(() => useAuthStore.getState().logout())
      .finally(() => {
        if (mounted) useAuthStore.getState().setAuthReady()
      })

    return () => { mounted = false }
  }, [])

  return children
}
