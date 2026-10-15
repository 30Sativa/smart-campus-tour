import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../../stores/auth-store'

type QueryProviderProps = {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => useAuthStore.subscribe((next, previous) => {
    if (next.sessionRevision !== previous.sessionRevision) {
      // Clear also cancels in-flight queries and removes mutation variables
      // (roster emails/password drafts). Owner-keyed caches alone retain that data.
      queryClient.clear()
    }
  }), [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
